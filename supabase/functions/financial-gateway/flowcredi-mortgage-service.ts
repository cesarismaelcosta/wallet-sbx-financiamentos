/**
 * FLOWCREDI · FINANCIAMENTO IMOBILIÁRIO
 * @path supabase/functions/financial-gateway/flowcredi-mortgage-service.ts
 *
 * @description Jornada de Financiamento Imobiliário com a FlowCredi
 * (parceiro 3, produto 1). Chamadas e regras comuns em flowcredi-service.ts.
 * Três ações, definidas pelo `step` da requisição:
 *
 *  1. SIMULATE  (step EXECUTE_SIMULATION; tela 1, sem aceites): simulador multibanco
 *               (tipoCredito "Financiamento"); a Taxa Balcão de cada banco (sem Balcão → menor taxa) vem com as
 *               parcelas e `is_selected`. Persiste a simulação e envia o e-mail ao cliente.
 *  2. DETAIL    (step EXECUTE_SIMULATION com `simulation_details.selected`): parcelas de outra
 *               condição do mesmo banco, escolhida na gaveta de detalhe. Somente leitura (NÃO grava).
 *  3. LEAD      (step SUBMIT_LEAD; tela de dados, com aceites): confere os aceites
 *               e cria o processo FINANCIAMENTO (POST /processos). Sem banco.
 *
 * --- ZERO-TRUST ---
 * Do front vêm apenas: valor a financiar, prazo, renda e os aceites. Valor do imóvel e UF vêm da
 * oferta; nome, CPF, e-mail, telefone e nascimento vêm do cadastro (entity);
 * limites e banco fixo (rules.fixed_bank) vêm de `rules` (orchestrator_configs).
 *
 * --- PROCESSO (Process API, produto FINANCIAMENTO) ---
 * aceites, refId (= simulation_id), valor_credito (a financiar), valor_garantia (imóvel),
 * prazo_meses, participantes[PRINCIPAL] e dados_imovel (cidade/UF da oferta; a oferta não
 * traz CEP). Banco escolhido não é enviado (a FlowCredi escolhe na análise).
 */

import { SimulationResponse, SimulationPayload, SimulationFinancials, Entity, Offer } from "../_shared/types.ts";
import { debugLog } from "../_shared/logger.ts";
import {
  FlowAction, FlowSimRequest, FlowRules, FlowNotification, FlowClient,
  businessError, num, resolveFlowAction, birthDateOf, assertPF, assertRequiredConsents,
  flowEnv, flowPrincipal, flowRefId, consentFlags, compact,
  simulateConditions, detailCondition, sendLead, leadConsult, maskLead,
} from "./flowcredi-service.ts";
import { generateUserEmailNotificationHtml } from "./flowcredi-notifications.ts";

const PRODUCT_LABEL = "O financiamento imobiliário";

/** Padrões da jornada quando `rules` não informa (mínimos a confirmar com a FlowCredi). */
const DEFAULTS = {
  max_financing_percentage: 90, // LTV máximo do simulador (residencial)
  min_financed_amount: 10000,
  min_term_months: 36,
  max_term_months: 420,
};

/**
 * Limites por subcategoria da oferta (rules.subcategory_limits), política da FlowCredi:
 * residencial 90% / 420 meses; sala comercial 70% / 120; terreno urbano 70% / 240.
 * Chave "*" = subcategoria não listada (limite conservador).
 */
function subcategoryLimits(offer: Offer, rules: FlowRules): Partial<FlowRules> {
  const map = rules?.subcategory_limits;
  if (!map || typeof map !== "object") return {};
  const id = String(offer?.subcategory_id ?? "").trim();
  return (id && map[id]) || map["*"] || {};
}

/** Banco fixo da simulação (rules.fixed_bank), por configuração — nunca vem do front. */
export function resolveFixedBank(rules: FlowRules): string | null {
  return typeof rules?.fixed_bank === "string" && rules.fixed_bank.trim() ? rules.fixed_bank.trim() : null;
}

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

/**
 * Cidade e UF do imóvel pela localização da oferta. Algumas ofertas vêm com a UF vazia e a
 * cidade como "Santo André - SP": se o que vem depois do último "-" for uma UF válida,
 * separa em cidade "Santo André" e UF "SP".
 */
