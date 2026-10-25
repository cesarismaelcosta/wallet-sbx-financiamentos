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
 * --- LEADS (Flow Preamble API) ---
 * POST {FLOWCREDI_LEADS_URL}/mortgage/lead | /cgi/lead | /auto/lead · Bearer FLOWCREDI_API_KEY
 * 201 → { message, lead }. Envio controlado por FLOWCREDI_SEND_LEAD.
 *
 * --- AMBIENTE ---
 * URLs nas constantes abaixo · Secret: FLOWCREDI_API_KEY
 */

import { Consultation, Entity, SimulationPayload } from "../_shared/types.ts";
import { STATUS } from "../_shared/types.ts";
import { debugLog } from "../_shared/logger.ts";
import { sql } from "../_shared/db.ts";

// =========================================================================
// CONFIGURAÇÃO
// =========================================================================

/** Simulador da FlowCredi (produção). Staging: https://api.staging.flowcredi.com.br/simulador/v1 */
const FLOWCREDI_SIMULATOR_URL = "https://api.flowcredi.com.br/simulador/v1";

/** API de leads (Flow Preamble API). A documentação só traz o servidor dev; produção a confirmar com a FlowCredi. */
const FLOWCREDI_LEADS_URL = "https://age3aiv1gd.execute-api.us-east-1.amazonaws.com/dev";

/**
 * Envio do lead à FlowCredi. false: o lead é montado e a simulação é gravada como
 * "Em análise", mas nada é enviado (a tela mostra sucesso). true: envia para
 * FLOWCREDI_LEADS_URL. Trocar para true junto com a URL de produção.
 */
export const FLOWCREDI_SEND_LEAD = false;

export const STATUS_OK = STATUS.COM_CONDICOES; // Simulação · Com condições
export const STATUS_NONE = STATUS.SEM_CONDICOES; // Simulação · Sem condições
// Lead · Enviado só quando o lead sai de fato; com o envio desligado, Lead · Pendente envio
export const STATUS_LEAD_SENT = FLOWCREDI_SEND_LEAD ? STATUS.ENVIADO : STATUS.PENDENTE_ENVIO;

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
export interface FlowRules {
  flowcredi_product?: "mortgage" | "home_equity" | "auto_equity";
  flowcredi_bank?: string;
  flowcredi_bank_by_seller?: Record<string, string>;
  max_financing_percentage?: number;
  min_financed_amount?: number;
  min_term_months?: number;
  max_term_months?: number;
  min_monthly_income?: number;
  max_loan_percentage?: number;
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
  valorSubsidio: number;
  uf: string;
  regiao: string;
}

/** Linha de consulta da FlowCredi: Consultation + condições do banco e parcelas mês a mês. */
export type FlowConsultation = Consultation & {
  details?: FlowConditionDetails;
  installment_schedule?: FlowParcela[];
};

/** Retorno de sendLead: resposta da API (201 → { message, lead }) ou o aviso de envio desligado. */
export interface FlowLeadResponse {
  message?: string;
  lead?: unknown;
  sent?: boolean;
  [key: string]: unknown;
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

/** Dados de contato do cadastro, no formato dos leads (comuns a /mortgage, /cgi e /auto). */
export function leadContact(payload: SimulationPayload, productLabel: string) {
  const entity = (payload.entity as Entity) || ({} as Entity);
  const cpf = String(entity.document ?? "").replace(/\D/g, "");
  const telefone = String(entity.phone ?? "").replace(/\D/g, "").replace(/^55(?=\d{10,11}$)/, "");
  if (cpf.length !== 11) throw businessError(`${productLabel} está disponível apenas para pessoa física.`);
  if (!entity.name || !entity.email || telefone.length < 10) {
    throw businessError("Complete nome, e-mail e celular no seu cadastro para enviar a proposta.");
  }
  return {
    refId: payload.simulation_id ? String(payload.simulation_id) : undefined,
    nome: String(entity.name).trim(),
    email: String(entity.email).trim(),
    cpf,
    telefone,
  };
}

// =========================================================================
// SIMULADOR
// =========================================================================

async function callFlowSimulator(req: FlowSimRequest): Promise<FlowSimItem[]> {
  const token = Deno.env.get("FLOWCREDI_API_KEY") ?? "";
  if (!token) throw new Error("FLOWCREDI_NOT_CONFIGURED: FLOWCREDI_API_KEY ausente.");

  const res = await fetch(`${FLOWCREDI_SIMULATOR_URL}/simulador`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(20000),
  });

  if (res.status === 404) return [];
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`FLOWCREDI_SIMULATOR_ERROR: HTTP ${res.status} ${body?.message ?? ""}`.trim());
  return Array.isArray(body) ? (body as FlowSimItem[]) : [];
}

/** Retorna as simulações da FlowCredi ([] quando nenhuma condição é encontrada). */
export async function flowSimulate(req: FlowSimRequest): Promise<FlowSimItem[]> {
  debugLog("🏠 [FlowCredi Simulador] request:", { ...req, dataNascimento: "***" });
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
    const rows = await sql`select id, logo_url from financial_institutions where id in ${sql(ids)} and is_active = true`;
    const byId = new Map<number, Institution>(rows.map((r: { id: number | string; logo_url: string | null }) => [Number(r.id), { id: Number(r.id), logo_url: r.logo_url ?? null }]));
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
function toConsult(it: FlowSimItem, valorImovel: number, statusId: number, isSelected: boolean, message: string | null, inst?: Institution): Consultation {
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
      valorSubsidio: it.valorSubsidio,
      uf: it.uf,
      regiao: it.regiao,
    },
  };
  return consult;
}

