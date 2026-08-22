/**
 * @fileoverview Gateway Utility — Transporte Zero-Trust ("Thin Payloads")
 * @path src/features/financial-hub/core/services/gateway.ts
 *
 * ============================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: ZERO-TRUST TRANSPORT LAYER
 * ============================================================================
 * Transportador unificado para as Edge Functions (orchestrator, financial-gateway,
 * orchestrator-configs).
 *
 * [MUDANÇAS ARQUITETURAIS - ALINHAMENTO DE CONTRATO v3.0.1]:
 * 1. {Thin Payload Sync}: Sincronização exata das THIN_KEYS com o `pickThin` 
 *    do backend (`hydrate-data.ts`). Inclusão crítica de `simulation_details` 
 *    e `consents` para impedir a morte por inanição do motor de crédito e da 
 *    auditoria LGPD.
 * 2. {Retrocompatibilidade de UI (Bridge)}: `toThinPayload` agora intercepta
 *    campos soltos antigos do Front-end (`installments`, `down_payment`) e os 
 *    envelopa em `simulation_details`, evitando quebrar os componentes do React.
 * 3. {Timeouts e Resiliência}: Failsafe ativo de 8s/20s. A Borda corta a 
 *    requisição para impedir a "tela infinita" no navegador.
 *
 * @version 3.0.1 (Zero-Trust Sync & UI Bridge)
 */

import { authHeaders, fetchOptions } from "@/services/session";
import { OrchestratorPayload } from "@/features/financial-hub/components/shared/types";

/** Contrato único de erro do Gateway consumido por hooks, steps e wrappers. */
export interface GatewayErrorResponse {
  success: boolean;
  code: string;
  message: string;
  status: number;
  fallback_url: string;
  details: any;
}

/** Timeouts por natureza da chamada (ms). */
const TIMEOUT_FAST = 8000; // orquestração e configs
const TIMEOUT_SIMULATION = 20000; // motor de crédito / upstream externo

// =========================================================================
// [1] DEFINIÇÃO E ENFORCEMENT DO THIN PAYLOAD
// =========================================================================

/**
 * Chaves permitidas no corpo enviado ao Edge (Zero-Trust).
 * 🚨 ALINHAMENTO CRÍTICO: Deve espelhar perfeitamente o pickThin() do Back-end.
 */
const THIN_KEYS = [
  "action",
  "action_description",
  "step",
  "product_id",
  "partner_id",
  "category_id",
  "offer_id",
  "event_id",
  "seller_id",
  "entity_id",
  "visit_id",
  "visit_update_id",
  "origin_visit_update_id",
  "simulation_id",
  "simulation_update_id",
  "origin_url",
  "target_url",
  "simulation_details", // 🚨 OBRIGATÓRIO PARA O MOTOR DE CRÉDITO
  "consents",           // 🚨 OBRIGATÓRIO PARA AUDITORIA LGPD
] as const;

/**
 * toThinPayload
 * Achata o payload para intenção + identificadores. Extrai IDs de objetos
 * aninhados legados e garante o formato exigido pelo Edge.
 */
export function toThinPayload(payload: Record<string, any> = {}): Record<string, any> {
  const thin: Record<string, any> = {};

  // Extração direta das chaves autorizadas
  for (const key of THIN_KEYS) {
    const value = payload[key];
    if (value !== undefined && value !== null && value !== "") thin[key] = value;
  }

  // Compatibilidade: colapsa objetos gordos em seus IDs.
  const nested: Array<[string, string]> = [
    ["offer", "offer_id"],
    ["event", "event_id"],
    ["seller", "seller_id"],
    ["entity", "entity_id"],
  ];
  for (const [obj, idKey] of nested) {
    const id = payload?.[obj]?.[idKey];
    if (thin[idKey] === undefined && id !== undefined && id !== null && id !== "") {
      thin[idKey] = id;
    }
  }

  // Preserva contexto de tracking (GPS da visita, sem PII)
  if (payload.interaction_context) {
    const { utm_source, utm_medium, utm_campaign, origin_url } = payload.interaction_context;
    thin.interaction_context = { utm_source, utm_medium, utm_campaign, origin_url };
  }

  // 🔥 BRIDGE DE SEGURANÇA (Retrocompatibilidade UI)
  // Se o Front-end legado enviar campos financeiros soltos, nós os envelopamos
  // na estrutura correta (`simulation_details`) que o Back-end (Zero-Trust) exige.
  if (payload.installments || payload.down_payment || payload.term || payload.requested_value) {
    thin.simulation_details = {
      ...(thin.simulation_details || {}),
      installments: payload.installments || payload.term || null,
      down_payment_amount: payload.down_payment || null,
      requested_value: payload.requested_value || null,
    };
  }

  return thin;
}

// =========================================================================
// [2] UTILS E HELPERS DE REDE
// =========================================================================

/** Mascara PII/valores sensíveis antes de qualquer log (LGPD / compliance). */
function sanitizePayloadForLogs(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;

  const sensitiveKeys = ["cpf", "name", "email", "phone", "document", "password", "token"];

  if (Array.isArray(data)) return data.map((item) => sanitizePayloadForLogs(item));

  const record = data as Record<string, unknown>;
  const clone: Record<string, unknown> = {};
  for (const key of Object.keys(record)) {
    clone[key] = sensitiveKeys.some((sk) => key.toLowerCase().includes(sk))
      ? "[MASKED]"
      : sanitizePayloadForLogs(record[key]);
  }
  return clone;
}

