/**
 * @fileoverview Serviço: Offer Details & Query (Client Service)
 * @path src/services/offer.ts
 *
 * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE - DOCUMENTAÇÃO DE NEGÓCIO]
 * =========================================================================
 * Camada de serviço responsável por atuar como intermediário direto entre o
 * Front-end e as Edge Functions do Supabase atuantes como BFFs (Backend for Frontend).
 * 
 * ESCOPO DO SERVIÇO:
 * 1. `sbx-offer`: (GET) Retorna o payload consolidado e minificado de um lote específico.
 * 2. `sbx-offer-query`: (POST) Atua como orquestrador do catálogo Superbid, permitindo
 *    listagens otimizadas por produto, blindando o front-end das taxonomias e 
 *    complexidades de query da API legada.
 * 
 * DIRETRIZES DE SEGURANÇA E GERENCIAMENTO DE SESSÃO:
 * - O serviço é inteiramente acoplado à infraestrutura híbrida do `session.ts`.
 * - Emula a proteção nativa de ambientes dividindo escopos (Staging / Production).
 * - Incorpora nativamente um Pattern Catch/Throw focado em Protocolo de Amnésia 
 *   (disparando Eventos em Tela de forma desacoplada sempre que a infraestrutura 
 *   remota sinaliza expiração - SESSION_EXPIRED).
 */

import { BFFOfferDetails, BFFErrorResponse } from "@/features/financial-hub/components/shared/types";
import { fetchOptions, authHeaders } from "@/services/session";

interface FetchOfferOptions {
  signal?: AbortSignal;
  originUrl?: string;
}

interface FetchOffersQueryParams {
  productId: number;
  sort?: string;
  pageNumber?: number;
  pageSize?: number;
  categoryFilter?: string | null;
}

// =========================================================================
// [SERVIÇO CORE 1]: Detalhes de Oferta Específica (GET)
// =========================================================================

/**
 * Consulta a Edge Function correspondente a uma oferta específica. Transita de
 * modo seguro acoplando os cabeçalhos de ambiente atuais da sessão do usuário.
 * 
 * @param offerId String numérica correspondente ao ID do catálogo Superbid.
 * @param options AbortController Signal e meta-informação de URL referencial.
 * @throws {BFFErrorResponse} Objeto de interface assinado para UI Components.
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
          message: "Falha crítica de comunicação com o servidor.",
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

    // [DATA]: Resposta normalizada
    const result = await response.json();
    return result.data || result;

  } catch (error: any) {
    if (error.name === 'AbortError' || signal?.aborted) {
      throw error;
    }

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


// =========================================================================
// [SERVIÇO CORE 2]: Engine de Busca em Massa (BFF sbx-offer-query via POST)
// =========================================================================

/**
 * Consulta ao BFF responsável pela tradução de intenção estruturada de prateleira
 * para a linguagem bruta de banco de dados do catálogo externo.
 * 
 * IMPORTANTE: O acoplamento paramétrico é feito com base no `productId` do 
 * sistema financeiro, permitindo que a Edge Function isole e traduza 
 * autonomamente se isso é um financiamento de veículo, imóvel, etc.
 * 
 * @param params Critérios de consulta: ID da Jornada Comercial e Paginadores.
 * @param options Signal de aborto autônomo acoplado ao Lifecycle do componente PAI.
 */
export async function fetchOffersQuery(
  params: FetchOffersQueryParams,
  { signal, originUrl }: FetchOfferOptions = {}
): Promise<any> {
  
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const url = `${supabaseUrl}/functions/v1/sbx-offer-query`;

  const currentUrl = originUrl || (typeof window !== "undefined" ? window.location.href : "/");
  const loginFallbackUrl = `/accounts/signin?redirect_uri=${encodeURIComponent(currentUrl)}`;

  try {
    // [NETWORK]: Acoplamento blindado de rede post-auth
    const response = await fetch(url, {
      method: "POST",
      signal,
      ...fetchOptions, // Permite envio seguro de Cookie HTTPOnly
      headers: {
        "Authorization": `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        ...authHeaders(), // Injeção transacional segura em dev
        "x-original-url": currentUrl,
        "x-auth-fallback-url": loginFallbackUrl,
      },
      body: JSON.stringify({
        productId: params.productId,
        sort: params.sort || "relevancia",
        pageNumber: params.pageNumber || 1,
        pageSize: params.pageSize || 20,
        categoryFilter: params.categoryFilter || null,
      }),
    });

    // -----------------------------------------------------------------------
    // [INTERCEPTAÇÃO DE ERRO]: Tratamento Unificado de Falha de Busca
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
          message: "Falha crítica de comunicação com o servidor de listagem.",
          fallback_url: "/",
        };
      }

      // [SECURITY]: Amnésia de Segurança
      if (bffError.code === "SESSION_EXPIRED" || bffError.code === "UNAUTHORIZED") {
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("session_expired"));
        }
      }

      throw bffError;
    }

    // =======================================================================
    // [DATA]: Retorno de matriz padronizada e limpa (Service Layer)
    // =======================================================================
    const result = await response.json();
    const payload = result.data || result;

    // A MÁGICA AQUI: O Service Layer descasca o { status, data } de cada 
    // item da lista antes de entregar para o Front-end
    if (payload && Array.isArray(payload.offers)) {
      payload.offers = payload.offers.map((item: any) => item.data || item);
    }

    return payload;

  } catch (error: any) {
    if (error.name === 'AbortError' || signal?.aborted) {
      throw error;
    }

    if (error && "code" in error) {
      throw error;
    }

    throw {
      success: false,
      code: "NETWORK_ERROR",
      message: "Falha de conexão física ao carregar o catálogo. Verifique sua internet.",
      fallback_url: "/",
    } as BFFErrorResponse;
  }
}