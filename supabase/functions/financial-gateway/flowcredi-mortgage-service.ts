/**
 * FLOWCREDI · FINANCIAMENTO IMOBILIÁRIO
 * @path supabase/functions/financial-gateway/flowcredi-mortgage-service.ts
 *
 * @description Jornada de Financiamento Imobiliário com a FlowCredi
 * (parceiro 3, ativada por `rules.flowcredi_product = "mortgage"` no
 * orchestrator_configs). Chamadas e regras comuns em flowcredi-service.ts.
 * Três ações, definidas pelo `step` da requisição:
 *
 *  1. SIMULATE  (step EXECUTE_SIMULATION; tela 1, sem aceites): simulador multibanco
 *               (tipoCredito "Financiamento"); a melhor condição de cada banco vem com as
 *               parcelas e `is_selected`. Persiste a simulação e envia o e-mail ao cliente.
 *  2. DETAIL    (step EXECUTE_SIMULATION com `simulation_details.selected`): parcelas de outra
 *               condição do mesmo banco, escolhida na gaveta de detalhe. Somente leitura (NÃO grava).
 *  3. LEAD      (step SUBMIT_LEAD; tela de dados, com aceites): confere os aceites
 *               e envia o lead para POST /mortgage/lead. Sem banco.
 *
 * --- ZERO-TRUST ---
 * Do front vêm apenas: valor a financiar, prazo, renda e os aceites. Valor do imóvel e UF vêm da
 * oferta; nome, CPF, e-mail, telefone e nascimento vêm do cadastro (entity);
 * limites e banco fixo (vendedor Santander) vêm de `rules` (orchestrator_configs).
 *
 * --- LEAD (Flow Preamble API) ---
 * Body: nome, email, cpf, telefone, data_nascimento (DD/MM/YYYY), renda_mensal, valor_imovel,
 * valor_emprestimo, tem_imovel_escolhido ("sim"), refId (= simulation_id).
 * O lead NÃO carrega prazo, banco escolhido nem aceites.
 */

import { SimulationResponse, Entity, Offer } from "../_shared/types.ts";
import { debugLog } from "../_shared/logger.ts";
import {
  FlowAction, FlowSimRequest, FLOWCREDI_SEND_LEAD,
  businessError, num, toBRDate, resolveFlowAction, birthDateOf, assertPF, assertRequiredConsents, leadContact,
  simulateConditions, detailCondition, sendLead, leadConsult, maskLead,
} from "./flowcredi-service.ts";
import { generateUserEmailNotificationHtml } from "./flowcredi-notifications.ts";

const PRODUCT_LABEL = "O financiamento imobiliário";

/** Padrões da jornada quando `rules` não informa (mínimos a confirmar com a FlowCredi). */
const DEFAULTS = {
  max_financing_percentage: 80,
  min_financed_amount: 50000,
  min_term_months: 60,
  max_term_months: 420,
  min_monthly_income: 1000,
};

export function isFlowcrediMortgage(rules: any): boolean {
  return rules?.flowcredi_product === "mortgage";
}

/**
 * Banco fixo da simulação, por configuração (nunca pelo front):
 *  - rules.flowcredi_bank_by_seller: { "<seller_id>": "Santander" } → só para
 *    ofertas daquele vendedor dentro desta jornada (ex.: imóveis Santander);
 *  - rules.flowcredi_bank: "Santander" → para todas as ofertas da configuração.
 */
export function resolveFixedBank(payload: any, rules: any): string | null {
  const sellerId = String(payload?.seller?.seller_id ?? "").trim();
  const bySeller = rules?.flowcredi_bank_by_seller;
  if (sellerId && bySeller && typeof bySeller === "object") {
    const b = bySeller[sellerId];
    if (typeof b === "string" && b.trim()) return b.trim();
  }
  return typeof rules?.flowcredi_bank === "string" && rules.flowcredi_bank.trim() ? rules.flowcredi_bank.trim() : null;
}

