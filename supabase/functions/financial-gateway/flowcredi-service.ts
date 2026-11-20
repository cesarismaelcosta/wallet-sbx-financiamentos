/**
 * FLOWCREDI SERVICE — chamadas e regras comuns aos produtos da FlowCredi
 * @path supabase/functions/financial-gateway/flowcredi-service.ts
 *
 * Usado pelos serviços de produto (flowcredi-mortgage-service.ts,
 * flowcredi-home-equity-service.ts), que ficam só com as regras de cada produto
 * (inputs, validação e corpo do lead).
 *
 * --- SIMULADOR (OpenAPI "Calculadora de Financiamento Imobiliário", POST /simulador) ---
 * tipoCredito "Financiamento" (imóveis) ou "CGI" (home equity).
 * Request obrigatório: valorImovel, prazo (meses), valorFinanciado, dataNascimento
 * (yyyy-mm-dd), tipoCredito. Opcionais: banco, idProduto, idSeguradora,
 * retornarParcelas, renda, uf.
 *   - sem banco: uma simulação por banco × produto × seguradora
 *   - banco + idProduto + idSeguradora: uma simulação só
 *   - `parcelas` só volta com retornarParcelas=true E uma simulação no retorno
 * Response: array (404 = nenhuma simulação). Sempre a API real (simular não cria lead).
 *
 * --- PROCESSOS (Process API, substitui a Preamble API descontinuada) ---
 * POST {process-api}/processos · Bearer FLOWCREDI_API_KEY (token do Portal Parceiro).
 * produto FINANCIAMENTO | CGI | CGA; titular em participantes[] (um PRINCIPAL).
 * 201 → processo criado · 200 + existingProcessReturned → processo já existente (mesmo CPF e
 * produto em até 7 dias). Os dois são sucesso; o processoId vai em external_operation_id.
 *
 * --- TERMOS (Terms Acceptance API) ---
 * POST {terms-service}/acceptances/batch com CPF, versões aceitas, IP e user-agent do cliente.
 * Falha aqui não impede o envio do processo (fica registrada no raw).
 *
 * --- AMBIENTE ---
 * orchestrator_configs.integration_details.partner_environment: "staging" | "production"
 * (ausente = production). O token da secret FLOWCREDI_API_KEY precisa ser do mesmo ambiente.
 */

import { Consultation, Entity, SimulationPayload, JourneyRules } from "../_shared/types.ts";
import { STATUS } from "../_shared/types.ts";
import { debugLog } from "../_shared/logger.ts";
import { sql } from "../_shared/db.ts";

// =========================================================================
// CONFIGURAÇÃO
// =========================================================================

export type FlowEnv = "staging" | "production";

/** Hosts da FlowCredi por ambiente. */
const FLOWCREDI_HOSTS: Record<FlowEnv, string> = {
  staging: "https://api.staging.flowcredi.com.br",
  production: "https://api.flowcredi.com.br",
};

/** URLs das APIs da FlowCredi no ambiente informado. */
export function flowUrls(env: FlowEnv) {
  const host = FLOWCREDI_HOSTS[env];
  return {
    simulator: `${host}/simulador/v1`,
    process: `${host}/process-api/v1`,
    terms: `${host}/terms-service/v1`,
  };
}

/** Ambiente do parceiro (integration_details.partner_environment, vindo do servidor). Padrão: production. */
export function flowEnv(payload: SimulationPayload): FlowEnv {
  const env = String(payload?.integration_details?.partner_environment ?? "").trim().toLowerCase();
  return env === "staging" ? "staging" : "production";
}

/**
 * fetch com nova tentativa em 429 (limite de 120 chamadas/min por parceiro), com espera
 * progressiva (0,5s, 1s, 2s). Respeita Retry-After quando vier.
 */
async function flowFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const waits = [500, 1000, 2000];
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    if (res.status !== 429 || attempt >= waits.length) return res;
    const retryAfter = Number(res.headers.get("retry-after"));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5000) : waits[attempt];
    debugLog(`⏳ [FlowCredi] 429 em ${new URL(url).pathname}; nova tentativa em ${wait}ms.`);
    await res.body?.cancel();
    await new Promise((r) => setTimeout(r, wait));
  }
}

function flowToken(): string {
  const token = Deno.env.get("FLOWCREDI_API_KEY") ?? "";
  if (!token) throw new Error("FLOWCREDI_NOT_CONFIGURED: FLOWCREDI_API_KEY ausente.");
  return token;
}

