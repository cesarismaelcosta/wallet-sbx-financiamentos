/**
 * @fileoverview Serviço: Autenticação da Wallet sbX
 * @description Atua como cliente da Edge Function (sbx-auth). 
 * Isola a complexidade do fluxo OAuth2 da Superbid e mantém o JWT original
 * inacessível ao frontend (Padrão Cofre/Gateway Bypass).
 * * * [RESPONSABILIDADES]:
 * 1. Proxy: Encapsula credenciais e ambiente, comunicando-se apenas com nosso servidor.
 * 2. Segurança: Recebe apenas o JWT Próprio e metadados temporais (expiração e desvio).
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
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseAnonKey}`,
        "apikey": supabaseAnonKey,
      },
      body: JSON.stringify({
        username: user,
        password: pass,
        environment: environment
      }),
    });

    // ---------------------------------------------------------------------------
    // TRATAMENTO DA RESPOSTA E SEGURANÇA
    // ---------------------------------------------------------------------------
    if (response.ok) {
      const data = await response.json();

      if (data.session_token) {
        // -----------------------------------------------------------------------
        // [SECURITY]: Cálculo e persistência de compensação de relógio (Clock Drift)
        // O servidor fornece a hora dele e o limite da sessão. O front compara.
        // -----------------------------------------------------------------------
        try {
          if (data.server_now_ms && data.expires_at) {
            const serverTimeMs = data.server_now_ms;
            const localTimeMs = Date.now();
            const timeDelta = serverTimeMs - localTimeMs;
            
            // Armazena informações críticas de sessão no localStorage para uso do Gateway e Guards
            // Tokens próprio e sbx_access_token são armazenados para chamadas subsequentes
            localStorage.setItem('session_token', data.session_token);
            // Persiste o Delta para uso dos Guards (financiamentos.lazy, etc)
            localStorage.setItem('time_delta', timeDelta.toString());
            // Persiste o limite de validade absoluta (já com margem T-15m)
            localStorage.setItem('session_expires_at', data.expires_at.toString());
          }
        } catch (err) {
          console.warn("⚠️ [auth.ts] Falha ao processar metadados temporais da sessão.", err);
        }

        return { 
          success: true, 
          session_token: data.session_token,  // JWT Próprio (Cofre)
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