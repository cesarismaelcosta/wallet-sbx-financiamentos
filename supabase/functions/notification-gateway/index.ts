import { createClient } from 'jsr:@supabase/supabase-js@2'
import nodemailer from "npm:nodemailer@6.9.13";

// Chave de controle para logs de depuração
const DEBUG_MODE = true;

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[NOTIFICATION-GATEWAY] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

Deno.serve(async (req) => {
  const receivedSecret = req.headers.get('x-gateway-secret');
  const expectedSecret = Deno.env.get('NOTIFICATION_GATEWAY_SECRET');

  debugLog("DEBUG: Secret recebido:", receivedSecret);
  debugLog("DEBUG: Secret esperado (configurado no env):", expectedSecret ? "EXISTE" : "NÃO CONFIGURADO");

  if (!receivedSecret || receivedSecret !== expectedSecret) {
    console.error("4. ERRO: Acesso negado. Secret inválido ou ausente.");
    return new Response("Unauthorized", { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Variável extraída para o escopo superior para poder ser usada no bloco catch
  let targetId: string | null = null;

  try {
    const body = await req.json();
    targetId = body.notification_id;

    if (!targetId) throw new Error("ID da notificação não fornecido");

    const { data: notif, error: fetchError } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', targetId)
      .single();

    if (fetchError || !notif) throw new Error("Notificação não encontrada no banco");

    // Usa a variável de e-mail padronizada que você configurou no painel
    const senderEmail = Deno.env.get('GOOGLE_WORKSPACE_SMTP_USER');

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: senderEmail,
        pass: Deno.env.get('GOOGLE_WORKSPACE_APP_PASSWORD')
      }
    });

    // 5. Envia o E-mail
    await transporter.sendMail({
      from: senderEmail,
      to: notif.recipient,
      subject: notif.subject || "Notificação Superbid",
      html: notif.channel === 'email' ? notif.rendered_content : undefined,
      text: notif.channel !== 'email' ? notif.rendered_content : undefined
    });

    // 🚨 NOVO: 6. MIGRAÇÃO PARA O HISTÓRICO EM CASO DE SUCESSO
    await supabase
      .from('notifications')
      .insert({ 
        id: notif.id, // Herda o mesmo ID para rastreabilidade
        context_type: notif.context_type,
        visit_id: notif.visit_id,
        visit_update_id: notif.visit_update_id,
        simulation_id: notif.simulation_id,
        simulation_update_id: notif.simulation_update_id,
        channel: notif.channel,
        template_slug: notif.template_slug,
        recipient_type: notif.recipient_type,
        recipient: notif.recipient,
        subject: notif.subject,
        rendered_content: notif.rendered_content,
        raw_payload: notif.raw_payload,
        status: 'sent',
        created_at: notif.created_at // Mantém a data de criação original
      });

    // 🚨 NOVO: 7. FAXINA (Deleta da fila quente)
    await supabase
      .from('notification_outbox')
      .delete()
      .eq('id', targetId);

    console.log(`SUCESSO: Notificação ${targetId} enviada e arquivada.`);
    return new Response(JSON.stringify({ status: "success", id: targetId }), { status: 200 });

  } catch (err: any) {
    console.error("[GATEWAY FATAL]:", err.message);
    
    // 🚨 NOVO: CONTROLE DE RETRY E DEAD LETTER QUEUE (Fica presa se estourar as tentativas)
    if (targetId) {
      // Busca o contador atual da outbox para calcular o próximo passo
      const { data: current } = await supabase
        .from('notification_outbox')
        .select('retry_count, max_retries')
        .eq('id', targetId)
        .single();
      
      if (current) {
        const nextRetry = (current.retry_count || 0) + 1;
        const isDead = nextRetry >= (current.max_retries || 3);

        await supabase
          .from('notification_outbox')
          .update({ 
            status: isDead ? 'dead_letter' : 'pending', // Volta para pending para reenvio ou vira DLQ
            retry_count: nextRetry,
            error_message: err.message,
            updated_at: new Date().toISOString()
          })
          .eq('id', targetId);
      }
    }
    
    return new Response(JSON.stringify({ error: err.message }), { status: 400 });
  }
});