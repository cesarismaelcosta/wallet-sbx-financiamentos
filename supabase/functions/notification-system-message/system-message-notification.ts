/**
 * @fileoverview System Message Template
 * @path supabase/functions/notification-system-message/system-message-notification.ts
 * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Template de e-mail para alertas técnicos de sistema.
 * Segue o padrão de retorno EmailTemplateResult para manter o motor 
 * de renderização agnóstico ao método de envio (SMTP/SendGrid/etc).
 * * [RESPONSABILIDADES]:
 * 1. Formatação: Constrói o HTML do erro focado em legibilidade técnica.
 * 2. Embutimento: Anexa o Content-ID (CID) para renderização inline de recursos estáticos.
 * 3. Sanitização: Garante a extração segura de metadados complexos do objeto de erro.
 */

// Interface simulada para manter a tipagem padrão dentro da Edge Function
export interface EmailTemplateResult {
  html: string;
  attachments?: {
    content_id: string;
    storage_path: string;
  }[];
}

/**
 * @function generateSystemErrorEmailHtml
 * @description Constrói o template HTML injetando os dados de erro e retornando o CID.
 * @param context O contexto de execução onde a falha ocorreu (ex: FINANCIAL-GATEWAY)
 * @param message A mensagem principal do erro capturado
 * @param details O objeto ou stack trace detalhado para debug
 * @returns Um objeto EmailTemplateResult contendo o HTML e os anexos requeridos
 */
export function generateSystemErrorEmailHtml(
  context: string, 
  message: string, 
  details: any
): EmailTemplateResult {
  
  // 1. Definição do Recurso CID (Logo)
  const logoSrc = "cid:logo-wallet";

  // 2. Extração segura dos detalhes do objeto (prevenindo 'Object object')
  const formattedDetails = details 
    ? JSON.stringify(details, Object.getOwnPropertyNames(details), 2) 
    : '{}';

  // 3. Tokens de Design
  const fontStack = "'Inter', Arial, sans-serif";
  const line = "#e2e8f0";
  const surface = "#f8f9fa";
  const slate = "#334155";

  // 4. Montagem Final do Documento HTML
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      @media only screen and (max-width: 600px) {
        .col-responsive { display: block !important; width: 100% !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: ${fontStack};">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 20px 10px;">
      <tr>
        <td align="center">
          <table width="100%" style="max-width: 95%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            
            <tr>
              <td align="left" style="padding: 24px 32px; background-color: ${surface}; border-bottom: 1px solid ${line}; display: flex; justify-content: space-between; align-items: center;">
                <img src="${logoSrc}" alt="Wallet sbX" width="140" style="display: block; border: 0;" />
                <span style="font-weight: bold; color: #ef4444; font-size: 16px;">⚠️ Alerta de Sistema</span>
              </td>
            </tr>
            
            <tr>
              <td style="padding: 40px 32px;">
                <p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; color: ${slate};">
                  O sistema identificou uma instabilidade no contexto: <b>${context}</b>
                </p>
                
                <div style="background: #fef2f2; padding: 16px; border-radius: 8px; border-left: 4px solid #ef4444; font-family: monospace; font-size: 13px; color: #991b1b; white-space: pre-wrap; margin-bottom: 24px;">
                  ${message}
                </div>
                
                <h4 style="margin: 0 0 12px 0; color: #0f172a; font-size: 15px;">Detalhes Técnicos:</h4>
                
                <div style="background: #1e293b; color: #f8fafc; padding: 16px; border-radius: 8px; font-size: 12px; overflow-x: auto;">
                  <pre style="white-space: pre-wrap; margin: 0;">${formattedDetails}</pre>
                </div>
              </td>
            </tr>
            
            <tr>
              <td style="background-color: ${surface}; padding: 24px 32px; border-top: 1px solid ${line}; text-align: center;">
                <p style="margin: 0; font-size: 11px; color: #64748b; line-height: 1.5;">
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

  // 5. Retorno Padronizado
  return {
    html: html,
    attachments: [
      {
        content_id: "logo-wallet",
        storage_path: "logos/wallet-sbx-200_60.png"
      }
    ]
  };
}