import { 
  Consultation,  
  SimulationPayload,
  EmailTemplateResult 
} from "../_shared/types.ts";

/**
 * Gera o HTML completo de notificação de e-mail para simulações de Veículos (Fandi).
 * Exibe a oferta aprovada em destaque e inclui o botão de WhatsApp dinâmico.
 * 
 * @param consults - Lista de opções de parcelamento (Veículos geralmente aprova a principal [0]).
 * @param payload - Objeto contendo os dados do evento, oferta, cliente e page_configs.
 * @returns Um objeto EmailTemplateResult contendo o HTML processado e anexos.
 */
export function generateUserEmailNotificationHtml(
  consults: Consultation[],
  payload: SimulationPayload
): EmailTemplateResult {
  
  // 1. Configurações de Ambiente e Tokens de Design
  const logoSrc = "cid:logo-wallet";
  const brandColor = payload.page_configs?.theme?.primary_color || "#B300FF";
  const nomeCliente = payload.entity?.name?.trim() || "Cliente";
  
  const formatCurrency = (value: number) => 
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const valorOferta = payload.offer?.offer_value || 0;
  const valorEntrada = payload.simulation_details?.down_payment_amount || 0;
  const valorFinanciado = consults[0]?.financed_amount || (valorOferta - valorEntrada);
  const valorSimulado = formatCurrency(payload.simulation_details?.requested_value || valorOferta);

  const eventoTexto = payload.event?.event_id 
    ? `${payload.event.event_id} | ${payload.event.event_description || ""}` 
    : (payload.event?.event_description || "");
    
  const loteTexto = payload.offer?.offer_id 
    ? `${payload.offer.offer_id} | ${payload.offer.offer_description || ""}` 
    : (payload.offer?.offer_description || "N/A");

  const fontStack = "'Inter', Arial, sans-serif";
  const ink = "#0f172a";
  const slate = "#334155";
  const muted = "#64748b";
  const line = "#e2e8f0";
  const surface = "#f8fafc";

  // 2. Motor de renderização dinâmica do Footer
  const renderFooter = (): string => {
    const config = payload.page_configs?.footer;
    if (!config?.template_text) return "";
    
    const links = config.links || [];
    const parts = config.template_text.split(/\{([^}]+)\}/g);
    
    return parts.map((part: string) => {
      const linkMatch = links.find((l: { text: string; url: string }) => l.text === part);
      return linkMatch 
        ? `<a href="${linkMatch.url}" style="text-decoration: underline; color: #64748b; font-weight: 500;">${part}</a>` 
        : part;
    }).join('');
  };

  // 3. Montagem do Bloco de Financiamento (Destaque Veículos)
  const mainConsult = consults && consults.length > 0 ? consults[0] : null;
  let htmlFinanciamento = "";

  if (mainConsult) {
    const parcelas = mainConsult.installments;
    const valorParcela = formatCurrency(mainConsult.installment_value || 0);
    const cetRate = Number(mainConsult.cet_rate || 0).toFixed(2);

    // Largura máxima para ficar elegante na web e centralizado
    // Fonte: peso 900 (black) e tamanhos proporcionais
    htmlFinanciamento = `
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 12px;">
        <tr>
          <td align="center">
            <div style="background: #ffffff; border: 2px solid ${brandColor}; border-radius: 12px; padding: 24px; max-width: 400px; margin: 0 auto;">
              
              <div style="font-size: 11px; color: ${brandColor}; font-weight: 900; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">
                Oferta Encontrada
              </div>
              
              <div style="color: ${ink}; font-weight: 900; margin-bottom: 20px;">
                <span style="color: ${brandColor}; font-size: 24px;">${parcelas}x</span> 
                <span style="font-size: 32px; letter-spacing: -0.5px;">${valorParcela}</span>
                <span style="font-size: 14px; color: ${muted}; font-weight: 500;">/mês*</span>
              </div>
              
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="border-top: 1px solid ${line}; padding-top: 16px;">
                <tr>
                  <td align="center" width="50%" style="border-right: 1px solid ${line};">
                    <div style="color: ${muted}; font-size: 11px; margin-bottom: 4px;">Valor Financiado</div>
                    <div style="font-weight: 700; font-size: 14px; color: ${ink};">${formatCurrency(valorFinanciado)}</div>
                  </td>
                  <td align="center" width="50%">
                    <div style="color: ${muted}; font-size: 11px; margin-bottom: 4px;">Taxa de Juros</div>
                    <div style="font-weight: 700; font-size: 14px; color: ${ink};">${cetRate}% a.m.</div>
                  </td>
                </tr>
              </table>
            </div>
          </td>
        </tr>
      </table>
    `;
  }

  // 4. Lógica do Botão WhatsApp
  const integrationConfig = payload.page_configs?.integration_details || (payload as any).integration_details || {};
  const contact = integrationConfig?.urlWhatsApp || integrationConfig?.whatsapp_number;
  let htmlWhatsApp = "";

  if (contact) {
    const docInfo = payload.entity?.name ? ` (${payload.entity.name} | ${payload.entity.document || ""})` : "";
    const entradaStr = valorEntrada > 0 ? `com entrada de ${formatCurrency(valorEntrada)}` : "sem entrada";
    const encerramento = payload.event?.event_end_date ? new Date(payload.event.event_end_date).toLocaleString("pt-BR") : "";
    const textoEncerramento = encerramento ? ` (Encerramento ${encerramento})` : "";

    const msg = `Olá! Fiz uma simulação ${entradaStr} e valor financiado de ${formatCurrency(valorFinanciado)} do lote "${payload.offer?.offer_description || ""}" (Lote ${payload.offer?.offer_id || ""}/ Valor Atual ${formatCurrency(valorOferta)}) do evento "${payload.event?.event_description || ""}"${textoEncerramento}. Gostaria de seguir com minha aprovação. Pode me ajudar?${docInfo}`;

    const numericContact = String(contact).replace(/[^0-9]/g, "");
    const whatsappUrl = String(contact).startsWith("http")
      ? `${contact}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/${numericContact}?text=${encodeURIComponent(msg)}`;

    htmlWhatsApp = `
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 24px;">
        <tr>
          <td align="center">
            <table border="0" cellspacing="0" cellpadding="0">
              <tr>
                <td align="center" style="border-radius: 12px; border: 2px solid ${brandColor}; background-color: transparent;">
                  <a href="${whatsappUrl}" target="_blank" style="font-size: 14px; font-family: ${fontStack}; font-weight: bold; color: ${brandColor}; text-decoration: none; padding: 14px 24px; display: inline-block; border-radius: 12px;">
                    💬 Continuar pelo WhatsApp
                  </a>
                  <a href="${whatsappUrl}" target="_blank" style="font-size: 14px; font-family: ${fontStack}; font-weight: bold; color: ${brandColor}; text-decoration: none; padding: 14px 24px; display: inline-block; border-radius: 12px; border: 2px solid ${brandColor};">
                    <span style="display: inline-block; background-color: ${brandColor}; border-radius: 50%; width: 20px; height: 20px; line-height: 20px; text-align: center; margin-right: 8px; vertical-align: middle;">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="white" style="display: block; margin: 4px auto;">
                        <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm0 4h9v2H6v-2z"/>
                      </svg>
                    </span>
                      Continuar pelo WhatsApp
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;
  }

  // 5. Montagem Final do Documento HTML
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: ${fontStack};">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 20px 10px;">
        <tr>
        <td align="center">
            <table width="100%" style="max-width: 95%; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            
            <tr>
                <td align="left" style="padding: 24px 32px; background-color: #f8f9fa; border-bottom: 1px solid ${line};">
                <img src="${logoSrc}" alt="Logo" width="140" style="display: block; border: 0;" />
                </td>
            </tr>

            <tr>
                <td style="padding: 40px 32px;">
                    <p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; color: ${slate};">
                        Olá <b>${nomeCliente}</b>,<br>
                        A simulação que você fez na Superbid tem grandes chances de ser aprovada. <br>
                        <span style="color: ${brandColor}; font-weight: 600;">Vamos continuar?</span>
                    </p>

                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: ${surface}; border-radius: 12px; margin-bottom: 24px;">
                    <tr>
                    <td style="padding: 16px 20px;">
                        <div style="font-size: 13px; color: ${slate}; margin-bottom: 4px;"><b>Evento:</b> ${eventoTexto}</div>
                        <div style="font-size: 13px; color: ${slate}; margin-bottom: 4px;"><b>Lote:</b> ${loteTexto}</div>
                        <div style="font-size: 13px; color: ${slate};"><b>Valor:</b> ${valorSimulado}</div>
                    </td>
                    </tr>
                </table>

                ${htmlFinanciamento}
                ${htmlWhatsApp}

                <p style="margin-top: 24px; font-size: 11px; color: ${muted}; line-height: 1.5; font-style: italic; text-align: center;">
                    *As condições apresentadas não são garantia de aprovação. Fale com nossos especialistas para seguirmos com a análise da sua linha de crédito.
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
    `.trim();

  return { 
    html, 
    attachments: [{ content_id: "logo-wallet", storage_path: "logos/wallet-sbx-200_60.png" }] 
  };
}