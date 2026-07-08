/**
 * @fileoverview Rota: financialGatewayEntry (Gateway de Entrada e Reidratação de Contexto)
 * * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Implementa o padrão "Entry Point Gateway" (DMZ). Atua como um "Porteiro" 
 * protetor entre o ecossistema externo e o núcleo interno do Financial Hub.
 * Ponto de entrada invisível no nível de roteador (Router-Level Controller).
 * Não possui interface gráfica (UI). Executa interceptação síncrona/assíncrona
 * antes da renderização de tela para garantir segurança e integridade do histórico.
 * * * [RESPONSABILIDADES]:
 * 1. Segurança: Intercepta a requisição, faz o Token Exchange e evita execuções duplicadas.
 * 2. Reidratação (BFF): Busca perfil do usuário e dados consolidados da oferta.
 * 3. Orquestração: Monta o SimulationPayload e delega decisão ao Core.
 * 4. Resiliência: Trata expiração de oferta com degradação graciosa e fallback.
 * 5. Anti-History Pollution: Garante navegação limpa usando redirecionamentos com 'replace'.
 */

import { createFileRoute, redirect, isRedirect } from "@tanstack/react-router";
import { exchangeAuthSBX } from "@/services/authSBX";
import { fetchMyProfile } from "@/services/user";
import { fetchOfferDetails } from "@/services/offer";
import { logSystemError } from "@/services/notification";
import { orchestrateNavigation } from "@/features/financial-hub/core/hooks/useOrchestrator";

// Tipagens de Domínio
import type { 
  UserProfile, Offer, Seller, Event, Manager, SimulationPayload 
} from "@/features/financial-hub/shared/types";

// =========================================================================
// [CONTRATO DE ENTRADA]: Validação estrita via TanStack Router
// =========================================================================
export const Route = createFileRoute("/financialGatewayEntry")({
  validateSearch: (search: Record<string, unknown>) => ({
    environment: search.environment as string | undefined,
    sbx_token: search.sbx_token as string | undefined,
    superbid_token: search.superbid_token as string | undefined,
    offer_id: search.offer_id as string | undefined,
    product_id: search.product_id as string | undefined,
    return_uri: search.return_uri as string | undefined,
    return_to: search.return_to as string | undefined,
    utm_source: search.utm_source as string | undefined,      
    utm_medium: search.utm_medium as string | undefined,      
    utm_campaign: search.utm_campaign as string | undefined, 
  }),

  // =========================================================================
  // [INTERCEPTOR / LOADER]: Execução pré-renderização (Bootstrapping)
  // =========================================================================
  loader: async ({ search, location }) => {
    // Garantia de segurança contra undefined search params
    const searchParams = search || {};
    
    const { 
      superbid_token, 
      sbx_token, 
      offer_id, 
      product_id, 
      return_uri, 
      return_to,
      environment, 
      ...utmParams 
    } = searchParams;

    const currentEnvironment = environment || "staging";
    let activeToken = sbx_token;

    try {
      // 1. TRATAMENTO DE LOGIN & AUTH EXCHANGE
      // [SECURITY]: Troca do token externo pelo JWT interno via Edge Function
      if (superbid_token) {
        const exchangeResult = await exchangeAuthSBX(superbid_token, currentEnvironment as "staging" | "production");
        
        if (!exchangeResult.success || !exchangeResult.token) {
          throw new Error(`AUTH_EXCHANGE_FAILED: ${exchangeResult.message || "Unknown error"}`);
        }
        activeToken = exchangeResult.token;
        localStorage.setItem("sbx_auth_token", activeToken);
      }

      // [GUARD CLAUSE]: Redireciona para login se o token for ausente
      if (!activeToken) {
        throw redirect({ 
          to: '/accounts/signin',
          search: { redirect: location.href }, 
          replace: true 
        });
      }

      // 2. REIDRATAÇÃO (BFF): Busca de dados consolidados
      const userProfile = await fetchMyProfile(activeToken);
      let offerData: any = null;

      if (offer_id) {
        offerData = await fetchOfferDetails(activeToken, offer_id);
        if (!offerData || !offerData.offer) {
          throw new Error("OFFER_NOT_FOUND");
        }
      }

      // 3. ORQUESTRAÇÃO DE NEGÓCIO
      // [CORE]: Montagem do payload conforme contrato original e delegação
      const payload: SimulationPayload = {
        action: "SIMULATE",
        timestamp: new Date().toISOString(),
        environment: currentEnvironment,
        entity: userProfile as UserProfile,
        product_id: product_id,
        offer: offerData?.offer as Offer,
        seller: offerData?.seller as Seller,
        event: offerData?.event as Event,
        manager: offerData?.manager as Manager,
        interaction_context: {
          utm_source: utmParams.utm_source,
          utm_medium: utmParams.utm_medium,
          utm_campaign: utmParams.utm_campaign,
          origin_url: location.href,
        },
      };

      await orchestrateNavigation("CONSULT", payload);
      
      // O loader finaliza sem renderizar componente
      return null;

    } catch (error: any) {
      // [CONTROLE DE FLUXO]: Ignora redirecionamentos legítimos do TanStack
      if (isRedirect(error)) throw error;

      console.error("[financialGatewayEntry Loader] Critical Failure:", error);

      // [FIX]: Purgar tokens antes de redirecionar para evitar loop
      localStorage.removeItem("sbx_auth_token");
      localStorage.removeItem("sbx_access_token");

      // 4. TELEMETRIA
      // Dispara o monitoramento antes da ação de fallback
      const errorMessage = error?.message || "Unknown error";

      await logSystemError(searchParams.superbid_token || sbx_token || "NO_TOKEN", {
        context: "FINANCIAL-GATEWAY-LOADER",
        message: errorMessage,
        details: { stack: error?.stack },
        payload: { searchParams: searchParams }
      });

      // 5. RETORNO SEGURO À ORIGEM (Fallback Graceful)
      const fallbackUrl = (return_to || return_uri) || "/";
      
      throw redirect({
        to: fallbackUrl as any,
        replace: true,
      });
    }
  },

  // =========================================================================
  // [COMPONENTE FANTASMA]
  // =========================================================================
  component: () => null,
});