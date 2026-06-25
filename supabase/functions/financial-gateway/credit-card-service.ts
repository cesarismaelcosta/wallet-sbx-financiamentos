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

// Função de geração do template de e-mail
import { generateUserEmailNotificationHtml } from "./credit-card-templates.ts";

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

  // Gera o HTML do e-mail do Usuário
  const userEmailHTMLBody = generateUserEmailNotificationHtml(consults, payload);

  // 5. Retorno Padronizado
  return {
    success: true,
    message: "Grid de simulação gerado com sucesso.",
    consults: consults,
    raw: {
      rules_snapshot_id: rules?.id || "not-provided",
      executed_at: new Date().toISOString(),
      notifications: [
        {
          channel: 'email',
          template_slug: 'simulation-result',
          recipient_type: "ENTITY",
          subject: "Sua simulação de parcelamento do cartão na Superbid 🚀",
          email_body: userEmailHTMLBody
        }
      ]
    }
  } as SimulationResponse;
}