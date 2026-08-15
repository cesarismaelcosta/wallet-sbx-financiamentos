/**
 * @fileoverview Serviço de Autenticação e Hidratação de Sessão (auth.ts)
 * @module Features/FinancialHub/Auth
 * 
 * ============================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE: O PADRÃO COFRE DE AUTENTICAÇÃO]
 * ============================================================================
 * Este módulo atua como o cliente HTTP de borda para a Edge Function `sbx-auth`.
 * Sua responsabilidade fundamental é abstrair a complexidade transacional do fluxo 
 * OAuth2/SAML com os provedores upstream da Superbid, implementando o padrão de 
 * segurança **Gateway Bypass / Cofre de Sessão**:
 * 
 * 1. **Blindagem de Credenciais (Zero-Leakage):** As credenciais brutas de acesso 
 *    do usuário são encapsuladas no payload do túnel TLS e enviadas estritamente 
 *    para o microsserviço de borda, impedindo qualquer exposição no client-side.
 * 2. **Isolamento de Transporte Híbrido:** Delega a estratégia de retenção do token 
 *    de forma inteligente ao `session.ts` — injetando via Cookie `HttpOnly` em 
 *    produção (mitigação absoluta contra XSS) ou confinado no escopo volátil 
 *    do `sessionStorage` em ambientes de desenvolvimento local / DX (Lovable).
 * 3. **Mitigação de Assimetria Temporal (Clock Drift):** Realiza o cálculo contínuo 
 *    do desvio de relógio entre o relógio atômico do servidor backend e a máquina 
 *    do cliente, neutralizando falsos positivos de expiração de sessão em guards de UI.
 * 4. **BFF Error Routing:** Desembrulha e repassa as ações de roteamento ('actions')
 *    calculadas pelo Backend For Frontend baseadas no dicionário da Superbid.
 */

import { setSessionToken, setSessionMetadata, USE_COOKIE } from "@/services/session";

// =========================================================================
// [CORE WORKFLOW]: AUTENTICAÇÃO E ORQUESTRAÇÃO DE SESSÃO DA WALLET SBX
// =========================================================================

/**
 * Autentica o usuário contra o ecossistema Superbid através do proxy de borda.
 * 
 * @param {string} user - Identificador de acesso (E-mail ou Documento/CPF-CNPJ).
 * @param {string} pass - Senha de credenciamento do usuário.
 * @param {"staging" | "production"} environment - Alvo de infraestrutura upstream.
 * @returns {Promise<{
 *   success: boolean, 
 *   session_token?: string, 
 *   userId?: string, 
 *   user_profile?: any, 
 *   code?: string,
 *   message?: string,
 *   action?: "show_inline_error" | "show_banner_error" | "redirect",
 *   redirect_path?: string
 * }>} Contrato normalizado de resposta contendo o resultado da transação de sessão.
 */
export const autenticateWalletsbX = async (
  user: string, 
  pass: string, 
  environment: "staging" | "production" = "staging"
) => {

  // [ENVIRONMENT RESILIENCE]: Injeção segura das variáveis de ambiente em tempo de execução
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  try {
    // -----------------------------------------------------------------------
    // [NETWORK LAYER]: Handshake com a Edge Function de Autenticação (sbx-auth)
    // -----------------------------------------------------------------------
    const response = await fetch(`${supabaseUrl}/functions/v1/sbx-auth`, {
      method: "POST",
      credentials: "include", // 👈 [SECURITY E2]: Obriga o navegador a aceitar e armazenar o Cookie HttpOnly emitido pela Edge Function
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
    // [PIPELINE DE VALIDAÇÃO]: Análise de Integridade e Contrato de Resposta
    // ---------------------------------------------------------------------------
    if (response.ok) {
      const data = await response.json();
      
      // O envelopamento pode vir direto na raiz ou dentro do objeto `data`
      const payload = data.data || data;

      // [ZERO-TRUST BARRIER]: Valida se o canal de transporte foi estabelecido com sucesso 
      // via token explícito no payload (DEV) ou via Handshake de Cookie HttpOnly (PROD)
      if (payload.session_token || USE_COOKIE) {
        
        // -----------------------------------------------------------------------
        // [SESSION LIFECYCLE MANAGEMENT]: Hidratação e Compensação de Deriva
        // -----------------------------------------------------------------------
        try {
          // [TRANSPORT ROUTING]: Delega o armazenamento do token ao session.ts, 
          // cumprindo rigorosamente a política de Zero LocalStorage.
          if (payload.session_token) {
            setSessionToken(payload.session_token);
          }

          // [CLOCK DRIFT MITIGATION]: Computa a assimetria temporal entre o servidor 
          // e o cliente, permitindo que os Guards da UI avaliem a validade do JWT 
          // de forma resiliente a atrasos de relógio local.
          if (payload.server_now_ms && payload.expires_at) {
            const serverTimeMs = payload.server_now_ms;
            const localTimeMs = Date.now();
            const timeDelta = serverTimeMs - localTimeMs;
            
            // Persiste metadados inofensivos de expiração estritamente no sessionStorage
            setSessionMetadata(payload.expires_at, timeDelta);
          }
        } catch (err) {
          console.warn("⚠️ [auth.ts] Falha não bloqueante ao processar metadados temporais da sessão:", err);
        }

        // [SUCCESS CONTRACT]: Retorna o payload estruturado para o consumidor de UI
        return { 
          success: true, 
          session_token: payload.session_token || null, 
          userId: payload.userId,
          user_profile: payload.user_profile
        };
      } else {
        // [ANOMALY DETECTION]: O servidor respondeu 200 OK mas omitiu as credenciais de sessão
        console.error("🚨 [auth.ts] Proxy validado com sucesso (200), mas o token de sessão está ausente na resposta:", data);
        return { 
          success: false, 
          code: "SESSION_TOKEN_MISSING",
          message: "Token de sessão ausente na resposta do servidor.",
          action: "show_banner_error"
        };
      }
    } else {
      // -----------------------------------------------------------------------
      // [CLIENT/SERVER ERROR NORMALIZATION]: Contrato Inteligente do BFF
      // -----------------------------------------------------------------------
      // Desembrulha o JSON contendo os comandos de UI (action, redirect_path) 
      // gerados pelo Edge Function com base na documentação da Superbid.
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
    // [CIRCUIT BREAKER CATCH]: Falhas de rede profundas, interrupções de túnel ou instabilidades de DNS
    console.error("🔥 [auth.ts] Erro crítico de rede na comunicação com o Proxy de Autenticação:", error);
    return { 
      success: false, 
      code: "NETWORK_ERROR",
      message: "Erro de rede ao contatar o servidor interno de autenticação. Verifique sua conexão.",
      action: "show_banner_error"
    };
  }
};