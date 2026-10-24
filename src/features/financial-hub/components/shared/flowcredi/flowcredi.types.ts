/**
 * @fileoverview Tipos e helpers das jornadas da FlowCredi (Financiamento Imobiliário e Home Equity)
 * @path src/features/financial-hub/components/products/flowcredi/flowcredi.types.ts
 *
 * Cada step chama o `financial-gateway` via `callSimulation` (core/services/gateway.ts)
 * enviando só os inputs do cliente em `simulation_details` e o `step`:
 *  - EXECUTE_SIMULATION: cards multibanco (tela 1, sem aceites)
 *  - EXECUTE_SIMULATION + `selected`: tabela de amortização de um card (somente leitura)
 *  - SUBMIT_LEAD: envio da proposta (tela 2, com aceites)
 * Valor do imóvel, dados pessoais e limites são resolvidos no servidor.
 */

import type { BFFUserProfile, HubData } from "@/features/financial-hub/components/shared/types";

export interface FlowParcela {
  parcela: number;
  data: string;
  parcelaBase: number;
  amortizacao: number;
  juros: number;
  dfi: number;
  mip: number;
  tac: number;
  saldoDevedor: number;
  parcelaTotal: number;
}

/** Condições do banco, como o gateway grava em `consult.details`. */
export interface FlowCondition {
  banco: string;
  logoUrl?: string | null; // financial_institutions.logo_url (resolvido no gateway)
  idProduto: string;
  produto: string;
  seguradora: { id: string; nomeProduto: string; nomeSeguradora: string };
  tabela: "SAC" | "PRICE";
  taxaJurosAnual: number;
  taxaJurosMensal: number;
  primeiraParcela: number;
  ultimaParcela: number;
  amortizacao: number;
  juros: number;
  mip: number;
  dfi: number;
  tac: number;
  rendaMinima: number;
  uf: string;
  regiao: string;
}

export interface FlowConsult {
  status_id: number;
  is_selected: boolean;
  message: string | null;
  financial_institution_name: string | null;
  requested_value: number | null;
  down_payment_amount: number | null;
  financed_amount: number | null;
  installments: number | null;
  installment_value: number | null; // 1ª parcela
  amortization_type?: string | null; // SAC | PRICE
  last_installment_value?: number | null; // última parcela
  details?: FlowCondition;
  installment_schedule?: FlowParcela[]; // parcelas mês a mês (só nas condições is_selected)
}

/** Inputs do cliente na simulação (enviados inteiros em `simulation_details`). */
export interface FlowInputs {
  requested_value: number; // valor a financiar (imóveis) ou do crédito (home equity)
  installments: number; // prazo em meses
  monthly_income: number; // renda mensal
  // Home equity: imóvel informado pelo cliente
  property_type?: string;
  property_state?: string;
  property_city?: string;
  property_value?: number;
  property_paid?: boolean;
  outstanding_balance?: number;
  // Car equity: veículo e perfil informados pelo cliente (POST /auto/lead)
  vehicle_plate?: string;
  vehicle_brand?: string;
  vehicle_model?: string;
  vehicle_year?: string;
  vehicle_model_year?: string;
  vehicle_doors?: string;
  vehicle_fuel?: string;
  vehicle_value?: number;
  vehicle_state?: string;
  vehicle_owner?: boolean;
  vehicle_paid?: boolean;
  loan_purpose?: string;
  professional_status?: string;
  profession?: string;
  employment_years?: number;
  customer_zip?: string;
  customer_address?: string;
}

/** Pós-fixado (taxa + IPCA): produtos CGI da FlowCredi ("CGI Pós indexado IPCA - ..."). */
export const isPosIPCA = (c: Pick<FlowCondition, "produto" | "idProduto">) =>
  /p[oó]s|ipca/i.test(`${c.produto ?? ""} ${c.idProduto ?? ""}`);

/** Nome da condição para o cliente. Imóveis: produto do banco. Home equity: "Pré-fixado · Price". */
export const conditionLabel = (c: FlowCondition, product: FlowProduct) =>
  product === "home_equity" ? `${isPosIPCA(c) ? "Pós-fixado" : "Pré-fixado"} · ${c.tabela === "SAC" ? "SAC" : "Price"}` : c.produto;

/** Taxa para o cliente. Imóveis: ao ano. Home equity: ao mês (+ IPCA no pós-fixado). */
export const rateLabel = (c: FlowCondition, product: FlowProduct) =>
  product === "home_equity"
    ? `${pct(c.taxaJurosMensal)} a.m.${isPosIPCA(c) ? " + IPCA" : ""}`
    : `${pct(c.taxaJurosAnual)} a.a.`;

/** Produto FlowCredi da jornada (gravado em `data.flowProduct` pelo step de simulação). */
export type FlowProduct = "mortgage" | "home_equity" | "auto_equity";

/**
 * Dados do wizard nas jornadas FlowCredi (Imóveis, Home Equity, Car Equity).
 * O wizard nasce com a entidade do cadastro no topo (nome, e-mail, nascimento, endereço).
 */
export interface FlowWizardData extends HubData {
  flowProduct?: FlowProduct;
  flowInputs?: Partial<FlowInputs>; // inputs do cliente (Car Equity preenche passo a passo)
  flowSimulatedWith?: FlowInputs; // inputs da última simulação
  flowResults?: FlowConsult[]; // condições por banco da última simulação
  flowLeadSent?: boolean;
  acceptedConsentIds?: string[];
  // Cliente (entidade do cadastro no topo do wizard)
  name?: string;
  document?: string;
  phone?: string;
  email?: string;
  birth_date?: string;
  address?: BFFUserProfile["address"];
}
export const flowProductOf = (data: FlowWizardData | null | undefined): FlowProduct => (data?.flowProduct === "home_equity" ? "home_equity" : "mortgage");

/** Valor do imóvel: da oferta (imóveis) ou informado pelo cliente (home equity). */
export const propertyValueOf = (data: FlowWizardData | null | undefined): number =>
  Number(data?.flowInputs?.property_value ?? data?.flowSimulatedWith?.property_value ?? data?.offer?.offer_value ?? 0);

export const sameInputs = (a?: FlowInputs | null, b?: FlowInputs | null) =>
  !!a &&
  !!b &&
  a.requested_value === b.requested_value &&
  a.installments === b.installments &&
  a.monthly_income === b.monthly_income;

export const selectionOf = (c: FlowCondition) => ({
  banco: c.banco,
  idProduto: c.idProduto,
  idSeguradora: c.seguradora?.id,
});

export const pct = (n: number | null | undefined, digits = 2) =>
  n === null || n === undefined || isNaN(Number(n))
    ? "—"
    : `${Number(n).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;

export const termLabel = (months: number) => {
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = years > 0 ? `${years} ${years === 1 ? "ano" : "anos"}` : "";
  const m = rest > 0 ? `${rest} ${rest === 1 ? "mês" : "meses"}` : "";
  return [y, m].filter(Boolean).join(" e ");
};
