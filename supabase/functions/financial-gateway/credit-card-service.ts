/**
 * MOTOR DE CÁLCULO: CARTÃO DE CRÉDITO (COM VALIDAÇÃO)
 * @description Aplica fatores multiplicadores e valida a existência do prazo nas regras.
 */

import { 
  SimulationResponse,
  Consultation,  
  SimulationPayload,
  SimulationFinancials
} from "../_shared/types.ts";

import { Entity, Offer } from "../_shared/types.ts";

// Chave de controle para logs de depuração
const DEBUG_MODE = true;

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[CREDIT CARD DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

/**
 * Calcula a taxa de juros mensal usando o Método da Secante.
 * @param pv - Valor presente (Principal)
 * @param pmt - Valor da parcela
 * @param n - Número de parcelas
 * @returns A taxa de juros decimal (ex: 0.0178 para 1.78%)
 */
function calculateRate(pv: number, pmt: number, n: number): number {

  // 1. Ajuste de sinal (Segurança contra erro de fluxo)
  // Se o usuário passar os dois positivos, força a parcela a ser negativa
  let pmt_calc = (Math.sign(pv) === Math.sign(pmt)) ? -pmt : pmt;

  // Se o principal for igual à soma das parcelas, taxa é zero
  if (Math.abs(pv) === Math.abs(pmt_calc * n)) return 0;

  // 2. Parâmetros do Algoritmo (Método da Secante)
  let r0 = 0.01; // Chute inicial 1%
  let r1 = 0.02; // Chute inicial 2%
  const maxIterations = 100;
  const tolerance = 0.0000001;

  debugLog("pv", pv)
  debugLog("pmt", pmt)
  debugLog("number", n)

  for (let i = 0; i < maxIterations; i++) {
    // Calcula o erro (VPL) para r0 e r1
    const f0 = pv + pmt_calc * ((1 - Math.pow(1 + r0, -n)) / r0);
    const f1 = pv + pmt_calc * ((1 - Math.pow(1 + r1, -n)) / r1);

    // Evita divisão por zero
    if (Math.abs(f1 - f0) < 1e-15) break;

    // Projeta o próximo chute (r2)
    const r2 = r1 - f1 * (r1 - r0) / (f1 - f0);

    // Verifica precisão
    if (Math.abs(r2 - r1) < tolerance) {
      return Number((r2 * 100).toFixed(2)); // Retorna em formato decimal (0.0178)
    }

    // Atualiza para a próxima iteração
    r0 = r1;
    r1 = r2;
  }

  return Number((r1 * 100).toFixed(2));
}


/**
 * Gera o HTML completo de notificação de e-mail para simulações de parcelamento.
 * Integra o cabeçalho, o miolo (dados e grid de parcelas), seção de segurança 
 * e o rodapé dinâmico em uma estrutura única e autocontida.
 * @param consults - Lista de opções de parcelamento.
 * @param payload - Objeto contendo os dados do evento, oferta, cliente e footer_config.
 * @returns String contendo o HTML processado e pronto para envio.
 */
export function generateUserEmailNotificationHtml(
  consults: Consultation[],
  payload: SimulationPayload
): string {
  // 1. Configurações de Ambiente e Tokens de Design
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const LOGO_URL = `${SUPABASE_URL}/storage/v1/object/public/logos/wallet-sbx-logo.png`;

  const brandColor = payload.page_configs?.theme?.primary_color || "#B300FF";
  const nomeCliente = payload.entity?.name?.trim() || "Cliente";
  const valorSimulado = (payload.simulation_details?.requested_value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });

  const fontStack = "'Inter', Arial, sans-serif";
  const ink = "#0f172a";
  const slate = "#334155";
  const muted = "#64748b";
  const line = "#e2e8f0";
  const surface = "#f8fafc";

  /**
   * Motor de renderização dinâmica do Footer.
   * Processa o template_text buscando substituições baseadas no padrão {chave}
   * e aplicando os links fornecidos em payload.footer_config.
   */
  const renderFooter = () => {
    const config = payload.footer;
    if (!config?.template_text) return "";
    
    const parts = config.template_text.split(/\{([^}]+)\}/g);
    return parts.map((part) => {
      const linkMatch = config.links?.find((l) => l.text === part);
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
      <td width="48%" valign="top" style="padding-bottom: 16px;">
        <div style="background: #ffffff; border: 1px solid ${brandColor}; border-radius: 12px; padding: 16px 20px;">
          <div style="font-size: 18px; color: ${ink}; margin-bottom: 6px;">
            <span style="font-weight: 700; color: ${brandColor};">${item.installments}x</span> 
            <span style="font-weight: 700;">${valorFormatado}</span>
          </div>
          <div style="font-size: 13px; color: ${muted};">Total ${totalFormatado}</div>
        </div>
      </td>
    `;
    if (index % 2 === 0) htmlParcelas += `<td width="4%"></td>`;
    else htmlParcelas += `</tr>`;
  });
  if (consults.length % 2 !== 0) htmlParcelas += `<td width="48%"></td></tr>`;

  // 3. Seção de Segurança
  const dicasPagamento = `
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin-top: 24px; border-radius: 12px; overflow: hidden; border: 1px solid ${line};">
      <tr><td style="background: ${surface}; padding: 18px 22px; border-bottom: 1px solid ${line};">
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td width="28" valign="top" style="font-size: 18px;">&#128274;</td>
              <td valign="top" style="font-size: 15px; color: ${ink}; font-weight: 700; line-height: 1.2;">
                Veja como é seguro pagar com cartão
                <div style="font-size: 12px; color: ${muted}; font-weight: 400; margin-top: 2px;">
                  Você pode concluir seu pagamento com total tranquilidade
                </div>
              </td>
            </tr>
          </table>
      </td></tr>
      <tr><td style="background: #ffffff; padding: 22px;">
          <ul style="margin: 0; padding-left: 30px; color: ${slate}; font-size: 13px; line-height: 1.55;">
            <li style="margin-bottom: 8px;">Aceitamos Visa e Mastercard. É indispensável que o cartão seja <b>de titularidade do comprador</b>.</li>
            <li style="margin-bottom: 8px;">O número do seu cartão <b>não fica salvo</b> em nossos bancos de dados.</li>
            <li>Seu banco faz a validação via <b>protocolo 3DS</b>, garantindo a autenticação segura da compra.</li>
          </ul>
      </td></tr>
    </table>
  `;

  // 4. Montagem Final e Retorno do Documento HTML
  return `
  <!DOCTYPE html>
  <html>
  <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: ${fontStack};">
    <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 40px 20px;">
      <tr>
        <td align="center">
          <table width="100%" style="max-width: 600px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <tr>
              <td align="left" style="padding: 24px 32px; background-color: #f8f9fa; border-bottom: 1px solid ${line};">
                <img src="${LOGO_URL}" alt="Wallet sbX" width="140" style="display: block; border: 0;" />
              </td>
            </tr>
            <tr>
              <td style="padding: 40px 32px;">
                <p style="font-size: 16px; line-height: 1.6; margin: 0 0 24px 0; color: ${slate};">
                  Olá <b>${nomeCliente}</b>,<br>aqui estão as opções de parcelamento consultadas.
                </p>
                <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background: ${surface}; border-radius: 12px; margin-bottom: 24px;">
                  <tr><td style="padding: 16px 20px;">
                    <div style="font-size: 13px; color: ${slate};"><b>Evento:</b> ${payload.event?.event_description || ""}</div>
                    <div style="font-size: 13px; color: ${slate};"><b>Valor:</b> ${valorSimulado}</div>
                  </td></tr>
                </table>
                <table width="100%" border="0" cellspacing="0" cellpadding="0">${htmlParcelas}</table>
                ${dicasPagamento}
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
}

/**
 * Escurece uma cor hex em porcentagem.
 * Usado apenas para o degradê do cabeçalho.
 */
function darken(hex: string, percent: number): string {
  const num = parseInt(hex.replace("#", ""), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max((num >> 16) - amt, 0);
  const G = Math.max(((num >> 8) & 0x00ff) - amt, 0);
  const B = Math.max((num & 0x0000ff) - amt, 0);
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}


/**
 * @function processSimulationCreditCard
 * @description Centraliza o pipeline de simulação de parcelamento de cartão.
 * Itera sobre todos os prazos configurados nas regras e retorna o grid completo.
 */
export async function processSimulationCreditCard(payload: SimulationPayload): Promise<SimulationResponse> {

  // EXTRAÇÃO PADRONIZADA
  const simulation = (payload.simulation_details as SimulationFinancials) || {};
  const entity = (payload.entity as Entity) || {};
  const offer = (payload.offer as Offer) || {};
  const rules = payload.rules;

  // Buscando valores para calculo das ofertas
  const requestedValue = simulation.requested_value || 0;
  const downPayment = simulation.down_payment_amount || 0;
  
  // Cálculos base (Mantidos como estavam)
  const amountToFinance = requestedValue - downPayment;
  const downPaymentPercent = requestedValue > 0 ? (downPayment / requestedValue) * 100 : 0;

  debugLog("Processando simulação em massa para Cartão:", {requestedValue, downPayment, amountToFinance});

  // Validação se os fatores estão cadastrados nas regras no orchestrador
  if (!rules?.payment_factors || Object.keys(rules.payment_factors).length === 0) {
    return {
      success: false,
      message: "Nenhuma regra de parcelamento disponível para esta oferta.",
      consults: [],
      raw: { error: "No payment_factors found" }
    } as SimulationResponse;
  }

  // 4. Mapeamento do Grid de Parcelas
  // Aqui transformamos a tabela de fatores em uma lista de simulações (Consultations)
  const consults: Consultation[] = Object.entries(rules.payment_factors).map(([prazo, factor]) => {
    const installmentValue = amountToFinance * Number(factor);
    const cetRate = calculateRate(-amountToFinance, Number(installmentValue.toFixed(2)), Number(prazo))
  
    return {
      status_id: 1, // Aprovado / Gerado
      is_selected: false,
      external_operation_id: `SIM-CARD-${Date.now()}-${prazo}`,
      message: "Condição comercial gerada.",
      
      // Barramento Financeiro
      financial_institution_id: null,
      financial_institution_name: null,
      requested_value: requestedValue,
      down_payment_amount: downPayment,
      down_payment_percentage: Number(downPaymentPercent.toFixed(2)),
      financed_amount: amountToFinance,
      installments: Number(prazo),
      cet_rate: cetRate, 
      installment_value: Number(installmentValue.toFixed(2))
    };
  });

  // 5. Retorno Padronizado
  return {
    success: true,
    message: "Grid de simulação gerado com sucesso.",
    consults: consults,
    raw: {
      rules_snapshot_id: rules?.id || "not-provided",
      executed_at: new Date().toISOString(),
      notifications: {
        recipient_type: "ENTITY",
        email_body: generateUserEmailNotificationHtml(consults, payload),
        subject: "Sua simulação de parcelamento do cartão na Superbid 🚀"
      }
    }
  } as SimulationResponse;
}