/**
 * FLOWCREDI · CRÉDITO COM GARANTIA DE IMÓVEL (HOME EQUITY / CGI)
 * @path supabase/functions/financial-gateway/flowcredi-home-equity-service.ts
 *
 * @description Jornada de Home Equity com a FlowCredi (parceiro 3, produto 6). Chamadas e regras
 * comuns em flowcredi-service.ts. Mesmas três ações de imóveis:
 *
 *  1. SIMULATE  (EXECUTE_SIMULATION): simulador multibanco com tipoCredito "CGI"; a melhor
 *               condição de cada banco vem com as parcelas e `is_selected`. Persiste e envia e-mail.
 *  2. DETAIL    (EXECUTE_SIMULATION com `simulation_details.selected`): parcelas de outra condição
 *               do banco (somente leitura).
 *  3. LEAD      (SUBMIT_LEAD): confere os aceites e cria o processo CGI (POST /processos).
 *
 * --- ENTRADAS (simulation_details, informadas pelo cliente: não há oferta da Superbid) ---
 * property_type, property_state (UF), property_city, property_value, property_paid (bool),
 * outstanding_balance (se não quitado), requested_value (crédito), installments, monthly_income.
 * Nome, CPF, e-mail, telefone e nascimento vêm do cadastro (entity).
 *
 * --- LIMITES (confirmados pela FlowCredi, itens 3.3 e 3.4) ---
 * Crédito: até 60% do imóvel (casa/apto), 40% (sala comercial/loja), 30% (terreno), menos o
 * saldo devedor. Galpão e rural não aceitos. Prazo 12 a 240 meses (idade + prazo até 80a6m,
 * o simulador reduz). Imóvel mínimo R$ 50 mil; crédito mínimo R$ 10 mil. Valores em `rules`
 * (loan_percentage_by_type, blocked_property_types, min_loan_term_months, min_property_value,
 * min_loan_amount); sem a chave, a regra não se aplica.
 *
 * --- PROCESSO (Process API, produto CGI) ---
 * aceites, refId (= simulation_id), valor_credito, valor_garantia (imóvel), prazo_meses,
 * participantes[PRINCIPAL] com a residência do cadastro Superbid (cep, cidade, estado) e
 * dados_imovel: tipo_imovel (lista da API), cidade/UF do imóvel, imovel_quitado, saldo_devedor.
 */

import { SimulationResponse, SimulationPayload, SimulationFinancials, Entity } from "../_shared/types.ts";
import { debugLog } from "../_shared/logger.ts";
import {
  FlowAction, FlowSimRequest, FlowRules, FlowNotification, FlowClient,
  businessError, num, resolveFlowAction, birthDateOf, assertPF, assertRequiredConsents,
  flowEnv, flowPrincipal, flowRefId, consentFlags, entityAddress, compact,
  simulateConditions, detailCondition, sendLead, leadConsult, maskLead,
} from "./flowcredi-service.ts";
import { generateUserEmailNotificationHtml } from "./flowcredi-notifications.ts";

const PRODUCT_LABEL = "O crédito com garantia de imóvel";

/** Limites publicados pela FlowCredi, quando `rules` não informa. */
const DEFAULTS: FlowRules = {
  max_loan_percentage: 60,
  max_term_months: 240,
};

/** Tipos aceitos no lead (enum tipo_imovel da Flow Preamble API). */
export const PROPERTY_TYPES = ["Apartamento", "Casa", "Casa em condomínio", "Sala Comercial", "Loja", "Terreno", "Galpão", "Rural", "Outros"];

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];

type HomeEquityInputs = {
  req: FlowSimRequest;
  tipo: string;
  uf: string;
  cidade: string;
  quitado: boolean;
  saldoDevedor: number;
};

