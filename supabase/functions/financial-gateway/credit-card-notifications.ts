import { 
  Consultation,  
  SimulationPayload,
  EmailTemplateResult 
} from "../_shared/types.ts";

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
import { debugLog } from "../_shared/logger.ts";

/**
 * Gera o HTML completo de notificação de e-mail para simulações de parcelamento.
 * Integra o cabeçalho, o miolo (dados e grid de parcelas), seção de segurança 
 * e o rodapé dinâmico em uma estrutura única e autocontida.
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS & NEUTRAL PURITY
 * =========================================================================
 * [ATUALIZAÇÃO VISUAL]:
 * - Neutral Purity: Remoção completa da injeção de cor primária (`brandColor`). 
 *   O e-mail agora opera 100% em escala tonal de `neutral-900` a `neutral-50`.
 * - Zero-Radius: Todos os `border-radius: 12px/16px` foram removidos. As
 *   caixas de opções de parcelamento, a tabela central e a caixa de dicas
 *   de pagamento agora possuem cantos estritamente retos (`0px`).
 * 
 * @param consults - Lista de opções de parcelamento.
 * @param payload - Objeto contendo os dados do evento, oferta, cliente e footer_config.
 * @returns Um objeto EmailTemplateResult contendo o HTML processado e a lista de anexos embutidos.
 */
