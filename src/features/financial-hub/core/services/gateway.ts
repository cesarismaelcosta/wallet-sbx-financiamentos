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
 * No futuro poderá ser usado cookies ou outro mecanismo de armazenamento seguro.
 * @returns {string} O token de sessão do usuário, ou string vazia se não encontrado.
 */
function getSessionToken(): string {

  // Busca especificamente a chave 'session_token' que está no seu Local Storage
  const sessionToken = localStorage.getItem("session_token");
  
  if (sessionToken) return sessionToken;

  return "";
}

/**
 * callOrchestrator
 * Executa uma chamada HTTP para a Edge Function ou intercepta via Mock.
 * * @param payload - O corpo da requisição contendo o product_id.
 * @param method - 'GET' ou 'POST'.
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

  // Se `passedSessionToken` veio (do loader), usa ele.
  // 2. Se não, chama a função getSessionToken() (que busca no localStorage)
  const sessionToken = passedSessionToken || getSessionToken();

  // Monta a rota de login exata que você quer
  const loginFallbackUrl = `/accounts/signin?redirect_uri=${encodeURIComponent(currentPath)}`;

  const options: RequestInit = {
    method: method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      "x-original-url": currentPath,
      // ✅ Envia a URL de login COMPLETA e montada para o backend
      "x-auth-fallback-url": loginFallbackUrl,
      ...(sessionToken ? { "x-session-token": sessionToken } : {})
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
        response: errorData
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

  // CAPTURA DO TOKEN PARA A TRAVA DE SEGURANÇA
  const sessionToken = getSessionToken();

  // Monta a rota de login para fallback
  const loginFallbackUrl = `/accounts/signin?redirect_uri=${encodeURIComponent(currentPath)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      "x-original-url": currentPath,
      // ✅ Envia a URL de login COMPLETA e montada para o backend
      "x-auth-fallback-url": loginFallbackUrl,
      ...(sessionToken ? { "x-session-token": sessionToken } : {})
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
    // Quando o próprio Deno/Supabase lança um erro não-tratado, o padrão universal da plataforma deles é devolver um JSON assim:
    // {
    //  "error": "Internal Server Error" 
    // }
    throw {
       ...errorData, // Espalha as propriedades nativas (code, message, fallback_url)
       status: response.status, // Anexa o HTTP status para caso o front precise (ex: 401)
       code: errorData.code || "GATEWAY_ERROR", 
       message: errorData.message || errorData.error || "Erro desconhecido ao chamar orquestrador",
       fallback_url: errorData.fallback_url || window.location.pathname + window.location.search // Proteção final de rota
    };
  }

  return response.json();
}