/** Valida as entradas do cliente e monta a requisição do simulador (tipoCredito "CGI"). */
export function buildHomeEquityInputs(payload: SimulationPayload, rules: FlowRules): HomeEquityInputs {
  const sim: SimulationFinancials = payload.simulation_details || ({} as SimulationFinancials);
  const r: FlowRules = { ...DEFAULTS, ...(rules || {}) };

  assertPF(payload, PRODUCT_LABEL);
  const birth = birthDateOf(payload);

  const tipo = String(sim.property_type ?? "").trim();
  if (!PROPERTY_TYPES.includes(tipo)) throw businessError("Informe o tipo do imóvel.");
  if ((r.blocked_property_types ?? []).includes(tipo)) {
    throw businessError(`Imóveis do tipo ${tipo} não são aceitos como garantia.`);
  }
  const maxPct = num(r.loan_percentage_by_type?.[tipo] ?? r.max_loan_percentage);

  const uf = String(sim.property_state ?? "").trim().toUpperCase();
  if (!UFS.includes(uf)) throw businessError("Informe o estado do imóvel.");

  const cidade = String(sim.property_city ?? "").trim().replace(/\s+/g, " ");
  if (cidade.length < 2 || cidade.length > 120) throw businessError("Informe a cidade do imóvel.");

  const valorImovel = Math.round(num(sim.property_value) * 100) / 100;
  if (!(valorImovel > 0)) throw businessError("Informe o valor do imóvel.");
  if (r.min_property_value && valorImovel < num(r.min_property_value)) {
    throw businessError(`O imóvel deve valer pelo menos R$ ${num(r.min_property_value).toLocaleString("pt-BR")}.`);
  }

  const quitado = sim.property_paid === true;
  const saldoDevedor = quitado ? 0 : Math.round(num(sim.outstanding_balance) * 100) / 100;
  if (!quitado && !(saldoDevedor >= 0)) throw businessError("Informe o saldo devedor do imóvel.");

  const maxCredito = Math.floor((valorImovel * maxPct) / 100 - saldoDevedor);
  if (!(maxCredito > 0)) throw businessError("O saldo devedor não permite crédito com este imóvel em garantia.");

  const valorFinanciado = Math.round(num(sim.requested_value) * 100) / 100;
  const minCredito = num(r.min_loan_amount) || 1;
  if (maxCredito < minCredito) throw businessError("O saldo devedor não permite crédito com este imóvel em garantia.");
  if (!(valorFinanciado >= minCredito) || valorFinanciado > maxCredito) {
    throw businessError(`O valor do crédito deve ficar entre R$ ${minCredito.toLocaleString("pt-BR")} e R$ ${maxCredito.toLocaleString("pt-BR")}.`);
  }

  const prazo = Math.trunc(num(sim.installments));
  const minPrazo = num(r.min_loan_term_months) || 1;
  if (!(prazo >= minPrazo && prazo <= num(r.max_term_months))) {
    throw businessError(`O prazo deve ficar entre ${minPrazo} e ${r.max_term_months} meses.`);
  }

  const renda = num(sim.monthly_income);
  if (!(renda > 0)) throw businessError("Informe sua renda bruta familiar.");

  return {
    req: { valorImovel, prazo, valorFinanciado, dataNascimento: birth, tipoCredito: "CGI", renda, uf, env: flowEnv(payload) },
    tipo, uf, cidade, quitado, saldoDevedor,
  };
}

/** Nosso tipo de imóvel → lista da API de Processos (TipoImovel). */
const PROCESS_PROPERTY_TYPE: Record<string, string> = {
  "Casa em condomínio": "Casa Condomínio",
  "Sala Comercial": "Comercial",
  "Loja": "Comercial",
};

/** Monta o corpo de POST /processos (produto CGI). */
export function buildHomeEquityProcess(payload: SimulationPayload, inp: HomeEquityInputs) {
  const home = entityAddress(payload);
  return {
    ...consentFlags(payload),
    produto: "CGI",
    refId: flowRefId(payload),
    valor_credito: inp.req.valorFinanciado,
    valor_garantia: inp.req.valorImovel,
    prazo_meses: inp.req.prazo,
    // No CGI, cep/estado/cidade do PRINCIPAL são a residência do cliente (cadastro Superbid)
    participantes: [flowPrincipal(payload, PRODUCT_LABEL, Number(inp.req.renda), { cep: home.cep, estado: home.estado, cidade: home.cidade })],
    dados_imovel: {
      tipo_imovel: PROCESS_PROPERTY_TYPE[inp.tipo] ?? inp.tipo,
      estado_imovel: inp.uf,
      cidade_imovel: inp.cidade,
      imovel_quitado: inp.quitado,
      ...(inp.quitado ? {} : { saldo_devedor: inp.saldoDevedor }),
    },
  };
}

/**
 * Executa a ação da jornada. Retorna `{ result, persist }`: `persist=false` no DETAIL (somente leitura).
 */
export async function processFlowcrediHomeEquity(
  payload: SimulationPayload,
  rules: FlowRules,
  step: string = "EXECUTE_SIMULATION",
  client: FlowClient = {},
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

    const notifications: FlowNotification[] = [];
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

  // 3) LEAD — cria o processo CGI
  if (action === "LEAD") {
    assertRequiredConsents(payload);
    const body = buildHomeEquityProcess(payload, inp);
    debugLog("🏠 [FlowCredi Home Equity] Criando processo (refId):", body.refId);
    const response = await sendLead(payload, body, client);
    return {
      action,
      persist: true,
      result: {
        success: true,
        consults: [leadConsult(req, response.processoId, { withDownPayment: false })],
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
