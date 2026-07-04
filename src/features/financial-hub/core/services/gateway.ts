/**
 * @fileoverview Gateway Utility
 * * ARQUITETURA DE REDE:
 * Atua como o "Transportador" que decide se a chamada deve ser atendida por um Mock
 * local (para desenvolvimento ágil) ou por uma Edge Function real (Supabase).
 * * RESPONSABILIDADE:
 * - Ponto de entrada único para chamadas à API.
 * - Centraliza autenticação (Bearer) e headers.
 */

/**
 * Função auxiliar para capturar o JWT do usuário ativo.
 * Procura automaticamente pelo token padrão do Supabase ou por chaves manuais.
 */
function getSessionToken(): string {
  // Busca especificamente a chave 'session_token' que está no seu Local Storage
  const token = localStorage.getItem("session_token");
  
  if (token) return token;

  // Fallback de segurança para o padrão nativo do Supabase (caso você mude a auth no futuro)
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
      try {
        const authData = JSON.parse(localStorage.getItem(key) || '{}');
        if (authData.access_token) return authData.access_token;
      } catch (e) {
        console.warn("[Gateway] Erro ao fazer parse do token Supabase", e);
      }
    }
  }
  
  return "";
}

/**
 * callOrchestrator
 * Executa uma chamada HTTP para a Edge Function ou intercepta via Mock.
 * * @param payload - O corpo da requisição contendo o product_id.
 * @param method - 'GET' ou 'POST'.
 * @returns Promise com os dados da resposta (JSON).
 */
export async function callOrchestrator(payload: any, method: "GET" | "POST" = "POST") {
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

  // 2. MODO REAL: Execução padrão via Edge Function (Orchestrator fixo)
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orchestrator`;

  // CAPTURA DO TOKEN PARA A TRAVA DE SEGURANÇA
  const sessionToken = getSessionToken();

  const options: RequestInit = {
    method: method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      // INJEÇÃO DO HEADER DE SEGURANÇA
      ...(sessionToken ? { "x-session-token": sessionToken } : {})
    },
  };

  console.log(`[Gateway] Preparando chamada para ${method} ${url} com payload:`, payload);

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

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Gateway] Erro HTTP ${response.status}:`, errorText);
    throw new Error(`Erro na comunicação com o Gateway: ${response.status}`);
  }

  console.log(`[Gateway] Retorno ${method} ${url} com payload:`, payload);

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
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/financial-gateway`;

  console.log("gateway payload:", payload);

  // CAPTURA DO TOKEN PARA A TRAVA DE SEGURANÇA
  const sessionToken = getSessionToken();

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      // INJEÇÃO DO HEADER DE SEGURANÇA
      ...(sessionToken ? { "x-session-token": sessionToken } : {})
    },
    body: JSON.stringify({
      ...payload,
      step,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Gateway] Erro na simulação:", errorText);
    throw new Error(`Erro ao processar simulação: ${response.status}`);
  }

  return response.json();
}