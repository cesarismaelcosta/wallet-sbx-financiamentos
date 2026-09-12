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
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO: NEUTRAL PURITY & ZERO-RADIUS ALIGNMENT
 * =========================================================================
 * [ATUALIZAÇÃO VISUAL]:
 * - Zero-Radius: Todas as bordas arredondadas (16px, 8px, 4px) foram 
 *   removidas para alinhar com o design system flat.
 * - Neutral Purity: A cor roxa de marca (brand_color) foi substituída pela
 *   cor `ink` (preto forte) na marcação de alerta. O fundo global foi
 *   padronizado para a escala Neutral estrita.
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
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
import { debugLog } from "../_shared/logger.ts";

/**
 * @function generateSystemErrorEmailHtml
 * @description Constrói o HTML do alerta técnico baseado no payload estruturado.
 */
export function generateSystemErrorEmailHtml(data: SystemErrorPayload): EmailTemplateResult {
  
  // Design Tokens: Escala Neutral Purity (Substituindo Slate e Brand Purple)
  const fontStack = "'Inter', Arial, sans-serif";
  const ink = "#171717";       // neutral-900 (Substitui o brand_color no alerta)
  const slate = "#525252";     // neutral-600
  const muted = "#737373";     // neutral-500
  const line = "#e5e5e5";      // neutral-200
  const surface = "#f5f5f5";   // neutral-100 (Fundo externo)
  const surfaceAlt = "#fafafa";// neutral-50 (Fundo interno)
  
  const logoSrc = "cid:logo-wallet";

  // =========================================================================
  // [SERIALIZAÇÃO INTELIGENTE]: Preserva o metadata completo e consolida IDs
  // =========================================================================
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
            
            <!-- HEADER -->
            <tr>
              <td align="left" style="padding: 24px 32px; background-color: #ffffff; border-bottom: 1px solid ${line};">
                <img src="${logoSrc}" alt="Wallet sbX" width="140" style="display: block; border: 0;" />
              </td>
            </tr>
            
            <!-- CORPO -->
            <tr>
              <td style="padding: 40px 32px;">
                <p style="font-size: 16px; line-height: 1.6; color: ${slate}; margin-top: 0;">
                  O sistema identificou uma instabilidade no contexto: <b style="color: ${ink};">${data.context}</b>
                </p>
                
                <!-- Box de Mensagem (Neutral Purity & Zero-Radius) -->
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
                
                <!-- Dump de Payload Técnico (Zero-Radius) -->
                <h4 style="margin: 0 0 12px 0; color: ${ink}; font-size: 15px;">Detalhes Técnicos:</h4>
                <div style="background: ${ink}; color: ${surface}; padding: 16px; border-radius: 0; font-size: 12px; overflow-x: auto; font-family: monospace;">
                  <pre style="white-space: pre-wrap; margin: 0;">${formattedPayload}</pre>
                </div>
              </td>
            </tr>
            
            <!-- FOOTER -->
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