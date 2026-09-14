/**
 * =========================================================================
 * UTILITY: CENTRALIZED SYSTEM ALERTS
 * =========================================================================
 * @module _shared/alert
 * @description Módulo único responsável por: (1) sanitizar/escapar o payload
 * de um alerta técnico, (2) renderizar o e-mail e (3) gravá-lo na Outbox
 * (`notification_outbox`) como 'pending'.
 *
 * Chamado de duas formas:
 *  - INTERNAMENTE, em processo, pelas engines do financial-gateway
 *    (ex: `fandi-service.ts`) via `sendSystemAlert(supabase, params)` —
 *    sem rede, sem segredo, é só uma chamada de função.
 *  - PELO HTTP, via `notification-system-message/index.ts`, que expõe essa
 *    mesma lógica (`dispatchSystemAlert`) para chamadas autenticadas por
 *    sessão vindas do front-end (`logSystemError` em
 *    `src/services/systemNotification.ts`).
 *
 * Antes deste módulo fazia um `fetch()` HTTP entre duas Edge Functions que
 * rodam do mesmo lado do servidor — o que exigia um segredo estático só
 * pra essa travessia de rede desnecessária. Isso foi eliminado: quem roda
 * em processo (as engines) chama a função direto.
 */

import { debugLog } from "./logger.ts";

// -----------------------------------------------------------------------
// [CONTRATO]: Formato aceito por `dispatchSystemAlert` (chamada HTTP ou interna)
// -----------------------------------------------------------------------
export interface SystemAlertPayload {
  context: string;
  subject?: string;
  message: any;
  raw_payload?: any;
  visit_id?: string | null;
  visit_update_id?: string | null;
  simulation_id?: string | null;
  simulation_update_id?: string | null;
}

// -----------------------------------------------------------------------
// [CONTRATO]: Formato ergonômico usado pelas engines internas (camelCase)
// -----------------------------------------------------------------------
export interface AlertPayload {
  context: string;
  message: string;
  subject?: string;
  visitId?: string | null;
  visitUpdateId?: string | null;
  simulationId?: string | null;
  simulationUpdateId?: string | null;
  rawPayload?: any;
}

export interface EmailTemplateResult {
  html: string;
  attachments?: {
    content_id: string;
    storage_path: string;
  }[];
}

// -----------------------------------------------------------------------
// [SEGURANÇA]: Escape de HTML (Prevenção contra XSS / HTML Injection)
// -----------------------------------------------------------------------
const escapeHtml = (str: unknown): string => {
  if (typeof str !== 'string') return String(str ?? '');
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

/**
 * [SEGURANÇA]: Escape de HTML RECURSIVO — percorre objetos/arrays em
 * qualquer profundidade, escapando toda folha que seja string, com teto de
 * profundidade (`MAX_ESCAPE_DEPTH`) contra payloads patologicamente
 * aninhados.
 */
const MAX_ESCAPE_DEPTH = 10;

const deepEscapeHtml = (value: unknown, depth = 0): unknown => {
  if (depth >= MAX_ESCAPE_DEPTH) {
    return escapeHtml(JSON.stringify(value));
  }
  if (typeof value === 'string') {
    return escapeHtml(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => deepEscapeHtml(item, depth + 1));
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, deepEscapeHtml(v, depth + 1)]),
    );
  }
  return value; // números, booleanos, null, undefined passam direto
};

/**
 * @function generateSystemErrorEmailHtml
 * @description Constrói o HTML do alerta técnico a partir do payload já
 * escapado. Migrado de
 * `notification-system-message/system-message-notification.ts` — não tinha
 * mais motivo pra viver isolado numa function que agora não é a única
 * chamadora.
 */
function generateSystemErrorEmailHtml(data: SystemAlertPayload): EmailTemplateResult {
  const fontStack = "'Inter', Arial, sans-serif";
  const ink = "#171717";
  const slate = "#525252";
  const muted = "#737373";
  const line = "#e5e5e5";
  const surface = "#f5f5f5";
  const surfaceAlt = "#fafafa";
  const logoSrc = "cid:logo-wallet";

  const technicalData = {
    ...(data.raw_payload || {}),
    visit_id: data.visit_id || null,
    visit_update_id: data.visit_update_id || null,
    simulation_id: data.simulation_id || null,
    simulation_update_id: data.simulation_update_id || null
  };

  const formattedMessage = typeof data.message === 'string'
    ? data.message
    : JSON.stringify(data.message || "Sem mensagem detalhada.", null, 2);

  const formattedPayload = JSON.stringify(technicalData, null, 2);

  const html = `
  <!DOCTYPE html>
  <html>
  <body style="margin: 0; padding: 0; background-color: ${surface}; font-family: ${fontStack};">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: ${surface}; padding: 20px 10px;">
      <tr>
        <td align="center">
          <table width="100%" style="max-width: 95%; background-color: #ffffff; border: 1px solid ${line}; border-radius: 0; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);">
            <tr>
              <td align="left" style="padding: 24px 32px; background-color: #ffffff; border-bottom: 1px solid ${line};">
                <img src="${logoSrc}" alt="Wallet sbX" width="140" style="display: block; border: 0;" />
              </td>
            </tr>
            <tr>
              <td style="padding: 40px 32px;">
                <p style="font-size: 16px; line-height: 1.6; color: ${slate}; margin-top: 0;">
                  O sistema identificou uma instabilidade no contexto: <b style="color: ${ink};">${data.context}</b>
                </p>
                <div style="
                  background: ${surfaceAlt};
                  padding: 16px 20px;
                  border-radius: 0;
                  border: 1px solid ${line};
                  border-left: 4px solid ${ink};
                  font-family: ${fontStack};
                  font-size: 14px;
                  color: ${ink};
                  white-space: pre-wrap;
                  margin-bottom: 24px;
                  text-align: left !important;
                  width: 100%;
                  box-sizing: border-box;
                ">
                  ${formattedMessage}
                </div>
                <h4 style="margin: 0 0 12px 0; color: ${ink}; font-size: 15px;">Detalhes Técnicos:</h4>
                <div style="background: ${ink}; color: ${surface}; padding: 16px; border-radius: 0; font-size: 12px; overflow-x: auto; font-family: monospace;">
                  <pre style="white-space: pre-wrap; margin: 0;">${formattedPayload}</pre>
                </div>
              </td>
            </tr>
            <tr>
              <td style="background-color: ${surfaceAlt}; padding: 24px 32px; border-top: 1px solid ${line}; text-align: center;">
                <p style="margin: 0; font-size: 11px; color: ${muted};">
                  © ${new Date().getFullYear()} Wallet sbX. Todos os direitos reservados.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
  </html>
  `;

  return {
    html: html,
    attachments: [{ content_id: "logo-wallet", storage_path: "logos/wallet-sbx-200_60.png" }]
  };
}

