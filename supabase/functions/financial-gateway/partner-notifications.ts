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
 * Gera o HTML completo de notificação de e-mail para Parceiros (Mesa de Crédito).
 * VERSÃO: PARTNER (Parceiro Comercial)
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO: NEUTRAL PURITY & ZERO-RADIUS ALIGNMENT
 * =========================================================================
 * [ATUALIZAÇÃO VISUAL E DE GOVERNANÇA]:
 * - Supressão de Branding: A variável `brandColor` customizada foi removida. O 
 *   template agora obedece estritamente ao tema corporativo.
 * - Zero-Radius: Todas as bordas arredondadas (anteriormente 8px/12px) foram
 *   removidas (0px) para alinhar à identidade enterprise.
 * - Neutral Purity: Uso exclusivo dos tokens `surface`, `ink` e `slate` em toda
 *   a paleta de cores.
 * - Tipografia: Pesos ajustados (font-weight: 600/700 max) e blocos condensados.
 * 
 * @param consults - Lista de opções de parcelamento simuladas.
 * @param payload - Objeto contendo os dados do evento, oferta, cliente e vendedor.
 * @returns Um objeto EmailTemplateResult contendo o HTML processado e anexos.
 */
export function generatePartnerEmailNotificationHtml(
  consults: Consultation[],
  payload: SimulationPayload
): EmailTemplateResult {
  
  // 1. Configurações de Ambiente e Extração de Dados
  const logoSrc = "cid:logo-wallet";
  
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

  // 2. Tokens de Design (Baseados no Tailwind Neutral)
  const fontStack = "'Inter', Arial, sans-serif";
  const ink = "#171717";          // neutral-900
  const slate = "#525252";        // neutral-600
  const muted = "#737373";        // neutral-500
  const line = "#e5e5e5";         // neutral-200
  const borderCard = "#d4d4d4";   // neutral-300
  const surface = "#f5f5f5";      // neutral-100
  const surfaceAlt = "#fafafa";   // neutral-50

  // 3. Definição de Estilos Compartilhados para a Tabela
  const headerStyle = `background: ${surfaceAlt}; padding: 12px 16px; font-size: 12px; font-weight: 700; color: ${ink}; text-transform: uppercase; border-bottom: 1px solid ${line}; letter-spacing: 0.5px;`;
  const cellStyle = `padding: 12px 16px; border-bottom: 1px solid ${line}; font-size: 13px; color: ${ink};`;
  const labelStyle = `font-weight: 600; color: ${slate}; width: 35%; background-color: ${surfaceAlt};`;

  // 4. Montagem da Tabela de Dados Principais (Zero-Radius)
  const htmlTabelaDados = `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: #ffffff; border: 1px solid ${borderCard}; border-radius: 0; overflow: hidden; margin-bottom: 24px;">
      
      <tr>
        <td colspan="2" style="${headerStyle}">▪ Dados do Proponente</td>
      </tr>
      <tr><td style="${cellStyle} ${labelStyle}">Nome/Razão Social</td><td style="${cellStyle}">${clienteNome}</td></tr>
      <tr><td style="${cellStyle} ${labelStyle}">CPF/CNPJ</td><td style="${cellStyle}">${clienteDoc}</td></tr>
      <tr><td style="${cellStyle} ${labelStyle}">E-mail</td><td style="${cellStyle}">${clienteEmail}</td></tr>
      <tr><td style="${cellStyle} ${labelStyle}">Telefone/WhatsApp</td><td style="${cellStyle}">${clientePhone}</td></tr>

      <tr>
        <td colspan="2" style="${headerStyle} border-top: 1px solid ${line};">▪ Dados do Evento</td>
      </tr>
      <tr><td style="${cellStyle} ${labelStyle}">Evento</td><td style="${cellStyle}">${eventoTexto}</td></tr>
      <tr><td style="${cellStyle} ${labelStyle}">Vendedor (Seller)</td><td style="${cellStyle}">${sellerName}</td></tr>
      <tr><td style="${cellStyle} ${labelStyle}">Encerramento</td><td style="${cellStyle}">${encerramentoData}</td></tr>

      <tr>
        <td colspan="2" style="${headerStyle} border-top: 1px solid ${line};">▪ Dados do Lote (Bem)</td>
      </tr>
      <tr><td style="${cellStyle} ${labelStyle}">Lote</td><td style="${cellStyle}">${loteTexto}</td></tr>
      <tr><td style="${cellStyle} ${labelStyle}">Valor do Bem (Base)</td><td style="${cellStyle} font-weight: 600;">${formatCurrency(valorOferta)}</td></tr>

      <tr>
        <td colspan="2" style="${headerStyle} border-top: 1px solid ${line};">▪ Condição Simulada</td>
      </tr>
      <tr><td style="${cellStyle} ${labelStyle}">Valor de Entrada</td><td style="${cellStyle}">${formatCurrency(valorEntrada)}</td></tr>
      <tr><td style="${cellStyle} ${labelStyle}">Valor a Financiar</td><td style="${cellStyle}">${formatCurrency(valorFinanciado)}</td></tr>
      
      ${mainConsult ? `
        <tr>
          <td style="${cellStyle} ${labelStyle}">Plano Simulado</td>
          <td style="${cellStyle} font-weight: 700; color: ${ink}; font-size: 14px;">
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

  // 5. Montagem Final do Documento HTML
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: ${surface}; font-family: ${fontStack};">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: ${surface}; padding: 20px 10px;">
        <tr>
        <td align="center">
            <table width="100%" style="max-width: 650px; background-color: #ffffff; border: 1px solid ${line}; border-radius: 0; overflow: hidden; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);">
            
            <tr>
                <td align="left" style="padding: 24px 32px; background-color: #ffffff; border-bottom: 1px solid ${line};">
                  <img src="${logoSrc}" alt="Logo" width="130" style="display: block; border: 0;" />
                </td>
            </tr>

            <tr>
                <td style="padding: 32px;">
                    <div style="font-size: 18px; font-weight: 700; color: ${ink}; margin-bottom: 8px; letter-spacing: -0.3px; text-transform: uppercase;">
                      Novo Lead de Financiamento
                    </div>
                    <p style="font-size: 13px; line-height: 1.6; margin: 0 0 24px 0; color: ${slate};">
                        Um cliente realizou uma simulação de crédito com base na tabela de fatores. Abaixo estão todos os detalhes da operação para acionamento comercial.
                    </p>

                    ${htmlTabelaDados}

                    <div style="background-color: ${surfaceAlt}; border: 1px solid ${borderCard}; border-left: 3px solid ${ink}; padding: 16px; border-radius: 0;">
                        <p style="font-size: 12px; color: ${slate}; line-height: 1.5; margin: 0;">
                            <strong style="color: ${ink};">Ação Comercial Requerida:</strong> Recomendamos o contato imediato com o proponente utilizando os dados acima para confirmar o interesse, coletar dados complementares e seguir com a formalização da análise de crédito.
                        </p>
                    </div>
                </td>
            </tr>

            <tr>
                <td style="background-color: ${surfaceAlt}; padding: 20px 32px; border-top: 1px solid ${line}; text-align: center;">
                <p style="margin: 0; font-size: 11px; color: ${muted}; line-height: 1.5;">
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