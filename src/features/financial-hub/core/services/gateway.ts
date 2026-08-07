/**
 * @fileoverview Gateway Utility (Versão Refatorada & Tipada)
 * * ARQUITETURA DE REDE:
 * Atua como o "Transportador" unificado de requisições para as Edge Functions 
 * do Supabase (Orchestrator, Financial Gateway e Configs).
 * * RESPONSABILIDADE:
 * - Ponto de entrada único e tipado para chamadas à API.
 * - Centraliza autenticação (Bearer + Cookies/Headers de sessão).
 * - Tratamento enriquecido e unificado de erros (Fábrica de Erros `buildGatewayError`).
 * - Sanitização rigorosa de PII (dados sensíveis) para logs seguros.
 */

import { authHeaders, fetchOptions } from "@/services/session";
import { OrchestratorPayload } from "@/features/financial-hub/components/shared/types";

/**
 * Interface padronizada para erros lançados pelo Gateway.
 * Garante que todos os consumidores (OrchestratorWrapper, useNavigation, Steps) 
 * leiam exatamente as mesmas chaves sem surpresas.
 */
export interface GatewayErrorResponse {
  success: boolean;
  code: string;
  message: string;
  status: number;
  fallback_url: string;
  details: any;
}

/**
 * Função auxiliar para mascarar dados sensíveis (PII e valores financeiros)
 * caso sejam logados em objetos de erro por segurança (LGPD / Compliance).
 * 
 * @param data - Objeto de erro ou payload bruto a ser auditado.
 * @returns Cópia higienizada do objeto com chaves sensíveis mascaradas.
 */
function sanitizePayloadForLogs(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;

  const sensitiveKeys = ["cpf", "name", "email", "phone", "document", "password", "token"];

  // Se for array, mapeia cada item de forma tipada
  if (Array.isArray(data)) {
    return data.map(item => sanitizePayloadForLogs(item));
  }

  // Se for objeto, trata como Record de forma segura
  const record = data as Record<string, unknown>;
  const clone: Record<string, unknown> = {};

  for (const key of Object.keys(record)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      clone[key] = "[MASKED]";
    } else {
      clone[key] = sanitizePayloadForLogs(record[key]);
    }
  }

  return clone;
}

/**
 * Fábrica Centralizada de Erros do Gateway (Ponto 1 da Prioridade 1).
 * Converte qualquer falha HTTP ou de parsing em um contrato unificado e previsível.
 * 
 * @payload errorData - Corpo do erro retornado pelo servidor ou capturado via catch.
 * @payload status - Código de status HTTP (ex: 400, 401, 500).
 * @payload currentPath - Rota atual para montagem inteligente do fallback de login.
 * @returns Um objeto de erro estruturado pronto para ser lançado (`throw`).
 */
function buildGatewayError(
  errorData: any, 
  status: number, 
  currentPath: string
): GatewayErrorResponse {
  // Garante a extração segura da mensagem de erro independentemente da chave enviada pelo backend
  const message = errorData?.message || errorData?.error || `Erro de rede ou servidor (Status: ${status})`;
  const code = errorData?.code || "GATEWAY_ERROR";
  
  // Monta o link de fallback dinamicamente caso o servidor não envie um específico
  const defaultFallback = `/accounts/signin?redirect_uri=${encodeURIComponent(currentPath)}`;
  const fallback_url = errorData?.fallback_url || defaultFallback;

  return {
    success: false,
    code,
    message,
    status,
    fallback_url,
    // Sanitizamos o payload para logs limpos e seguros contra vazamento de PII
    details: sanitizePayloadForLogs(errorData)
  };
}

/**
 * callOrchestrator
 * Executa uma chamada HTTP para a Edge Function principal 'orchestrator'.
 * 
 * @param payload - Corpo da requisição fortemente tipado com `OrchestratorPayload`.
 * @param method - Método HTTP ('GET' ou 'POST').
 * @param passedSessionToken - Parâmetro mantido por retrocompatibilidade (a injeção real usa authHeaders).
 * @returns Promise contendo os dados de resposta deserializados em JSON.
 */
