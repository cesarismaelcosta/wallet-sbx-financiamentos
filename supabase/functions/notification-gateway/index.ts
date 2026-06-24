/**
 * @fileoverview Gateway de Notificações
 * @path supabase/functions/notification-gateway/index.ts
 * * ESTRUTURA DO PROJETO:
 * --------------------------------------------------------------------------------
 * Orquestrador central de disparos (Email/SMS/WhatsApp). 
 * Realiza a autenticação, renderização do conteúdo (via gerador unificado), 
 * envio via SMTP e auditoria completa no banco de dados Supabase.
 * --------------------------------------------------------------------------------
 * * PADRÃO DE DOCUMENTAÇÃO:
 * - Toda função deve conter cabeçalho de propósito e contexto.
 * - Integração atômica com o gerador de HTML (contido neste arquivo).
 * - Registro obrigatório de 'rendered_content' para fins de auditoria.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import nodemailer from "npm:nodemailer@6.9.13";

Deno.serve(async (req) => {
  const authHeader = req.headers.get('x-gateway-secret');
  if (authHeader !== Deno.env.get('NOTIFICATION_GATEWAY_SECRET')) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const body = await req.json();
    
    // O HTML JÁ VEM PRONTO NO email_body. O Gateway não renderiza, ele apenas transporta.
    const renderedContent = body.channel === 'email' ? body.email_body : body.text_content;

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: Deno.env.get('GOOGLE_WORKSPACE_SMTP_USER'),
        pass: Deno.env.get('GOOGLE_WORKSPACE_APP_PASSWORD')
      }
    });

    await transporter.sendMail({
      from: Deno.env.get('GMAIL_USER'),
      to: body.recipient,
      subject: body.subject,
      html: body.channel === 'email' ? renderedContent : undefined,
      text: body.channel !== 'email' ? renderedContent : undefined
    });

    console.log(body);

    const { data: log, error: dbError } = await supabase
      .from('notifications')
      .insert({
        context_type: body.context_type,
        ...(body.simulation_id && { simulation_id: body.simulation_id }),
        ...(body.simulation_update_id && { simulation_update_id: body.simulation_update_id }),
        ...(body.visit_id && { visit_id: body.visit_id }),
        ...(body.visit_update_id && { visit_update_id: body.visit_update_id }),
        channel: body.channel,
        template_slug: body.template_slug,
        recipient_type: body.recipient_type,
        recipient: body.recipient,
        rendered_content: renderedContent,
        raw_payload: body.raw_payload,
        status: 'sent'
      })
      .select('id')
      .single();

    if (dbError) throw new Error(dbError.message);

    return new Response(JSON.stringify({ status: "success", id: log.id }), { status: 200 });

  } catch (err: any) {
    console.error("[GATEWAY FATAL]:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 400 });
  }
});