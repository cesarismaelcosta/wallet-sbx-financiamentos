/**
 * MOTOR DE CÁLCULO: CARTÃO DE CRÉDITO (COM VALIDAÇÃO)
 * @description Aplica fatores multiplicadores e valida a existência do prazo nas regras.
 */

/**
 * @interface Consultation
 * @description Representa cada linha de consulta individual (Marketplace).
 * Cada item aqui será uma linha na tabela 'simulation_consults'.
 */
interface Consultation {
  status_id: number;                    // ID sbX (1: Aprovado, 2: Negado, 8: Falha)
  is_selected: boolean;                 // Indica se esta consulta foi a escolhida pelo usuário (relevante para múltiplas opções) 
  external_operation_id: string | null; // ID no parceiro (proposta)
  message: string;                      // Mensagem do banco/parceiro
  
  // Barramento Financeiro Específico desta Consulta
  financial_institution_id: number | null;
  financial_institution_name: string | null;
  requested_value: number | null;
  down_payment_amount: number | null;
  down_payment_percentage: number | null;
  financed_amount: number | null;
  installments: number | null;
  cet_rate: number | null;
  installment_value: number | null;
}

/**
 * @interface PartnerResponse
 * @description O Envelope que o fandi-service ou credit-card-service retorna.
 */
interface PartnerResponse {
  success: boolean;            // A integração (handshake) funcionou?
  message: string;             // Resumo da operação do serviço
  consults: Consultation[];    // Lista de todas as consultas realizadas
  // Audit Trail individual para esta linha
  raw: any; 
}

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

export async function processarFluxoCartao(payload: any): Promise<PartnerResponse> {
  const rules = payload.rules;
  const installments = payload.installments || rules.default_installments;
  const requestedValue = payload.requested_value || payload.offer?.offer_value || 0;
  const downPayment = payload.down_payment_amount || 0;

  debugLog("CARTÃO: ", payload);

  // 1. VALIDAÇÃO DE ENTRADA (O "Disjuntor")
  // Verificamos se o prazo solicitado existe no dicionário de fatores
  const factor = rules.payment_factors?.[String(installments)];

  debugLog("CARTÃO FATORES: ", factor);

  if (factor === undefined || factor === null) {
    debugLog(`CARTÃO ERROR: Prazo de ${installments}x não permitido para estas regras.`);
    
    return {
      sucess: false,
      status_id: 8, // Falha Técnica/Negócio
      external_operation_id: null,
      message: `O prazo de ${installments} parcelas não está disponível para esta modalidade.`,
      
      // Barramento zerado por segurança
      financial_institution_id: null,
      financial_institution_name: null,
      financed_amount: requestedValue - downPayment,
      down_payment_amount: downPayment,
      installments: Number(installments),
      cet_rate: null,
      installment_value: null,    
      raw: { error: "Invalid installments", requested: installments, available: Object.keys(rules.payment_factors) }
    };
  }

  // 2. CÁLCULO (Sinal validado)
  const amountToFinance = requestedValue - downPayment;
  const installmentValue = amountToFinance * factor;

  // 3. RETORNO PADRONIZADO
  return {
    sucess: true,
    status_id: 1,
    external_operation_id: `CC-${Date.now()}`,
    message: "Cálculo de parcelamento concluído com sucesso",
    financial_institution_id: null,
    financial_institution_name: null,
    down_payment_amount: downPayment,
    financed_amount: amountToFinance,
    installments: Number(installments),
    cet_rate: null,
    installment_value: installmentValue,
    raw: {
      applied_factor: factor,
      calculation_base: amountToFinance,
      rules_snapshot: rules
    }
  } as PartnerResponse;
}