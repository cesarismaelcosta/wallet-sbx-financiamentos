import { setSessionToken, setSessionMetadata, USE_COOKIE } from './session';

/**
 * @fileoverview Serviço: Autenticação da Wallet sbX
 * @description Atua como cliente da Edge Function (sbx-auth). 
 * Isola a complexidade do fluxo OAuth2 da Superbid e mantém o JWT original
 * inacessível ao frontend (Padrão Cofre/Gateway Bypass).
 * 
 * [RESPONSABILIDADES]:
 * 1. Proxy: Encapsula credenciais e ambiente, comunicando-se apenas com nosso servidor.
 * 2. Segurança: Delega o token para o session.ts (Cookie em PROD, sessionStorage em DEV).
 * 3. Sincronia: Calcula e persiste o Clock Drift para validação local de sessão.
 */

// =========================================================================
// FUNÇÃO: autenticateWalletsbX
// =========================================================================
export const autenticateWalletsbX = async (
  user: string, 
  pass: string, 
  environment: "staging" | "production" = "staging"
) => {

  // [STATE]: Resgate de variáveis de ambiente
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  try {
    // [NETWORK]: Chamada dinâmica usando a URL do seu ambiente
    const response = await fetch(`${supabaseUrl}/functions/v1/sbx-auth`, {
      method: "POST",
      credentials: "include", // 👈 Adicionado para permitir o recebimento e envio do Cookie HttpOnly
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseAnonKey}`,
        "apikey": supabaseAnonKey,
      },
      body: JSON.stringify({
        username: user,
        password: pass,
        sbx_environment: environment
      }),
    });

    // ---------------------------------------------------------------------------
    // TRATAMENTO DA RESPOSTA E SEGURANÇA
    // ---------------------------------------------------------------------------
    if (response.ok) {
      const data = await response.json();

      // [SECURITY]: O token vem no payload (DEV) ou via Set-Cookie invisível (PROD)
      if (data.session_token || USE_COOKIE) {
        
        // -----------------------------------------------------------------------
        // [STORAGE]: Armazenamento Híbrido Consciente e Clock Drift
        // -----------------------------------------------------------------------
        try {
          // 1. Transporte do Token (Delega a decisão de ambiente para session.ts)
          if (data.session_token) {
            setSessionToken(data.session_token);
          }

          // 2. Cálculo e persistência de compensação de relógio (Clock Drift)
          if (data.server_now_ms && data.expires_at) {
            const serverTimeMs = data.server_now_ms;
            const localTimeMs = Date.now();
            const timeDelta = serverTimeMs - localTimeMs;
            
            // Persiste metadados inofensivos no localStorage para os Guards da UI
            setSessionMetadata(data.expires_at, timeDelta);
          }
        } catch (err) {
          console.warn("⚠️ [auth.ts] Falha ao processar metadados temporais da sessão.", err);
        }

        return { 
          success: true, 
          // Retorna null em PROD para garantir que a UI não manipule a string da sessão
          session_token: data.session_token || null, 
          userId: data.user_id                // Identificador público do usuário
        };
      } else {
        console.error("Proxy validado (200), mas sem token na resposta:", data);
        return { success: false, message: "Token ausente na resposta do servidor" };
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      return { 
        success: false, 
        message: errorData.error || "Login ou senha inválidos" 
      };
    }

  } catch (error) {
    console.error("Erro crítico na comunicação com o Proxy de Autenticação:", error);
    return { success: false, message: "Erro de rede ao contatar o servidor interno" };
  }
};