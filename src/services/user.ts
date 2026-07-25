/**
 * @fileoverview Serviço: User Profile (Client Service)
 * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Busca os dados do usuário autenticado através da Edge Function sbx-user.
 * Totalmente integrado ao Gerenciador Híbrido de Sessão (session.ts).
 */

import { BFFUserProfile } from "@/features/financial-hub/components/shared/types";
import { fetchOptions, authHeaders } from "@/services/session";

// =========================================================================
// [CONTRATO DE ERRO PADRONIZADO (BFF)]
// =========================================================================
export interface BFFErrorResponse {
  success: boolean;
  code: string;
  message: string;
  fallback_url: string;
}

interface FetchProfileOptions {
  signal?: AbortSignal;
  originUrl?: string;
}

// =========================================================================
// [SERVIÇO CORE]: Abstração de Chamada HTTP e Telemetria
// =========================================================================

/**
 * Busca o perfil do usuário no servidor respeitando o modelo híbrido (Cookie / Header).
 * @param options Opções contendo AbortSignal e/ou URL de origem opcional.
 * @throws {BFFErrorResponse} Objeto de erro padronizado para consumo do React Router.
 */
export const fetchMyProfile = async (
  optionsArg?: FetchProfileOptions | string
): Promise<BFFUserProfile> => {
  
  // Retrocompatibilidade caso algum lugar ainda chame passando string ou objeto
  const signal = typeof optionsArg === 'object' ? optionsArg.signal : undefined;
  const originUrl = typeof optionsArg === 'object' ? optionsArg.originUrl : (typeof optionsArg === 'string' ? optionsArg : undefined);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const url = `${supabaseUrl}/functions/v1/sbx-user`;

  const currentUrl = originUrl || (typeof window !== 'undefined' ? window.location.href : "/");
  const loginFallbackUrl = `/accounts/signin?redirect_uri=${encodeURIComponent(currentUrl)}`;

  try {
    // [NETWORK]: Chamada segura utilizando a infraestrutura híbrida do session.ts
    const response = await fetch(url, {
      method: "GET",
      signal,
      ...fetchOptions, // 👈 Em PROD: injeta 'credentials: include' para o Cookie HttpOnly viajar sozinho
      headers: {
        "Authorization": `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...authHeaders(), // 👈 Em DEV: injeta o x-session-token do sessionStorage. Em PROD: retorna {}
        ...(originUrl && { "x-original-url": originUrl }),
        ...(loginFallbackUrl && { "x-auth-fallback-url": loginFallbackUrl })
      }
    });

    // -----------------------------------------------------------------------
    // [INTERCEPTAÇÃO DE ERRO]: Leitura do Contrato Padronizado
    // -----------------------------------------------------------------------
    if (!response.ok) {
      let bffError: BFFErrorResponse;
      
      try {
        const jsonError = await response.json();
        bffError = {
            success: false,
            code: jsonError.code || "UNKNOWN_ERROR",
            message: jsonError.message || `HTTP ${response.status} ${response.statusText}`,
            fallback_url: jsonError.fallback_url || "/"
        };
      } catch {
        bffError = {
            success: false,
            code: "INFRASTRUCTURE_ERROR",
            message: "Falha crítica de comunicação com o servidor.",
            fallback_url: "/"
        };
      }

      // [SECURITY]: Gatilho do Protocolo de Amnésia global
      if (bffError.code === "SESSION_EXPIRED" || bffError.code === "UNAUTHORIZED") {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('session_expired'));
          }
      }

      throw bffError;
    }

    // [DATA]: Retorna os dados hidratados garantindo a tipagem do contrato BFF
    const result = await response.json();
    return result.data || result;

  } catch (error: any) {
    if (error && "code" in error) {
      throw error;
    }
    
    // [FALLBACK CATASTRÓFICO]: Erro de rede físico
    throw {
        success: false,
        code: "NETWORK_ERROR",
        message: "Falha de conexão física. Verifique sua internet.",
        fallback_url: "/"
    } as BFFErrorResponse;
  }
};