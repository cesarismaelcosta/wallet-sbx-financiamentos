/**
 * @fileoverview Serviço: Gerenciador Híbrido de Sessão (session.ts)
 * @description Centraliza a estratégia de armazenamento e injeção de tokens.
 * Implementa o padrão "Híbrido Consciente" para garantir segurança máxima em produção
 * e fluidez no desenvolvimento local/Lovable.
 * 
 * [RESPONSABILIDADES]:
 * 1. Detecção de Ambiente: Avalia se o contexto permite Cookies (Same-Site) ou exige fallback.
 * 2. Segurança (PROD): Bloqueia o acesso do JS ao token (Mitigação de XSS), delegando ao Cookie HttpOnly.
 * 3. DX (DEV): Gerencia o token em sessionStorage para suportar reloads (F5/HMR) sem deslogar.
 * 4. Sincronia: Persiste metadados não-sensíveis (Clock Drift) para os Guards do React.
 * 5. Upstream Config: Resolve e isola a definição do ambiente alvo (Staging/Prod da Superbid).
 */

// =========================================================================
// [ENVIRONMENT]: DETECÇÃO DE CONTEXTO E DOMÍNIO
// =========================================================================

/**
 * Verifica se o domínio do frontend e da API compartilham a mesma raiz (eTLD+1).
 * Exemplo: 'wallet.superbid.net' e 'api.superbid.net' -> true
 */
function isSameSite(frontendHost: string, apiHost: string) {
  const eTLDplus1 = (h: string) => h.split('.').slice(-2).join('.');
  return eTLDplus1(frontendHost) === eTLDplus1(apiHost);
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const apiHost = supabaseUrl ? new URL(supabaseUrl).hostname : '';

// [STATE]: Flag global que dita o comportamento de toda a camada de rede.
// Ativa o modo seguro (Cookie) APENAS se for build de Produção E estiver no mesmo domínio pai.
export const USE_COOKIE = import.meta.env.PROD && isSameSite(window.location.hostname, apiHost);

// Padronizado estritamente como 'session_token' para bater com o cookie e a tabela do banco
const TOKEN_KEY = 'session_token';

// =========================================================================
// [STORAGE]: GERENCIAMENTO DO TOKEN (TRANSPORTE)
// =========================================================================

/**
 * Armazena o JWT recebido apenas se estivermos em modo de fallback (DEV).
 * @param token JWT interno emitido pela Edge Function (BFF).
 */
export function setSessionToken(token: string) {
  // [SECURITY]: Em PROD, ignoramos o token pois a Edge Function já enviou via 'Set-Cookie'.
  if (USE_COOKIE) return; 
  sessionStorage.setItem(TOKEN_KEY, token);
}

// =========================================================================
// [METADATA]: GERENCIAMENTO DE TEMPO E ESTADO LOCAL
// =========================================================================

/**
 * Salva os metadados temporais necessários para o frontend fazer logoff proativo.
 * @description Dados inofensivos (não-sensíveis) salvos no localStorage para 
 * informar os Guards da UI sobre a validade da sessão, independentemente do transporte.
 * @param expiresAt Timestamp absoluto de expiração da sessão no servidor.
 * @param timeDelta Diferença em milissegundos entre o servidor e o cliente (Clock Drift).
 */
export function setSessionMetadata(expiresAt: number, timeDelta: number) {
  localStorage.setItem('session_expires_at', expiresAt.toString());
  localStorage.setItem('time_delta', timeDelta.toString());
}

/**
 * Purgador universal de sessão (Usado no Logoff ou Expiração).
 */
export function clearSession() {
  sessionStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem('session_expires_at');
  localStorage.removeItem('time_delta');
}

// =========================================================================
// [NETWORK]: INJEÇÃO NAS REQUISIÇÕES HTTP
// =========================================================================

/**
 * Constrói os cabeçalhos dinâmicos de autenticação para o Client HTTP.
 * @returns Headers contendo o token (DEV) ou um objeto vazio (PROD, onde o browser age sozinho).
 */
export function authHeaders(): HeadersInit {
  if (USE_COOKIE) return {}; // O navegador anexa o cookie automaticamente
  
  const token = sessionStorage.getItem(TOKEN_KEY);
  return token ? { 'x-session-token': token } : {};
}

/**
 * Configuração base exportada para qualquer requisição `fetch` da aplicação.
 * @description Garante que requisições de Produção levem a flag 'credentials: include'.
 */
export const fetchOptions: RequestInit = {
  credentials: USE_COOKIE ? 'include' : 'omit',
};

// =========================================================================
// [UPSTREAM_ENV]: RESOLUÇÃO DE AMBIENTE ALVO (SUPERBID)
// =========================================================================

/**
 * Determina o ambiente inicial que deve ser assumido para a autenticação.
 * @description Abstrai a lógica de fallback da interface, aplicando a hierarquia:
 * 1. Variável de ambiente (Hard lock)
 * 2. Preferência salva na máquina local (Memória de DX)
 * 3. 'production' (Fallback padrão configurado)
 * @returns {"staging" | "production"}
 */
export function getDefaultSbxEnvironment(): "staging" | "production" {
  const envConfig = import.meta.env.VITE_SBX_ENVIRONMENT;
  if (envConfig === "production" || envConfig === "staging") {
    return envConfig;
  }

  const savedPref = localStorage.getItem('sbx_env_pref');
  if (savedPref === "production" || savedPref === "staging") {
    return savedPref;
  }

  return "production";
}

/**
 * Avalia se o ambiente de destino foi imposto pelas variáveis de build.
 * @description Usado pela interface gráfica para decidir se exibe ou bloqueia
 * os controles de alteração de ambiente para o usuário.
 * @returns {boolean} `true` se o ambiente não pode ser alterado via UI.
 */
export function isEnvironmentLocked(): boolean {
  return !!import.meta.env.VITE_SBX_ENVIRONMENT;
}

/**
 * Persiste a seleção manual do ambiente no client-side.
 * @description Melhora a DX mantendo a escolha do desenvolvedor/QA ativa após reloads (F5).
 * Não tem efeito se `isEnvironmentLocked()` for verdadeiro.
 * @param env {"staging" | "production"}
 */
export function setSbxEnvironmentPreference(env: "staging" | "production") {
  localStorage.setItem('sbx_env_pref', env);
}