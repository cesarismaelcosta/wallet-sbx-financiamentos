/**
 * @fileoverview MOTOR DE CÁLCULO: CARTÃO DE CRÉDITO (COM VALIDAÇÃO)
 * @path supabase/functions/financial-gateway/credit-card-service.ts
 * 
 * ============================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: INTERNAL COMPUTE ENGINE
 * ============================================================================
 * [MUDANÇAS ARQUITETURAIS]:
 * 1. {SRP / Dead Code}: Removida a função `darken()` que pertencia à camada de UI.
 * 2. {Math Safety}: Adicionada proteção contra divisão por zero (`n <= 0`) no 
 *    Método da Secante.
 * 3. {Smart Selection}: O Grid agora auto-seleciona a parcela mais longa (ex: 12x)
 *    por padrão, garantindo que o botão de avançar na UI não nasça bloqueado.
 * 4. {Doc Sync}: Corrigida a tipagem JSDoc do `calculateRate` que prometia 
 *    decimal mas entregava percentual.
 * 
 * @author Cesar Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { 
  SimulationResponse,
  Consultation,  
  SimulationPayload,
  SimulationFinancials
} from "../_shared/types.ts";

import { Entity, Offer } from "../_shared/types.ts";
import { generateUserEmailNotificationHtml } from "./credit-card-notifications.ts";
import { debugLog } from "../_shared/logger.ts";

/**
 * ============================================================================
 * 🧮 HELPERS MATEMÁTICOS
 * ============================================================================
 */

/**
 * Calcula a taxa de juros mensal usando o Método Numérico da Secante.
 * 
 * @param pv - Valor presente (Principal) financiado.
 * @param pmt - Valor da parcela mensal.
 * @param n - Número de parcelas (prazo).
 * @returns {number} A taxa de juros em formato percentual arredondada a 2 casas (ex: 1.78).
 */
function calculateRate(pv: number, pmt: number, n: number): number {
  // 🛡️ GUARD CLAUSE: Proteção contra loop infinito e divisão por zero
  if (n <= 0) return 0;

  // Ajuste de sinal (Segurança contra erro de fluxo financeiro)
  // Se o usuário passar os dois positivos, força a parcela a ser negativa
  let pmt_calc = (Math.sign(pv) === Math.sign(pmt)) ? -pmt : pmt;

  // Se o principal for igual à soma das parcelas, a taxa é exatamente zero
  if (Math.abs(pv) === Math.abs(pmt_calc * n)) return 0;

  // Parâmetros do Algoritmo Numérico
  let r0 = 0.01; // Chute inicial 1%
  let r1 = 0.02; // Chute inicial 2%
  const maxIterations = 100;
  const tolerance = 0.0000001;

  for (let i = 0; i < maxIterations; i++) {
    const f0 = pv + pmt_calc * ((1 - Math.pow(1 + r0, -n)) / r0);
    const f1 = pv + pmt_calc * ((1 - Math.pow(1 + r1, -n)) / r1);

    if (Math.abs(f1 - f0) < 1e-15) break; // Evita divisão por zero (assíntota)

    const r2 = r1 - f1 * (r1 - r0) / (f1 - f0);

    if (Math.abs(r2 - r1) < tolerance) {
      return Number((r2 * 100).toFixed(2)); // Retorna 1.78 e não 0.0178
    }

    r0 = r1;
    r1 = r2;
  }

  return Number((r1 * 100).toFixed(2));
}


/**
 * ============================================================================
 * 🚀 MOTOR PRINCIPAL DE PROCESSAMENTO (CARTÃO DE CRÉDITO)
 * ============================================================================
 */

/**
 * @description Centraliza o pipeline de simulação de parcelamento de cartão.
 * Itera sobre todos os prazos configurados nas regras do Orchestrator e 
 * retorna o grid financeiro completo e pré-calculado.
 */