/** "Taxa Balcão": condição sem exigência de relacionamento com o banco. */
const isBalcao = (it: FlowSimItem) => /balc[aã]o/i.test(it.produto ?? "");

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
      flowSimulate({ ...req, banco: it.banco, idProduto: it.idProduto, idSeguradora: it.seguradora?.id, retornarParcelas: true }),
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
    if (one.banco !== it.banco || one.idProduto !== it.idProduto || one.seguradora?.id !== it.seguradora?.id) {
      debugLog("⚠️ [FlowCredi] Parcelas: retorno não bate com a condição pedida:", {
        pedido: { banco: it.banco, idProduto: it.idProduto, seguradora: it.seguradora?.id },
        retorno: { banco: one.banco, idProduto: one.idProduto, seguradora: one.seguradora?.id },
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
    const consult: FlowConsultation = toConsult(it, req.valorImovel, STATUS_OK, pickSet.has(it), null, institutions.get(normBank(it.banco)));
    const schedule = pickSet.has(it) ? schedules.get(it) : undefined;
    if (schedule) consult.installment_schedule = schedule;
    return consult;
  });
  return { consults, count: items.length };
}

/** Condição pedida pela gaveta de detalhe (banco + produto + seguradora). */
function readSelection(payload: SimulationPayload): { banco: string; idProduto: string; idSeguradora: string } {
  const s = payload?.simulation_details?.selected ?? {};
  const pick = (v: unknown) => (typeof v === "string" && v.trim().length > 0 && v.length <= 120 ? v.trim() : "");
  const sel = { banco: pick(s.banco), idProduto: pick(s.idProduto), idSeguradora: pick(s.idSeguradora) };
  if (!sel.banco || !sel.idProduto || !sel.idSeguradora) throw businessError("Condição inválida.");
  return sel;
}

/** DETAIL: parcelas de outra condição do banco, escolhida na gaveta (somente leitura). */
export async function detailCondition(payload: SimulationPayload, req: FlowSimRequest): Promise<Consultation> {
  const sel = readSelection(payload);
  if (req.banco && sel.banco !== req.banco) throw businessError("Condição indisponível.");
  const items = await flowSimulate({ ...req, banco: sel.banco, idProduto: sel.idProduto, idSeguradora: sel.idSeguradora, retornarParcelas: true });
  const one: FlowSimItem | undefined = items.length === 1 ? items[0] : items.find((x) => x.banco === sel.banco && x.idProduto === sel.idProduto);
  if (!one || !Array.isArray(one.parcelas) || one.parcelas.length === 0) {
    throw businessError("Não foi possível carregar as parcelas desta condição.");
  }
  if (one.banco !== sel.banco || one.idProduto !== sel.idProduto || one.seguradora?.id !== sel.idSeguradora) {
    debugLog("⚠️ [FlowCredi] DETAIL: retorno não bate com a condição pedida:", {
      pedido: sel, retorno: { banco: one.banco, idProduto: one.idProduto, seguradora: one.seguradora?.id },
    });
  }
  const consult: FlowConsultation = toConsult(one, req.valorImovel, STATUS_OK, true, null);
  consult.installment_schedule = one.parcelas;
  return consult;
}

// =========================================================================
// LEADS
// =========================================================================

/** Envia o lead para a rota do produto ("/mortgage/lead", "/cgi/lead"...). Respeita FLOWCREDI_SEND_LEAD. */
export async function sendLead(route: string, lead: Record<string, unknown>): Promise<FlowLeadResponse> {
  if (!FLOWCREDI_SEND_LEAD) {
    return { message: "Lead não enviado (FLOWCREDI_SEND_LEAD = false).", lead: null, sent: false };
  }
  const token = Deno.env.get("FLOWCREDI_API_KEY") ?? "";
  if (!token) throw new Error("FLOWCREDI_NOT_CONFIGURED: FLOWCREDI_API_KEY ausente.");

  const res = await fetch(`${FLOWCREDI_LEADS_URL}${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(lead),
    signal: AbortSignal.timeout(20000),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 400 && body && !body.message) {
    // Erro de validação: { campo: ["mensagem", ...] }
    const detail = Object.entries(body).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`).join("; ");
    throw new Error(`FLOWCREDI_LEAD_VALIDATION: ${detail}`);
  }
  if (!res.ok) throw new Error(`FLOWCREDI_LEAD_ERROR: HTTP ${res.status} ${body?.message ?? ""}`.trim());
  return body;
}

/** Linha de consulta do lead enviado (Lead · Enviado, sem banco). */
export function leadConsult(
  req: FlowSimRequest,
  refId: string | null | undefined,
  opts: { withDownPayment?: boolean } = { withDownPayment: true },
): Consultation {
  // Entrada só existe no financiamento imobiliário; no crédito com garantia (home/car equity) não há entrada
  const entrada = opts.withDownPayment ? Math.max(0, req.valorImovel - req.valorFinanciado) : null;
  return {
    status_id: STATUS_LEAD_SENT,
    is_selected: true,
    external_operation_id: refId ?? null,
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

/** Lead para auditoria (raw), sem dados pessoais. */
export const maskLead = (lead: Record<string, unknown>) => ({
  ...lead, cpf: "***", nome: "***", email: "***", telefone: "***", data_nascimento: "***",
});
