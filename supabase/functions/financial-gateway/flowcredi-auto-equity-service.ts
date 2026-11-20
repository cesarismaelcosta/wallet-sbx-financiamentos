/**
 * FLOWCREDI · CRÉDITO COM GARANTIA DE VEÍCULO (CAR EQUITY / CGA)
 * @path supabase/functions/financial-gateway/flowcredi-auto-equity-service.ts
 *
 * @description Jornada de Car Equity com a FlowCredi (parceiro 3, produto 7). A FlowCredi não tem
 * simulador de auto: a jornada tem uma única ação.
 *
 *  LEAD (SUBMIT_LEAD): valida as entradas, confere os aceites e cria o processo CGA (POST /processos).
 *
 * --- ENTRADAS (simulation_details, digitadas pelo cliente; como no site da FlowCredi + mínimo do PDF) ---
 * vehicle_plate, vehicle_state (UF), vehicle_year (fabricação), vehicle_value, vehicle_owner (bool),
 * vehicle_paid (bool), outstanding_balance e outstanding_bank (se não quitado), requested_value,
 * installments, loan_purpose, monthly_income, professional_status, profession, credit_restriction.
 * Nome, CPF, e-mail, telefone, nascimento, endereço e nome da mãe vêm do cadastro (entity);
 * customer_zip/customer_address só quando o cadastro não tem endereço.
 *
 * --- LIMITES ---
 * Crédito até o valor do veículo menos o saldo devedor (confirmado pela FlowCredi). Elegibilidade
 * em `rules`: max_vehicle_age_years, allowed_licensing_states, min_vehicle_value.
 *
 * --- PROCESSO (Process API, produto CGA) ---
 * Raiz: aceites, refId (= simulation_id), valor_credito, valor_garantia (veículo), prazo_meses, finalidade.
 * participantes[PRINCIPAL]: profissao, tipo_renda (lista da API), nome_mae e residência
 * (cep, estado, cidade, logradouro, numero, bairro) do cadastro Superbid; sem cadastro, o
 * CEP e o endereço digitados. dados_garantia: placa, tipo_veiculo "Carro", uf_licenciamento,
 * propriedade_objeto, ano_fabricacao, veiculo_quitado, saldo_devedor e banco_saldo_devedor.
 * Restrição SPC/Serasa (Sim/Não) e banco do saldo devedor (veículo financiado) vêm da tela. Prazo até 70 meses.
 */

import { SimulationResponse, SimulationPayload, SimulationFinancials } from "../_shared/types.ts";
import { debugLog } from "../_shared/logger.ts";
import {
  FlowAction, FlowSimRequest, FlowRules, FlowClient,
  businessError, num, resolveFlowAction, birthDateOf, assertPF, assertRequiredConsents,
  flowPrincipal, flowRefId, consentFlags, entityAddress, fmtCep, compact,
  sendLead, leadConsult, maskLead,
} from "./flowcredi-service.ts";

const PRODUCT_LABEL = "O crédito com garantia de veículo";

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const TERMS = ["12", "24", "30", "36", "42", "48", "54", "60", "66", "70"]; // CGA: até 70 meses
const PURPOSES = ["Pagamento de dívidas", "Refinanciamento de dívidas", "Reforma de casa", "Aquisição de Bens", "Outros"];
const PROFESSIONAL_STATUS = ["Assalariado/Registrado", "Autônomo", "Profissional Liberal", "Empresário", "Funcionário Público", "Aposentado/Pensionista"];
const PLATE_RE = /^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/;

const money = (v: unknown) => Math.round(num(v) * 100) / 100;
const text = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const year = (v: unknown) => {
  const y = String(v ?? "").trim();
  const n = Number(y);
  return /^\d{4}$/.test(y) && n >= 1950 && n <= new Date().getFullYear() + 1 ? y : "";
};

/** Situação profissional da tela → lista da API de Processos (TipoRenda). */
const PROCESS_INCOME_TYPE: Record<string, string> = {
  "Assalariado/Registrado": "Assalariado",
  "Funcionário Público": "Assalariado",
  "Autônomo": "Autônomo",
  "Profissional Liberal": "Autônomo",
  "Empresário": "Empresário",
  "Aposentado/Pensionista": "Aposentado",
};

/** Valida as entradas do cliente e monta o corpo de POST /processos (produto CGA). */
/**
 * Elegibilidade do CGA (FlowCredi, item 4.4), configurável em `rules`: ano de fabricação a partir de
 * (ano atual − max_vehicle_age_years), UFs de licenciamento aceitas e valor mínimo do veículo.
 */
function eligibility(rules: FlowRules | null | undefined) {
  const r = rules ?? {};
  return {
    minYear: r.max_vehicle_age_years ? new Date().getFullYear() - Number(r.max_vehicle_age_years) : null,
    states: Array.isArray(r.allowed_licensing_states) && r.allowed_licensing_states.length ? r.allowed_licensing_states.map((x) => String(x).toUpperCase()) : null,
    minValue: r.min_vehicle_value ? Number(r.min_vehicle_value) : null,
  };
}

