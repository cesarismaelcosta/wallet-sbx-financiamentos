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
 * * @param consults - Lista de opções de parcelamento.
 * @param payload - Objeto contendo os dados do evento, oferta, cliente e footer_config.
 * @returns Um objeto EmailTemplateResult contendo o HTML processado e a lista de anexos embutidos (CID) necessários, mantendo o enviador agnóstico.
 */
export function generateUserEmailNotificationHtml(
  consults: Consultation[],
  payload: SimulationPayload
): EmailTemplateResult {
  // 1. Configurações de Ambiente e Tokens de Design
  // O logoSrc aponta para o ID do anexo embutido (CID) referenciado no array de attachments
  const logoSrc = "cid:logo-wallet";

  const brandColor = payload.page_configs?.theme?.primary_color || "#B300FF";
  const nomeCliente = payload.entity?.name?.trim() || "Cliente";
  const valorSimulado = (payload.simulation_details?.requested_value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  // Identificação do Evento e Lote conforme padrão solicitado
  const eventoTexto = payload.event?.event_id ? `${payload.event.event_id} | ${payload.event.event_description || ""}` : (payload.event?.event_description || "");
  const loteTexto = payload.offer?.offer_id ? `${payload.offer.offer_id} | ${payload.offer.offer_description || ""}` : (payload.offer?.offer_description || "N/A");

  const fontStack = "'Inter', Arial, sans-serif";
  const ink = "#0f172a";
  const slate = "#334155";
  const muted = "#64748b";
  const line = "#e2e8f0";
  const surface = "#f8fafc";

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
        ? `<a href="${linkMatch.url}" style="text-decoration: underline; color: #64748b; font-weight: 500;">${part}</a>` 
        : part;
    }).join('');
  };

  // 2. Montagem do Grid de Parcelas
  let htmlParcelas = "";
  consults.forEach((item, index) => {
    const valorFormatado = item.installment_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    const totalFormatado = (item.installments * item.installment_value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
    
    if (index % 2 === 0) htmlParcelas += `<tr>`;
    htmlParcelas += `
      <td width="48%" class="col-responsive" valign="top" align="center" style="padding-bottom: 16px;">
        <div style="background: #ffffff; border: 1px solid ${brandColor}; border-radius: 12px; padding: 12px 16px; max-width: 300px; margin: 0 auto;">
          <div style="font-size: 18px; color: ${ink}; margin-bottom: 4px;">
            <span style="font-weight: 700; color: ${brandColor};">${item.installments}x</span> 
            <span style="font-weight: 700;">${valorFormatado}</span>
          </div>
          <div style="font-size: 13px; color: ${muted};">Total ${totalFormatado}</div>
        </div>
      </td>
    `;
    if (index % 2 === 0) htmlParcelas += `<td width="4%" class="spacer-responsive"></td>`;
    else htmlParcelas += `</tr>`;
  });
  if (consults.length % 2 !== 0) htmlParcelas += `<td width="48%" class="col-responsive"></td></tr>`;

  // 3. Seção de Segurança
  const dicasPagamento = `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 12px; border-radius: 12px; overflow: hidden; border: 1px solid ${line};">
      <tr><td style="background: ${surface}; padding: 12px 16px; border-bottom: 1px solid ${line};">
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td width="28" valign="top" style="font-size: 18px;">&#128274;</td>
              <td valign="top" style="font-size: 15px; color: ${ink}; font-weight: 700; line-height: 1.2;">
                Veja como é seguro pagar com cartão
                <div style="font-size: 12px; color: ${muted}; font-weight: 400; margin-top: 2px;">
                  Conclua seu pagamento com total tranquilidade
                </div>
              </td>
            </tr>
          </table>
      </td></tr>
      <tr><td style="background: #ffffff; padding: 16px;">
          <ul style="margin: 0; padding-left: 20px; color: ${slate}; font-size: 13px; line-height: 1.55;">
            <li style="margin-bottom: 8px;">Aceitamos Visa e Mastercard. Para sua proteção, é indispensável que o cartão seja <b>de titularidade do comprador</b>.</li>
            <li style="margin-bottom: 8px;">O número do seu cartão <b>não fica salvo</b>  em nossos bancos de dados; a transação é processada de forma segura.</li>
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
  <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: ${fontStack};">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 20px 10px;">
      <tr>
        <td align="center">
          <table width="100%" style="max-width: 95%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <tr>
              <td align="left" style="padding: 24px 32px; background-color: #f8f9fa; border-bottom: 1px solid ${line};">
                <img src="${logoSrc}" alt="Wallet sbX" width="140" style="display: block; border: 0;" />
              </td>
            </tr>
            <tr>
              <td style="padding: 40px 32px;">
                <p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; color: ${slate};">
                  Olá <b>${nomeCliente}</b>,<br>Aqui estão as opções de parcelamento com cartão de crédito consultadas em nosso site.
                </p>
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: ${surface}; border-radius: 12px; margin-bottom: 24px;">
                  <tr><td style="padding: 16px 20px;">
                    <div style="font-size: 13px; color: ${slate}; margin-bottom: 4px;"><b>Evento:</b> ${eventoTexto}</div>
                    <div style="font-size: 13px; color: ${slate}; margin-bottom: 4px;"><b>Lote:</b> ${loteTexto}</div>
                    <div style="font-size: 13px; color: ${slate};"><b>Valor:</b> ${valorSimulado}</div>
                  </td></tr>
                </table>
                <table width="100%" border="0" cellspacing="0" cellpadding="0">${htmlParcelas}</table>
                ${dicasPagamento}
                
                <p style="margin-top: 24px; font-size: 11px; color: ${muted}; line-height: 1.4; font-style: italic;">
                  * Considera o valor de um lance ou proposta para a oferta no momento da simulação, sem adicionar eventuais comissões ou outras taxas que também podem ser parceladas.
                </p>
              </td>
            </tr>
            <tr>
              <td style="background-color: ${surface}; padding: 24px 32px; border-top: 1px solid ${line}; text-align: center;">
                <p style="margin: 0; font-size: 11px; color: ${muted}; line-height: 1.5;">
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