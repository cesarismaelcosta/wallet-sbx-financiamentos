/**
 * CREDITAS SERVICE - MOTOR DE INTEGRAÇÃO AUTO EQUITY
 * @description Módulo responsável pela orquestração do pipeline de crédito com a Creditas.
 * Opera de forma desacoplada através de estados (steps), permitindo validações granulares.
 * * --- WORKFLOW DE INTEGRAÇÃO ---
 * 1. ELEGIBILIDADE (step: 'ELIGIBILITY'): Valida restrições de CPF e elegibilidade básica.
 * 2. SIMULAÇÃO (step: 'SIMULATION'): Executa a análise assertiva e retorna o grid de ofertas aprovadas.
 * * @param payload Dados do cliente, veículo e parâmetros financeiros.
 * @param step Define o passo a ser executado ('ELIGIBILITY' ou 'SIMULATION').
 * @returns {Promise<SimulationResponse>} Contrato unificado (Consultation[]) aderente ao core.
 */

import { 
  SimulationResponse,
  Consultation, 
  SimulationFinancials, 
  VehicleCollateral 
} from "../_shared/types.ts";

import { Entity, Offer } from "../_shared/types.ts";

// ============================================================================
// CONFIGURAÇÕES E FLAGS
// ============================================================================
const DEBUG_MODE = true;

const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[CREDITAS-AUTO-EQUITY-DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

// Helper de Regra (Stateless)
function getMockBehavior(cpf: string) {
  const firstDigit = parseInt((cpf.replace(/\D/g, "").charAt(0)) || "0", 10);
  return {
    firstDigit,
    isEligible: firstDigit <= 7,           // 0-7 elegível
    isSimulationApproved: firstDigit <= 4  // 0-4 aprovado
  };
}

// 1. ELEGIBILIDADE
async function runEligibilityStep(payload: any): Promise<SimulationResponse> {
  
  // EXTRAÇÃO PADRONIZADA
  const simulation = (payload.simulation_details as SimulationFinancials) || {};
  const entity = (payload.entity as Entity) || {};
  const offer = (payload.offer as Offer) || {};
  const rules = payload.rules;

  // VALIDA RESULTADO ESPERADO DE ACORDO COM DOCUMENTO
  const behavior = getMockBehavior(entity.document || "");

  if (!behavior.isEligible) {
    return {
      success: true,
      message: "Mock. Cliente não elegível.",
      consults: [{
        status_id: 2,
        is_selected: true,
        external_operation_id: null,
        message: "Elegibilidade negada (Regra CPF E CNPJ INÍCIO 8 E 9).",
        financial_institution_id: 342, 
        financial_institution_name: "Creditas",
        requested_value: simulation.requested_value,
        down_payment_amount: null, down_payment_percentage: null, financed_amount: null,
        installments: null, cet_rate: null, installment_value: null
      }],
      raw: { firstDigit: behavior.firstDigit, step: 'CHECK_ELIGIBILITY' }
    } as SimulationResponse;
  }

  return {
    success: true,
    message: "Mock. Cliente elegível.",
    consults: [{
      status_id: 1,
      is_selected: true,
      external_operation_id: null,
      message: "Mock. Cliente aprovado na análise de elegibilidade. (Regra CPF E CNPJ INÍCIO 0 a 7).",
      financial_institution_id: 342, 
      financial_institution_name: "Creditas",
      requested_value: simulation.requested_value,
      down_payment_amount: null, down_payment_percentage: null, financed_amount: null,
      installments: null, cet_rate: null, installment_value: null
    }],
    raw: { firstDigit: behavior.firstDigit, step: 'CHECK_ELIGIBILITY' }
  } as SimulationResponse;
}

// 2. SIMULAÇÃO
async function runSimulationStep(payload: any): Promise<SimulationResponse> {

  // EXTRAÇÃO PADRONIZADA
  const simulation = (payload.simulation_details as SimulationFinancials) || {};
  const entity = (payload.entity as Entity) || {};
  const offer = (payload.offer as Offer) || {};
  const rules = payload.rules;

  // VALIDA RESULTADO ESPERADO DE ACORDO COM DOCUMENTO
  const behavior = getMockBehavior(entity.document || "");
  const requestedValue = simulation.requested_value || 0;

  if (!behavior.isSimulationApproved) {
    return {
      success: true,
      message: "Mock. Proposta recusada na análise de crédito.",
      consults: [{
        status_id: 2,
        is_selected: true,
        external_operation_id: null,
        message: "Mock. Simulação recusada (Regra CPF/CNPJ início 5 A 7).",
        financial_institution_id: 342, 
        financial_institution_name: "Creditas",
        requested_value: requestedValue,
        down_payment_amount: null, 
        down_payment_percentage: null, 
        financed_amount: null,
        installments: null, 
        cet_rate: null, 
        installment_value: null
      }],
      raw: { firstDigit: behavior.firstDigit, step: 'EXECUTE_SIMULATION' }
    } as SimulationResponse;
  }

  // SUCESSO: Regra 0-2 (Aprovado)
  // financed_amount agora igual ao requestedValue
  const consults: Consultation[] = [12, 24, 36].map((n, index) => ({
    status_id: 1,
    is_selected: index === 0,
    external_operation_id: `PRP-${payload.document}`,
    message: "Mock. Simulação aprovada (Regra CPF/CNPJ início 0 a 4).",
    financial_institution_id: 342, 
    financial_institution_name: "Creditas",
    requested_value: requestedValue,
    down_payment_amount: 0, 
    down_payment_percentage: 0,
    financed_amount: requestedValue, 
    installments: n,
    cet_rate: 1.89,
    installment_value: Number((requestedValue / n).toFixed(2))
  }));

  return {
    success: true,
    message: "Simulação realizada com sucesso.",
    consults: consults,
    raw: { firstDigit: behavior.firstDigit, step: 'EXECUTE_SIMULATION' }
  } as SimulationResponse;
}

// ORQUESTRADOR
export async function processSimulationCreditasAutoEquity(
  payload: any,
  step: 'CHECK_ELIGIBILITY' | 'EXECUTE_SIMULATION' = 'EXECUTE_SIMULATION'
): Promise<SimulationResponse> {
  
  if (step === 'CHECK_ELIGIBILITY') {
    return await runEligibilityStep(payload);
  }

  if (step === 'EXECUTE_SIMULATION') {
    return await runSimulationStep(payload);
  }

  throw new Error("Step inválido");
}