/**
 * @function dispatchSystemAlert
 * @description Núcleo único de processamento de um alerta de sistema:
 * valida contrato mínimo, escapa entrada, resolve destinatários ativos,
 * renderiza o e-mail e grava na `notification_outbox`. Usado tanto pelo
 * handler HTTP (`notification-system-message/index.ts`) quanto por quem
 * chama em processo (`sendSystemAlert` abaixo).
 *
 * Lança (`throw`) em caso de falha — quem chama decide como reagir: o
 * handler HTTP traduz pra 500; a chamada interna (fire-and-forget) captura
 * e só loga.
 *
 * @param supabase - Client Supabase (Service Role) já instanciado pelo chamador.
 * @param rawPayload - Corpo cru (ainda não escapado) do alerta.
 */
export async function dispatchSystemAlert(
  supabase: any,
  rawPayload: Record<string, any>,
): Promise<{ status: "queued" | "ignored"; reason?: string }> {
  if (!rawPayload?.context || !rawPayload?.message) {
    throw new Error("Parâmetros contratuais obrigatórios ('context' e 'message') ausentes.");
  }

  // [SANITIZAÇÃO DE SEGURANÇA]: Escape de HTML nos campos textuais de entrada
  const payload: SystemAlertPayload = {
    ...rawPayload,
    context: escapeHtml(rawPayload.context),
    subject: rawPayload.subject ? escapeHtml(rawPayload.subject) : undefined,
    message: escapeHtml(rawPayload.message),
    raw_payload: typeof rawPayload.raw_payload === 'object' && rawPayload.raw_payload !== null
      ? deepEscapeHtml(rawPayload.raw_payload)
      : rawPayload.raw_payload,
  };

  const {
    context,
    subject,
    message,
    visit_id,
    visit_update_id,
    simulation_id,
    simulation_update_id,
  } = payload;

  // [DOMÍNIO]: Busca dinâmica de destinatários ativos no Backoffice
  const { data: recipients, error: recipientError } = await supabase
    .from('notification_alert_recipients')
    .select('email')
    .eq('is_active', true);

  if (recipientError) {
    debugLog(`[WARNING]: Falha ao buscar destinatários na tabela: ${recipientError.message}`);
    throw new Error(`Falha ao carregar destinatários de alerta: ${recipientError.message}`);
  }

  if (!recipients || recipients.length === 0) {
    debugLog("[DISPARO ALERTA ABORTADO]: Nenhum destinatário ativo encontrado na tabela notification_alert_recipients.");
    return { status: "ignored", reason: "no_active_recipients" };
  }

  const finalRecipients = recipients.map((r: { email: string }) => r.email).join(';');
  debugLog(`[DISPARO ALERTA]: Destinatários definidos -> ${finalRecipients}`);

  const templateResult = generateSystemErrorEmailHtml(payload);

  const { error: insertError } = await supabase.from('notification_outbox').insert({
    context_type: 'SYSTEM_ERROR',
    channel: 'email',
    template_slug: 'system-message-notification',
    recipient_type: 'INTERNAL',
    recipient: finalRecipients,
    subject: subject || `Alerta de Erro no Gateway de Financiamentos e Seguros ⚠️`,
    rendered_content: templateResult.html,
    attachments: templateResult.attachments,
    visit_id: visit_id || null,
    visit_update_id: visit_update_id || null,
    simulation_id: simulation_id || null,
    simulation_update_id: simulation_update_id || null,
    raw_payload: payload.raw_payload || {
      message,
      timestamp: new Date().toISOString(),
    },
    status: 'pending',
  });

  if (insertError) throw insertError;

  return { status: "queued" };
}

/**
 * @function sendSystemAlert
 * @description Wrapper "fire-and-forget" para chamadores internos em
 * processo (ex: `fandi-service.ts`). Mantém a assinatura ergonômica de
 * antes (objeto camelCase) e NUNCA propaga erro — uma falha no disparo de
 * alerta não pode derrubar a simulação do cliente.
 */
export async function sendSystemAlert(supabase: any, params: AlertPayload): Promise<void> {
  try {
    await dispatchSystemAlert(supabase, {
      context: params.context,
      subject: params.subject || `Alerta de Sistema: ${params.context} ⚠️`,
      message: params.message,
      visit_id: params.visitId || null,
      visit_update_id: params.visitUpdateId || null,
      simulation_id: params.simulationId || null,
      simulation_update_id: params.simulationUpdateId || null,
      raw_payload: params.rawPayload || {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    debugLog("[CRITICAL] Falha ao despachar alerta de sistema:", err.message);
  }
}