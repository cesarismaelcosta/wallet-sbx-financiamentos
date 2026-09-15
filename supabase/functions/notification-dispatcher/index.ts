/**
 * @fileoverview Notification Dispatcher (Scheduler/Carteiro)
 * @path supabase/functions/notification-dispatcher/index.ts
 * * ESTRUTURA DE ORQUESTRAÇÃO:
 * --------------------------------------------------------------------------------
 * Este serviço é o CÉREBRO da fila. Ele varre o banco em busca de tarefas.
 * * 1. OBJETIVO: Mover registros 'pending' para 'processing' e chamar o Gateway.
 * 2. GATILHO (CRON JOB):
 * Deve ser configurado no Supabase para rodar a cada 1 minuto, autenticando
 * via assinatura HMAC (ver bloco de setup abaixo) — NÃO com a service_role key.
 * * 3. SEGURANÇA: A autenticação do chamador (o cron) é validada de forma
 * centralizada pelo wrapper `withSecurity` (`_shared/server.ts`), através do
 * campo `requiresHmac` configurado em `_shared/registry.ts` para esta função.
 * Este arquivo não contém nenhuma lógica de autenticação própria — ela vive
 * inteiramente em `_shared/hmac.ts` (`verifyHmacSignature`), reaproveitável
 * por qualquer outra função que precisar do mesmo padrão.
 * O segredo (`NOTIFICATION_DISPATCHER_SECRET`) nunca trafega em texto: o
 * chamador manda um `x-timestamp` e uma `x-signature` (HMAC-SHA256 do
 * timestamp, calculada com o segredo como chave), e a função recalcula e
 * compara em tempo constante, rejeitando timestamps fora de uma janela de
 * ~30s (proteção contra replay).
 * 4. CONCORRÊNCIA: Atualiza status para 'processing' antes de chamar o Gateway,
 * evitando que o mesmo e-mail seja enviado duas vezes se o cron disparar rápido.
 * 5. VAZÃO: cada execução processa no máximo `BATCH_LIMIT` itens (o cron roda a
 * cada minuto, então não há motivo pra uma única execução tentar drenar uma
 * fila inteira acumulada), e os disparos ao Gateway rodam em paralelo com um
 * teto de `CONCURRENCY` simultâneos em vez de um `for` sequencial — evita que
 * uma fila grande estoure o tempo limite da Edge Function no meio do loop.
 * --------------------------------------------------------------------------------
 */

/**
 * SETUP DE INFRAESTRUTURA (rodar uma vez no SQL Editor do projeto):
 *
 * -- Habilita as extensões necessárias (pg_cron e pgcrypto já vêm habilitadas
 * -- por padrão nos projetos Supabase, mas o IF NOT EXISTS torna isso idempotente)
 * CREATE EXTENSION IF NOT EXISTS pg_cron;
 * CREATE EXTENSION IF NOT EXISTS pgcrypto;
 *
 * -- 1. Cria a função que atualiza o timestamp
 * CREATE OR REPLACE FUNCTION public.handle_updated_at()
 * RETURNS TRIGGER AS $$
 * BEGIN
 * NEW.updated_at = timezone('utc'::text, now());
 *   RETURN NEW;
 * END;
 * $$ LANGUAGE plpgsql;
 *
 * -- 2. Cria o Trigger que liga a função à tabela notifications
 * CREATE TRIGGER set_notifications_updated_at
 * BEFORE UPDATE ON public.notifications
 * FOR EACH ROW
 * EXECUTE FUNCTION public.handle_updated_at();
 *
 * -- 3. Guarda o segredo HMAC no Vault (o MESMO valor deve ser configurado
 * --    como env var `NOTIFICATION_DISPATCHER_SECRET` desta Edge Function
 * --    via `supabase secrets set` ou o painel — Vault e Secrets de Function
 * --    são dois cofres separados, cada um só é lido pelo seu próprio runtime)
 * SELECT vault.create_secret(
 *   '<valor-gerado-aleatoriamente>',
 *   'notification_dispatcher_secret',
 *   'Segredo HMAC para autenticar o cron do notification-dispatcher'
 * );
 *
 * -- 4. Agenda o job. O comando calcula, a cada disparo, um timestamp e a
 * --    assinatura HMAC-SHA256 correspondente via pgcrypto — o valor do
 * --    segredo em si nunca aparece em texto puro no comando do job.
 * SELECT cron.schedule(
 * 'processar-notificacoes-pendentes',
 * '* * * * *', -- Roda a cada minuto
 * $$
 * WITH params AS (
 *   SELECT
 *     extract(epoch FROM now())::bigint::text AS ts,
 *     (SELECT decrypted_secret FROM vault.decrypted_secrets
 *      WHERE name = 'notification_dispatcher_secret') AS secret
 * )
 * SELECT net.http_post(
 *   url := 'https://SEU_PROJETO_REF.supabase.co/functions/v1/notification-dispatcher',
 *   headers := jsonb_build_object(
 *     'Content-Type', 'application/json',
 *     'x-timestamp', p.ts,
 *     'x-signature', encode(hmac(p.ts, p.secret, 'sha256'), 'hex')
 *   ),
 *   body := '{}'::jsonb
 * )
 * FROM params p;
 * $$
 * );
 *
 * Para atualizar um job já existente sem perder o histórico de execuções,
 * usar `cron.alter_job(job_id := <id>, command := $$ ... $$)` em vez de
 * apagar e recriar com `cron.schedule`.
 */

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
import { debugLog } from "../_shared/logger.ts";

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withSecurity } from "../_shared/server.ts";

