import { 
  Consultation,  
  SimulationPayload,
  EmailTemplateResult 
} from "../_shared/types.ts";

/**
 * Gera o HTML completo de notificação de e-mail para simulações de Parceiros (Fluxo não integrado).
 * VERSÃO: USER (Cliente)
 * Exibe a oferta aprovada em destaque e inclui o botão de WhatsApp dinâmico.
 * 
 * @param consults - Lista de opções de parcelamento.
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

  // 3. Bloco de Parceria
  const partnerConfig = payload.page_configs?.offer_panel?.partner;
  let htmlParceria = "";

  if (partnerConfig?.name) {
    htmlParceria = `
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-bottom: 24px;">
        <tr>
          <td align="center">
            <div style="max-width: 400px; margin: 0 auto; padding: 12px 10px; border: 1px solid ${line}; border-radius: 12px; font-size: 11px; color: ${muted}; background: ${surface}; text-align: center;">
              ${partnerConfig.label || "Parceria com:"} <span style="font-weight: 700; color: ${ink};">${partnerConfig.name}</span>
            </div>
          </td>
        </tr>
      </table>
    `;
  }

  // 4. Montagem do Bloco de Financiamento
  const mainConsult = consults && consults.length > 0 ? consults[0] : null;
  let htmlFinanciamento = "";

  if (mainConsult) {
    const parcelas = mainConsult.installments;
    const valorParcela = formatCurrency(mainConsult.installment_value || 0);
    const cetRate = Number(mainConsult.cet_rate || 0).toFixed(2);

    htmlFinanciamento = `
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 12px;">
        <tr>
          <td align="center">
            <div style="background: #ffffff; border: 2px solid ${brandColor}; border-radius: 12px; padding: 24px; max-width: 400px; margin: 0 auto;">
              
              <div style="font-size: 11px; color: ${brandColor}; font-weight: 900; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px;">
                Condição Encontrada
              </div>
              
              <div style="color: ${ink}; font-weight: 600; margin-bottom: 20px; white-space: nowrap;">
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

  // 5. Lógica do Botão WhatsApp
  const integrationConfig = payload.page_configs?.integration_details || (payload as any).integration_details || {};
  const contact = integrationConfig?.urlWhatsApp || integrationConfig?.whatsapp_number;
  let htmlWhatsApp = "";

  if (contact) {
    const docInfo = payload.entity?.name ? ` (${payload.entity.name} | ${payload.entity.document || ""})` : "";
    const entradaStr = valorEntrada > 0 ? `com entrada de ${formatCurrency(valorEntrada)}` : "sem entrada";
    const encerramento = payload.event?.event_end_date ? new Date(payload.event.event_end_date).toLocaleString("pt-BR") : "";
    const textoEncerramento = encerramento ? ` (Encerramento ${encerramento})` : "";

    const msg = `Olá! Fiz uma simulação ${entradaStr} e valor financiado de ${formatCurrency(valorFinanciado)} do lote "${payload.offer?.offer_description || ""}" (Lote ${payload.offer?.offer_id || ""}/ Valor Atual ${formatCurrency(valorOferta)}) do evento "${payload.event?.event_description || ""}"${textoEncerramento}. Gostaria de seguir com minha análise de crédito. Pode me ajudar?${docInfo}`;

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
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    `;
  }

  // 6. Montagem Final do Documento HTML
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
                        Temos uma referência de preço para o seu financiamento.<br>
                        <span style="color: ${brandColor}; font-weight: 600;">Vamos continuar?</span>
                    </p>

                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: ${surface}; border-radius: 12px; margin-bottom: 24px;">
                    <tr>
                    <td style="padding: 16px 20px;">
                        <div style="font-size: 13px; color: ${slate}; margin-bottom: 4px;"><b>Evento:</b> ${eventoTexto}</div>
                        <div style="font-size: 13px; color: ${slate}; margin-bottom: 4px;"><b>Lote:</b> ${loteTexto}</div>
                        <div style="font-size: 13px; color: ${slate};"><b>Valor Financiado:</b> ${valorSimulado}</div>
                    </td>
                    </tr>
                </table>

                ${htmlParceria}
                ${htmlFinanciamento}
                ${htmlWhatsApp}

                <p style="margin-top: 24px; font-size: 11px; color: ${muted}; line-height: 1.5; font-style: italic; text-align: justify;">
                    *O valor de parcela é baseado em taxas de referência para financiamentos com nosso parceiro e não representa garantia de aprovação. Um espcialista pode entrar em contato para seguirm com a análise de crédito e buscar as melhores condições para você financiar essa oferta.
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

/**
 * Gera o HTML completo de notificação de e-mail para Parceiros (Mesa de Crédito).
 * VERSÃO: PARTNER (Parceiro Comercial)
 */