export const STATUS_OK = STATUS.COM_CONDICOES; // Simulação · Com condições
export const STATUS_NONE = STATUS.SEM_CONDICOES; // Simulação · Sem condições
export const STATUS_LEAD_SENT = STATUS.ENVIADO; // Lead · Enviado

// =========================================================================
// TIPOS
// =========================================================================

export type FlowTipoCredito = "Financiamento" | "CGI";
export type FlowTabela = "SAC" | "PRICE";
export type FlowAction = "SIMULATE" | "DETAIL" | "LEAD";

export interface FlowSimRequest {
  valorImovel: number;
  prazo: number;
  valorFinanciado: number;
  dataNascimento: string; // yyyy-mm-dd
  tipoCredito: FlowTipoCredito;
  banco?: string;
  idProduto?: string;
  idSeguradora?: string;
  retornarParcelas?: boolean;
  renda?: number;
  uf?: string;
  /** Ambiente da FlowCredi (não vai no corpo do simulador). */
  env?: FlowEnv;
}

export interface FlowParcela {
  parcela: number;
  data: string; // dd/mm/yyyy
  parcelaBase: number;
  amortizacao: number;
  juros: number;
  dfi: number;
  mip: number;
  tac: number;
  saldoDevedor: number;
  parcelaTotal: number;
}

export interface FlowSimItem {
  tipoCredito: FlowTipoCredito;
  idProduto: string;
  produto: string;
  banco: string;
  seguradora: { id: string; nomeProduto: string; nomeSeguradora: string };
  primeiraParcela: number;
  ultimaParcela: number;
  amortizacao: number;
  juros: number;
  dfi: number;
  mip: number;
  tac: number;
  rendaMinima: number;
  valorFinanciado: number;
  valorSubsidio: number;
  valorEntrada: number;
  taxaJurosMensal: number; // %
  taxaJurosAnual: number; // %
  prazo: number;
  tabela: FlowTabela;
  uf: string;
  regiao: string;
  parcelas?: FlowParcela[];
}

/** Regras da jornada (orchestrator_configs.rules) lidas pelos serviços da FlowCredi. */
export interface FlowRules extends JourneyRules {
  /** Banco fixo na simulação (regra genérica; use numa linha SELLER/EVENT para casos como imóveis de um banco). */
  fixed_bank?: string;
  max_financing_percentage?: number;
  min_financed_amount?: number;
  min_term_months?: number;
  max_term_months?: number;
  min_monthly_income?: number;
  max_loan_percentage?: number;
  min_property_value?: number;
  max_property_value?: number;
  min_loan_amount?: number;
  min_loan_term_months?: number;
  /** Imóveis: limites por subcategoria da oferta ("*" = não listada). */
  subcategory_limits?: Record<string, Partial<Pick<FlowRules, "max_financing_percentage" | "max_term_months" | "min_term_months">>>;
  /** Home equity: % máximo do imóvel por tipo (sem chave: max_loan_percentage). */
  loan_percentage_by_type?: Record<string, number>;
  /** Home equity: tipos de imóvel não aceitos. */
  blocked_property_types?: string[];
  /** Car equity: elegibilidade do parceiro. */
  max_vehicle_age_years?: number;
  allowed_licensing_states?: string[];
  min_vehicle_value?: number;
}

/** Condições do banco gravadas em simulation_consults.simulation_details. */
export interface FlowConditionDetails {
  banco: string;
  logoUrl: string | null;
  idProduto: string;
  produto: string;
  seguradora: FlowSimItem["seguradora"];
  tabela: FlowTabela;
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
  rendaSuficiente?: boolean | null;
  valorSubsidio: number;
  uf: string;
  regiao: string;
}

/** Linha de consulta da FlowCredi: Consultation + condições do banco e parcelas mês a mês. */
export type FlowConsultation = Consultation & {
  details?: FlowConditionDetails;
  installment_schedule?: FlowParcela[];
};

/** Cliente final (IP e user-agent capturados pelo servidor), exigido pela API de Termos. */
export interface FlowClient {
  ip?: string | null;
  userAgent?: string | null;
}

/** Resultado do envio: processo criado (ou já existente) e o registro dos aceites. */
export interface FlowLeadResult {
  processoId: string | null;
  existing: boolean;
  status: number;
  terms: { ok: boolean; status?: number; error?: string; detail?: unknown };
}

