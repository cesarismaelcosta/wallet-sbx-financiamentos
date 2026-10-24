/**
 * FLOWCREDI · CRÉDITO COM GARANTIA DE IMÓVEL (HOME EQUITY / CGI)
 * @path supabase/functions/financial-gateway/flowcredi-home-equity-service.ts
 *
 * @description Jornada de Home Equity com a FlowCredi (parceiro 3, PRODUCT 6, ativada por
 * `rules.flowcredi_product = "home_equity"` no orchestrator_configs). Chamadas e regras
 * comuns em flowcredi-service.ts. Mesmas três ações de imóveis:
 *
 *  1. SIMULATE  (EXECUTE_SIMULATION): simulador multibanco com tipoCredito "CGI"; a melhor
 *               condição de cada banco vem com as parcelas e `is_selected`. Persiste e envia e-mail.
 *  2. DETAIL    (EXECUTE_SIMULATION com `simulation_details.selected`): parcelas de outra condição
 *               do banco (somente leitura).
 *  3. LEAD      (SUBMIT_LEAD): confere os aceites e envia POST /cgi/lead.
 *
 * --- ENTRADAS (simulation_details, informadas pelo cliente: não há oferta da Superbid) ---
 * property_type, property_state (UF), property_city, property_value, property_paid (bool),
 * outstanding_balance (se não quitado), requested_value (crédito), installments, monthly_income.
 * Nome, CPF, e-mail, telefone e nascimento vêm do cadastro (entity).
 *
 * --- LIMITES (site da FlowCredi: até 60% do valor do imóvel, até 240 meses) ---
 * rules.max_loan_percentage (60) e rules.max_term_months (240). Imóvel não quitado: o crédito
 * fica limitado a 60% do imóvel menos o saldo devedor (regra nossa, a confirmar com a FlowCredi).
 * Sem valor mínimo, prazo mínimo ou renda mínima publicados.
 *
 * --- LEAD (Flow Preamble API, CGILeadRequest) ---
 * nome, email, cpf, telefone, data_nascimento (DD/MM/YYYY), renda_mensal, valor_imovel,
 * valor_emprestimo, estado_imovel, cidade_imovel, imovel_quitado, saldo_devedor (se não
 * quitado), tipo_imovel, refId (= simulation_id).
 */

import { SimulationResponse, Entity } from "../_shared/types.ts";
import { debugLog } from "../_shared/logger.ts";
import {
  FlowAction, FlowSimRequest, FLOWCREDI_SEND_LEAD,
  businessError, num, toBRDate, resolveFlowAction, birthDateOf, assertPF, assertRequiredConsents, leadContact,
  simulateConditions, detailCondition, sendLead, leadConsult, maskLead,
} from "./flowcredi-service.ts";
import { generateUserEmailNotificationHtml } from "./flowcredi-notifications.ts";

const PRODUCT_LABEL = "O crédito com garantia de imóvel";

/** Limites publicados pela FlowCredi, quando `rules` não informa. */
const DEFAULTS = {
  max_loan_percentage: 60,
  max_term_months: 240,
};

/** Tipos aceitos no lead (enum tipo_imovel da Flow Preamble API). */
export const PROPERTY_TYPES = ["Apartamento", "Casa", "Casa em condomínio", "Sala Comercial", "Loja", "Terreno", "Galpão", "Rural", "Outros"];

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

export function isFlowcrediHomeEquity(rules: any): boolean {
  return rules?.flowcredi_product === "home_equity";
}

type HomeEquityInputs = {
  req: FlowSimRequest;
  tipo: string;
  uf: string;
  cidade: string;
  quitado: boolean;
  saldoDevedor: number;
};

