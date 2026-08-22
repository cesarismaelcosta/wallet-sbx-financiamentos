/**
 * @fileoverview Serviço de Autenticação e Hidratação de Sessão (auth.ts)
 * @module Features/FinancialHub/Auth
 * 
 * ============================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE: O PADRÃO COFRE DE AUTENTICAÇÃO]
 * ============================================================================
 * Este módulo atua como o cliente HTTP de borda para a Edge Function `sbx-auth`.
 * 
 * [MUDANÇAS v3.0.0 - SIGNED STATE HANDOFF]:
 * A extração insegura de `visit_id` da URL foi removida. O Frontend agora apenas
 * repassa o `handoff_token` criptografado para o Backend. É o Backend quem
 * abre o cofre, lê a intenção segura, e devolve a `final_redirect_url` blindada.
 */

import { setSessionToken, setSessionMetadata, USE_COOKIE } from "@/services/session";

export const autenticateWalletsbX = async (
  user: string, 
  pass: string, 
  environment: "staging" | "production" = "staging",
  handoffToken?: string | null // ✨ INJEÇÃO: Passaporte Criptografado
) => {

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  try {
    // -----------------------------------------------------------------------
    // [NETWORK LAYER]: Handshake com a Edge Function de Autenticação (sbx-auth)
    // -----------------------------------------------------------------------
    const response = await fetch(`${supabaseUrl}/functions/v1/sbx-auth`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseAnonKey}`,
        "apikey": supabaseAnonKey,
      },
      body: JSON.stringify({
        username: user,
        password: pass,
        environment: environment,
        handoff_token: handoffToken || undefined // ✨ Manda o cofre lacrado
      }),
    });

    // ---------------------------------------------------------------------------
    // [PIPELINE DE VALIDAÇÃO]: Análise de Integridade e Contrato de Resposta
    // ---------------------------------------------------------------------------
    if (response.ok) {
      const data = await response.json();
      const payload = data.data || data;

      if (payload.session_token || USE_COOKIE) {
        
        try {
          if (payload.session_token) {
            setSessionToken(payload.session_token);
          }

          if (payload.server_now_ms && payload.expires_at) {
            const serverTimeMs = payload.server_now_ms;
            const localTimeMs = Date.now();
            const timeDelta = serverTimeMs - localTimeMs;
            setSessionMetadata(payload.expires_at, timeDelta);
          }
        } catch (err) {
          console.warn("[auth.ts] Falha não bloqueante ao processar metadados temporais da sessão:", err);
        }

        return { 
          success: true, 
          session_token: payload.session_token || null, 
          userId: payload.userId,
          user_profile: payload.user_profile,
          initial_visit: payload.initial_visit // ✨ Contém final_redirect_url devolvida pelo Orquestrador!
        };
      } else {
        console.error("[auth.ts] Proxy validado com sucesso (200), mas o token de sessão está ausente na resposta:", data);
        return { 
          success: false, 
          code: "SESSION_TOKEN_MISSING",
          message: "Token de sessão ausente na resposta do servidor.",
          action: "show_banner_error"
        };
      }
    } else {
      const errorData = await response.json().catch(() => ({}));
      const errorPayload = errorData.data || errorData;
      
      return { 
        success: false, 
        code: errorPayload.code || "AUTH_FAILED",
        message: errorPayload.message || "Ocorreu um erro ao processar a autenticação.",
        action: errorPayload.action || "show_banner_error",
        redirect_path: errorPayload.redirect_path
      };
    }

  } catch (error) {
    console.error("[auth.ts] Erro crítico de rede na comunicação com o Proxy de Autenticação:", error);
    return { 
      success: false, 
      code: "NETWORK_ERROR",
      message: "Erro de rede ao contatar o servidor interno de autenticação. Verifique sua conexão.",
      action: "show_banner_error"
    };
  }
};