/** Remove dados pessoais (CPF, IP, user-agent, quem aceitou) do retorno da API de Termos. */
function stripPersonal(v: unknown, depth = 0): unknown {
  if (depth > 6 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.slice(0, 20).map((x) => stripPersonal(x, depth + 1));
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>)
      .filter(([k]) => !/^(cpf|ip|useragent|user_agent|acceptedby|accepted_by|documento)$/i.test(k))
      .map(([k, x]) => [k, stripPersonal(x, depth + 1)]),
  );
}

/** E-mail ao cliente devolvido em raw.notifications. */
export interface FlowNotification {
  channel: "email";
  template_slug: string;
  recipient_type: "ENTITY";
  recipient: string;
  subject: string;
  email_body: string;
  attachments: { content_id: string; storage_path: string }[];
}

type FlowError = Error & { flowBusiness?: boolean };

// =========================================================================
// HELPERS
// =========================================================================

/**
 * Erro de negócio com mensagem amigável: o gateway devolve `err.message` à UI
 * (código BUSINESS_ERROR). `flowBusiness` evita gravar a tentativa inválida.
 */
export function businessError(msg: string): Error {
  const err: FlowError = new Error(msg);
  err.flowBusiness = true;
  return err;
}

export function isFlowBusinessError(err: unknown): boolean {
  return !!(err as FlowError | null | undefined)?.flowBusiness;
}

export const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};

export const toBRDate = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
};

/** SUBMIT_LEAD → LEAD · EXECUTE_SIMULATION com `selected` → DETAIL · senão SIMULATE. */
export function resolveFlowAction(payload: SimulationPayload, step: string): FlowAction {
  if (step === "SUBMIT_LEAD") return "LEAD";
  return payload?.simulation_details?.selected ? "DETAIL" : "SIMULATE";
}

/** Data de nascimento do cadastro (yyyy-mm-dd). */
export function birthDateOf(payload: SimulationPayload): string {
  const birth = String((payload.entity as Entity)?.birth_date ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) throw businessError("Complete sua data de nascimento no cadastro para simular.");
  return birth;
}

/** Produtos da FlowCredi são para pessoa física. */
export function assertPF(payload: SimulationPayload, productLabel: string) {
  const entityType = String(payload.entity?.entity_type ?? "").toUpperCase();
  if (entityType === "J" || entityType === "PJ") throw businessError(`${productLabel} está disponível apenas para pessoa física.`);
}

type ConsentInput = { consent_id?: string | number; acceptedConsents?: boolean };

/** Garante que os aceites obrigatórios configurados vieram na requisição. */
export function assertRequiredConsents(payload: SimulationPayload) {
  const configs: { id?: string | number; is_required?: boolean }[] = Array.isArray(payload.consent_configs) ? payload.consent_configs : [];
  const accepted = new Set(
    (Array.isArray(payload.consents) ? payload.consents : [])
      .filter((c: ConsentInput | null): c is ConsentInput => !!c?.consent_id && c?.acceptedConsents !== false)
      .map((c: ConsentInput) => String(c.consent_id)),
  );
  const missing = configs.filter((c) => c?.is_required && !accepted.has(String(c.id)));
  if (missing.length > 0) throw businessError("Aceite os termos obrigatórios para enviar a proposta.");
}

const onlyDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

/** CPF no formato da API: 123.456.789-00. */
export const fmtCpf = (cpf: string) => cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");

/** CEP no formato da API: 01310-100 (vazio se inválido). */
export const fmtCep = (v: unknown) => {
  const d = onlyDigits(v);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : "";
};

/** Telefone no formato da API: (11) 99999-9999 / (11) 3333-4444. */
export const fmtPhone = (digits: string) =>
  digits.length === 11
    ? `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
    : `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;

/** Endereço e nome da mãe do cadastro Superbid (entity_details), quando existirem. */
export function entityAddress(payload: SimulationPayload) {
  const details = ((payload.entity as Entity)?.entity_details ?? {}) as Record<string, unknown>;
  const a = (details.address ?? {}) as Record<string, unknown>;
  const str = (v: unknown, max: number) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max);
  const uf = str(a.state, 2).toUpperCase();
  return {
    cep: fmtCep(a.zip_code),
    logradouro: str(a.street, 200),
    numero: str(a.number, 20),
    complemento: str(a.complement, 100),
    bairro: str(a.neighborhood, 100),
    cidade: str(a.city, 100),
    estado: /^[A-Z]{2}$/.test(uf) ? uf : "",
    nome_mae: str(details.mothers_name, 150),
  };
}

