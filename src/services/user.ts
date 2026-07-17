/**
 * @fileoverview Serviço: User Profile (Client Service)
 * * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Busca os dados do usuário autenticado através da Edge Function sbx-user.
 * Centraliza a chamada para garantir compliance e segurança.
 * 
 * * [RESPONSABILIDADES]:
 * 1. Interface de comunicação: O front-end envia apenas o session_token (JWT Próprio),
 *    mantendo os tokens reais da API da Superbid protegidos no servidor.
 * 2. Gateway Bypass: Utiliza a Anon Key do Supabase para transpor o Kong Gateway.
 * 3. SSOT Compliance: Omitiu o envio de `x-sbx-env` pois a Edge Function resolve 
 *    o ambiente 100% via banco de dados (Zero Trust Frontend).
 * 4. Error Handling: Intercepta o novo contrato de erro padronizado ({ code, message, fallback_url })
 *    e propaga para a Action/Loader do React Router ou dispara a Amnésia.
 * 
 * @version 3.0.0 (Adequação ao novo contrato SSOT e Padronização de Erros BFF)
 */

// =========================================================================
// [CONTRATO DE DADOS]: Interface de Reidratação do BFF
// =========================================================================
export interface BFFUserProfile {
  entity_id: string;
  name: string;
  document: string;
  document_rg?: string; // Adicionado seguindo a edge function
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
  metadata?: {
    processedAt: string;
    originIp: string;
  };
}

// =========================================================================
// [CONTRATO DE ERRO PADRONIZADO (BFF)]
// =========================================================================
export interface BFFErrorResponse {
  success: boolean;
  code: string;
  message: string;
  fallback_url: string;
}

// =========================================================================
// [SERVIÇO CORE]: Abstração de Chamada HTTP e Telemetria
// =========================================================================

/**
 * Busca o perfil do usuário no servidor.
 * @param sessionToken O JWT Próprio de sessão gerado pelo nosso backend.
 * @param originUrl [NOVO] A URL atual da página, para ser enviada no header 'x-original-url'
 * @throws {BFFErrorResponse} Objeto de erro padronizado para consumo do React Router.
 */
export const fetchMyProfile = async (
  sessionToken: string, 
  originUrl?: string
): Promise<BFFUserProfile> => {
  
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const url = `${supabaseUrl}/functions/v1/sbx-user`;

  // -----------------------------------------------------------------------
  // [TELEMETRIA]: Configuração da Requisição
  // -----------------------------------------------------------------------
    // Monta a rota de login exata que você quer
  const loginFallbackUrl = `/accounts/signin?redirect_uri=${encodeURIComponent(originUrl)}`;
  // Nota: x-sbx-env foi removido. A responsabilidade de descobrir o ambiente
  // é exclusiva da Edge Function, consultando a tabela `session_tokens` (SSOT).
  const options: RequestInit = {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${supabaseAnonKey}`,
      "x-session-token": sessionToken,
      "Content-Type": "application/json",
      "Accept": "application/json",
      // Mapeia a URL de origem
      ...(originUrl && { "x-original-url": originUrl }),
      // Mapeia a URL de fallback para o contrato esperado pelo backend
      ...(loginFallbackUrl && { "x-auth-fallback-url": loginFallbackUrl })
    }
  };

  try {
    // [NETWORK]: Chamada segura para a Edge Function via API REST
    const response = await fetch(url, options);

    // -----------------------------------------------------------------------
    // [INTERCEPTAÇÃO DE ERRO]: Leitura do Contrato Padronizado
    // -----------------------------------------------------------------------
    if (!response.ok) {
      let bffError: BFFErrorResponse;
      
      try {
        // Tenta parsear o contrato exato que construímos na Edge Function
        const jsonError = await response.json();
        bffError = {
            success: false,
            code: jsonError.code || "UNKNOWN_ERROR",
            message: jsonError.message || `HTTP ${response.status} ${response.statusText}`,
            fallback_url: jsonError.fallback_url || "/"
        };
      } catch (parseError) {
        // Fallback de infraestrutura (Ex: Supabase fora do ar ou 502 do Nginx)
        bffError = {
            success: false,
            code: "INFRASTRUCTURE_ERROR",
            message: "Falha crítica de comunicação com o servidor.",
            fallback_url: "/"
        };
      }

      // [SECURITY]: Gatilho do Protocolo de Amnésia global (Retrocompatibilidade)
      // Só dispara o evento na janela se estivermos rodando no navegador (CSR).
      if (bffError.code === "SESSION_EXPIRED" || bffError.code === "UNAUTHORIZED") {
          const isBrowser = typeof window !== 'undefined';
          if (isBrowser) {
            window.dispatchEvent(new CustomEvent('session_expired'));
          }
      }

      // [CRITICAL FIX]: Interrompe a execução lançando o objeto formatado.
      // Componentes e Loaders não devem lidar com strings, mas com este objeto.
      throw bffError;
    }

    // [DATA]: Retorna os dados hidratados garantindo a tipagem do contrato BFF
    return await response.json();

  } catch (error: any) {
    // Se o erro já for o nosso BFFErrorResponse (lançado no if !response.ok acima), propaga direto.
    if (error && "code" in error) {
      throw error;
    }
    
    // [FALLBACK CATASTRÓFICO]: Erro de rede (Ex: Cliente sem internet ou CORS block)
    throw {
        success: false,
        code: "NETWORK_ERROR",
        message: "Falha de conexão física. Verifique sua internet.",
        fallback_url: "/"
    } as BFFErrorResponse;
  }
};