/**
 * NOTIFICATION GATEWAY (WORKER)
 * @description Endpoint serverless responsável por escutar a fila quente (notification_outbox),
 * processar o payload (incluindo mapeamento de anexos inline/CID) e realizar o disparo via SMTP.
 * Possui controle transacional em três fases: Disparo, Arquivamento (Histórico) e Faxina, 
 * além de roteamento para Dead Letter Queue (DLQ) em caso de falhas excessivas.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2'
import nodemailer from "npm:nodemailer@6.9.13";
import { encodeBase64 } from "jsr:@std/encoding/base64";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withSecurity } from "../_shared/server.ts";

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
import { debugLog } from "../_shared/logger.ts";

serve(withSecurity('notification-gateway', async (req: Request) => {
  // 1. AUTENTICAÇÃO E SEGURANÇA
  // Valida o header da requisição contra o secret de ambiente para evitar disparos indevidos
  const receivedSecret = req.headers.get('x-gateway-secret');
  const expectedSecret = Deno.env.get('NOTIFICATION_GATEWAY_SECRET');

  debugLog("DEBUG: Secret recebido:", receivedSecret);
  debugLog("DEBUG: Secret esperado (configurado no env):", expectedSecret ? "EXISTE" : "NÃO CONFIGURADO");

  if (!receivedSecret || receivedSecret !== expectedSecret) {
    debugLog("ERRO [AUTH]: Acesso negado. Secret inválido ou ausente.");
    return { status: 401, data: { error: "Unauthorized" } };
  }

  // 2. INICIALIZAÇÃO DO SUPABASE
  // Utiliza a Service Role Key para ignorar RLS durante as operações de sistema (Outbox/Histórico)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  // Variável extraída para o escopo superior para garantir rastreabilidade no bloco catch
  let targetId: string | null = null;

  try {
    // 3. CAPTURA E VALIDAÇÃO DA FILA QUENTE
    const body = await req.json();
    targetId = body.id;

    if (!targetId) throw new Error("ID da notificação não fornecido no payload.");

    const { data: notif, error: fetchError } = await supabase
      .from('notification_outbox')
      .select('*')
      .eq('id', targetId)
      .single();

    if (fetchError || !notif) throw new Error("Notificação não encontrada no banco de dados.");

    // 4. CONFIGURAÇÃO DO TRANSPORTER (SMTP)
    const senderEmail = Deno.env.get('GOOGLE_WORKSPACE_SMTP_USER');
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: senderEmail,
        pass: Deno.env.get('GOOGLE_WORKSPACE_APP_PASSWORD')
      }
    });

    // 5. MAPEAMENTO DE ANEXOS E INJEÇÃO CID
    // Gateway busca o binário no bucket e converte para base64 em tempo real.
    let mailAttachments = [];
    if (notif.attachments && Array.isArray(notif.attachments)) {
      mailAttachments = await Promise.all(notif.attachments.map(async (att: any) => {
        // Divide a string storage_path na primeira barra
        const [bucket, ...pathParts] = att.storage_path.split('/');
        const path = pathParts.join('/'); // Reconstrói o caminho caso tenha subpastas

        // Usa o bucket dinâmico e o path
        const { data, error } = await supabase.storage.from(bucket).download(path);

        if (error) throw error;

        // Converte para buffer e depois usamos o utilitário nativo encodeBase64
        const arrayBuffer = await data.arrayBuffer();
        const base64 = encodeBase64(new Uint8Array(arrayBuffer));

        return {
          filename: att.storage_path.split('/').pop(), // Extrai o nome do arquivo do path
          content: base64,
          encoding: 'base64',
          cid: att.content_id
        };
      }));
    }

    // 6. DISPARO DA NOTIFICAÇÃO
    await transporter.sendMail({
      from: senderEmail,
      to: notif.recipient,
      subject: notif.subject || "Notificação Superbid",
      html: notif.channel === 'email' ? notif.rendered_content : undefined,
      text: notif.channel !== 'email' ? notif.rendered_content : undefined,
      attachments: mailAttachments
    });

    // 7. MIGRAÇÃO PARA O HISTÓRICO (Auditoria)
    // Garante um snapshot exato de tudo que foi disparado, preservando os metadados.
    await supabase
      .from('notifications')
      .insert({ 
        id: notif.id,
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
        attachments: notif.attachments, 
        raw_payload: notif.raw_payload,
        status: 'sent',
        created_at: notif.created_at
      });

    // 8. FAXINA DA FILA QUENTE
    // Remove o registro processado da Outbox para manter a fila enxuta.
    await supabase
      .from('notification_outbox')
      .delete()
      .eq('id', targetId);

    console.log(`SUCESSO: Notificação ${targetId} enviada e arquivada.`);
    return { status: 200, data: { status: "success", id: targetId } };

  } catch (err: any) {
    debugLog("[GATEWAY FATAL]:", err.message);
    
    // 9. CONTROLE DE RETRY E DEAD LETTER QUEUE (DLQ)
    // Evita loop infinito incrementando o contador e definindo morte térmica (dead_letter) se necessário.
    if (targetId) {
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
            status: isDead ? 'dead_letter' : 'pending',
            retry_count: nextRetry,
            error_message: err.message,
            updated_at: new Date().toISOString()
          })
          .eq('id', targetId);
      }
    }
    
    return { status: 400, data: { error: err.message } };
  }
}));