/** Remove chaves vazias (""/null/undefined) de um objeto. */
export const compact = <T extends Record<string, unknown>>(o: T) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v !== null && v !== undefined)) as Partial<T>;

/**
 * Titular (participante PRINCIPAL) com os dados do cadastro. `extra` traz os campos do
 * produto (residência, profissão etc.). Sem dado obrigatório → erro amigável.
 */
export function flowPrincipal(payload: SimulationPayload, productLabel: string, renda: number, extra: Record<string, unknown> = {}) {
  const entity = (payload.entity as Entity) || ({} as Entity);
  const cpf = onlyDigits(entity.document);
  const telefone = onlyDigits(entity.phone).replace(/^55(?=\d{10,11}$)/, "");
  if (cpf.length !== 11) throw businessError(`${productLabel} está disponível apenas para pessoa física.`);
  if (!entity.name || !entity.email || telefone.length < 10) {
    throw businessError("Complete nome, e-mail e celular no seu cadastro para enviar a proposta.");
  }
  return {
    tipo_participante: "PRINCIPAL",
    tipo_pessoa: "PF",
    documento: fmtCpf(cpf),
    nome: String(entity.name).trim(),
    email: String(entity.email).trim(),
    telefone: fmtPhone(telefone),
    data_nascimento: toBRDate(birthDateOf(payload)),
    renda_mensal: renda,
    ...compact(extra),
  };
}

/** refId do processo: o id da simulação (até 100 caracteres). */
export const flowRefId = (payload: SimulationPayload) =>
  payload.simulation_id ? String(payload.simulation_id).slice(0, 100) : undefined;

type TermsConsentInput = ConsentInput & { terms_version?: unknown };

/**
 * Aceites de termos do parceiro marcados pelo cliente. O tipo vem da configuração do servidor
 * (consent_configs[].terms_type) e a versão é a exibida na tela (terms_version, do texto
 * oficial carregado da API de termos). Sem versão exibida → vai sem versão (vale a ativa).
 */
function acceptedTerms(payload: SimulationPayload): { type: string; version?: number }[] {
  const configs: { id?: string | number; terms_type?: string }[] = Array.isArray(payload.consent_configs) ? payload.consent_configs : [];
  // Só aceites configurados no servidor (o cliente não inventa tipos)
  const typeById = new Map(configs.filter((c) => c?.id && c?.terms_type).map((c) => [String(c.id), String(c.terms_type)]));
  return (Array.isArray(payload.consents) ? payload.consents : [])
    .filter((c: TermsConsentInput | null): c is TermsConsentInput => !!c?.consent_id && c?.acceptedConsents !== false)
    .map((c: TermsConsentInput) => {
      const type = typeById.get(String(c.consent_id));
      const v = Number(c.terms_version);
      return type ? { type, ...(Number.isInteger(v) && v > 0 && v < 1000 ? { version: v } : {}) } : null;
    })
    .filter((t): t is { type: string; version?: number } => !!t);
}

/** aceita_uso_dados (Política + Termo de Uso) e aceita_consulta_credito (SCR). */
export function consentFlags(payload: SimulationPayload) {
  const types = new Set(acceptedTerms(payload).map((t) => t.type));
  return {
    aceita_uso_dados: types.has("politica_privacidade") && types.has("termos_gerais"),
    aceita_consulta_credito: types.has("autorizacao_scr"),
  };
}

// =========================================================================
// SIMULADOR
// =========================================================================

async function callFlowSimulator(req: FlowSimRequest): Promise<FlowSimItem[]> {
  const token = flowToken();
  const { env, ...simBody } = req;

  const res = await flowFetch(`${flowUrls(env ?? "production").simulator}/simulador`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(simBody),
  }, 20000);

  if (res.status === 404) return [];
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`FLOWCREDI_SIMULATOR_ERROR: HTTP ${res.status} ${body?.message ?? ""}`.trim());
  return Array.isArray(body) ? (body as FlowSimItem[]) : [];
}

/** Retorna as simulações da FlowCredi ([] quando nenhuma condição é encontrada). */
export async function flowSimulate(req: FlowSimRequest): Promise<FlowSimItem[]> {
  debugLog(`🏠 [FlowCredi Simulador] request (${req.env ?? "production"}):`, { ...req, dataNascimento: "***" });
  const items = await callFlowSimulator(req);
  debugLog(`🏠 [FlowCredi Simulador] ${items.length} simulação(ões).`);
  return items;
}

// =========================================================================
// BANCOS, CONSULTAS E PARCELAS
// =========================================================================

