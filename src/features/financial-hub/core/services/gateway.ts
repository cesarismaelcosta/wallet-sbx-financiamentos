/**
 * @fileoverview Gateway Utility
 * * ARQUITETURA DE REDE:
 * Atua como o "Transportador" que decide se a chamada deve ser atendida por um Mock
 * local (para desenvolvimento ágil) ou por uma Edge Function real (Supabase).
 * * RESPONSABILIDADE:
 * - Ponto de entrada único para chamadas à API.
 * - Centraliza autenticação (Bearer) e headers.
 * - [GEMINI PRO]: Tratamento enriquecido de erros e montagem dinâmica de query params.
 * - [SECURITY E2]: Eliminação rigorosa de dependência do localStorage (Zero LocalStorage policy).
 */

import { authHeaders, fetchOptions } from "@/services/session";

/**
 * Função auxiliar para mascarar dados sensíveis (PII e valores financeiros)
 * caso sejam logados em objetos de erro por segurança.
 */
function sanitizePayloadForLogs(data: any): any {
  if (!data || typeof data !== "object") return data;
  
  const clone = Array.isArray(data) ? [...data] : { ...data };
  const sensitiveKeys = ["cpf", "name", "email", "phone", "document"];

  for (const key of Object.keys(clone)) {
    if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
      clone[key] = "[MASKED]";
    } else if (typeof clone[key] === "object") {
      clone[key] = sanitizePayloadForLogs(clone[key]);
    }
  }
  return clone;
}

/**
 * callOrchestrator
 * Executa uma chamada HTTP para a Edge Function ou intercepta via Mock.
 * * @param payload - O corpo da requisição contendo o product_id.
 * @param method - 'GET' ou 'POST'.
 * @param passedSessionToken - Mantido na assinatura para retrocompatibilidade, mas a injeção real ocorre via authHeaders().
 * @returns Promise com os dados da resposta (JSON).
 */
