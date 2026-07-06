/**
 * @fileoverview System Message Template
 * @path supabase/functions/notification-system-message/system-message-notification.ts
 * @description Template de e-mail para alertas técnicos de sistema.
 * --------------------------------------------------------------------------------
 * 1. OBJETIVO: Formatar o HTML do erro para legibilidade técnica.
 * 2. ESTRUTURA: Header de alerta, corpo de erro, stack trace e rodapé fixo.
 * --------------------------------------------------------------------------------
 */

/**
 * @function generateSystemErrorEmailHtml
 * @description Constrói o template HTML injetando os dados de erro.
 */
export function generateSystemErrorEmailHtml(
  context: string, 
  message: string, 
  details: any
): string {
  // 1. COMPONENTE DE RODAPÉ (Wallet sbX):
  const footer = `
  <tr>
    <td style="background-color: #f8fafc; padding: 24px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
      <p style="margin: 0; font-size: 11px; color: #64748b; line-height: 1.5;">
        © 2026 Wallet sbX. Todos os direitos reservados.
      </p>
    </td>
  </tr>`;

  // 2. TEMPLATE HTML:
  return `
  <!DOCTYPE html>
  <html>
  <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Inter', Arial, sans-serif;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="padding: 40px 10px;">
      <tr><td align="center">
        <table width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
          <tr><td style="padding: 24px 32px; background-color: #f8f9fa; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #ef4444; font-size: 18px;">
             ⚠️ Alerta [FINANCIAL-GATEWAY]
          </td></tr>
          <tr><td style="padding: 32px; color: #334155; font-size: 16px; line-height: 1.6;">
              <p>O sistema identificou uma instabilidade no contexto: <b>${context}</b></p>
              <div style="background: #fef2f2; padding: 16px; border-radius: 8px; border-left: 4px solid #ef4444; font-family: monospace; font-size: 13px; color: #991b1b; white-space: pre-wrap;">
                ${message}
              </div>
              <h4 style="margin-top: 24px; color: #0f172a;">Detalhes Técnicos:</h4>
              <div style="background: #1e293b; color: #f8fafc; padding: 16px; border-radius: 8px; font-size: 12px; overflow-x: auto;">
                <pre style="white-space: pre-wrap;">${JSON.stringify(details, null, 2)}</pre>
              </div>
          </td></tr>
          ${footer}
        </table>
      </td></tr>
    </table>
  </body>
  </html>
  `;
}