export function generatePartnerEmailNotificationHtml(
  consults: Consultation[],
  payload: SimulationPayload
): EmailTemplateResult {
  
  const logoSrc = "cid:logo-wallet";
  const brandColor = payload.page_configs?.theme?.primary_color || "#0f172a"; 
  
  const formatCurrency = (value: number) => 
    value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const clienteNome = payload.entity?.name?.trim() || "Não informado";
  const clienteDoc = payload.entity?.document || "Não informado";
  const clienteEmail = payload.entity?.email || "Não informado";
  const clientePhone = payload.entity?.phone || "Não informado";

  const sellerName = payload.seller?.trade_name || payload.seller?.legal_name || "Não informado";
  const eventoTexto = payload.event?.event_id 
    ? `${payload.event.event_id} - ${payload.event.event_description || ""}` 
    : (payload.event?.event_description || "N/A");
  const encerramentoData = payload.event?.event_end_date
    ? new Date(payload.event.event_end_date).toLocaleString("pt-BR", { 
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' 
      })
    : "Não informada";

  const loteTexto = payload.offer?.offer_id 
    ? `${payload.offer.offer_id} - ${payload.offer.offer_description || ""}` 
    : (payload.offer?.offer_description || "N/A");
  const valorOferta = payload.offer?.offer_value || 0;

  const valorEntrada = payload.simulation_details?.down_payment_amount || 0;
  const mainConsult = consults && consults.length > 0 ? consults[0] : null;
  const valorFinanciado = mainConsult?.financed_amount || (valorOferta - valorEntrada);

  const fontStack = "'Inter', Arial, sans-serif";
  const ink = "#0f172a";
  const slate = "#334155";
  const muted = "#64748b";
  const line = "#e2e8f0";
  const surface = "#f8fafc";

  // AJUSTE 1: font-weight alterado para 600 aqui no headerStyle
  const headerStyle = `background: ${surface}; padding: 14px 16px; font-size: 13px; font-weight: 600; color: ${slate}; text-transform: uppercase; border-bottom: 2px solid ${line}; letter-spacing: 0.5px;`;
  const cellStyle = `padding: 12px 16px; border-bottom: 1px solid ${line}; font-size: 13px; color: ${ink};`;
  const labelStyle = `font-weight: 600; color: ${slate}; width: 35%; background-color: #fafafa;`;

  // AJUSTE 2: Inclusão do bullet "▪" em todas as sessões
  const htmlTabelaDados = `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: #ffffff; border: 1px solid ${brandColor}; border-radius: 8px; overflow: hidden; margin-bottom: 24px;">
      
      <tr>
        <td colspan="2" style="${headerStyle}">▪ Dados do Proponente</td>
      </tr>
      <tr><td style="${cellStyle} ${labelStyle}">Nome/Razão Social</td><td style="${cellStyle}">${clienteNome}</td></tr>
      <tr><td style="${cellStyle} ${labelStyle}">CPF/CNPJ</td><td style="${cellStyle}">${clienteDoc}</td></tr>
      <tr><td style="${cellStyle} ${labelStyle}">E-mail</td><td style="${cellStyle}">${clienteEmail}</td></tr>
      <tr><td style="${cellStyle} ${labelStyle}">Telefone/WhatsApp</td><td style="${cellStyle}">${clientePhone}</td></tr>

      <tr>
        <td colspan="2" style="${headerStyle} border-top: 1px solid ${brandColor};">▪ Dados do Evento</td>
      </tr>
      <tr><td style="${cellStyle} ${labelStyle}">Evento</td><td style="${cellStyle}">${eventoTexto}</td></tr>
      <tr><td style="${cellStyle} ${labelStyle}">Vendedor (Seller)</td><td style="${cellStyle}">${sellerName}</td></tr>
      <tr><td style="${cellStyle} ${labelStyle}">Encerramento</td><td style="${cellStyle}">${encerramentoData}</td></tr>

      <tr>
        <td colspan="2" style="${headerStyle} border-top: 1px solid ${brandColor};">▪ Dados do Lote (Bem)</td>
      </tr>
      <tr><td style="${cellStyle} ${labelStyle}">Lote</td><td style="${cellStyle}">${loteTexto}</td></tr>
      <tr><td style="${cellStyle} ${labelStyle}">Valor do Bem (Base)</td><td style="${cellStyle} font-weight: 600;">${formatCurrency(valorOferta)}</td></tr>

      <tr>
        <td colspan="2" style="${headerStyle} border-top: 1px solid ${brandColor};">▪ Condição Simulada</td>
      </tr>
      <tr><td style="${cellStyle} ${labelStyle}">Valor de Entrada</td><td style="${cellStyle}">${formatCurrency(valorEntrada)}</td></tr>
      <tr><td style="${cellStyle} ${labelStyle}">Valor a Financiar</td><td style="${cellStyle}">${formatCurrency(valorFinanciado)}</td></tr>
      
      ${mainConsult ? `
        <tr>
          <td style="${cellStyle} ${labelStyle}">Plano Simulado</td>
          <td style="${cellStyle} font-weight: 600; color: ${brandColor}; font-size: 15px;">
            ${mainConsult.installments}x de ${formatCurrency(mainConsult.installment_value || 0)}
          </td>
        </tr>
        <tr>
          <td style="${cellStyle} ${labelStyle}; border-bottom: none;">Taxa de Referência</td>
          <td style="${cellStyle}; border-bottom: none;">${Number(mainConsult.cet_rate || 0).toFixed(2)}% a.m.</td>
        </tr>
      ` : `
        <tr>
          <td colspan="2" style="${cellStyle}; border-bottom: none; color: ${muted}; font-style: italic;">
            Nenhuma condição de parcelamento registrada.
          </td>
        </tr>
      `}
    </table>
  `;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: ${fontStack};">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 24px 10px;">
        <tr>
        <td align="center">
            <table width="100%" style="max-width: 650px; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            
            <tr>
                <td align="left" style="padding: 24px 32px; background-color: #f8f9fa; border-bottom: 1px solid ${line};">
                  <img src="${logoSrc}" alt="Logo" width="140" style="display: block; border: 0;" />
                </td>
            </tr>

            <tr>
                <td style="padding: 32px;">
                    <!-- AJUSTE 3: Título principal também alterado para font-weight: 600 -->
                    <div style="font-size: 20px; font-weight: 600; color: ${ink}; margin-bottom: 8px; letter-spacing: -0.5px;">
                      Novo Lead de Financiamento
                    </div>
                    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 24px 0; color: ${slate};">
                        Um cliente realizou uma simulação de crédito com base na sua tabela de fatores. Abaixo estão todos os detalhes da operação para acionamento comercial.
                    </p>

                    ${htmlTabelaDados}

                    <div style="background-color: ${surface}; border: 1px solid ${line}; border-left: 4px solid ${brandColor}; padding: 16px; border-radius: 4px;">
                        <p style="font-size: 13px; color: ${slate}; line-height: 1.5; margin: 0;">
                            <strong style="color: ${brandColor};">Ação Comercial Requerida:</strong> Recomendamos o contato imediato com o proponente utilizando os dados acima (telefone/e-mail) para confirmar o interesse, coletar dados complementares e seguir com a formalização da análise de crédito no seu sistema.
                        </p>
                    </div>
                </td>
            </tr>

            <tr>
                <td style="background-color: ${surface}; padding: 20px 32px; border-top: 1px solid ${line}; text-align: center;">
                <p style="margin: 0; font-size: 11px; color: ${muted};">
                    Este é um e-mail gerado automaticamente pelo Motor de Simulação.<br>
                    ID da Operação: ${mainConsult?.external_operation_id || "N/A"}
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