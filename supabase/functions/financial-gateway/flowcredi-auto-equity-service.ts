/**
 * FLOWCREDI · CRÉDITO COM GARANTIA DE VEÍCULO (CAR EQUITY / CGA)
 * @path supabase/functions/financial-gateway/flowcredi-auto-equity-service.ts
 *
 * @description Jornada de Car Equity com a FlowCredi (parceiro 3, PRODUCT 7, ativada por
 * `rules.flowcredi_product = "auto_equity"` no orchestrator_configs). A FlowCredi não tem
 * simulador de auto: a jornada tem uma única ação.
 *
 *  LEAD (SUBMIT_LEAD): valida as entradas, confere os aceites e envia POST /auto/lead.
 *
 * --- ENTRADAS (simulation_details, digitadas pelo cliente) ---
 * vehicle_plate, vehicle_brand, vehicle_model, vehicle_year, vehicle_model_year, vehicle_doors,
 * vehicle_fuel (opcional), vehicle_value, vehicle_state (UF), vehicle_owner (bool), vehicle_paid (bool),
 * outstanding_balance, requested_value, installments, loan_purpose, monthly_income,
 * professional_status, profession, employment_years, customer_zip, customer_address.
 * Nome, CPF, e-mail, telefone e nascimento vêm do cadastro (entity).
 *
 * --- LIMITES ---
 * O swagger só diz que o empréstimo não pode passar do valor do veículo. Usamos o valor do
 * veículo menos o saldo devedor (regra nossa, a confirmar). Parcelas: lista fechada do lead.
 *
 * --- LEAD (Flow Preamble API, AutoLeadRequest) ---
 * Obrigatórios: nome, email, telefone, cpf, cep, data_nascimento (DD/MM/YYYY), renda_mensal,
 * valor_veiculo, valor_emprestimo, uf_licenciamento, endereço_cliente, is_veiculo_proprio_nome,
 * profissao_cliente, tempo_trabalho, divida_veiculo, ano_veiculo, ano_modelo, marca_veiculo,
 * modelo_veiculo, placa_veiculo, numero_portas. Opcionais enviados: situacao_profissional,
 * parcelas_emprestimo, combustivel_veiculo, motivo_emprestimo, saldo_devedor, refId.
 * Pendente com a FlowCredi: divida_veiculo tem mínimo 0,01 (veículo quitado envia 0).
 */

import { SimulationResponse } from "../_shared/types.ts";
import { debugLog } from "../_shared/logger.ts";
import {
  FlowAction, FlowSimRequest, FLOWCREDI_SEND_LEAD,
  businessError, num, toBRDate, resolveFlowAction, birthDateOf, assertPF, assertRequiredConsents, leadContact,
  sendLead, leadConsult, maskLead,
} from "./flowcredi-service.ts";

const PRODUCT_LABEL = "O crédito com garantia de veículo";

const UFS = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const DOORS = ["2", "3", "4", "5"];
const FUELS = ["Alcool", "Gasolina", "Flex", "Hibrido", "Elétrico"];
const TERMS = ["12", "24", "30", "36", "42", "48", "54", "60"];
const PURPOSES = ["Pagamento de dívidas", "Refinanciamento de dívidas", "Reforma de casa", "Aquisição de Bens", "Outros"];
const PROFESSIONAL_STATUS = ["Assalariado/Registrado", "Autônomo", "Profissional Liberal", "Empresário", "Funcionário Público", "Aposentado/Pensionista"];
const PLATE_RE = /^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/;

export function isFlowcrediAutoEquity(rules: any): boolean {
  return rules?.flowcredi_product === "auto_equity";
}

const money = (v: unknown) => Math.round(num(v) * 100) / 100;
const text = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
const year = (v: unknown) => {
  const y = String(v ?? "").trim();
  const n = Number(y);
  return /^\d{4}$/.test(y) && n >= 1950 && n <= new Date().getFullYear() + 1 ? y : "";
};