export async function callOrchestrator(
  payload: any, 
  method: "GET" | "POST", 
  passedSessionToken?: string
) {

  if (method !== "GET" && method !== "POST") {
    console.error("[DEBUG] Gateway chamado com método inválido:", method);
    console.trace("[DEBUG] Stack Trace de quem chamou:");
  }

  // BLINDAGEM: Se o ID estiver faltando, busca no storage antes de sair do navegador
  if (!payload.visit_update_id) {
    const storedUpdateId = sessionStorage.getItem("sbx_last_update_id");
    if (storedUpdateId) {
      payload.visit_update_id = storedUpdateId;
    }
  }

  const productId = String(payload.product_id);

  // Execução padrão via Edge Function (Orchestrator fixo)
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orchestrator`;

  // Monta a rota de login exata que você quer
  const currentPath = window.location.pathname + window.location.search;
  const loginFallbackUrl = `/accounts/signin?redirect_uri=${encodeURIComponent(currentPath)}`;

  const options: RequestInit = {
    method: method,
    ...fetchOptions, // ✅ Em prod, isso ativa { credentials: 'include' } pra enviar o Cookie HttpOnly
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      "x-original-url": currentPath,
      "x-auth-fallback-url": loginFallbackUrl,
      ...authHeaders(), // ✅ Injeção segura e centralizada: puxa do sessionStorage (DEV) ou confia no Cookie (PROD)
    },
  };

  if (method === "POST") options.body = JSON.stringify(payload);

  // CONSTRUÇÃO DA URL:
  // Se for GET, garantimos que o visit_id e visit_update_id existem para propagar a informação
  let finalUrl = url;
  if (method === "GET") {
    const params = new URLSearchParams();
    if (payload?.visit_id) params.append("visit_id", payload.visit_id);
    if (payload?.visit_update_id) params.append("visit_update_id", payload.visit_update_id);

    finalUrl = `${url}?${params.toString()}`;
  }

  const response = await fetch(finalUrl, options);

  /**
   * [TRATAMENTO DE ERRO: Normalização]
   * -------------------------------------------------------------------------
   * [CONTEXTO]: Valida a resposta HTTP. Se falhar, tenta extrair a mensagem 
   * legível do servidor antes de interromper o fluxo.
   * [RESPONSABILIDADE]: Converter erros de rede/servidor em erros ricos (enriquecidos) 
   * para permitir log de diagnóstico detalhado no frontend e monitoramento externo.
   */
  if (!response.ok) {
    // Tenta decodificar o corpo do erro como JSON; fallback para texto simples.
    // Capturas o payload de erro como um objeto puro
    const errorData = await response.json().catch(() => ({ 
      error: "Erro de parsing no Gateway", 
      details: "O servidor retornou um erro não estruturado" 
    }));

    // NÃO cria uma instância de Error. 
    // Lança um objeto simples. Isso impede que qualquer camada 
    // superior "limpe" os dados ao tentar acessar .message
    throw {
        message: errorData?.error || errorData?.message || `Erro: ${response.status}`,
        code: errorData.code || "GATEWAY_ERROR", 
        status: response.status,
        response: sanitizePayloadForLogs(errorData)
    };
  }

  return response.json();
}

/**
 * Realiza uma requisição POST para o endpoint 'processsimulation'.
 * Responsável por persistir dados de simulação, validar regras de negócio
 * e atualizar o estado do banco de dados (tabela simulations/visit_updates).
 * * @param {Object} payload - Objeto contendo os dados da simulação (entity, offer, rules, etc).
 * @throws {Error} Lança um erro caso a resposta do servidor não seja 2xx (status ok).
 * @returns {Promise<any>} Dados de retorno do processamento (ex: comando REDIRECT).
 */
export async function callSimulation(
  payload: any,
  step: "CHECK_ELIGIBILITY" | "EXECUTE_SIMULATION" = "EXECUTE_SIMULATION",
) {

  const method = "POST";
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/financial-gateway`;

  // Monta a rota de login para fallback
  const currentPath = window.location.pathname + window.location.search;
  const loginFallbackUrl = `/accounts/signin?redirect_uri=${encodeURIComponent(currentPath)}`;

  const response = await fetch(url, {
    method: "POST",
    ...fetchOptions, // ✅ Em prod, isso ativa { credentials: 'include' } pra enviar o Cookie HttpOnly 
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      "x-original-url": currentPath,
      "x-auth-fallback-url": loginFallbackUrl,
      ...authHeaders(), // ✅ Injeção segura e centralizada: puxa do sessionStorage (DEV) ou confia no Cookie (PROD)
    },
    body: JSON.stringify({
      ...payload,
      step,
    }),
  });

  /**
   * [TRATAMENTO DE ERRO: Normalização]
   * -------------------------------------------------------------------------
   * [CONTEXTO]: Valida a resposta HTTP. Se falhar, tenta extrair a mensagem 
   * legível do servidor antes de interromper o fluxo.
   * [RESPONSABILIDADE]: Converter erros de rede/servidor em erros ricos (enriquecidos) 
   * para permitir log de diagnóstico detalhado no frontend e monitoramento externo.
   */
  if (!response.ok) {
    let errorData;
    
    try {
      // 1. Lê o JSON original, rico, feito pelo Orquestrador/Gatekeeper
      errorData = await response.json();
    } catch (e) {
      // 2. Failsafe: Se o backend morreu feio e não devolveu JSON (ex: erro 502 de Nginx)
      throw {
        success: false,
        code: "NETWORK_ERROR",
        message: `Falha de rede ou servidor inacessível (Status: ${response.status})`,
        fallback_url: window.location.pathname + window.location.search
      };
    }

    // 3. TRANSPARÊNCIA: Joga o erro exatamente como o backend mandou.
    // Isso garante que o OrchestratorWrapper leia o fallback_url e o code ('SESSION_EXPIRED') nativamente.
    // O fallback para GATEWAY_ERROR só ocorre se o backend enviar um JSON malformado sem 'code'.
    throw {
       ...sanitizePayloadForLogs(errorData), 
       status: response.status, 
       code: errorData.code || "GATEWAY_ERROR", 
       message: errorData.message || errorData.error || "Erro desconhecido ao chamar orquestrador",
       fallback_url: errorData.fallback_url || window.location.pathname + window.location.search 
    };
  }

  return response.json();
}

/**
 * callOrchestratorConfigs
 * Executa uma chamada GET segura para a Edge Function 'orchestrator-configs' 
 * enviando todos os headers obrigatórios e montando dinamicamente a query string 
 * com base no contexto do card (event, seller, category, product).
 * 
 * @param {Record<string, any>} params - Objeto contendo os IDs de contexto
 */
export async function callOrchestratorConfigs(params: Record<string, any>) {
  // [GEMINI PRO]: Montagem dinâmica da URL. Em vez de fixar 'lookup_id',
  // iteramos sobre o objeto passado para construir a query string real que a Edge Function espera.
  const queryParams = new URLSearchParams();
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      // Ignoramos undefined, null, strings vazias e a chave "title" (usada apenas no front)
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
    ...fetchOptions, // Mantém credentials/cookies se necessário
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`, // Chave pública do Supabase
      "x-original-url": currentPath,
      "x-auth-fallback-url": loginFallbackUrl,
      ...authHeaders(), // 👈 Injeta automaticamente o 'x-session-token' interno correto
    },
  };

  const response = await fetch(url, options);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ 
      error: "Erro no Gateway de Configs", 
      details: "O servidor retornou um erro não estruturado" 
    }));

    throw {
      message: errorData?.error || errorData?.message || `Erro: ${response.status}`,
      code: errorData.code || "GATEWAY_CONFIG_ERROR", 
      status: response.status,
      response: sanitizePayloadForLogs(errorData)
    };
  }

  const result = await response.json();
  return result.data || result;
}