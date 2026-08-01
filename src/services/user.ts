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
 * @param optionsArg Opções contendo AbortSignal e/ou URL de origem opcional (retrocompatível com string).
 * @throws {BFFErrorResponse} Objeto de erro padronizado para consumo do React Router / UI.
 */
export const fetchMyProfile = async (
  optionsArg?: FetchProfileOptions | string
): Promise<BFFUserProfile> => {
  
  // -----------------------------------------------------------------------
  // [SANITIZAÇÃO DE PARÂMETROS]: Prevenção contra falsos-positivos (typeof null)
  // -----------------------------------------------------------------------
  // Retrocompatibilidade caso o sistema chame passando string, objeto ou nulo.
  const isObject = typeof optionsArg === 'object' && optionsArg !== null;
  
  const signal = isObject ? optionsArg.signal : undefined;
  const originUrl = isObject 
    ? optionsArg.originUrl 
    : (typeof optionsArg === 'string' ? optionsArg : undefined);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const url = `${supabaseUrl}/functions/v1/sbx-user`;

  const currentUrl = originUrl || (typeof window !== 'undefined' ? window.location.href : "/");
  const loginFallbackUrl = `/accounts/signin?redirect_uri=${encodeURIComponent(currentUrl)}`;

  try {
    // -----------------------------------------------------------------------
    // [NETWORK]: Chamada segura utilizando a infraestrutura híbrida
    // -----------------------------------------------------------------------
    const response = await fetch(url, {
      method: "GET",
      signal,
      ...fetchOptions, // 👈 Em PROD: injeta 'credentials: include' para o Cookie HttpOnly viajar na requisição
      headers: {
        "Authorization": `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...authHeaders(), // 👈 Em DEV: injeta o x-session-token do sessionStorage. Em PROD: retorna objeto vazio
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
        // Fallback de parse para quando a Edge Function cai severamente e não retorna JSON
        bffError = {
            success: false,
            code: "INFRASTRUCTURE_ERROR",
            message: "Falha crítica de comunicação com o servidor.",
            fallback_url: "/"
        };
      }

      // [SECURITY]: Gatilho do Protocolo de Amnésia Global
      // Se a sessão expirou na API ou na Borda, avisa a aplicação React para limpar os storages imediatamente.
      if (bffError.code === "SESSION_EXPIRED" || bffError.code === "UNAUTHORIZED") {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('session_expired'));
          }
      }

      throw bffError;
    }

    // -----------------------------------------------------------------------
    // [DATA]: Retorno Sucesso
    // -----------------------------------------------------------------------
    // Retorna os dados hidratados garantindo a tipagem do contrato BFF
    const result = await response.json();
    return result.data || result;

  } catch (error: any) {
    // Re-lança erros customizados que já passaram pela interceptação (BFFErrorResponse)
    if (error && "code" in error) {
      throw error;
    }
    
    // [FALLBACK CATASTRÓFICO]: Erro de rede físico (ex: cliente sem internet)
    throw {
        success: false,
        code: "NETWORK_ERROR",
        message: "Falha de conexão física. Verifique sua internet.",
        fallback_url: "/"
    } as BFFErrorResponse;
  }
};