export function buildAutoEquityLead(payload: SimulationPayload, rules: FlowRules = {}) {
  const elig = eligibility(rules);
  const sim: SimulationFinancials = payload.simulation_details || ({} as SimulationFinancials);
  assertPF(payload, PRODUCT_LABEL);
  birthDateOf(payload); // valida o nascimento do cadastro antes das demais entradas

  const placa = String(sim.vehicle_plate ?? "").trim().toUpperCase();
  if (!PLATE_RE.test(placa)) throw businessError("Informe a placa do veículo.");
  // Ano de fabricação: o site da FlowCredi pede e é critério de elegibilidade do parceiro
  const anoVeiculo = year(sim.vehicle_year);
  if (!anoVeiculo) throw businessError("Informe o ano de fabricação do veículo.");
  const uf = String(sim.vehicle_state ?? "").trim().toUpperCase();
  if (!UFS.includes(uf)) throw businessError("Informe a UF de licenciamento.");
  if (elig.states && !elig.states.includes(uf)) throw businessError(`Veículos licenciados em ${uf} ainda não são aceitos.`);

  const valorVeiculo = money(sim.vehicle_value);
  if (!(valorVeiculo > 0)) throw businessError("Informe o valor do veículo.");
  if (elig.minValue && valorVeiculo < elig.minValue) throw businessError(`O veículo deve valer pelo menos R$ ${elig.minValue.toLocaleString("pt-BR")}.`);
  const quitado = sim.vehicle_paid === true;
  const saldoDevedor = quitado ? 0 : money(sim.outstanding_balance);
  if (!(saldoDevedor >= 0)) throw businessError("Informe o saldo devedor do veículo.");
  const maxCredito = Math.floor(valorVeiculo - saldoDevedor);
  if (!(maxCredito > 0)) throw businessError("O saldo devedor não permite crédito com este veículo em garantia.");
  const valorEmprestimo = money(sim.requested_value);
  if (!(valorEmprestimo > 0) || valorEmprestimo > maxCredito) {
    throw businessError(`O valor do crédito deve ficar entre R$ 1 e R$ ${maxCredito.toLocaleString("pt-BR")}.`);
  }
  const parcelas = String(Math.trunc(num(sim.installments)));
  if (!TERMS.includes(parcelas)) throw businessError("Escolha o número de parcelas.");
  const motivo = String(sim.loan_purpose ?? "");
  if (!PURPOSES.includes(motivo)) throw businessError("Escolha o motivo do crédito.");

  const renda = money(sim.monthly_income);
  if (!(renda > 0)) throw businessError("Informe sua renda bruta familiar.");
  const situacao = String(sim.professional_status ?? "");
  if (!PROFESSIONAL_STATUS.includes(situacao)) throw businessError("Informe sua situação profissional.");
  const profissao = text(sim.profession, 80);
  if (profissao.length < 2) throw businessError("Informe sua profissão.");
  if (typeof sim.credit_restriction !== "boolean") throw businessError("Informe se há restrição no SPC/Serasa.");
  const bancoSaldo = quitado ? "" : text(sim.outstanding_bank, 100);
  if (!quitado && bancoSaldo.length < 2) throw businessError("Informe o banco do financiamento do veículo.");

  // Residência: cadastro Superbid; o CEP e o endereço digitados só valem quando o cadastro não tem
  const home = entityAddress(payload);
  const fromProfile = !!(home.cep && home.cidade && home.estado);
  const cep = String(sim.customer_zip ?? "").replace(/\D/g, "");
  const endereco = text(sim.customer_address, 200);
  if (!fromProfile && (cep.length !== 8 || endereco.length < 5)) throw businessError("Informe seu CEP e endereço.");

  const principal = flowPrincipal(payload, PRODUCT_LABEL, renda, {
    profissao: profissao,
    tipo_renda: PROCESS_INCOME_TYPE[situacao] ?? "Outros",
    nome_mae: home.nome_mae,
    // Residência: cadastro Superbid; sem ele, o CEP e o endereço digitados
    cep: fromProfile ? home.cep : fmtCep(cep),
    estado: home.estado,
    cidade: home.cidade,
    logradouro: fromProfile ? home.logradouro : endereco,
    numero: home.numero,
    complemento: home.complemento,
    bairro: home.bairro,
  });

  const lead = {
    ...consentFlags(payload),
    produto: "CGA",
    refId: flowRefId(payload),
    valor_credito: valorEmprestimo,
    valor_garantia: valorVeiculo,
    prazo_meses: Number(parcelas),
    finalidade: motivo,
    restricao_spc_serasa: sim.credit_restriction === true ? "Sim" : "Não",
    participantes: [principal],
    dados_garantia: compact({
      placa_veiculo: placa.replace("-", ""),
      tipo_veiculo: "Carro",
      uf_licenciamento: uf,
      propriedade_objeto: sim.vehicle_owner === true ? "Sim" : "Não",
      ano_fabricacao: Number(anoVeiculo),
      veiculo_quitado: quitado,
      saldo_devedor: quitado ? null : saldoDevedor,
      banco_saldo_devedor: bancoSaldo,
    }),
  };

  // Para o registro da consulta (mesmo formato dos outros produtos FlowCredi)
  const req = { valorImovel: valorVeiculo, valorFinanciado: valorEmprestimo, prazo: Number(parcelas) } as FlowSimRequest;
  return { lead, req };
}

/** Executa a ação da jornada (só LEAD: não há simulador de auto na FlowCredi). */
export async function processFlowcrediAutoEquity(
  payload: SimulationPayload,
  rules: FlowRules,
  step: string = "SUBMIT_LEAD",
  client: FlowClient = {},
): Promise<{ action: FlowAction; result: SimulationResponse; persist: boolean }> {
  const action = resolveFlowAction(payload, step);
  if (action !== "LEAD") throw businessError("Ação inválida.");

  assertRequiredConsents(payload);
  const { lead, req } = buildAutoEquityLead(payload, rules);
  debugLog("🚗 [FlowCredi Car Equity] Criando processo (refId):", lead.refId);
  const response = await sendLead(payload, lead, client);
  return {
    action,
    persist: true,
    result: {
      success: true,
      consults: [leadConsult(req, response.processoId, { withDownPayment: false })],
      raw: { action, lead: maskLead(lead), response },
    },
  };
}
