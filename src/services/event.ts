/**
 * @fileoverview Serviço: Event Details (Client Service)
 * @path src/services/event.ts
 *
 * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE - DOCUMENTAÇÃO DE NEGÓCIO]
 * =========================================================================
 * Camada de serviço responsável por atuar como intermediário direto entre o
 * Front-end e a Edge Function `sbx-event` atuante como BFF isolado de leilões.
 * 
 * ESCOPO DO SERVIÇO:
 * 1. `sbx-event`: (GET) Retorna os metadados macro de um leilão (datas, 
 *    semáforo, pipeline, modalidade, contatos).
 * 
 * DIRETRIZES DE SEGURANÇA E GERENCIAMENTO DE SESSÃO:
 * - O serviço é inteiramente acoplado à infraestrutura híbrida do `session.ts`.
 * - Incorpora nativamente o Pattern Catch/Throw focado em Protocolo de Amnésia 
 *   (disparando Eventos em Tela de forma desacoplada sempre que a infraestrutura 
 *   remota sinaliza expiração - SESSION_EXPIRED).
 */

import { BFFErrorResponse } from "@/features/financial-hub/components/shared/types";
import { fetchOptions, authHeaders } from "@/services/session";

interface FetchEventOptions {
  signal?: AbortSignal;
  originUrl?: string;
}

// =========================================================================
// [SERVIÇO CORE]: Detalhes de Evento / Leilão (GET)
// =========================================================================

/**
 * Consulta a Edge Function correspondente a um evento (leilão) específico. 
 * Transita de modo seguro acoplando os cabeçalhos de ambiente da sessão atual.
 * 
 * @param eventId String correspondente ao ID do evento/leilão na Superbid.
 * @param options AbortController Signal e meta-informação de URL referencial.
 * @throws {BFFErrorResponse} Objeto de interface assinado para UI Components.
 */
export const fetchEventDetails = async (
  eventId: string,
  { signal, originUrl }: FetchEventOptions = {}
): Promise<any> => { // Caso já tenha a tipagem BFFEventDetails, você pode substituir o 'any' aqui
  
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const url = `${supabaseUrl}/functions/v1/sbx-event?event_id=${eventId}`;

  const currentUrl = originUrl || (typeof window !== "undefined" ? window.location.href : "/");
  const loginFallbackUrl = `/accounts/signin?redirect_uri=${encodeURIComponent(currentUrl)}`;

  try {
    // [NETWORK]: Chamada segura utilizando a infraestrutura híbrida
    const response = await fetch(url, {
      method: "GET",
      signal,
      ...fetchOptions, // Credenciais injetadas com base no ambiente
      headers: {
        "Authorization": `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...authHeaders(), // Fallback SessionStorage em DevMode
        ...(originUrl && { "x-original-url": originUrl }),
        ...(loginFallbackUrl && { "x-auth-fallback-url": loginFallbackUrl }),
      },
    });

    // -----------------------------------------------------------------------
    // [INTERCEPTAÇÃO DE ERRO]: Tratamento Unificado de Falha Transacional
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
          message: "Falha crítica de comunicação com o servidor de eventos.",
          fallback_url: "/",
        };
      }

      // [SECURITY]: Gatilho Global de Expiração
      if (bffError.code === "SESSION_EXPIRED" || bffError.code === "UNAUTHORIZED") {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("session_expired"));
        }
      }

      throw bffError;
    }

    // [DATA]: Resposta normalizada (Garante a leitura de result.data caso exista)
    const result = await response.json();
    return result.data || result;

  } catch (error: any) {
    // Trata aborto de requisição pelo React (Clean-up de useEffect)
    if (error.name === 'AbortError' || signal?.aborted) {
      throw error;
    }

    // Se o erro já foi formatado como BFFErrorResponse, apenas repassa
    if (error && "code" in error) {
      throw error;
    }

    // [FALLBACK CATASTRÓFICO]: Desconexões e problemas físicos
    throw {
      success: false,
      code: "NETWORK_ERROR",
      message: "Falha de conexão física. Verifique sua internet.",
      fallback_url: "/",
    } as BFFErrorResponse;
  }
};