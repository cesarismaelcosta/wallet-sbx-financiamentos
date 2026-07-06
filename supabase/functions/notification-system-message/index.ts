/**
 * @fileoverview Notification System Message
 * @path supabase/functions/notification-system-message/index.ts
 * @description Orquestrador de entrada para alertas e erros técnicos do sistema.
 * --------------------------------------------------------------------------------
 * 1. OBJETIVO: Ingestão de alertas técnicos via API interna com rastreabilidade opcional.
 * 2. COMPORTAMENTO: Persiste na Outbox como 'pending' com metadados de contexto.
 * 3. SEGURANÇA: Service Role Key.
 * --------------------------------------------------------------------------------
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { generateSystemErrorEmailHtml } from './system-message-notification.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

/**
 * @function Deno.serve
 * @description Orquestra o recebimento de erros e a persistência na fila quente.
 */
Deno.serve(async (req) => {
  // 1. REGISTRO DE ACESSO E MÉTODO:
  if (req.method !== 'POST') {
    return new Response("Method not allowed", { status: 405 });
  }

  // Trata a requisição de Preflight (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // 2. INICIALIZAÇÃO DO SUPABASE:
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // 3. RECEBIMENTO DE CONTEXTO E IDS OPCIONAIS:
    const { 
      context, message, details, payload, 
      visit_id, visit_update_id, simulation_id, simulation_update_id 
    } = await req.json();

    // 4. VALIDAÇÃO DE CONTRATO:
    if (!context || !message) {
      throw new Error("Parâmetros 'context' e 'message' são obrigatórios.");
    }

    // 5. GERAÇÃO DE TEMPLATE HTML:
    const htmlContent = generateSystemErrorEmailHtml(context, message, details);

    // 6. PERSISTÊNCIA NA FILA (OUTBOX):
    const { error: insertError } = await supabase.from('notification_outbox').insert({
      context_type: 'SYSTEM_ERROR',
      channel: 'email',
      template_slug: 'system-error-alert',
      recipient_type: 'INTERNAL',
      recipient: 'cesarismaelcosta@gmail.com',
      subject: `[FINANCIAL-GATEWAY] ${context}`,
      rendered_content: htmlContent,
      visit_id,
      visit_update_id,
      simulation_id,
      simulation_update_id,
      raw_payload: { 
        context, 
        details, 
        payload, 
        timestamp: new Date().toISOString() 
      },
      status: 'pending'
    });

    if (insertError) throw insertError;

    return new Response(JSON.stringify({ status: "queued" }), { 
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    // 7. TRATAMENTO DE ERRO CRÍTICO:
    console.error("[NOTIFICATION-SYSTEM-MESSAGE ERROR]:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});