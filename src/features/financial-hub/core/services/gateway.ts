/**
 * @fileoverview Gateway Utility
 * * ARQUITETURA DE REDE (PADRÃO COFRE):
 * Atua como o "Transportador" que decide se a chamada deve ser atendida por um Mock
 * local (para desenvolvimento ágil) ou por uma Edge Function real (Supabase).
 * * RESPONSABILIDADE:
 * - Ponto de entrada único para chamadas à API.
 * - Centraliza autenticação (Bearer), headers customizados e tokens.
 * - Atua como vigilante de segurança, disparando o Protocolo de Amnésia (401/403).
 */

/**
 * callOrchestrator
 * Executa uma chamada HTTP para a Edge Function ou intercepta via Mock.
 * @param payload - O corpo da requisição contendo os dados.
 * @param method - 'GET' ou 'POST'.
 * @returns Promise com os dados da resposta (JSON).
 */
export async function callOrchestrator(
  payload: any, 
  method: 'GET' | 'POST' = 'POST'
) {

  // ADICIONE ISSO AQUI NO TOPO DA FUNÇÃO:
  if (method !== 'GET' && method !== 'POST') {
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

  // 1. Configuração estática da URL (Sem Query Params expostos)
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orchestrator`;
  const sessionToken = localStorage.getItem('session_token'); // Resgata a chave do cofre local

  // 2. Montagem dos Headers (O Fundo Falso)
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY, // Obrigatório para o Kong Gateway
  };

  // Se o usuário estiver logado, envia o token de sessão customizado
  if (sessionToken) {
    headers["x-session-token"] = sessionToken;
  }

  // Se for GET, injetamos as chaves sensíveis de forma oculta no cabeçalho
  if (method === 'GET') {
    if (payload?.visit_id) headers["x-visit-id"] = payload.visit_id;
    if (payload?.visit_update_id) headers["x-visit-update-id"] = payload.visit_update_id;
    if (payload?.simulation_id) headers["x-simulation-id"] = payload.simulation_id;
  }

  const options: RequestInit = {
    method: method,
    headers: headers,
  };

  console.log(`[Gateway] Preparando chamada para ${method} ${url} com payload:`, payload);

  // Se for POST, o payload vai no corpo normalmente
  if (method === 'POST') options.body = JSON.stringify(payload);

  const response = await fetch(url, options);

  // 3. O VIGILANTE: Protocolo de Amnésia
  if (response.status === 401 || response.status === 403) {
    console.warn(`[Gateway] Bloqueio de segurança detectado no Orchestrator (${response.status}). Acionando amnésia.`);
    window.dispatchEvent(new CustomEvent('session_expired'));
    throw new Error("Acesso revogado: Sessão inválida ou violação de segurança.");
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[Gateway] Erro HTTP ${response.status}:`, errorText);
    throw new Error(`Erro na comunicação com o Gateway: ${response.status}`);
  }
  
  console.log(`[Gateway] Retorno ${method} ${url} com sucesso.`);

  return response.json();
}

/**
 * Realiza uma requisição POST para o endpoint 'processsimulation'.
 * Responsável por persistir dados de simulação, validar regras de negócio 
 * e atualizar o estado do banco de dados (tabela simulations/visit_updates).
 * @param {Object} payload - Objeto contendo os dados da simulação (entity, offer, rules, etc).
 * @throws {Error} Lança um erro caso a resposta do servidor não seja 2xx (status ok).
 * @returns {Promise<any>} Dados de retorno do processamento (ex: comando REDIRECT).
 */
export async function callSimulation(payload: any, step: 'CHECK_ELIGIBILITY' | 'EXECUTE_SIMULATION' = 'EXECUTE_SIMULATION') {
  
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/financial-gateway`;
  const sessionToken = localStorage.getItem('session_token');

  console.log("gateway payload:", payload);

  // 1. Padronização de Headers (Padrão Cofre)
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
    "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
  };

  // Adiciona o token da sessão se existir
  if (sessionToken) {
    headers["x-session-token"] = sessionToken;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify({
      ...payload, 
      step
    }),
  });

  // 2. O VIGILANTE: Protocolo de Amnésia (Para o fluxo de simulação)
  if (response.status === 401 || response.status === 403) {
    console.warn(`[Gateway] Sessão morta durante simulação (${response.status}). Acionando amnésia.`);
    window.dispatchEvent(new CustomEvent('session_expired'));
    throw new Error("Acesso negado: Sessão encerrada durante o processo financeiro.");
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error("[Gateway] Erro na simulação:", errorText);
    throw new Error(`Erro ao processar simulação: ${response.status}`);
  }
  
  return response.json();
}