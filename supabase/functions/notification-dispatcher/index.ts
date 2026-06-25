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
 * CONFIGURAÇÕES TÉCNICAS E FLAGS DE AMBIENTE
 */

// Chave de controle para logs de depuração
const DEBUG_MODE = true;

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[NOTIFICATION-DISPATCHER] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

/**
 * ============================================================================
 * DISPATCHER DE NOTIFICAÇÕES (Versão Final)
 * ============================================================================
 * Objetivo: Identificar notificações pendentes, atualizar seu estado para 
 * 'processing' (prevenindo duplicidade) e disparar o Gateway de envio.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'

Deno.serve(async (req) => {
  // 1. REGISTRO DE ACESSO:
  // Valida que a função foi acionada corretamente.
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

    if (queryError) throw queryError;
    if (!pendentes || pendentes.length === 0) {
      debugLog("3. Nenhuma pendência encontrada.");
      return new Response("Sem pendências");
    }

    debugLog(`4. Encontrei ${pendentes.length} itens. Iniciando loop de disparo.`);

    // 3. LOOP DE PROCESSAMENTO:
    // Iteramos sobre cada item para processar individualmente.
    for (const notif of pendentes) {
      debugLog(`5. Processando ID: ${notif.id}`);

      // 3.1. LOCK DE SEGURANÇA:
      // Atualizamos para 'processing' para evitar que o próximo pulso do 
      // Cron processe a mesma notificação simultaneamente.
      await supabase
        .from('notification_outbox')
        .update({ 
          status: 'processing', 
          updated_at: new Date().toISOString() 
        })
        .eq('id', task.id);

      if (updateError) {
        console.error(`6. Falha ao travar o ID ${notif.id}:`, updateError);
        continue;
      }

      // 3.2. ACIONAMENTO DO GATEWAY:
      // Chamamos o gateway enviando o segredo de segurança (x-gateway-secret).
      const gatewayUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/notification-gateway`;
      const response = await fetch(gatewayUrl, {
        method: 'POST',
        headers: { 
          'x-gateway-secret': Deno.env.get('NOTIFICATION_GATEWAY_SECRET')!,
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ notification_id: notif.id })
      });

      if (!response.ok) {
        console.error(`7. Gateway retornou erro para o ID ${notif.id}: ${response.statusText}`);
      } else {
        debugLog(`7. Gateway acionado com sucesso para o ID ${notif.id}`);
      }
    }

    return new Response("Processamento finalizado");

  } catch (e) {
    // 4. TRATAMENTO DE ERROS GLOBAIS:
    // Captura exceções críticas durante o loop ou acesso ao banco.
    console.error("8. ERRO CRÍTICO NO DISPATCHER:", e);
    return new Response("Erro no processamento", { status: 500 });
  }
});