// Teto de itens processados por execução do cron (roda a cada minuto —
// não faz sentido uma única chamada tentar drenar uma fila acumulada inteira).
const BATCH_LIMIT = 30;
// Teto de disparos simultâneos ao notification-gateway (evita tanto serializar
// tudo quanto abrir uma rajada descontrolada de requisições).
const CONCURRENCY = 5;

/** Executa `worker` sobre `items` respeitando um teto de concorrência. */
async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  const executing: Promise<void>[] = [];
  for (const item of items) {
    const p = worker(item).then(() => {
      executing.splice(executing.indexOf(p), 1);
    });
    executing.push(p);
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

serve(withSecurity('notification-dispatcher', async (req: Request) => {
  // 1. REGISTRO DE ACESSO:
  debugLog("1. --- DISPATCHER INICIADO ---");

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // 2. BUSCA DE REGISTROS PENDENTES NA FILA QUENTE (com teto por execução —
    //    o cron roda a cada minuto, então não há motivo pra uma única execução
    //    tentar engolir uma fila inteira acumulada):
    debugLog("2. Buscando notificações pendentes...");
    const { data: tasks, error: fetchError } = await supabase
      .from('notification_outbox')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH_LIMIT);

    if (fetchError) throw fetchError;

    // 🚨 CORREÇÃO: Usando a variável 'tasks' corretamente
    if (!tasks || tasks.length === 0) {
      debugLog("3. Nenhuma pendência encontrada.");
      return { status: 200, data: { message: "Sem pendências" } };
    }

    debugLog(`4. Encontrei ${tasks.length} itens. Iniciando disparo com concorrência ${CONCURRENCY}.`);

    // 3. PROCESSAMENTO COM CONCORRÊNCIA CONTROLADA:
    async function processTask(task: any): Promise<void> {
      debugLog(`5. Processando ID: ${task.id}`);

      // 3.1. LOCK DE SEGURANÇA:
      const { error: updateError } = await supabase
        .from('notification_outbox')
        .update({
          status: 'processing',
          updated_at: new Date().toISOString()
        })
        .eq('id', task.id);

      if (updateError) {
        debugLog(`6. Falha ao travar o ID ${task.id}:`, updateError);
        return;
      }

      // 3.2. ACIONAMENTO DO GATEWAY:
      try {
        const response = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/notification-gateway`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              "x-gateway-secret": Deno.env.get("NOTIFICATION_GATEWAY_SECRET") || ""
            },
            body: JSON.stringify(task),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          debugLog(`7. Falha no Gateway para ID ${task.id}:`, errorText);

          // 🚨 CONTROLE DE RETENTATIVAS CORRIGIDO
          const nextRetry = (task.retry_count || 0) + 1;
          const isDead = nextRetry >= (task.max_retries || 3);

          await supabase
            .from('notification_outbox')
            .update({
              status: isDead ? 'dead_letter' : 'pending',
              retry_count: nextRetry,
              error_message: `Dispatcher HTTP Error: ${response.status} - ${errorText}`,
              updated_at: new Date().toISOString()
            })
            .eq('id', task.id);
        } else {
          debugLog(`8. Gateway confirmou o envio do ID: ${task.id}`);
        }

      } catch (networkError: any) {
        debugLog(`7. Erro de rede ao chamar Gateway para ID ${task.id}:`, networkError);

        // 🚨 CONTROLE DE RETENTATIVAS PARA FALHA DE REDE CORRIGIDO
        const nextRetry = (task.retry_count || 0) + 1;
        const isDead = nextRetry >= (task.max_retries || 3);

        await supabase
          .from('notification_outbox')
          .update({
            status: isDead ? 'dead_letter' : 'pending',
            retry_count: nextRetry,
            error_message: `Dispatcher Network Error: ${networkError.message}`,
            updated_at: new Date().toISOString()
          })
          .eq('id', task.id);
      }
    }

    await runWithConcurrency(tasks, CONCURRENCY, processTask);

    return { status: 200, data: { message: "Processamento finalizado" } };

  } catch (e: any) {
    debugLog("8. ERRO CRÍTICO NO DISPATCHER:", e);
    return { status: 500, data: { error: "Erro no processamento" } };
  }
}));