export function offerCityUf(offer: Offer): { cidade: string; uf: string } {
  let cidade = String(offer?.location?.city ?? "").trim().replace(/\s+/g, " ");
  let uf = String(offer?.location?.state ?? "").trim().toUpperCase();
  const m = /^(.+?)\s*[-–]\s*([A-Za-z]{2})$/.exec(cidade);
  if (m && UFS.includes(m[2].toUpperCase()) && (!UFS.includes(uf) || uf === m[2].toUpperCase())) {
    cidade = m[1].trim();
    uf = m[2].toUpperCase();
  }
  if (/n[aã]o informado/i.test(cidade)) cidade = "";
  return { cidade: cidade.slice(0, 100), uf: UFS.includes(uf) ? uf : "" };
}

/** Monta a requisição do simulador com dados confiáveis + inputs validados. */
export function buildSimRequest(payload: SimulationPayload, rules: FlowRules): FlowSimRequest {
  const offer = (payload.offer as Offer) || ({} as Offer);
  const sim: SimulationFinancials = payload.simulation_details || ({} as SimulationFinancials);
  const r: FlowRules = { ...DEFAULTS, ...(rules || {}), ...subcategoryLimits(offer, rules) };

  assertPF(payload, PRODUCT_LABEL);

  const valorImovel = num(offer.offer_value);
  if (!(valorImovel > 0)) throw businessError("Valor do imóvel indisponível para esta oferta.");
  // Faixa de valor do imóvel (rules.min_property_value / max_property_value; sem chave, sem limite)
  if ((r.min_property_value && valorImovel < num(r.min_property_value)) || (r.max_property_value && valorImovel > num(r.max_property_value))) {
    throw businessError("O valor deste imóvel está fora da faixa aceita para financiamento.");
  }

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

  // Sem renda mínima fixa: cada condição traz `rendaMinima` (30% de comprometimento com a 1ª parcela)
  const renda = num(sim.monthly_income);
  if (!(renda > 0)) throw businessError("Informe sua renda mensal.");

  const { uf: ufRaw } = offerCityUf(offer);
  const req: FlowSimRequest = { valorImovel, prazo, valorFinanciado, dataNascimento: birth, tipoCredito: "Financiamento", renda, env: flowEnv(payload) };
  if (/^[A-Z]{2}$/.test(ufRaw)) req.uf = ufRaw;
  // Banco fixo por configuração — nunca vem do front.
  const bank = resolveFixedBank(r);
  if (bank) req.banco = bank;
  return req;
}

/** Monta o corpo de POST /processos (produto FINANCIAMENTO). */
export function buildMortgageProcess(payload: SimulationPayload, req: FlowSimRequest) {
  const offer = (payload.offer as Offer) || ({} as Offer);
  const { cidade, uf } = offerCityUf(offer);
  return {
    ...consentFlags(payload),
    produto: "FINANCIAMENTO",
    refId: flowRefId(payload),
    valor_credito: req.valorFinanciado,
    valor_garantia: req.valorImovel,
    prazo_meses: req.prazo,
    participantes: [flowPrincipal(payload, PRODUCT_LABEL, Number(req.renda))],
    dados_imovel: compact({
      estado_imovel: /^[A-Z]{2}$/.test(uf) ? uf : "",
      cidade_imovel: cidade && !/n[aã]o informado/i.test(cidade) ? cidade : "",
    }),
  };
}

/**
 * Executa a ação da jornada. Retorna `{ result, persist }`: `persist=false` no DETAIL (somente leitura).
 */
export async function processFlowcrediMortgage(
  payload: SimulationPayload,
  rules: FlowRules,
  step: string = "EXECUTE_SIMULATION",
  client: FlowClient = {},
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
    const notifications: FlowNotification[] = [];
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
    const body = buildMortgageProcess(payload, req);
    debugLog("🏠 [FlowCredi Mortgage] Criando processo (refId):", body.refId);
    const response = await sendLead(payload, body, client);
    return {
      action,
      persist: true,
      result: {
        success: true,
        consults: [leadConsult(req, response.processoId)],
        raw: { action, env: req.env, lead: maskLead(body), response },
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
