/**
 * @fileoverview Serviço: User Profile
 * Busca os dados do usuário autenticado através da Edge Function sbx-data.
 * Centraliza a chamada para garantir compliance e segurança.
 * * [RESPONSABILIDADES]:
 * 1. Interface de comunicação: O front-end envia apenas o session_token (UUID),
 * mantendo os tokens reais da API protegidos no servidor.
 * 2. Gateway Bypass: Utiliza a Anon Key do Supabase para transpor o Kong Gateway.
 * 3. Delegação de Rota: Erros 401 lançam exceções, delegando o roteamento ao SandboxLayout.
 */

export interface BFFUserProfile {
  entity_id: string;
  name: string;
  document: string;
  email: string;
  phone: string;
  birth_date: string;
  gender: string;
  login: string;
  mothers_name: string;
  address: {
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
    zip_code: string;
    country: string;
  } | null;
  metadata: {
    processedAt: string;
    originIp: string;
  };
}

/**
 * Busca o perfil do usuário no servidor.
 * @param sessionToken O UUID de sessão (Cofre) salvo no banco de dados.
 */
export const fetchMyProfile = async (sessionToken: string): Promise<BFFUserProfile> => {
  // [STATE]: Resgate de variáveis de ambiente e preferências de armazenamento local
  const storedAmbiente = localStorage.getItem("sandbox_env") || "stage";
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // [NETWORK]: Chamada segura para a Edge Function via API REST
  const response = await fetch(`${supabaseUrl}/functions/v1/sbx-data`, {
    method: "GET",
    headers: {
      // [SECURITY]: Chaves públicas obrigatórias do Supabase. 
      // Isso impede que o Gateway do Supabase bloqueie a requisição antes de chegar na Edge Function.
      "Authorization": `Bearer ${supabaseAnonKey}`,
      "apikey": supabaseAnonKey,
      
      // [BUSINESS LOGIC]: O UUID do cofre passa a trafegar via header customizado.
      // IMPORTANTE: A sua Edge Function (sbx-data) PRECISA ser alterada para capturar 'x-session-token'.
      "x-session-token": sessionToken,
      
      "x-sbx-env": storedAmbiente,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
  });

  if (response.status === 401) {
    // -----------------------------------------------------------------------
    // [SECURITY]: Gatilho do Protocolo de Amnésia
    // -----------------------------------------------------------------------
    // Ao invés de delegar a limpeza de estado apenas para o componente pai (que pode falhar ou vazar dados),
    // gritamos para o FinancialAuthContext matar a sessão globalmente e forçar o redirecionamento limpo.
    window.dispatchEvent(new CustomEvent('session_expired'));

    // [CRITICAL FIX]: Interrompe a guerra de rotas e a execução do componente local.
    // O throw garante que o `await fetchMyProfile` no componente pare aqui e não tente setar um estado com erro.
    throw new Error("SESSION_EXPIRED");
  }

  if (!response.ok) {
    // [BUSINESS LOGIC]: Interceptação de falhas sistêmicas da API (500, 403, 404)
    throw new Error("API_ERROR");
  }
  
  // [DATA]: Retorna os dados hidratados caso a resposta seja 200 OK
  return response.json();
};