/** Monta a requisição do simulador com dados confiáveis + inputs validados. */
export function buildSimRequest(payload: any, rules: any): FlowSimRequest {
  const offer = (payload.offer as Offer) || ({} as Offer);
  const sim = payload.simulation_details || {};
  const r = { ...DEFAULTS, ...(rules || {}) };

  assertPF(payload, PRODUCT_LABEL);

  const valorImovel = num((offer as any).offer_value);
  if (!(valorImovel > 0)) throw businessError("Valor do imóvel indisponível para esta oferta.");

  const birth = birthDateOf(payload);

  const valorFinanciado = Math.round(num(sim.requested_value) * 100) / 100;
  const maxFin = Math.floor((valorImovel * num(r.max_financing_percentage)) / 100);
  if (!(valorFinanciado >= num(r.min_financed_amount)) || valorFinanciado > maxFin) {
    throw businessError(`O valor a financiar deve ficar entre R$ ${num(r.min_financed_amount).toLocaleString("pt-BR")} e ${num(r.max_financing_percentage)}% do valor do imóvel.`);
  }

  const prazo = Math.trunc(num(sim.installments));
  if (!(prazo >= num(r.min_term_months) && prazo <= num(r.max_term_months))) {
    throw businessError(`O prazo deve ficar entre ${r.min_term_months} e ${r.max_term_months} meses.`);
  }

  const renda = num(sim.monthly_income);
  if (!(renda >= num(r.min_monthly_income))) throw businessError("Informe sua renda mensal.");

  const ufRaw = String((offer as any)?.location?.state ?? "").trim().toUpperCase();
  const req: FlowSimRequest = { valorImovel, prazo, valorFinanciado, dataNascimento: birth, tipoCredito: "Financiamento", renda };
  if (/^[A-Z]{2}$/.test(ufRaw)) req.uf = ufRaw;
  // Banco fixo por configuração — nunca vem do front.
  const bank = resolveFixedBank(payload, r);
  if (bank) req.banco = bank;
  return req;
}

/** Monta o body de POST /mortgage/lead (OpenAPI MortgageLeadRequest). */
export function buildMortgageLead(payload: any, req: FlowSimRequest) {
  return {
    ...leadContact(payload, PRODUCT_LABEL),
    data_nascimento: toBRDate(req.dataNascimento),
    renda_mensal: req.renda,
    valor_imovel: req.valorImovel,
    valor_emprestimo: req.valorFinanciado,
    tem_imovel_escolhido: "sim", // o comprador está em uma oferta específica
  };
}

/**
 * Executa a ação da jornada. Retorna `{ result, persist }`: `persist=false` no DETAIL (somente leitura).
 */
export async function processFlowcrediMortgage(
  payload: any,
  rules: any,
  step: string = "EXECUTE_SIMULATION",
): Promise<{ action: FlowAction; result: SimulationResponse; persist: boolean }> {
  const action = resolveFlowAction(payload, step);
  const req = buildSimRequest(payload, rules);

  // 1) SIMULATE — condições multibanco
  if (action === "SIMULATE") {
    const { consults, count } = await simulateConditions(req);
    if (count === 0) {
      return {
        action,
        persist: true,
        result: { success: true, message: "Nenhuma condição encontrada.", consults, raw: { action, request: { ...req, dataNascimento: "***" }, count: 0 } },
      };
    }

    // E-mail ao cliente a cada simulação com condições (mesmo padrão de veículos e cartão)
    const notifications: any[] = [];
    const recipient = (payload.entity as Entity)?.email;
    if (recipient) {
      const email = generateUserEmailNotificationHtml("mortgage", consults.filter((c) => c.is_selected), payload, {
        valorImovel: req.valorImovel,
        valorFinanciado: req.valorFinanciado,
        prazo: req.prazo,
      });
      notifications.push({
        channel: "email",
        template_slug: "flowcredi-mortgage-simulation-result",
        recipient_type: "ENTITY",
        recipient,
        subject: "Sua simulação de financiamento imobiliário na Superbid",
        email_body: email.html,
        attachments: email.attachments,
      });
    }

    return {
      action,
      persist: true,
      result: {
        success: true,
        message: `${count} condição(ões) encontrada(s).`,
        consults,
        raw: { action, request: { ...req, dataNascimento: "***" }, count, notifications },
      },
    };
  }

  // 3) LEAD — envia a proposta (sem banco: quem negocia com os bancos é a FlowCredi)
  if (action === "LEAD") {
    assertRequiredConsents(payload);
    const lead = buildMortgageLead(payload, req);
    debugLog("🏠 [FlowCredi Mortgage] Enviando lead (refId):", lead.refId);
    const response = await sendLead("/mortgage/lead", lead);
    return {
      action,
      persist: true,
      result: {
        success: true,
        consults: [leadConsult(req, lead.refId)],
        raw: { action, leadSent: FLOWCREDI_SEND_LEAD, lead: maskLead(lead), response },
      },
    };
  }

  // 2) DETAIL — parcelas de outra condição do banco (somente leitura)
  if (action === "DETAIL") {
    const consult = await detailCondition(payload, req);
    return { action, persist: false, result: { success: true, message: "Parcelas da condição.", consults: [consult], raw: { action } } };
  }

  throw businessError("Ação inválida.");
}
