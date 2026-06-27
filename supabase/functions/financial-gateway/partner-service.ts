/**
 * =========================================================================
 * MOTOR DE CÁLCULO: SIMULAÇÃO DE CONDIÇÕES COMERCIAIS
 * =========================================================================
 * @module processSimulationPartner
 * @description Centraliza o pipeline de validação de fatores e simulação de parcelamento
 * para parceiros comerciais, encapsulando o resultado no formato esperado pelo simulation-handler.
 */

import { 
  SimulationResponse,
  Consultation, 
  SimulationFinancials, 
  VehicleCollateral, 
  HomeCollateral, 
  SimulationPayload, 
  SimulationConsent, 
  SimulationUpdate 
} from "../_shared/types.ts";

import { 
  Offer
} from "../_shared/types.ts";

import { 
  generateUserEmailNotificationHtml,
  generatePartnerEmailNotificationHtml
} from "./partner-notifications.ts";

/**
 * CONFIGURAÇÕES TÉCNICAS E FLAGS DE AMBIENTE
 */
// Chave de controle global para exibição de rastros no console do servidor
const DEBUG_MODE = true;

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * @description Captura informações estratégicas do pipeline sem expor dados em ambientes produtivos se a flag estiver inativa.
 */
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[PARTNER-DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : "");
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
 * PROCESSAR FLUXO PARCEIRO
 * @async
 * @function processSimulationPartner
 * @param {any} payload Dados dinâmicos enviados pelo front-end contendo regras, prazos e valores.
 * @returns {Promise<SimulationResponse>} Retorno envelopado estritamente aderente ao contrato técnico do core.
 */
export async function processSimulationPartner(payload: any): Promise<SimulationResponse> {
  // EXTRAÇÃO PADRONIZADA (Mesma estrutura do CreditCard)
  const simulation = (payload.simulation_details as SimulationFinancials) || {};
  const offer = (payload.offer as Offer) || {};
  const rules = payload.rules;
  const installments = simulation.installments || null; 

  // Buscando valores
  const requestedValue = simulation.requested_value || 0;
  const downPayment = simulation.down_payment_amount || 0;

  debugLog("Payload de entrada capturado para processamento:", {
    requested_value: requestedValue,
    down_payment_amount: downPayment,
    installments: installments
  });

  // Base do cálculo matemático: Valor Líquido que precisa ser financiado
  const amountToFinance = requestedValue - downPayment;
  const downPaymentPercent = requestedValue > 0 ? (downPayment / requestedValue) * 100 : 0;

  // Recupera o fator multiplicador mapeado na tabela dinamicamente por chave string
  const factor = rules?.payment_factors?.[String(installments)];

  debugLog("Resultado da busca de fatores no dicionário de regras:", {
    prazo: installments,
    fator: factor
  });

  // Se o prazo não estiver listado no JSON de regras do parceiro, corta a execução imediatamente
  if (factor === undefined || factor === null) {
    debugLog(`[BLOQUEIO] Prazo de ${installments}x não é permitido ou está sem fator cadastrado.`);
    
    return {
      success: false,
      message: `O prazo de ${installments} parcelas não está disponível para esta modalidade.`,
      consults: [
        {
          status_id: 8, // Falha de Negócio / Regra Não Atendida
          is_selected: false,
          external_operation_id: null,
          message: `Prazo inválido para a tabela de fatores do parceiro.`,
          
          // Barramento financeiro estruturado com segurança
          financial_institution_id: null,
          financial_institution_name: payload.page_configs?.partner?.name || null,
          requested_value: requestedValue,
          down_payment_amount: downPayment,
          down_payment_percentage: Number(downPaymentPercent.toFixed(2)),
          financed_amount: amountToFinance,
          installments: Number(installments),
          cet_rate: null,
          installment_value: null // Nulo porque o cálculo não pôde ser efetuado
        }
      ],
      // Trilha de depuração para correção rápida na retaguarda
      raw: { 
        error: "Invalid installments dictionary key", 
        requested: installments, 
        available_factors: rules?.payment_factors ? Object.keys(rules.payment_factors) : [] 
      }
    } as SimulationResponse;
  }

  // 2. MOTOR DE CÁLCULO DE CONDIÇÃO COMERCIAL (Fluxo Autorizado)
  // Aplicação direta do fator sobre o montante financiado
  const installmentValue = amountToFinance * factor;
  const cetRate = calculateRate(-amountToFinance, Number(installmentValue.toFixed(2)), Number(installments))

  // 3. OBJETO COM O RESULTADO DA CONSULTA
  const consult: Consultation = {
    status_id: 1, 
    is_selected: true,
    external_operation_id: `SIM-PRC-${Date.now()}`,
    message: "Referência de taxa e parcela gerada com sucesso.",
    financial_institution_id: null,
    financial_institution_name: payload.page_configs?.partner?.name || "Parceiro Comercial",
    requested_value: requestedValue,
    down_payment_amount: downPayment,
    down_payment_percentage: Number(downPaymentPercent.toFixed(2)),
    financed_amount: amountToFinance,
    installments: Number(installments),
    cet_rate: cetRate,
    installment_value: Number(installmentValue.toFixed(2)) 
  };

  // 4. GERAÇÃO DOS E-MAILS (Se chegou aqui, é porque aprovou)
  let notificationsConfig = [];

  // 4.1 Email para o Cliente (User)
  const userEmailData = generateUserEmailNotificationHtml([consult], payload);
  notificationsConfig.push({
    channel: 'email',
    template_slug: 'partner-simulation-user',
    recipient_type: "ENTITY", // Vai para o e-mail do cliente
    recipient: payload.entity?.email,
    subject: "Sua simulação de financiamento na Superbid",
    email_body: userEmailData.html,
    attachments: userEmailData.attachments 
  });
  
  // 4.2 Email para a Mesa de Crédito / Parceiro (Admin)
  const adminEmailData = generatePartnerEmailNotificationHtml([consult], payload);
  notificationsConfig.push({
    channel: 'email',
    template_slug: 'partner-simulation-admin',
    recipient_type: "PARTNER", // O Outbox-processor vai rotear para o e-mail do parceiro
    recipient: payload.entity?.email,
    subject: `Novo Lead de Financiamento - ${payload.entity?.name || "Cliente"}`,
    email_body: adminEmailData.html,
    attachments: adminEmailData.attachments 
  });

  // 5. RETORNO PADRONIZADO
  return {
    success: true,
    message: "Simulação de condições comerciais concluída com sucesso",
    consults: [consult],
    raw: {
      applied_factor: factor,
      calculation_base: amountToFinance,
      rules_snapshot_id: rules?.id || "not-provided",
      executed_at: new Date().toISOString(),
      notifications: notificationsConfig
    }
  } as SimulationResponse;
}