export function generateUserEmailNotificationHtml(
  consults: Consultation[],
  payload: SimulationPayload
): EmailTemplateResult {
  // 1. Configurações de Ambiente e Tokens de Design
  // O logoSrc aponta para o ID do anexo embutido (CID) referenciado no array de attachments
  const logoSrc = "cid:logo-wallet";

  const nomeCliente = payload.entity?.name?.trim() || "Cliente";
  const valorSimulado = (payload.simulation_details?.requested_value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  // Identificação do Evento e Lote conforme padrão solicitado
  const eventoTexto = payload.event?.event_id ? `${payload.event.event_id} | ${payload.event.event_description || ""}` : (payload.event?.event_description || "");
  const loteTexto = payload.offer?.offer_id ? `${payload.offer.offer_id} | ${payload.offer.offer_description || ""}` : (payload.offer?.offer_description || "N/A");

  // Tokens de cor baseados no Tailwind Neutral
  const fontStack = "'Inter', Arial, sans-serif";
  const ink = "#171717";       // neutral-900
  const slate = "#525252";     // neutral-600
  const muted = "#737373";     // neutral-500
  const line = "#e5e5e5";      // neutral-200
  const borderCard = "#d4d4d4";// neutral-300 (usado na borda do step 1)
  const surface = "#f5f5f5";   // neutral-100
  const surfaceAlt = "#fafafa";// neutral-50
  const disclaimerText = "#a3a3a3"; // neutral-400

  /**
   * Motor de renderização dinâmica do Footer.
   * Processa o template_text buscando substituições baseadas no padrão {chave}
   * e aplicando os links fornecidos em payload.footer.
   */
  const renderFooter = () => {
    const config = payload.page_configs.footer;
    if (!config?.template_text) return "";
    
    const links = config.links || [];
    const parts = config.template_text.split(/\{([^}]+)\}/g);
    
    return parts.map((part) => {
      const linkMatch = links.find((l) => l.text === part);
      
      return linkMatch 
        ? `<a href="${linkMatch.url}" style="text-decoration: underline; color: ${muted}; font-weight: 500;">${part}</a>` 
        : part;
    }).join('');
  };

  // 2. Montagem do Grid de Parcelas (Agora Zero-Radius, Neutral e com Hairline divider)
  let htmlParcelas = "";
  consults.forEach((item, index) => {
    const valorFormatado = item.installment_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const totalFormatado = (item.installments * item.installment_value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    
    if (index % 2 === 0) htmlParcelas += `<tr>`;
    htmlParcelas += `
      <td width="48%" class="col-responsive" valign="top" align="center" style="padding-bottom: 12px;">
        <div style="background: ${surfaceAlt}; border: 1px solid ${borderCard}; padding: 14px 16px 14px 24px; max-width: 300px; margin: 0 auto; text-align: left;">
          <div style="margin-bottom: 0;">
            <span style="font-size: 14px; font-weight: 500; color: ${muted}; margin-right: 6px;">${item.installments}x</span> 
            <span style="font-size: 20px; font-weight: 700; color: ${ink}; letter-spacing: -0.5px;">${valorFormatado}</span>
          </div>
          <div style="width: 28px; height: 1px; background-color: ${line}; margin: 8px 0 6px 0;"></div>
          <div style="font-size: 12px; color: ${muted}; font-weight: 400;">Total ${totalFormatado}</div>
        </div>
      </td>
    `;
    if (index % 2 === 0) htmlParcelas += `<td width="4%" class="spacer-responsive"></td>`;
    else htmlParcelas += `</tr>`;
  });
  if (consults.length % 2 !== 0) htmlParcelas += `<td width="48%" class="col-responsive"></td></tr>`;

  // 3. Seção de Segurança (Agora Zero-Radius e Integrada)
  const dicasPagamento = `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 12px; border: 1px solid ${line};">
      <tr><td style="background: ${surfaceAlt}; padding: 16px; border-bottom: 1px solid ${line};">
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td width="28" valign="top" style="font-size: 18px;">&#128274;</td>
              <td valign="top" style="font-size: 15px; color: ${ink}; font-weight: 700; line-height: 1.2;">
                Veja como é seguro pagar com cartão
                <div style="font-size: 12px; color: ${muted}; font-weight: 500; margin-top: 2px;">
                  Conclua seu pagamento com total tranquilidade
                </div>
              </td>
            </tr>
          </table>
      </td></tr>
      <tr><td style="background: #ffffff; padding: 16px 20px;">
          <ul style="margin: 0; padding-left: 16px; color: ${slate}; font-size: 13px; line-height: 1.6;">
            <li style="margin-bottom: 8px;">Aceitamos Visa e Mastercard. Para sua proteção, é indispensável que o cartão seja <b>de titularidade do comprador</b>.</li>
            <li style="margin-bottom: 8px;">O número do seu cartão <b>não fica salvo</b> em nossos bancos de dados; a transação é processada de forma segura.</li>
            <li>Seu banco faz uma rápida validação de segurança na hora da compra com o <b>protocolo 3DS</b>. Ele pode aprovar silenciosamente ou pedir uma confirmação no seu app, por WhatsApp ou por SMS, garantindo que ninguém use seu cartão sem autorização.</li>
          </ul>
      </td></tr>
    </table>
  `;

  // 4. Montagem Final do Documento HTML
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <style>
      @media only screen and (max-width: 600px) {
        .col-responsive { display: block !important; width: 100% !important; }
        .spacer-responsive { display: none !important; }
      }
    </style>
  </head>
  <body style="margin: 0; padding: 0; background-color: ${surface}; font-family: ${fontStack};">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: ${surface}; padding: 20px 10px;">
      <tr>
        <td align="center">
          <table width="100%" style="max-width: 95%; background-color: #ffffff; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05); border: 1px solid ${line};">
            <tr>
              <td align="left" style="padding: 24px 32px; background-color: #ffffff; border-bottom: 1px solid ${line};">
                <img src="${logoSrc}" alt="Wallet sbX" width="140" style="display: block; border: 0;" />
              </td>
            </tr>
            <tr>
              <td style="padding: 40px 32px;">
                <!-- TÍTULO PADRONIZADO -->
                <h3 style="font-size: 18px; font-weight: 700; color: ${ink}; text-transform: uppercase; letter-spacing: -0.5px; margin: 0 0 8px 0;">
                  Simulação de parcelamento
                </h3>
                <p style="font-size: 14px; line-height: 1.6; margin: 0 0 24px 0; color: ${slate};">
                  Olá <b style="color: ${ink};">${nomeCliente}</b>,<br>Aqui estão as opções de parcelamento consultadas em nosso site.
                </p>
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: ${surfaceAlt}; border: 1px solid ${line}; margin-bottom: 24px;">
                  <tr><td style="padding: 16px 20px;">
                    <div style="font-size: 13px; color: ${slate}; margin-bottom: 6px;"><b style="color: ${ink};">Evento:</b> ${eventoTexto}</div>
                    <div style="font-size: 13px; color: ${slate}; margin-bottom: 6px;"><b style="color: ${ink};">Lote:</b> ${loteTexto}</div>
                    <div style="font-size: 13px; color: ${slate};"><b style="color: ${ink};">Valor:</b> <span style="font-weight: 700; color: ${ink};">${valorSimulado}</span></div>
                  </td></tr>
                </table>
                <table width="100%" border="0" cellspacing="0" cellpadding="0">${htmlParcelas}</table>
                ${dicasPagamento}
                
                <p style="margin-top: 24px; font-size: 12px; color: ${disclaimerText}; font-weight: 500; line-height: 1.5;">
                  * Considera o valor de um lance ou proposta para a oferta no momento da simulação, sem adicionar eventuais comissões ou outras taxas que também podem ser parceladas.
                </p>
              </td>
            </tr>
            <tr>
              <td style="background-color: ${surfaceAlt}; padding: 24px 32px; border-top: 1px solid ${line}; text-align: center;">
                <p style="margin: 0; font-size: 11px; color: ${muted}; line-height: 1.6;">
                  ${renderFooter()}
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