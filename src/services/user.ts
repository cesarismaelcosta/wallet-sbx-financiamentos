/**
 * @fileoverview Serviço: User Profile
 * Busca os dados do usuário autenticado através da Edge Function sbx-data.
 * Centraliza a chamada para garantir compliance e segurança.
 * * [RESPONSABILIDADES]:
 * 1. Interface de comunicação: O front-end envia apenas o session_token (JWT Próprio),
 * mantendo os tokens reais da API da Superbid protegidos no servidor.
 * 2. Gateway Bypass: Utiliza a Anon Key do Supabase para transpor o Kong Gateway.
 * 3. Delegação de Rota: Erros 401 lançam exceções, abortam o fluxo local e 
 * ativam o Protocolo de Amnésia global.
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
 * @param sessionToken O JWT Próprio de sessão gerado pelo nosso backend.
 * @param environment [NOVO] Opcional. Força o ambiente (production/stage) contornando o localStorage durante o SSR.
 */
export const fetchMyProfile = async (sessionToken: string, environment?: string): Promise<BFFUserProfile> => {
  // [STATE]: Resgate de variáveis de ambiente e preferências de armazenamento local
  // ====================================================================================
  // [SSR SAFEGUARD & CROSS-DOMAIN SYNC]: A Injeção do Parâmetro 'environment'
  // ====================================================================================
  // Por que precisamos do 'environment' aqui se já usávamos o localStorage?
  // 1. O Servidor é Cego: Durante o carregamento inicial (SSR / F5) ou ao receber uma 
  //    chamada real do mundo externo (Portal Superbid), o código roda no Node.js. Lá, o 
  //    `window` e o `localStorage` não existem.
  // 2. A Prevenção do Falso 401: Sem o `environment`, o servidor cairia no fallback e assumiria "stage". 
  //    Se a URL pedisse "production", enviaríamos o token de Produção apontando para Stage, 
  //    causando um erro 401 (SESSION_EXPIRED) falso.
  // 3. O Fluxo: Se o 'environment' for fornecido (injetado pelo Loader do Router que leu a URL), 
  //    ele assume prioridade máxima. Caso contrário (navegação interna via SPA), ele 
  //    continua usando o localStorage perfeitamente.
  const isBrowser = typeof window !== 'undefined';
  const storedAmbiente = environment || (isBrowser ? (localStorage.getItem("sbx_environment") || "stage") : "stage");
  
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  // [NETWORK]: Chamada segura para a Edge Function via API REST
  const response = await fetch(`${supabaseUrl}/functions/v1/sbx-user`, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${supabaseAnonKey}`,
      "apikey": supabaseAnonKey,
      "x-session-token": sessionToken,
      "x-sbx-env": storedAmbiente, // Garante alinhamento total entre o Router e a API
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
    
    // [CORE UPDATE - SSR SAFEGUARD]: Só dispara o evento na janela se estivermos no navegador.
    // Durante o SSR, o throw Error abaixo será capturado pelo loader, que forçará o redirecionamento via backend.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('session_expired'));
    }

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