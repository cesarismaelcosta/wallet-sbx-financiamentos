/**
 * WEBHOOK FLOWCREDI — mudança de status da proposta nos bancos
 * @path supabase/functions/financial-gateway-webhook/flowcredi-service.ts
 *
 * A FlowCredi (Partner Webhook Dispatcher, evento `bank.status_changed`) faz um POST para
 * `/financial-gateway-webhook/flowcredi` quando o status de uma proposta muda num banco.
 *
 * Segurança (sem secret nova): o aviso é só uma "campainha". Do corpo usamos apenas o
 * `data.processId`; o status gravado vem SEMPRE de uma consulta nossa à Process Bank API
 * (GET /processes/{processId}/banks) com o token do parceiro (FLOWCREDI_API_KEY), que só
 * devolve processos da Superbid. Um aviso falso não altera nada.
 *  - só processa `processId` que já existe em simulations.external_operation_id (FlowCredi);
 *  - evento já processado (mesmo `id`, que não muda nas retentativas) é ignorado;
 *  - teto de MAX_CHECKS_PER_HOUR consultas por processo por hora;
 *  - grava só quando o quadro dos bancos muda (nova simulation_update + status da simulação).
 * Responde sempre 200 (nada a fazer também é sucesso); 500 só em falha nossa, para a
 * FlowCredi tentar de novo.
 *
 * @author César Ismael Pereira da Costa
 * @author Claude
 */

import { sql } from "../_shared/db.ts";
import { debugLog } from "../_shared/logger.ts";
import { captureInfrastructure } from "../_shared/infrastructure.ts";
import { STATUS, STAGE } from "../_shared/types.ts";

const FLOWCREDI_PARTNER_ID = 3;
const MAX_CHECKS_PER_HOUR = 30; // teto de consultas por processo (proteção contra avisos em massa)
const MAX_BODY_BYTES = 64 * 1024;
const SOURCE = "flowcredi_webhook";

const HOSTS = { staging: "https://api.staging.flowcredi.com.br", production: "https://api.flowcredi.com.br" } as const;

type BankInProcess = {
  bankCode?: string;
  bankName?: string;
  status?: string;
  stage?: string;
  statusSummary?: string;
  bankProposalNumber?: string | null;
  rejectionReason?: string | null;
  approvedCreditAmount?: number | null;
  termMonths?: number | null;
  annualNominalRate?: number | null;
  monthlyNominalRate?: number | null;
  updatedAt?: string;
};

const ok = (body: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ ok: true, ...body }), { status: 200, headers: { "Content-Type": "application/json" } });

/** Status canônico da FlowCredi → nosso status (status_types). */
function toStatus(flowStatus: string): number {
  const s = flowStatus.toUpperCase();
  if (/^APROVAD/.test(s)) return STATUS.APROVADA;
  if (/PRE_?APROVAD/.test(s)) return STATUS.PRE_APROVADO;
  if (/REPROVAD|RECUSAD|NEGAD/.test(s)) return STATUS.RECUSADA;
  if (/CANCELAD|DESISTEN|EXPIRAD/.test(s)) return STATUS.CANCELADA;
  if (/DOCUMENT|PENDENC/.test(s)) return STATUS.PENDENTE_DOCUMENTOS;
  if (/CONTRAT|ASSINAD|FORMALIZ/.test(s)) return STATUS.EM_FORMALIZACAO;
  if (/PAG|LIBERAD|DESEMBOLS/.test(s)) return STATUS.PAGA;
  return STATUS.EM_ANALISE;
}

/** Status da simulação = o mais avançado entre os bancos; recusada/cancelada só se todos estiverem. */
const PRIORITY: number[] = [
  STATUS.PAGA, STATUS.EM_FORMALIZACAO, STATUS.APROVADA, STATUS.PRE_APROVADO,
  STATUS.PENDENTE_DOCUMENTOS, STATUS.EM_ANALISE, STATUS.RECUSADA, STATUS.CANCELADA,
];
function overallStatus(banks: { status?: string | null }[]): number {
  const statuses = banks.map((b) => toStatus(String(b.status ?? "")));
  if (statuses.length === 0) return STATUS.EM_ANALISE;
  return PRIORITY.find((p) => statuses.includes(p)) ?? STATUS.EM_ANALISE;
}

/** Quadro dos bancos que gravamos (sem campos operacionais). */
const snapshot = (banks: BankInProcess[]) =>
  banks
    .map((b) => ({
      bankCode: b.bankCode ?? null, bankName: b.bankName ?? null, status: b.status ?? null, stage: b.stage ?? null,
      statusSummary: b.statusSummary ?? null, bankProposalNumber: b.bankProposalNumber ?? null,
      rejectionReason: b.rejectionReason ?? null, approvedCreditAmount: b.approvedCreditAmount ?? null,
      termMonths: b.termMonths ?? null, annualNominalRate: b.annualNominalRate ?? null,
      monthlyNominalRate: b.monthlyNominalRate ?? null, updatedAt: b.updatedAt ?? null,
    }))
    .sort((a, b) => String(a.bankCode).localeCompare(String(b.bankCode)));

