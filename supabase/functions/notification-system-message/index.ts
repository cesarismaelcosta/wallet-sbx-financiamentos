/**
 * @fileoverview Serviço: Notification System Message
 * @path supabase/functions/notification-system-message/index.ts
 * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Porta de Ingestão do Sistema de Notificações. Atua como um sumidouro 
 * assíncrono de telemetria e erros técnicos para o ecossistema do Hub Financeiro.
 * * Garante o desacoplamento total entre falhas de infraestrutura/integração
 * e a experiência do usuário (UX), operando sob o princípio de tolerância a falhas.
 * * [RESPONSABILIDADES]:
 * 1. Protocolo de Borda: Responde síncronamente ao aperto de mão de segurança (CORS OPTIONS).
 * 2. Validação Contratual: Garante a presença dos metadados mínimos de rastreabilidade.
 * 3. Persistência de Transição: Deposita a mensagem na Outbox como 'pending' para processamento assíncrono.
 * 4. Isolamento de Falhas: Protege o cliente consumidor emitindo respostas silenciosas em caso de pane interna.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { generateSystemErrorEmailHtml } from './system-message-notification.ts'

// =========================================================================
// [POLÍTICA DE SEGURANÇA]: Configuração Estrita de CORS (Cross-Origin)
// =========================================================================
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

/**
 * @function Deno.serve
 * @description Ponto de entrada do microserviço HTTP Deno Deploy.
 */
Deno.serve(async (req) => {
  
  // -----------------------------------------------------------------------
  // [GUARITA 1]: Intercepção Primária de Preflight (CORS OPTIONS)
  // -----------------------------------------------------------------------
  // Deve ser a primeira linha de execução. O navegador envia esta requisição 
  // antes do POST real para validar se o domínio local tem autorização de tráfego.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // -----------------------------------------------------------------------
  // [GUARITA 2]: Restrição de Verbo HTTP (White-list)
  // -----------------------------------------------------------------------
  // Bloqueia qualquer tentativa de varredura ou acesso via métodos não homologados.
  if (req.method !== 'POST') {
    return new Response("Method not allowed", { 
      status: 405, 
      headers: corsHeaders 
    });
  }

  // -----------------------------------------------------------------------
  // [INFRAESTRUTURA]: Inicialização do Client Supabase (Service Role)
  // -----------------------------------------------------------------------
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  // Proteção de inicialização contra variáveis de ambiente ausentes na nuvem
  if (!supabaseUrl || !supabaseKey) {
    console.error("[CRITICAL CONFIG ERROR]: Variáveis de infraestrutura ausentes no ambiente Supabase.");
    return new Response(JSON.stringify({ error: "Erro interno de configuração na nuvem." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Utiliza a Service Role para ignorar políticas de RLS ao gravar na fila (Outbox)
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // -----------------------------------------------------------------------
    // [CONTRATO DE ENTRADA]: Consumo e Desestruturação do Payload
    // -----------------------------------------------------------------------
    const payload = await req.json();
    const { 
      context, 
      message, 
      details, 
      raw_payload, 
      visit_id, 
      visit_update_id, 
      simulation_id, 
      simulation_update_id 
    } = payload;
    
    // Validação estrita dos nós obrigatórios do contrato do log
    if (!context || !message) {
      throw new Error("Parâmetros contratuais obrigatórios ('context' e 'message') ausentes.");
    }

    // -----------------------------------------------------------------------
    // [DOMÍNIO]: Processamento e Renderização Visual do Alerta
    // -----------------------------------------------------------------------
    // CORREÇÃO: Variável nomeada como templateResult para alinhar com o insert
    const templateResult = generateSystemErrorEmailHtml(context, message, details);
    
    // -----------------------------------------------------------------------
    // [PERSISTÊNCIA]: Ingestão na Fila Quente (Notification Outbox)
    // -----------------------------------------------------------------------
    // O registro entra com status 'pending'. O Worker assíncrono do banco
    // interceptará este registro para disparar o e-mail via SMTP/SendGrid.
    const { error: insertError } = await supabase.from('notification_outbox').insert({
      context_type: 'SYSTEM_ERROR',
      channel: 'email',
      template_slug: 'system-error-alert',
      recipient_type: 'INTERNAL',
      recipient: 'cesarismaelcosta@gmail.com',
      subject: `Alerta de Erro no Gateway de Financiamentos e Seguros: ${context} ⚠️`,
      rendered_content: templateResult.html, 
      attachments: templateResult.attachments, 
      visit_id: visit_id || null,
      visit_update_id: visit_update_id || null,
      simulation_id: simulation_id || null,
      simulation_update_id: simulation_update_id || null,
      raw_payload: raw_payload || {
        context,
        details,
        timestamp: new Date().toISOString()
      },
      status: 'pending'
    });

    if (insertError) throw insertError;

    // -----------------------------------------------------------------------
    // [OUTPUT]: Resposta de Sucesso (Fila Aceita)
    // -----------------------------------------------------------------------
    return new Response(JSON.stringify({ status: "queued" }), { 
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    // -----------------------------------------------------------------------
    // [FALLBACK]: Monitoramento Interno de Exceções da Própria Função
    // -----------------------------------------------------------------------
    console.error("[EDGE FUNCTION CRITICAL EXCEPTION]:", err.message);
    
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});