export async function callOrchestrator(
  payload: OrchestratorPayload | Record<string, any>, 
  method: "GET" | "POST", 
  passedSessionToken?: string
): Promise<any> {
  // Validação preventiva de método em ambiente de desenvolvimento
  if (method !== "GET" && method !== "POST") {
    console.warn("[Gateway] Chamada executada com método atípico:", method);
  }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orchestrator`;

  // Contexto de navegação para redirecionamentos automáticos de sessão expirada
  const currentPath = window.location.pathname + window.location.search;
  const loginFallbackUrl = `/accounts/signin?redirect_uri=${encodeURIComponent(currentPath)}`;

  const options: RequestInit = {
    method,
    ...fetchOptions, // Ativa credentials: 'include' para envio de Cookies HttpOnly em produção
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      "x-original-url": currentPath,
      "x-auth-fallback-url": loginFallbackUrl,
      ...authHeaders(), // Injeção segura centralizada (SessionStorage em DEV, Cookie em PROD)
    },
  };

  if (method === "POST") {
    options.body = JSON.stringify(payload);
  }

  // Tratamento de Query Parameters para requisições do tipo GET
  let finalUrl = url;
  if (method === "GET" && payload) {
    const params = new URLSearchParams();
    Object.entries(payload).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.append(key, String(value));
      }
    });
    if (params.toString()) {
      finalUrl = `${url}?${params.toString()}`;
    }
  }

  const response = await fetch(finalUrl, options);

  if (!response.ok) {
    // Tenta decodificar o erro como JSON; caso o servidor retorne HTML/texto plano, aplica fallback estruturado
    const errorData = await response.json().catch(() => ({
      error: "Erro de parsing no Gateway",
      code: "PARSING_ERROR",
      details: "O servidor retornou uma resposta não estruturada (não-JSON)"
    }));

    // Lança o erro unificado usando a nossa fábrica centralizada
    throw buildGatewayError(errorData, response.status, currentPath);
  }

  return response.json();
}

/**
 * Realiza uma requisição POST para o endpoint 'financial-gateway' (processsimulation).
 * Responsável por persistir simulações, validar regras de negócio e avançar passos no motor.
 * 
 * @param payload - Dados consolidados da simulação (entity, offer, rules).
 * @param step - Etapa atual do fluxo de processamento.
 * @returns Promise com o resultado da execução do motor de crédito.
 */
export async function callSimulation(
  payload: OrchestratorPayload | Record<string, any>,
  step: "CHECK_ELIGIBILITY" | "EXECUTE_SIMULATION" = "EXECUTE_SIMULATION",
): Promise<any> {
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/financial-gateway`;

  const currentPath = window.location.pathname + window.location.search;
  const loginFallbackUrl = `/accounts/signin?redirect_uri=${encodeURIComponent(currentPath)}`;

  const response = await fetch(url, {
    method: "POST",
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      "x-original-url": currentPath,
      "x-auth-fallback-url": loginFallbackUrl,
      ...authHeaders(),
    },
    body: JSON.stringify({
      ...payload,
      step,
    }),
  });

  if (!response.ok) {
    let errorData;
    try {
      // Tenta ler o JSON rico enviado pelo Gatekeeper/Orquestrador
      errorData = await response.json();
    } catch {
      // Failsafe robusto para quedas severas de infraestrutura (ex: Bad Gateway 502 de Nginx)
      throw buildGatewayError(
        {
          code: "NETWORK_OR_SERVER_DOWN",
          message: `Falha crítica de infraestrutura ou servidor inacessível (Status: ${response.status})`,
        },
        response.status,
        currentPath
      );
    }

    // Padroniza o erro utilizando a mesma fábrica centralizada
    throw buildGatewayError(errorData, response.status, currentPath);
  }

  return response.json();
}

/**
 * callOrchestratorConfigs
 * Executa uma chamada GET segura para a Edge Function 'orchestrator-configs' 
 * para carregar metadados dinâmicos de wizard, steps e FAQs.
 * 
 * @param params - Dicionário de parâmetros de contexto (event_id, seller_id, category_id, product_id).
 * @returns Promise com os dados de configuração obtidos.
 */
export async function callOrchestratorConfigs(params: Record<string, any>): Promise<any> {
  const queryParams = new URLSearchParams();
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      // Filtra valores nulos, vazios e descarta propriedades auxiliares de front-end como "title"
      if (value !== undefined && value !== null && value !== "" && key !== "title") {
        queryParams.append(key, String(value));
      }
    });
  }

  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orchestrator-configs?${queryParams.toString()}`;

  const currentPath = window.location.pathname + window.location.search;
  const loginFallbackUrl = `/accounts/signin?redirect_uri=${encodeURIComponent(currentPath)}`;

  const options: RequestInit = {
    method: "GET",
    ...fetchOptions,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      "x-original-url": currentPath,
      "x-auth-fallback-url": loginFallbackUrl,
      ...authHeaders(),
    },
  };

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({
      error: "Erro no Gateway de Configs",
      code: "CONFIG_PARSING_ERROR",
      details: "O servidor retornou um erro de configuração não estruturado"
    }));

    throw buildGatewayError(errorData, response.status, currentPath);
  }

  const result = await response.json();
  // Retorna os dados normalizados independentemente se vieram encapsulados em .data ou na raiz
  return result.data || result;
}