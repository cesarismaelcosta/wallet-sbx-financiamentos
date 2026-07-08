/**
 * @fileoverview Gateway de Orquestração e Token Exchange (Rota: /financialGatewayEntry)
 * * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Ponto de entrada invisível no nível de roteador (Router-Level Controller).
 * Não possui interface gráfica (UI). Executa interceptação síncrona/assíncrona
 * antes da renderização de tela para garantir segurança e integridade do histórico.
 * * [RESPONSABILIDADES]:
 * 1. Guard de Autenticação: Valida a presença de credenciais externas.
 * 2. Token Exchange: Troca o token Superbid pelo token interno (via sbx-auth-exchange).
 * 3. Validação de Regra de Negócio: Verifica elegibilidade da oferta antes de orquestrar.
 * 4. Telemetria e Alertas: Dispara logs de erro e e-mails de notificação em caso de falha.
 * 5. Anti-History Pollution: Garante navegação limpa usando redirecionamentos com 'replace'.
 */

import { createFileRoute, redirect } from "@tanstack/react-router";
import { orchestrateNavigation } from "@/features/financial-hub/core/hooks/useOrchestrator";

// Dependências de Serviço Assíncronas
import { exchangeAuthSBX } from "@/services/authSBX";
import { fetchOfferDetails } from "@/services/offer";
import { logSystemError, sendErrorEmailNotification } from "@/services/notification";

// =========================================================================
// [CONTRATO DE ENTRADA]: Validação estrita via TanStack Router
// =========================================================================
export const Route = createFileRoute("/financialGatewayEntry")({
  validateSearch: (search: Record<string, unknown>) => ({
    environment: search.environment as string | undefined,
    superbid_token: search.superbid_token as string | undefined,
    offer_id: search.offer_id as string | undefined,
    product_id: search.product_id as string | undefined,
    return_uri: search.return_uri as string | undefined,
    utm_source: search.utm_source as string | undefined,
    utm_medium: search.utm_medium as string | undefined,
    utm_campaign: search.utm_campaign as string | undefined,
  }),

  // =========================================================================
  // [INTERCEPTOR / LOADER]: Execução pré-renderização
  // =========================================================================
  loader: async ({ search, location }) => {
    const { superbid_token, offer_id, return_uri, environment, ...orchestratorParams } = search as any;

    try {
      // 1. TRATAMENTO DE LOGIN (Deep Linking e Preservação de Intenção)
      if (!superbid_token) {
        console.warn("🚨 [GATEWAY]: Token externo ausente. Redirecionando para login.");
        throw redirect({
          to: "/login",
          search: { redirect_uri: location.href },
          replace: true,
        });
      }

      // 2. TOKEN EXCHANGE (Valida upstream e emite JWT Próprio via Edge Function)
      const authResult = await exchangeAuthSBX(
        superbid_token, 
        (environment as "staging" | "production") || "staging"
      );
      
      if (!authResult || !authResult.success || !authResult.token) {
        throw new Error(authResult?.message || "AUTH_EXCHANGE_FAILED");
      }

      // Salva o token gerado para consumo global do sistema (uso no useFinancialAuth)
      localStorage.setItem("sbx_auth_token", authResult.token);

      // 3. VALIDAÇÃO DA OFERTA (Garante que a oferta existe)
      let isOfferValid = false;
      if (offer_id) {
        const offerData = await fetchOfferDetails(authResult.token, offer_id);
        isOfferValid = !!(offerData && offerData.offer);
      }

      if (offer_id && !isOfferValid) {
        throw new Error("OFFER_NOT_FOUND");
      }

      // 4. ORQUESTRAÇÃO DE NEGÓCIO
      // Delega a decisão de fluxo repassando o token validado
      const destino = await orchestrateNavigation("SIMULATE", {
        ...orchestratorParams,
        environment,
        offer_id,
        sbx_token: authResult.token
      });

      // 5. REDIRECIONAMENTO DE SUCESSO (Substitui o gateway no histórico)
      throw redirect({
        to: destino as string,
        replace: true,
      });

    } catch (error: any) {
      // [CONTROLE DE FLUXO INTERNO]: Ignorar erros de redirecionamento intencional do TanStack
      if (error && error.isRouteRedirect) throw error;

      console.error("🚨 [FINANCIAL_GATEWAY_CRITICAL_ERROR]:", error);
      
      const errorMessage = error?.message || error?.error || "Falha crítica no Gateway de Entrada";
      const isOfferError = errorMessage.includes("OFFER_NOT_FOUND");

      // 6. TELEMETRIA E NOTIFICAÇÃO
      logSystemError(superbid_token || "NO_TOKEN", {
        context: "FINANCIAL-GATEWAY-LOADER",
        message: errorMessage,
        payload: { searchParams: search, errorDetails: error?.stack },
      });

      // E-mail de contingência para a engenharia/suporte
      sendErrorEmailNotification({
        env: environment || "production",
        userId: superbid_token ? "EXTERNAL_USER" : "UNAUTHENTICATED",
        errorCode: isOfferError ? "OFFER_VALIDATION_FAILED" : "TOKEN_EXCHANGE_OR_SYSTEM_ERROR",
        details: `Falha na rota gateway. Offer ID: ${offer_id || "N/A"}. Mensagem: ${errorMessage}`,
      }).catch(err => console.error("Falha ao disparar e-mail de contingência:", err));

      // 7. RETORNO SEGURO À ORIGEM
      // Em caso de falha, devolve o usuário para o return_uri ou sandbox sem poluir o histórico
      throw redirect({
        to: return_uri || "/sandbox",
        replace: true,
      });
    }
  },

  // =========================================================================
  // [COMPONENTE FANTASMA]
  // =========================================================================
  // O loader inviabiliza a montagem deste componente ao disparar redirects.
  component: () => null,
});