/** Valida as entradas do cliente e monta a requisição do simulador (tipoCredito "CGI"). */
export function buildHomeEquityInputs(payload: any, rules: any): HomeEquityInputs {
  const sim = payload.simulation_details || {};
  const r = { ...DEFAULTS, ...(rules || {}) };

  assertPF(payload, PRODUCT_LABEL);
  const birth = birthDateOf(payload);

  const tipo = String(sim.property_type ?? "").trim();
  if (!PROPERTY_TYPES.includes(tipo)) throw businessError("Informe o tipo do imóvel.");

  const uf = String(sim.property_state ?? "").trim().toUpperCase();
  if (!UFS.includes(uf)) throw businessError("Informe o estado do imóvel.");

  const cidade = String(sim.property_city ?? "").trim().replace(/\s+/g, " ");
  if (cidade.length < 2 || cidade.length > 120) throw businessError("Informe a cidade do imóvel.");

  const valorImovel = Math.round(num(sim.property_value) * 100) / 100;
  if (!(valorImovel > 0)) throw businessError("Informe o valor do imóvel.");

  const quitado = sim.property_paid === true;
  const saldoDevedor = quitado ? 0 : Math.round(num(sim.outstanding_balance) * 100) / 100;
  if (!quitado && !(saldoDevedor >= 0)) throw businessError("Informe o saldo devedor do imóvel.");

  const maxCredito = Math.floor((valorImovel * num(r.max_loan_percentage)) / 100 - saldoDevedor);
  if (!(maxCredito > 0)) throw businessError("O saldo devedor não permite crédito com este imóvel em garantia.");

  const valorFinanciado = Math.round(num(sim.requested_value) * 100) / 100;
  if (!(valorFinanciado > 0) || valorFinanciado > maxCredito) {
    throw businessError(`O valor do crédito deve ficar entre R$ 1 e R$ ${maxCredito.toLocaleString("pt-BR")}.`);
  }

  const prazo = Math.trunc(num(sim.installments));
  if (!(prazo > 0 && prazo <= num(r.max_term_months))) {
    throw businessError(`O prazo deve ser de até ${r.max_term_months} meses.`);
  }

  const renda = num(sim.monthly_income);
  if (!(renda > 0)) throw businessError("Informe sua renda bruta familiar.");

  return {
    req: { valorImovel, prazo, valorFinanciado, dataNascimento: birth, tipoCredito: "CGI", renda, uf },
    tipo, uf, cidade, quitado, saldoDevedor,
  };
}

/** Monta o body de POST /cgi/lead (OpenAPI CGILeadRequest). */
export function buildHomeEquityLead(payload: any, inp: HomeEquityInputs) {
  return {
    ...leadContact(payload, PRODUCT_LABEL),
    data_nascimento: toBRDate(inp.req.dataNascimento),
    renda_mensal: inp.req.renda,
    valor_imovel: inp.req.valorImovel,
    valor_emprestimo: inp.req.valorFinanciado,
    tipo_imovel: inp.tipo,
    estado_imovel: inp.uf,
    cidade_imovel: inp.cidade,
    imovel_quitado: inp.quitado,
    ...(inp.quitado ? {} : { saldo_devedor: inp.saldoDevedor }),
  };
}

/**
 * Executa a ação da jornada. Retorna `{ result, persist }`: `persist=false` no DETAIL (somente leitura).
 */
export async function processFlowcrediHomeEquity(
  payload: any,
  rules: any,
  step: string = "EXECUTE_SIMULATION",
): Promise<{ action: FlowAction; result: SimulationResponse; persist: boolean }> {
  const action = resolveFlowAction(payload, step);
  const inp = buildHomeEquityInputs(payload, rules);
  const req = inp.req;

  // 1) SIMULATE — condições multibanco (CGI)
  if (action === "SIMULATE") {
    // CGI: o simulador devolve produtos da própria FlowCredi (pré/pós-fixado × Price/SAC): todos exibidos
    const { consults, count } = await simulateConditions(req, { showAll: true });
    // Crédito com garantia não tem entrada (o simulador devolve valor do imóvel − crédito)
    for (const c of consults) { c.down_payment_amount = null; c.down_payment_percentage = null; }
    if (count === 0) {
      return {
        action,
        persist: true,
        result: { success: true, message: "Nenhuma condição encontrada.", consults, raw: { action, request: { ...req, dataNascimento: "***" }, count: 0 } },
      };
    }

    const notifications: any[] = [];
    const recipient = (payload.entity as Entity)?.email;
    if (recipient) {
      const email = generateUserEmailNotificationHtml("home_equity", consults.filter((c) => c.is_selected), payload, {
        valorImovel: req.valorImovel,
        valorFinanciado: req.valorFinanciado,
        prazo: req.prazo,
        imovelTexto: `${inp.tipo} · ${inp.cidade}/${inp.uf}`,
      });
      notifications.push({
        channel: "email",
        template_slug: "flowcredi-home-equity-simulation-result",
        recipient_type: "ENTITY",
        recipient,
        subject: "Sua simulação de crédito com garantia de imóvel",
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

  // 3) LEAD — envia a proposta para /cgi/lead
  if (action === "LEAD") {
    assertRequiredConsents(payload);
    const lead = buildHomeEquityLead(payload, inp);
    debugLog("🏠 [FlowCredi Home Equity] Enviando lead (refId):", lead.refId);
    const response = await sendLead("/cgi/lead", lead);
    return {
      action,
      persist: true,
      result: {
        success: true,
        consults: [leadConsult(req, lead.refId, { withDownPayment: false })],
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
