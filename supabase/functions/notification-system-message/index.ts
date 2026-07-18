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
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withSecurity } from "../_shared/server.ts";

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
import { debugLog } from "../_shared/logger.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

serve(withSecurity('notification-system-message', async (req: Request) => {
  // -----------------------------------------------------------------------
  // [GUARITA 2]: Restrição de Verbo HTTP (White-list)
  // -----------------------------------------------------------------------
  // Bloqueia qualquer tentativa de varredura ou acesso via métodos não homologados.
  if (req.method !== 'POST') {
    return { status: 405, data: { error: "Method not allowed" } };
  }

  // -----------------------------------------------------------------------
  // [INFRAESTRUTURA]: Inicialização do Client Supabase (Service Role)
  // -----------------------------------------------------------------------
  // Proteção de inicialização contra variáveis de ambiente ausentes na nuvem
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    debugLog("[CRITICAL CONFIG ERROR]: Variáveis de infraestrutura ausentes no ambiente Supabase.");
    return { status: 500, data: { error: "Erro interno de configuração na nuvem." } };
  }

  // Utiliza a Service Role para ignorar políticas de RLS ao gravar na fila (Outbox)
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  try {
    // -----------------------------------------------------------------------
    // [CONTRATO DE ENTRADA]: Consumo e Desestruturação do Payload
    // -----------------------------------------------------------------------
    const payload = await req.json();
    const { 
      context, 
      subject, 
      message, 
      raw_payload, 
      visit_id, 
      visit_update_id, 
      simulation_id, 
      simulation_update_id 
    } = payload;
    
    // Validação estrita dos nós obrigatórios do contrato do log
    if (!payload.context || !payload.message) {
      throw new Error("Parâmetros contratuais obrigatórios ('context' e 'message') ausentes.");
    }

    // -----------------------------------------------------------------------
    // [DOMÍNIO]: Processamento e Renderização Visual do Alerta
    // -----------------------------------------------------------------------
    // CORREÇÃO: Variável nomeada como templateResult para alinhar com o insert
    const templateResult = generateSystemErrorEmailHtml(payload);
    
    // -----------------------------------------------------------------------
    // [PERSISTÊNCIA]: Ingestão na Fila Quente (Notification Outbox)
    // -----------------------------------------------------------------------
    // O registro entra com status 'pending'. O Worker assíncrono do banco
    // interceptará este registro para disparar o e-mail via SMTP/SendGrid.
    const { error: insertError } = await supabase.from('notification_outbox').insert({
      context_type: 'SYSTEM_ERROR',
      channel: 'email',
      template_slug: 'system-message-notification',
      recipient_type: 'INTERNAL',
      recipient: 'cesarismaelcosta@gmail.com',
      subject: payload.subject || `Alerta de Erro no Gateway de Financiamentos e Seguros ⚠️`,
      rendered_content: templateResult.html, 
      attachments: templateResult.attachments, 
      visit_id: visit_id || null,
      visit_update_id: visit_update_id || null,
      simulation_id: simulation_id || null,
      simulation_update_id: simulation_update_id || null,
      raw_payload: payload.raw_payload || {
        message,
        timestamp: new Date().toISOString()
      },
      status: 'pending'
    });

    if (insertError) throw insertError;

    // -----------------------------------------------------------------------
    // [OUTPUT]: Resposta de Sucesso (Fila Aceita)
    // -----------------------------------------------------------------------
    return { status: 200, data: { status: "queued" } };

  } catch (err: any) {
    // -----------------------------------------------------------------------
    // [FALLBACK]: Monitoramento Interno de Exceções da Própria Função
    // -----------------------------------------------------------------------
    debugLog("[EDGE FUNCTION CRITICAL EXCEPTION]:", err.message);
    
    return { status: 500, data: { error: err.message } };
  }
}));