export async function tratarWebhookFlowcredi(req: Request): Promise<Response> {
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Método não permitido" }), { status: 405 });

  // 1) Corpo: só o processId interessa
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return ok({ ignored: "body" });
  let event: Record<string, unknown> = {};
  try {
    event = JSON.parse(raw);
  } catch (_) {
    return ok({ ignored: "json" });
  }
  const data = (event?.data ?? {}) as Record<string, unknown>;
  const processId = String(data.processId ?? "").trim();
  if (!/^[\w-]{8,100}$/.test(processId)) return ok({ ignored: "processId" });

  // 2) Só processos nossos (criados pela Wallet com a FlowCredi)
  const [sim] = await sql`
    select id, status_id from simulations
    where external_operation_id = ${processId} and partner_id = ${FLOWCREDI_PARTNER_ID}
    order by updated_at desc limit 1`;
  if (!sim) {
    debugLog("🔕 [FlowCredi Webhook] processId desconhecido; ignorado.");
    return ok({ ignored: "unknown" });
  }

  // 3) Retentativa do mesmo evento ou excesso de avisos → ignora
  const eventId = String(event.id ?? "").slice(0, 100);
  const [seen] = await sql`
    select
      count(*) filter (where raw_payload->'event'->>'id' = ${eventId}) as same_event,
      count(*) filter (where created_at > now() - interval '1 hour') as last_hour
    from simulation_updates
    where simulation_id = ${sim.id} and raw_payload->>'source' = ${SOURCE}`;
  if (eventId && Number(seen?.same_event) > 0) return ok({ ignored: "duplicate" });
  if (Number(seen?.last_hour) >= MAX_CHECKS_PER_HOUR) {
    debugLog("⚠️ [FlowCredi Webhook] Teto de consultas por hora atingido para o processo.");
    return ok({ ignored: "throttled" });
  }

  // 4) Fonte da verdade: Process Bank API, no ambiente configurado para a FlowCredi
  const [cfg] = await sql`
    select integration_details->>'partner_environment' as env from orchestrator_configs
    where partner_id = ${FLOWCREDI_PARTNER_ID} and integration_details ? 'partner_environment' limit 1`;
  const env = cfg?.env === "staging" ? "staging" : "production";
  const token = Deno.env.get("FLOWCREDI_API_KEY") ?? "";
  if (!token) throw new Error("FLOWCREDI_NOT_CONFIGURED: FLOWCREDI_API_KEY ausente.");

  const res = await fetch(`${HOSTS[env]}/process-bank/v1/processes/${encodeURIComponent(processId)}/banks`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 403 || res.status === 404) {
    debugLog(`🔕 [FlowCredi Webhook] Process Bank API ${res.status}; ignorado.`);
    return ok({ ignored: `bank-api-${res.status}` });
  }
  if (!res.ok) throw new Error(`FLOWCREDI_BANK_API_ERROR: HTTP ${res.status}`); // 500 → a FlowCredi reenvia
  const body = await res.json().catch(() => ({}));
  const banks = snapshot(Array.isArray(body?.banks) ? body.banks : []);
  const statusId = overallStatus(banks);

  // 5) Grava só se o quadro mudou desde o último aviso
  const [last] = await sql`
    select simulation_details->'banks' as banks from simulation_updates
    where simulation_id = ${sim.id} and raw_payload->>'source' = ${SOURCE}
    order by created_at desc limit 1`;
  const changed = !last || JSON.stringify(last.banks) !== JSON.stringify(banks) || Number(sim.status_id) !== statusId;

  const infra = await captureInfrastructure(req);
  // Etapa do status pela tabela status_types (sem etapa própria → Proposta)
  const [st] = await sql`select stage_id from status_types where id = ${statusId}`;
  const stageId = Number(st?.stage_id) || STAGE.PROPOSTA;
  const details = { processId, env, banks };
  const rawPayload = {
    source: SOURCE,
    changed,
    event: { id: eventId || null, type: event.type ?? null, occurredAt: event.occurredAt ?? null, bankCode: data.bankCode ?? null, status: data.status ?? null },
  };

  await sql.begin(async (t: typeof sql) => {
    await t`
      insert into simulation_updates (
        simulation_id, operation, status_id, stage_id, result_partner_id,
        ip_address, country, state, city, user_agent, device_type, operating_system,
        origin_details, simulation_details, raw_payload
      ) values (
        ${sim.id}, 'UPDATE', ${statusId}, ${stageId}, null,
        ${infra.ip_address}, ${infra.country}, ${infra.state}, ${infra.city}, ${infra.user_agent},
        ${infra.device_type}, ${infra.operating_system},
        ${infra}::jsonb, ${details}::jsonb, ${rawPayload}::jsonb
      )`;
    if (changed) {
      await t`update simulations set status_id = ${statusId}, stage_id = ${stageId}, updated_at = now() where id = ${sim.id}`;
    }
  });

  debugLog(`📬 [FlowCredi Webhook] ${changed ? "Status atualizado" : "Sem mudança"} (${banks.length} banco(s), status ${statusId}).`);
  return ok({ updated: changed });
}