/** Nome do banco na FlowCredi → código do banco (financial_institutions.id). */
const BANK_CODES: Record<string, number> = {
  "banco do brasil": 1,
  santander: 33,
  inter: 77,
  caixa: 104,
  bradesco: 237,
  itau: 341,
};
const normBank = (n: string) => String(n ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

type Institution = { id: number; logo_url: string | null };

/** Busca id e logo dos bancos devolvidos (uma consulta por chamada). Falha → sem logo. */
async function loadInstitutions(items: FlowSimItem[]): Promise<Map<string, Institution>> {
  const byBank = new Map<string, Institution>();
  const ids = [...new Set(items.map((it) => BANK_CODES[normBank(it.banco)]).filter((v): v is number => !!v))];
  if (ids.length === 0) return byBank;
  try {
    // Linhas do postgres.js chegam como Row genérico: tipadas pelas colunas do select
    const rows = (await sql`select id, logo_url from financial_institutions where id in ${sql(ids)} and is_active = true`) as unknown as { id: number | string; logo_url: string | null }[];
    const byId = new Map<number, Institution>(rows.map((r) => [Number(r.id), { id: Number(r.id), logo_url: r.logo_url ?? null }]));
    for (const it of items) {
      const inst = byId.get(BANK_CODES[normBank(it.banco)]);
      if (inst) byBank.set(normBank(it.banco), inst);
    }
  } catch (err: unknown) {
    debugLog("⚠️ [FlowCredi] Falha ao buscar financial_institutions:", (err as Error)?.message);
  }
  return byBank;
}

/** Converte uma simulação da FlowCredi em uma linha de consulta (simulation_consults). */
/**
 * Parcela exibida = parcela cheia da tabela (com MIP, DFI e tarifa), não a da lista: a lista
 * pode vir com outra seguradora (orientação da FlowCredi, item 3.2).
 */
function applySchedule(consult: FlowConsultation, schedule: FlowParcela[]) {
  consult.installment_schedule = schedule;
  const first = schedule[0]?.parcelaTotal;
  const last = schedule[schedule.length - 1]?.parcelaTotal;
  if (Number.isFinite(first) && first > 0) {
    consult.installment_value = first;
    if (consult.details) consult.details.primeiraParcela = first;
  }
  if (Number.isFinite(last) && last > 0) {
    consult.last_installment_value = last;
    if (consult.details) consult.details.ultimaParcela = last;
  }
}

function toConsult(it: FlowSimItem, valorImovel: number, statusId: number, isSelected: boolean, message: string | null, inst?: Institution, renda?: number): Consultation {
  const consult: FlowConsultation = {
    status_id: statusId,
    is_selected: isSelected,
    external_operation_id: null,
    message,
    financial_institution_id: inst?.id ?? null,
    financial_institution_name: it.banco,
    requested_value: valorImovel,
    down_payment_amount: it.valorEntrada,
    down_payment_percentage: valorImovel > 0 ? Math.round((it.valorEntrada / valorImovel) * 10000) / 100 : null,
    financed_amount: it.valorFinanciado,
    installments: it.prazo,
    cet_rate: null, // a FlowCredi não informa CET; as taxas ficam em `details`
    amortization_type: it.tabela,
    installment_value: it.primeiraParcela,
    last_installment_value: it.ultimaParcela,
    // Condições do banco (gravadas em simulation_consults.simulation_details)
    details: {
      banco: it.banco,
      logoUrl: inst?.logo_url ?? null,
      idProduto: it.idProduto,
      produto: it.produto,
      seguradora: it.seguradora,
      tabela: it.tabela,
      taxaJurosAnual: it.taxaJurosAnual,
      taxaJurosMensal: it.taxaJurosMensal,
      primeiraParcela: it.primeiraParcela,
      ultimaParcela: it.ultimaParcela,
      amortizacao: it.amortizacao,
      juros: it.juros,
      mip: it.mip,
      dfi: it.dfi,
      tac: it.tac,
      rendaMinima: it.rendaMinima,
      // Renda informada atende a renda mínima desta condição (30% de comprometimento)?
      rendaSuficiente: renda && it.rendaMinima ? renda >= it.rendaMinima : null,
      valorSubsidio: it.valorSubsidio,
      uf: it.uf,
      regiao: it.regiao,
    },
  };
  return consult;
}

/** "Taxa Balcão": condição sem exigência de relacionamento com o banco. */
// Condição padrão do card: idProduto "Balcao" (taxa base do banco), confirmado pela FlowCredi
const isBalcao = (it: FlowSimItem) => /balc[aã]o/i.test(`${it.idProduto ?? ""} ${it.produto ?? ""}`);

/**
 * Condição exibida de cada banco: a "Taxa Balcão" (vale para quem não é cliente do banco).
 * Banco sem Balcão → menor taxa. Em qualquer caso, empate → menor taxa e depois menor 1ª parcela.
 */
function bestByBank(items: FlowSimItem[]): FlowSimItem[] {
  const best = new Map<string, FlowSimItem>();
  for (const it of items) {
    const cur = best.get(it.banco);
    if (
      !cur ||
      (isBalcao(it) && !isBalcao(cur)) ||
      (isBalcao(it) === isBalcao(cur) &&
        (it.taxaJurosAnual < cur.taxaJurosAnual ||
          (it.taxaJurosAnual === cur.taxaJurosAnual && it.primeiraParcela < cur.primeiraParcela)))
    ) {
      best.set(it.banco, it);
    }
  }
  return [...best.values()];
}

/**
 * Parcelas mês a mês das condições escolhidas, em paralelo. A FlowCredi só devolve
 * `parcelas` com retornarParcelas e um único resultado (banco + idProduto + idSeguradora).
 * Falha numa chamada → aquele banco fica sem parcelas (não derruba a simulação).
 */
async function loadSchedules(req: FlowSimRequest, picks: FlowSimItem[]): Promise<Map<FlowSimItem, FlowParcela[]>> {
  const out = new Map<FlowSimItem, FlowParcela[]>();
  const results = await Promise.allSettled(
    picks.map((it) =>
      // Sem idSeguradora: cada produto já tem a sua seguradora vinculada (orientação da FlowCredi)
      flowSimulate({ ...req, banco: it.banco, idProduto: it.idProduto, retornarParcelas: true }),
    ),
  );
  results.forEach((r, i) => {
    const it = picks[i];
    if (r.status !== "fulfilled") {
      debugLog("⚠️ [FlowCredi] Parcelas indisponíveis:", { banco: it.banco, idProduto: it.idProduto, erro: (r.reason as Error | undefined)?.message });
      return;
    }
    const one: FlowSimItem | undefined = r.value.length === 1 ? r.value[0] : undefined;
    if (!one || !Array.isArray(one.parcelas) || one.parcelas.length === 0) {
      debugLog("⚠️ [FlowCredi] Parcelas não vieram:", { banco: it.banco, idProduto: it.idProduto, itens: r.value.length });
      return;
    }
    if (one.banco !== it.banco || one.idProduto !== it.idProduto) {
      debugLog("⚠️ [FlowCredi] Parcelas: retorno não bate com a condição pedida:", {
        pedido: { banco: it.banco, idProduto: it.idProduto },
        retorno: { banco: one.banco, idProduto: one.idProduto },
      });
    }
    out.set(it, one.parcelas);
  });
  return out;
}

/**
 * SIMULATE: todas as condições (uma linha por banco × produto × seguradora). As exibidas
 * ao cliente vêm com `is_selected` e as parcelas mês a mês (`installment_schedule`):
 *  - padrão (imóveis): uma por banco, a Taxa Balcão (sem Balcão → menor taxa);
 *  - `showAll` (home equity: só produtos da própria FlowCredi): todas.
 * Sem condição: devolve `consults` com uma linha "Sem condições" e `count = 0`.
 */
export async function simulateConditions(
  req: FlowSimRequest,
  opts: { showAll?: boolean } = {},
): Promise<{ consults: Consultation[]; count: number }> {
  const items = (await flowSimulate(req)).sort((a, b) => a.primeiraParcela - b.primeiraParcela);
  if (items.length === 0) {
    return {
      count: 0,
      consults: [{
        status_id: STATUS_NONE, is_selected: true, external_operation_id: null,
        message: null, // sem texto próprio: o nome/descrição do status vêm de status_types
        financial_institution_id: null, financial_institution_name: "FlowCredi",
        requested_value: req.valorImovel, down_payment_amount: req.valorImovel - req.valorFinanciado,
        down_payment_percentage: null, financed_amount: req.valorFinanciado, installments: req.prazo,
        cet_rate: null, installment_value: null,
      }],
    };
  }

  const institutions = await loadInstitutions(items);
  const picks = opts.showAll ? items : bestByBank(items);
  const schedules = await loadSchedules(req, picks);
  const pickSet = new Set(picks);
  const consults = items.map((it) => {
    // is_selected = condição exibida ao cliente (a Taxa Balcão de cada banco; sem Balcão → menor taxa)
    const consult: FlowConsultation = toConsult(it, req.valorImovel, STATUS_OK, pickSet.has(it), null, institutions.get(normBank(it.banco)), req.renda);
    const schedule = pickSet.has(it) ? schedules.get(it) : undefined;
    if (schedule) applySchedule(consult, schedule);
    return consult;
  });
  return { consults, count: items.length };
}

/** Condição pedida pela gaveta de detalhe (banco + produto + seguradora). */
function readSelection(payload: SimulationPayload): { banco: string; idProduto: string } {
  const s = payload?.simulation_details?.selected ?? {};
  const pick = (v: unknown) => (typeof v === "string" && v.trim().length > 0 && v.length <= 120 ? v.trim() : "");
  const sel = { banco: pick(s.banco), idProduto: pick(s.idProduto) };
  if (!sel.banco || !sel.idProduto) throw businessError("Condição inválida.");
  return sel;
}

/** DETAIL: parcelas de outra condição do banco, escolhida na gaveta (somente leitura). */
export async function detailCondition(payload: SimulationPayload, req: FlowSimRequest): Promise<Consultation> {
  const sel = readSelection(payload);
  if (req.banco && sel.banco !== req.banco) throw businessError("Condição indisponível.");
  const items = await flowSimulate({ ...req, banco: sel.banco, idProduto: sel.idProduto, retornarParcelas: true });
  const one: FlowSimItem | undefined = items.length === 1 ? items[0] : items.find((x) => x.banco === sel.banco && x.idProduto === sel.idProduto);
  if (!one || !Array.isArray(one.parcelas) || one.parcelas.length === 0) {
    throw businessError("Não foi possível carregar as parcelas desta condição.");
  }
  if (one.banco !== sel.banco || one.idProduto !== sel.idProduto) {
    debugLog("⚠️ [FlowCredi] DETAIL: retorno não bate com a condição pedida:", {
      pedido: sel, retorno: { banco: one.banco, idProduto: one.idProduto },
    });
  }
  const consult: FlowConsultation = toConsult(one, req.valorImovel, STATUS_OK, true, null, undefined, req.renda);
  applySchedule(consult, one.parcelas);
  return consult;
}

// =========================================================================
// LEADS
// =========================================================================

/** Registra os aceites na API de Termos. Não lança: quem chama decide (sendLead exige 201). */
async function registerTerms(env: FlowEnv, token: string, payload: SimulationPayload, client: FlowClient): Promise<FlowLeadResult["terms"]> {
  const items = acceptedTerms(payload);
  const cpf = onlyDigits((payload.entity as Entity)?.document);
  if (items.length === 0 || cpf.length !== 11) return { ok: false, error: "sem aceites ou CPF" };
  if (!client.ip || !client.userAgent) return { ok: false, error: "sem IP ou user-agent do cliente" };
  try {
    const res = await fetch(`${flowUrls(env).terms}/acceptances/batch`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        cpf,
        acceptedBy: `superbid:${String((payload.entity as Entity)?.entity_id ?? cpf)}`,
        items,
        ip: client.ip,
        userAgent: client.userAgent,
        channel: "wallet-sbx",
        metadata: { refId: flowRefId(payload) ?? null },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const body = await res.json().catch(() => ({}));
    // 201: todos gravados · 207: gravação parcial (o retorno diz item a item o que falhou)
    const detail = stripPersonal(body);
    if (res.status === 201) return { ok: true, status: res.status, detail };
    if (res.status === 207) {
      debugLog("⚠️ [FlowCredi Termos] Aceites gravados parcialmente:", { enviados: items, retorno: detail });
      return { ok: false, status: res.status, detail };
    }
    debugLog("⚠️ [FlowCredi Termos] Aceites não registrados:", { status: res.status, retorno: detail });
    return { ok: false, status: res.status, error: String(body?.message ?? ""), detail };
  } catch (err: unknown) {
    debugLog("⚠️ [FlowCredi Termos] Falha ao registrar aceites:", (err as Error)?.message);
    return { ok: false, error: (err as Error)?.message };
  }
}

/** Tipos de termo recusados no retorno da API de Termos (207: item a item). */
function refusedTerms(detail: unknown): { type: unknown; status: unknown }[] {
  const results = (detail as { results?: { type?: unknown; status?: unknown }[] } | null)?.results;
  if (!Array.isArray(results)) return [];
  return results
    .filter((r) => !["ok", "alreadyAccepted"].includes(String(r?.status)))
    .map((r) => ({ type: r?.type ?? null, status: r?.status ?? null }));
}

/**
 * Registra os aceites na API de Termos e, só com 201, cria o processo (POST /processos).
 * Aceites não registrados (207, erro ou sem resposta) → lança sem criar o processo (vira
 * "Falha" com o retorno dos termos em `detail`). Processo: 201 e 200 (existingProcessReturned)
 * são sucesso; erro da API → lança (vira "Falha"); 400 traz os campos faltantes no log.
 */
export async function sendLead(
  payload: SimulationPayload,
  body: Record<string, unknown>,
  client: FlowClient = {},
): Promise<FlowLeadResult> {
  const env = flowEnv(payload);
  const token = flowToken();

  // Aceites antes do processo: sem a autorização registrada na FlowCredi, o processo não é criado
  const terms = await registerTerms(env, token, payload, client);
  debugLog(`📝 [FlowCredi Termos] ${terms.status ?? "sem resposta"}`, terms.ok ? "" : { recusados: refusedTerms(terms.detail), erro: terms.error ?? null });
  if (!terms.ok) {
    const err = new Error("Não foi possível registrar seus aceites na FlowCredi. Tente novamente em instantes.") as Error & { detail?: unknown };
    err.detail = { terms: { status: terms.status ?? null, refused: refusedTerms(terms.detail), error: terms.error ?? null } };
    throw err;
  }

  debugLog(`📨 [FlowCredi Processos] Criando processo ${String(body.produto)} (${env}) refId:`, body.refId);

  const res = await flowFetch(`${flowUrls(env).process}/processos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }, 20000);
  const resp = await res.json().catch(() => ({}));
  if (res.status === 400) {
    debugLog("⚠️ [FlowCredi Processos] Validação:", { message: resp?.message, missingFields: resp?.missingFields });
    const missing = Array.isArray(resp?.missingFields) ? ` (${resp.missingFields.join(", ")})` : "";
    throw new Error(`FLOWCREDI_PROCESS_VALIDATION: ${resp?.message ?? resp?.error ?? "dados inválidos"}${missing}`);
  }
  if (res.status !== 201 && res.status !== 200) {
    throw new Error(`FLOWCREDI_PROCESS_ERROR: HTTP ${res.status} ${resp?.message ?? ""}`.trim());
  }

  const processoId = resp?.processoId ?? resp?.processo?.processoId ?? resp?.id ?? null;
  return { processoId: processoId ? String(processoId) : null, existing: resp?.existingProcessReturned === true, status: res.status, terms };
}

/** Linha de consulta do lead enviado (Lead · Enviado, sem banco). `processoId` → external_operation_id. */
export function leadConsult(
  req: FlowSimRequest,
  processoId: string | null | undefined,
  opts: { withDownPayment?: boolean } = { withDownPayment: true },
): Consultation {
  // Entrada só existe no financiamento imobiliário; no crédito com garantia (home/car equity) não há entrada
  const entrada = opts.withDownPayment ? Math.max(0, req.valorImovel - req.valorFinanciado) : null;
  return {
    status_id: STATUS_LEAD_SENT,
    is_selected: true,
    external_operation_id: processoId ?? null,
    message: null, // sem texto próprio: o nome/descrição do status vêm de status_types
    financial_institution_id: null,
    financial_institution_name: "FlowCredi",
    requested_value: req.valorImovel,
    down_payment_amount: entrada,
    down_payment_percentage: entrada !== null && req.valorImovel > 0 ? Math.round((entrada / req.valorImovel) * 10000) / 100 : null,
    financed_amount: req.valorFinanciado,
    installments: req.prazo,
    cet_rate: null,
    installment_value: null,
  };
}

/** Lead (corpo do processo) para auditoria (raw), sem dados pessoais do titular. */
export const maskLead = (body: Record<string, unknown>) => ({
  ...body,
  participantes: (Array.isArray(body.participantes) ? body.participantes : []).map((p: Record<string, unknown>) => ({
    ...p,
    documento: "***", nome: "***", email: "***", telefone: "***", data_nascimento: "***", nome_mae: p.nome_mae ? "***" : undefined,
    logradouro: p.logradouro ? "***" : undefined, numero: p.numero ? "***" : undefined, complemento: p.complemento ? "***" : undefined,
  })),
});