/** Valida as entradas do cliente e monta o body de POST /auto/lead. */
export function buildAutoEquityLead(payload: any) {
  const sim = payload.simulation_details || {};
  assertPF(payload, PRODUCT_LABEL);
  const birth = birthDateOf(payload);

  const placa = String(sim.vehicle_plate ?? "").trim().toUpperCase();
  if (!PLATE_RE.test(placa)) throw businessError("Informe a placa do veículo.");
  const marca = text(sim.vehicle_brand, 60);
  if (marca.length < 2) throw businessError("Informe a marca do veículo.");
  const modelo = text(sim.vehicle_model, 80);
  if (!modelo) throw businessError("Informe o modelo do veículo.");
  const anoVeiculo = year(sim.vehicle_year);
  const anoModelo = year(sim.vehicle_model_year);
  if (!anoVeiculo || !anoModelo) throw businessError("Informe os anos de fabricação e do modelo.");
  const portas = String(sim.vehicle_doors ?? "");
  if (!DOORS.includes(portas)) throw businessError("Informe o número de portas.");
  // combustivel_veiculo é opcional no /auto/lead: só vai se vier um valor da lista
  const combustivel = FUELS.includes(String(sim.vehicle_fuel ?? "")) ? String(sim.vehicle_fuel) : null;
  const uf = String(sim.vehicle_state ?? "").trim().toUpperCase();
  if (!UFS.includes(uf)) throw businessError("Informe a UF de licenciamento.");

  const valorVeiculo = money(sim.vehicle_value);
  if (!(valorVeiculo > 0)) throw businessError("Informe o valor do veículo.");
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
  const tempoTrabalho = num(sim.employment_years);
  if (!(tempoTrabalho > 0)) throw businessError("Informe o tempo na ocupação atual.");
  const cep = String(sim.customer_zip ?? "").replace(/\D/g, "");
  if (cep.length !== 8) throw businessError("Informe seu CEP.");
  const endereco = text(sim.customer_address, 200);
  if (endereco.length < 5) throw businessError("Informe seu endereço.");

  const lead = {
    ...leadContact(payload, PRODUCT_LABEL),
    cep,
    data_nascimento: toBRDate(birth),
    renda_mensal: renda,
    valor_veiculo: valorVeiculo,
    valor_emprestimo: valorEmprestimo,
    uf_licenciamento: uf,
    "endereço_cliente": endereco,
    is_veiculo_proprio_nome: sim.vehicle_owner === true,
    profissao_cliente: profissao,
    tempo_trabalho: tempoTrabalho,
    divida_veiculo: saldoDevedor,
    ...(quitado ? {} : { saldo_devedor: saldoDevedor }),
    ano_veiculo: anoVeiculo,
    ano_modelo: anoModelo,
    marca_veiculo: marca,
    modelo_veiculo: modelo,
    placa_veiculo: placa,
    numero_portas: portas,
    situacao_profissional: situacao,
    parcelas_emprestimo: parcelas,
    ...(combustivel ? { combustivel_veiculo: combustivel } : {}),
    motivo_emprestimo: motivo,
  };

  // Para o registro da consulta (mesmo formato dos outros produtos FlowCredi)
  const req = { valorImovel: valorVeiculo, valorFinanciado: valorEmprestimo, prazo: Number(parcelas) } as FlowSimRequest;
  return { lead, req };
}

/** Executa a ação da jornada (só LEAD: não há simulador de auto na FlowCredi). */
export async function processFlowcrediAutoEquity(
  payload: any,
  _rules: any,
  step: string = "SUBMIT_LEAD",
): Promise<{ action: FlowAction; result: SimulationResponse; persist: boolean }> {
  const action = resolveFlowAction(payload, step);
  if (action !== "LEAD") throw businessError("Ação inválida.");

  assertRequiredConsents(payload);
  const { lead, req } = buildAutoEquityLead(payload);
  debugLog("🚗 [FlowCredi Car Equity] Enviando lead (refId):", lead.refId);
  const response = await sendLead("/auto/lead", lead);
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