export async function processSimulationCreditCard(payload: SimulationPayload): Promise<SimulationResponse> {

  // 1. EXTRAÇÃO PADRONIZADA
  const simulation = (payload.simulation_details as SimulationFinancials) || {};
  const rules = payload.rules;
  const requestedValue = simulation.requested_value || 0;
  const downPayment = simulation.down_payment_amount || 0;
  
  // 2. CÁLCULOS BASE
  const amountToFinance = requestedValue - downPayment;
  const downPaymentPercent = requestedValue > 0 ? (downPayment / requestedValue) * 100 : 0;

  debugLog("Processando simulação em massa para Cartão:", {requestedValue, downPayment, amountToFinance});

  // 3. 🛡️ GUARD CLAUSE: Validação de Regras
  if (!rules?.payment_factors || Object.keys(rules.payment_factors).length === 0) {
    return {
      success: false,
      message: "Nenhuma regra de parcelamento disponível para esta oferta.",
      consults: [],
      raw: { error: "No payment_factors found in the provided rules." }
    } as SimulationResponse;
  }

  // 🛡️ EXTRAÇÃO E ORDENAÇÃO DE PRAZOS
  // Como as chaves de objetos em JS nem sempre garantem ordem, a ordenação é vital.
  const prazosDisponiveis = Object.keys(rules.payment_factors)
    .map(Number)
    .sort((a, b) => a - b); 
  
  // ✨ SMART SELECTION UI: Seleciona o maior prazo por padrão (ex: 12x)
  // UX Strategy: A parcela mais longa gera o menor ticket mensal, aumentando a conversão.
  // Garante que o Front-end não renderize um grid totalmente desmarcado.
  const prazoPadrao = prazosDisponiveis[prazosDisponiveis.length - 1];

  // 4. MAPEAMENTO DO GRID DE PARCELAS (CPU-Bound Math)
  // Processamento intencionalmente síncrono para velocidade máxima na V8 Engine
  const consults: Consultation[] = Object.entries(rules.payment_factors).map(([prazoStr, factor]) => {
    const prazo = Number(prazoStr);
    const installmentValue = amountToFinance * Number(factor);
    const cetRate = calculateRate(-amountToFinance, Number(installmentValue.toFixed(2)), prazo);
  
    return {
      status_id: 1, // Aprovado / Gerado
      is_selected: prazo === prazoPadrao, // Acende `true` apenas na parcela de maior prazo
      external_operation_id: `SIM-CARD-${Date.now()}-${prazo}`, // Mock de rastreabilidade
      message: "Condição comercial gerada.",
      
      // Barramento Financeiro
      financial_institution_id: null, // Cartão de crédito padrão geralmente é multi-adquirente
      financial_institution_name: null,
      requested_value: requestedValue,
      down_payment_amount: downPayment,
      down_payment_percentage: Number(downPaymentPercent.toFixed(2)),
      financed_amount: amountToFinance,
      installments: prazo,
      cet_rate: cetRate, 
      installment_value: Number(installmentValue.toFixed(2))
    };
  });

  // 5. PREPARAÇÃO DO OUTBOX DE NOTIFICAÇÕES
  let notificationsConfig = [];
  
  if (consults.length > 0) {
    const emailTemplateData = generateUserEmailNotificationHtml(consults, payload);
    
    notificationsConfig.push({
      channel: 'email',
      template_slug: 'simulation-result',
      recipient_type: "ENTITY",
      recipient: payload.entity?.email,
      subject: "Sua simulação de parcelamento na Superbid 🚀",
      email_body: emailTemplateData.html,
      attachments: emailTemplateData.attachments 
    });
  }

  // 6. RETORNO PADRONIZADO
  return {
    success: true,
    message: "Grid de simulação gerado com sucesso.",
    consults: consults,
    raw: {
      rules_snapshot_id: rules?.id || "not-provided",
      executed_at: new Date().toISOString(),
      notifications: notificationsConfig 
    }
  } as SimulationResponse;
}