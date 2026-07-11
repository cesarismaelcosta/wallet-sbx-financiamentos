/**
 * @fileoverview System Message Template
 * @path supabase/functions/notification-system-message/system-message-notification.ts
 * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Responsável pela renderização visual de alertas do sistema.
 * 
 * [RESPONSABILIDADES]:
 * 1. Template Engine: Converte estados de erro em HTML estruturado.
 * 2. Resource Management: Gerencia IDs de conteúdo (CID) para ativos estáticos.
 * 3. Sanitização: Normaliza objetos de erro JS para serialização segura em e-mail.
 */

export interface EmailTemplateResult {
  html: string;
  attachments?: {
    content_id: string;
    storage_path: string;
  }[];
}

/**
 * @function generateSystemErrorEmailHtml
 * @description Constrói o HTML do alerta técnico.
 */
export function generateSystemErrorEmailHtml(
  context: string, 
  message: string, 
  details: any
): EmailTemplateResult {
  
  const logoSrc = "cid:logo-wallet";

  // Serialização robusta para capturar o payload completo
  let formattedPayload = '{}';
  if (payload) {
    try {
      // Se o payload já for string, usa ela; se for objeto, faz o stringify do TUDO
      formattedPayload = typeof payload === 'string' 
        ? payload 
        : JSON.stringify(payload, null, 2); 
    } catch (e) {
      formattedPayload = String(payload);
    }
  }

  const html = `
  <!DOCTYPE html>
  <html>
  <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: 'Inter', Arial, sans-serif;">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 20px 10px;">
      <tr>
        <td align="center">
          <table width="100%" style="max-width: 95%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            
            <!-- HEADER: Apenas logo conforme padrão -->
            <tr>
              <td align="left" style="padding: 24px 32px; background-color: #f8f9fa; border-bottom: 1px solid #e2e8f0;">
                <img src="${logoSrc}" alt="Wallet sbX" width="140" style="display: block; border: 0;" />
              </td>
            </tr>
            
            <!-- CORPO: Alerta e Detalhes -->
            <tr>
              <td style="padding: 40px 32px;">
                <p style="font-size: 16px; line-height: 1.6; color: #334155;">
                  O sistema identificou uma instabilidade no contexto: <b>${context}</b>
                </p>
                
                <div style="background: #ffffff; padding: 16px; border-radius: 4px; border-left: 4px solid #ef4444; border: 1px solid #e2e8f0; border-left: 4px solid #ef4444; font-family: monospace; font-size: 13px; color: #1e293b; white-space: pre-wrap; margin-bottom: 24px;">
                  ${message}
                </div>
                
                <h4 style="margin: 0 0 12px 0; color: #0f172a; font-size: 15px;">Detalhes Técnicos:</h4>
                <div style="background: #1e293b; color: #f8fafc; padding: 16px; border-radius: 8px; font-size: 12px; overflow-x: auto;">
                  <pre style="white-space: pre-wrap; margin: 0;">${formattedDetails}</pre>
                </div>
              </td>
            </tr>
            
            <!-- FOOTER -->
            <tr>
              <td style="background-color: #f8f9fa; padding: 24px 32px; border-top: 1px solid #e2e8f0; text-align: center;">
                <p style="margin: 0; font-size: 11px; color: #64748b;">
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