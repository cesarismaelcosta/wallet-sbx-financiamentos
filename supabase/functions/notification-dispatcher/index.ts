/**
 * @fileoverview Notification Dispatcher (Scheduler/Carteiro)
 * @path supabase/functions/notification-dispatcher/index.ts
 * * ESTRUTURA DE ORQUESTRAÇÃO:
 * --------------------------------------------------------------------------------
 * Este serviço é o CÉREBRO da fila. Ele varre o banco em busca de tarefas.
 * * 1. OBJETIVO: Mover registros 'pending' para 'processing' e chamar o Gateway.
 * 2. GATILHO (CRON JOB):
 * Deve ser configurado no Supabase para rodar a cada 1 minuto:
 * ----------------------------------------------------------------------------
 * [cron.jobs.process-notifications]
 * schedule = "* * * * *"
 * cmd = "curl -X POST 'https://SEU_PROJETO.supabase.co/functions/v1/notification-dispatcher' 
 * -H 'Authorization: Bearer SEU_SERVICE_ROLE_KEY'"
 * ----------------------------------------------------------------------------
 * * 3. SEGURANÇA: Bloqueia chamadas externas via Service Role Key.
 * 4. CONCORRÊNCIA: Atualiza status para 'processing' antes de chamar o Gateway,
 * evitando que o mesmo e-mail seja enviado duas vezes se o cron disparar rápido.
 * --------------------------------------------------------------------------------
 */

/**
 *
 * -- Habilita a extensão pg_cron
 * CREATE EXTENSION IF NOT EXISTS pg_cron;
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
 * 
 * 
 * SELECT cron.schedule(
 * 'processar-notificacoes-pendentes',
 * '* * * * *', -- Roda a cada minuto
 * $$
 * SELECT net.http_post(
 *   url := 'https://SEU_PROJETO_REF.supabase.co/functions/v1/notification-dispatcher',
 *   headers := jsonb_build_object(
 *     'Content-Type', 'application/json',
 *     'Authorization', 'Bearer SEU_SERVICE_ROLE_KEY' -- Substitua pela sua chave REAL
 *   ),
 *   body := '{}'::jsonb
 * );
 * $$
 * );
 * 
 */

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
import { debugLog } from "../_shared/logger.ts";

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withSecurity } from "../_shared/server.ts";

serve(withSecurity('notification-dispatcher', async (req: Request) => {
  // 1. REGISTRO DE ACESSO:
  debugLog("1. --- DISPATCHER INICIADO ---");

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // 2. BUSCA DE REGISTROS PENDENTES NA FILA QUENTE:
    debugLog("2. Buscando notificações pendentes...");
    const { data: tasks, error: fetchError } = await supabase
      .from('notification_outbox')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (fetchError) throw fetchError;
    
    // 🚨 CORREÇÃO: Usando a variável 'tasks' corretamente
    if (!tasks || tasks.length === 0) {
      debugLog("3. Nenhuma pendência encontrada.");
      return { status: 200, data: { message: "Sem pendências" } };
    }

    debugLog(`4. Encontrei ${tasks.length} itens. Iniciando loop de disparo.`);

    // 3. LOOP DE PROCESSAMENTO:
    // 🚨 CORREÇÃO: Padronizado para 'task'
    for (const task of tasks) {
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
        continue; 
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

    return { status: 200, data: { message: "Processamento finalizado" } };

  } catch (e: any) {
    debugLog("8. ERRO CRÍTICO NO DISPATCHER:", e);
    return { status: 500, data: { error: "Erro no processamento" } };
  }
}));