/**
 * @fileoverview Serviço: Offer Details (Client Service)
 * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Busca os dados consolidados da oferta através da Edge Function sbx-offer.
 * Atua na camada de Gateway de Serviços (Data Provider) do Hub Financeiro.
 * Totalmente integrado ao Gerenciador Híbrido de Sessão (session.ts) (Zero Retrocompatibilidade).
 */

import { BFFOfferDetails, BFFErrorResponse } from "@/features/financial-hub/components/shared/types";
import { fetchOptions, authHeaders } from "@/services/session";

interface FetchOfferOptions {
  signal?: AbortSignal;
  originUrl?: string;
}

// =========================================================================
// [SERVIÇO CORE]: Abstração de Chamada HTTP e Telemetria
// =========================================================================

/**
 * Busca os detalhes de uma oferta específica no servidor respeitando o modelo híbrido (Cookie / Header).
 * @param offerId O ID do lote/oferta.
 * @param options Opções contendo AbortSignal e/ou URL de origem opcional.
 * @throws {BFFErrorResponse} Objeto de erro padronizado para consumo do React Router.
 */
export const fetchOfferDetails = async (
  offerId: string,
  { signal, originUrl }: FetchOfferOptions = {}
): Promise<BFFOfferDetails> => {
  
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const url = `${supabaseUrl}/functions/v1/sbx-offer?offer_id=${offerId}`;

  const currentUrl = originUrl || (typeof window !== "undefined" ? window.location.href : "/");
  const loginFallbackUrl = `/accounts/signin?redirect_uri=${encodeURIComponent(currentUrl)}`;

  try {
    // [NETWORK]: Chamada segura utilizando a infraestrutura híbrida do session.ts
    const response = await fetch(url, {
      method: "GET",
      signal,
      ...fetchOptions, // Em PROD: injeta 'credentials: include' para o Cookie HttpOnly viajar sozinho
      headers: {
        "Authorization": `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...authHeaders(), // Em DEV: injeta o x-session-token do sessionStorage. Em PROD: retorna {}
        ...(originUrl && { "x-original-url": originUrl }),
        ...(loginFallbackUrl && { "x-auth-fallback-url": loginFallbackUrl }),
      },
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
          fallback_url: jsonError.fallback_url || "/",
        };
      } catch {
        bffError = {
          success: false,
          code: "INFRASTRUCTURE_ERROR",
          message: "Falha crítica de comunicação com o servidor.",
          fallback_url: "/",
        };
      }

      // [SECURITY]: Gatilho do Protocolo de Amnésia global
      if (bffError.code === "SESSION_EXPIRED" || bffError.code === "UNAUTHORIZED") {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("session_expired"));
        }
      }

      throw bffError;
    }

    // [DATA]: Retorna os dados hidratados garantindo a tipagem do contrato BFF
    const result = await response.json();
    return result.data || result;

  } catch (error: any) {
    if (error.name === 'AbortError' || signal?.aborted) {
      throw error;
    }

    if (error && "code" in error) {
      throw error;
    }

    // [FALLBACK CATASTRÓFICO]: Erro de rede físico
    throw {
      success: false,
      code: "NETWORK_ERROR",
      message: "Falha de conexão física. Verifique sua internet.",
      fallback_url: "/",
    } as BFFErrorResponse;
  }
};