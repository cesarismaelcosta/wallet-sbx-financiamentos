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
    sbx_access_token: search.sbx_access_token as string | undefined,
    offer_id: search.offer_id as string | undefined,
    product_id: search.product_id as string | undefined,
    return_uri: search.return_uri as string | undefined,
    utm_source: search.utm_source as string | undefined,      
    utm_medium: search.utm_medium as string | undefined,      
    utm_campaign: search.utm_campaign as string | undefined, 
  }),

  // =========================================================================
  // [INTERCEPTOR / LOADER]: Execução pré-renderização (Bootstrapping)
  // =========================================================================
  loader: async ({ search, location }) => {
        
    // 1. RASTREADOR DE ENTRADA
    console.log("🚀 [GATEWAY] Loader disparado. Search Params:", search);

    // Garantia de segurança contra undefined search params
    const searchParams = search && typeof search === 'object' ? search : {};

    const { 
      environment, 
      sbx_access_token, 
      offer_id, 
      product_id, 
      return_uri, 
      ...utmParams 
    } = searchParams;

    const currentEnvironment = environment || "staging";
    let activeSBXAccessToken = sbx_access_token;

    try {
      // 1. TRATAMENTO DE LOGIN & AUTH EXCHANGE
      // [SECURITY]: Troca do token externo pelo JWT interno via Edge Function
      if (sbx_access_token) {
        console.log("🔐 [financialGatewayEntry Loader] Tentando exchange do token:", sbx_access_token.substring(0, 10) + "...")
        const exchangeResult = await exchangeAuthSBX(sbx_access_token, currentEnvironment as "staging" | "production");
        
        console.log("✅ [financialGatewayEntry Loader] Resultado do Exchange:", exchangeResult);

        if (!exchangeResult.success || !exchangeResult.sbx_access_token) {
          throw new Error(`AUTH_EXCHANGE_FAILED: ${exchangeResult.message || "Unknown error"}`);
        }
        const sessionToken = exchangeResult.session_token; // Alinhado ao nome real
        localStorage.setItem('session_token', sessionToken); 
        localStorage.setItem('sbx_access_token', exchangeResult.sbx_access_token);
      }

      // [GUARD CLAUSE]: Redireciona para login se o token for ausente
      if (!activeSBXAccessToken) {
        throw redirect({ 
          to: '/accounts/signin',
          search: { redirect_uri: location.href }, 
          replace: true 
        });
      }

      // 2. REIDRATAÇÃO (BFF): Busca de dados consolidados
      const userProfile = await fetchMyProfile(activeSBXAccessToken);
      let offerData: any = null;

      if (offer_id) {
        console.log("🔍 [financialGatewayEntry Loader] Buscando oferta:", offer_id);
        offerData = await fetchOfferDetails(activeSBXAccessToken, offer_id);
        if (!offerData || !offerData.offer) {
          throw new Error("OFFER_NOT_FOUND");
        }
        console.log("🎉 [financialGatewayEntry Loader] Oferta carregada com sucesso.");
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

      console.log("🚀 [financialGatewayEntry Loader] Tudo OK. Delegando para o orquestrador.");
      await orchestrateNavigation("CONSULT", payload);
      
      // O loader finaliza sem renderizar componente
      return null;

    } catch (error: any) {
      // 1. RASTREADOR DE ERRO (Mantive exatamente seus logs originais)
      console.error("🚨 [financialGatewayEntry Loader] CRITICAL FAILURE. Erro capturado:", error);
      console.error("🚨 [financialGatewayEntry Loader] Stack trace:", error.stack);

      // Ignora redirecionamentos legítimos do TanStack
      if (isRedirect(error)) throw error;

      console.error("🛑 [financialGatewayEntry Loader] Critical Failure:", error);

      // Identificação técnica (Adicionado suporte a objeto Response)
      const isResponse = error instanceof Response;
      const status = isResponse ? error.status : 0;
      const errorMessage = error?.message || (isResponse ? `HTTP_${status}` : "Unknown error");
      const isOfferNotFound = errorMessage.includes("OFFER_NOT_FOUND") || errorMessage.includes("404") || status === 404;
      
      // 2. TELEMETRIA (Movida para cá: enviada antes de qualquer throw, garantindo que o log chegue)
      await logSystemError(searchParams.superbid_token || activeSBXAccessToken || "NO_TOKEN", {
        context: "FINANCIAL-GATEWAY-LOADER",
        message: errorMessage,
        details: { stack: error?.stack, status }, // Status adicionado para debug
        payload: { searchParams: searchParams }
      });

      // 3. ERRO DE NEGÓCIO (Sua lógica original de 404 preservada)
      if (isOfferNotFound) {
        const targetURL = searchParams.return_uri;
        if (targetURL) {
          throw redirect({ to: targetURL as any, replace: true });
        }
        throw new Error("OFFER_NOT_FOUND");
      }

      // 4. ERRO DE AUTENTICAÇÃO (A trava contra o Loop Infinito)
      // SÓ limpamos a sessão se for erro real de auth (401/403). 
      // Se for 307, 500 ou erro de rede, o sistema apenas para (lança erro) 
      // mas mantém o localStorage, impedindo o loop.
      if (status === 401 || status === 403 || errorMessage.includes("AUTH")) {
        localStorage.removeItem('session_token');
        localStorage.removeItem('sbx_access_token');

        throw redirect({
          to: '/accounts/signin',
          search: { redirect_uri: location.href },
          replace: true,
        });
      }

      // 5. ERRO GENÉRICO (Se chegou aqui, não é redirect, não é 404 e não é auth)
      // Apenas explode o erro para o sistema, mantendo a sessão do usuário intacta.
      throw new Error(errorMessage);
    }
  },
  
  // =========================================================================
  // [COMPONENTE FANTASMA]
  // =========================================================================
  component: () => null,
});