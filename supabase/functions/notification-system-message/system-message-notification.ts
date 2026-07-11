/**
 * @fileoverview System Message Template
 * @path supabase/functions/notification-system-message/system-message-notification.ts
 * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Responsável pela renderização visual de alertas do sistema.
 * 
 * [RESPONSABILIDADES]:
 * 1. Template Engine: Converte SystemErrorPayload em HTML estruturado.
 * 2. Resource Management: Gerencia IDs de conteúdo (CID) para ativos estáticos.
 * 3. Sanitização: Normaliza objetos de erro JS para serialização segura em e-mail.
 */

export interface SystemErrorPayload {
  context: string;
  subject: string;
  message?: any;
  payload?: any;
  visit_id?: string | null;
  visit_update_id?: string | null;
  simulation_id?: string | null;
  simulation_update_id?: string | null;
}

export interface EmailTemplateResult {
  html: string;
  attachments?: {
    content_id: string;
    storage_path: string;
  }[];
}

/**
 * @function generateSystemErrorEmailHtml
 * @description Constrói o HTML do alerta técnico baseado no payload estruturado.
 */
export function generateSystemErrorEmailHtml(data: SystemErrorPayload): EmailTemplateResult {
  
  // Design Tokens: Identidade visual e paleta de cores
  const fontStack = "'Inter', Arial, sans-serif";
  const brand_color = "#B300FF";
  const ink = "#0f172a";
  const slate = "#334155";
  const muted = "#64748b";
  const line = "#e2e8f0";
  const surface = "#f8fafc";
  
  const logoSrc = "cid:logo-wallet";

  // Serialização e estruturação dos dados
  // Consolidamos os IDs de rastreamento com o payload para visibilidade total no dump técnico
  const technicalData = {
    ... (data.payload || {}),
    metadata: {
      visit_id: data.visit_id,
      visit_update_id: data.visit_update_id,
      simulation_id: data.simulation_id,
      simulation_update_id: data.simulation_update_id
    }
  };

  const formattedMessage = typeof data.message === 'string' 
    ? data.message 
    : JSON.stringify(data.message || "Sem mensagem detalhada.", null, 2);

  const formattedPayload = JSON.stringify(technicalData, null, 2);

  const html = `
  <!DOCTYPE html>
  <html>
  <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: ${fontStack};">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 20px 10px;">
      <tr>
        <td align="center">
          <table width="100%" style="max-width: 95%; background-color:${surface}; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            
            <!-- HEADER -->
            <tr>
              <td align="left" style="padding: 24px 32px; background-color: ${surface}; border-bottom: 1px solid ${line};">
                <img src="${logoSrc}" alt="Wallet sbX" width="140" style="display: block; border: 0;" />
              </td>
            </tr>
            
            <!-- CORPO -->
            <tr>
              <td style="padding: 40px 32px;">
                <p style="font-size: 16px; line-height: 1.6; color: ${slate}; margin-top: 0;">
                  O sistema identificou uma instabilidade no contexto: <b>${data.context}</b>
                </p>
                
                <!-- Box de Mensagem (Brand Color) -->
                <div style="
                  background: ${surface}; 
                  padding: 16px; 
                  border-radius: 4px; 
                  border: 1px solid ${line}; 
                  border-left: 4px solid ${brand_color}; 
                  font-family: ${fontStack}; 
                  font-size: 14px; 
                  color: ${ink}; 
                  white-space: pre-wrap; 
                  margin-bottom: 24px;
                  text-align: left;           /* Força o texto para a esquerda */
                  width: 100%;                /* Garante que o box ocupe a largura disponível */
                  box-sizing: border-box;     /* Impede que o padding aumente a largura total */
                ">
                  ${formattedMessage}
                </div>
                
                <!-- Dump de Payload Técnico -->
                <h4 style="margin: 0 0 12px 0; color: ${ink}; font-size: 15px;">Detalhes Técnicos:</h4>
                <div style="background: ${ink}; color: ${surface}; padding: 16px; border-radius: 8px; font-size: 12px; overflow-x: auto; font-family: monospace;">
                  <pre style="white-space: pre-wrap; margin: 0;">${formattedPayload}</pre>
                </div>
              </td>
            </tr>
            
            <!-- FOOTER -->
            <tr>
              <td style="background-color: ${surface}; padding: 24px 32px; border-top: 1px solid ${line}; text-align: center;">
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