/** Fábrica centralizada de erros: qualquer falha vira contrato previsível. */
function buildGatewayError(errorData: any, status: number, currentPath: string): GatewayErrorResponse {
  const message = errorData?.message || errorData?.error || `Erro de rede ou servidor (Status: ${status})`;
  const code = errorData?.code || "GATEWAY_ERROR";
  const defaultFallback = `/accounts/signin?redirect_uri=${encodeURIComponent(currentPath)}`;

  return {
    success: false,
    code,
    message,
    status,
    fallback_url: errorData?.fallback_url || defaultFallback,
    details: sanitizePayloadForLogs(errorData),
  };
}

/** Caminho atual usado em headers de contexto e fallback de login. */
function currentContext() {
  const currentPath = window.location.pathname + window.location.search;
  return {
    currentPath,
    loginFallbackUrl: `/accounts/signin?redirect_uri=${encodeURIComponent(currentPath)}`,
  };
}

/** Headers padrão: anon key + session-token + contexto de navegação. */
function baseHeaders(currentPath: string, loginFallbackUrl: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    "x-original-url": currentPath,
    "x-auth-fallback-url": loginFallbackUrl,
    ...authHeaders(), // sessionStorage em DEV, Cookie HttpOnly em PROD
  };
}

/** fetch com timeout; aborto vira erro tipado GATEWAY_TIMEOUT. */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  currentPath: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw buildGatewayError(
        { code: "GATEWAY_TIMEOUT", message: `Tempo limite excedido (${timeoutMs / 1000}s). Tente novamente.` },
        504,
        currentPath,
      );
    }
    throw buildGatewayError({ code: "NETWORK_ERROR", message: "Falha de rede ao contatar o serviço." }, 0, currentPath);
  } finally {
    clearTimeout(timer);
  }
}

/** Lê o corpo de erro (JSON ou não) e lança sempre o contrato unificado. */
async function throwFromResponse(response: Response, currentPath: string, code: string): Promise<never> {
  const errorData = await response.json().catch(() => ({
    error: "Resposta não estruturada do servidor",
    code,
  }));
  throw buildGatewayError(errorData, response.status, currentPath);
}

// =========================================================================
// [3] ENDPOINTS DO GATEWAY
// =========================================================================

/**
 * callOrchestrator
 * GET  -> hidratação (exige visit_id + visit_update_id).
 * POST -> registro de intenção (ThinPayload) e decisão de roteamento.
 */
export async function callOrchestrator(
  payload: OrchestratorPayload | Record<string, any>,
  method: "GET" | "POST",
): Promise<any> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orchestrator`;
  const { currentPath, loginFallbackUrl } = currentContext();

  const options: RequestInit = {
    method,
    ...fetchOptions,
    headers: baseHeaders(currentPath, loginFallbackUrl),
  };

  let finalUrl = url;
  let timeoutToUse = TIMEOUT_FAST; // Padrão: 8s

  if (method === "POST") {
    const thin = toThinPayload(payload as Record<string, any>);
    options.body = JSON.stringify(thin);

    // ✨ Decisão cirúrgica baseada na intenção (action)
    const action = String(thin.action || "").toUpperCase();
    if (["CONSULT", "SIMULATE"].includes(action)) {
      timeoutToUse = TIMEOUT_SIMULATION; // 20s para transações pesadas
    }
  } else {
    const p = payload as Record<string, any>;
    if (!p?.visit_id || !p?.visit_update_id) {
      throw buildGatewayError(
        {
          code: "MISSING_JOURNEY_CURSOR",
          message: "Hidratação requer visit_id e visit_update_id.",
        },
        400,
        currentPath,
      );
    }
    const params = new URLSearchParams({
      visit_id: String(p.visit_id),
      visit_update_id: String(p.visit_update_id),
    });
    finalUrl = `${url}?${params.toString()}`;
  }

  const response = await fetchWithTimeout(finalUrl, options, timeoutToUse, currentPath);
  if (!response.ok) await throwFromResponse(response, currentPath, "PARSING_ERROR");
  return response.json();
}

/**
 * callSimulation
 * POST no 'financial-gateway'. O corpo carrega apenas intenção + IDs;
 * entity/offer/regras são hidratados no Edge (hydrate-data).
 */
export async function callSimulation(
  payload: OrchestratorPayload | Record<string, any>,
  step: "CHECK_ELIGIBILITY" | "EXECUTE_SIMULATION" = "EXECUTE_SIMULATION",
): Promise<any> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/financial-gateway`;
  const { currentPath, loginFallbackUrl } = currentContext();

  const response = await fetchWithTimeout(
    url,
    {
      method: "POST",
      ...fetchOptions,
      headers: baseHeaders(currentPath, loginFallbackUrl),
      body: JSON.stringify({ ...toThinPayload(payload as Record<string, any>), step }),
    },
    TIMEOUT_SIMULATION,
    currentPath,
  );

  if (!response.ok) await throwFromResponse(response, currentPath, "NETWORK_OR_SERVER_DOWN");
  return response.json();
}

/**
 * callOrchestratorConfigs
 * GET de metadados dinâmicos (wizard, steps, FAQs).
 */
export async function callOrchestratorConfigs(params: Record<string, any>): Promise<any> {
  const queryParams = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "" && key !== "title") {
      queryParams.append(key, String(value));
    }
  });

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orchestrator-configs?${queryParams.toString()}`;
  const { currentPath, loginFallbackUrl } = currentContext();

  const response = await fetchWithTimeout(
    url,
    { method: "GET", ...fetchOptions, headers: baseHeaders(currentPath, loginFallbackUrl) },
    TIMEOUT_FAST,
    currentPath,
  );

  if (!response.ok) await throwFromResponse(response, currentPath, "CONFIG_PARSING_ERROR");

  const result = await response.json();
  return result.data || result;
}