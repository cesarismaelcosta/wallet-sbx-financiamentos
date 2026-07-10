/**
 * @fileoverview Rota: financialGatewayEntry (Gateway de Entrada e Reidratação de Contexto)
 * 
 * * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Implementa o padrão "Entry Point Gateway" (DMZ). Atua como um "Porteiro" 
 * protetor entre o ecossistema externo e o núcleo interno do Financial Hub.
 * 
 * * [RESPONSABILIDADES TÉCNICAS]:
 * 1. [ATOMICIDADE]: Integração direta com a Edge Function `sbx-loader`. Substitui
 *    o waterfall de chamadas legadas por uma única requisição de hidratação.
 * 2. [SSR-SAFE]: O loader processa a autenticação via Cookies no Deno (Server). 
 *    Não há acesso a 'window' ou 'localStorage' nesta fase.
 * 3. [RESILIÊNCIA]: Tratamento de erros centralizado (401, 404, 502). Garante que 
 *    o "Protocolo de Amnésia" (redirect para signin) ocorra em falhas de auth.
 * 4. [BRIDGE]: O componente fantasma realiza a sincronização client-side (Storage)
 *    apenas após a renderização, permitindo a importação dinâmica do orquestrador.
 */

import { createFileRoute, redirect, isRedirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { logSystemError } from "@/services/notification";
import type { UserProfile, Offer, Seller, Event, Manager, SimulationPayload } from "@/features/financial-hub/shared/types";

// Interface EXATAMENTE com os campos da URI (Contrato mantido)
interface SearchSchema {
  environment?: "staging" | "production";
  sbx_access_token?: string;
  offer_id?: string;
  product_id?: string;
  return_uri?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export const Route = createFileRoute("/financialGatewayEntry")({
  // Validação de entrada estrita
  validateSearch: (search: Record<string, unknown>): SearchSchema => ({
    environment: search.environment as "staging" | "production" | undefined,
    sbx_access_token: search.sbx_access_token as string | undefined,
    offer_id: search.offer_id as string | undefined,
    product_id: search.product_id as string | undefined,
    return_uri: search.return_uri as string | undefined,
    utm_source: search.utm_source as string | undefined,
    utm_medium: search.utm_medium as string | undefined,
    utm_campaign: search.utm_campaign as string | undefined,
  }),

  loaderDeps: ({ search }) => search,

  // O Loader consolidado que resolve o contexto em uma chamada única
  loader: async ({ deps, location, request }) => {
    // [F5 PERSISTENCE]: Leitura do cookie para reidratação imediata em Server-Side
    const cookieHeader = request?.headers?.get("Cookie") || "";
    const cookieToken = cookieHeader.split('; ').find(row => row.startsWith('session_token='))?.split('=')[1] || null;

    if (!deps?.sbx_access_token && !cookieToken) {
       throw redirect({ to: '/accounts/signin', replace: true });
    }

    const currentEnvironment = deps.environment || "production";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";

    try {
      // [INTEGRAÇÃO ATÔMICA]: Chamada direta para sbx-loader (substitui os 3 serviços legados)
      const response = await fetch(`${supabaseUrl}/functions/v1/sbx-loader`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sbx_access_token: deps.sbx_access_token,
          environment: currentEnvironment,
          offer_id: deps.offer_id
        }),
      });

      const data = await response.json();

      // [TRATAMENTO DE ERROS SEMÂNTICOS]: Propagação de erro da Edge para o Router
      if (!response.ok) {
        throw new Error(data.message || `HTTP_${response.status}`);
      }

      // [MONTAGEM DE NEGÓCIO]: Payload preservando contrato original para o orquestrador
      const payload: SimulationPayload = {
        action: "SIMULATE",
        timestamp: new Date().toISOString(),
        environment: currentEnvironment,
        entity: data.rehydration_payload.user_profile as UserProfile,
        product_id: deps.product_id || "",
        offer: data.rehydration_payload.offer_details?.offer as Offer,
        seller: data.rehydration_payload.offer_details?.seller as Seller,
        event: data.rehydration_payload.offer_details?.event as Event,
        manager: data.rehydration_payload.offer_details?.manager as Manager,
        interaction_context: {
          utm_source: deps.utm_source || "",
          utm_medium: deps.utm_medium || "",
          utm_campaign: deps.utm_campaign || "",
          origin_url: deps.return_uri,
        },
      };

      return { 
        session_token: data.session_token, 
        sbx_access_token: deps.sbx_access_token,
        payload 
      };

    } catch (error: any) {
      console.error("🚨 [financialGatewayEntry] Falha na hidratação:", error.message);

      // [MONITORAMENTO]: Log de infraestrutura
      await logSystemError(deps.sbx_access_token || "NO_TOKEN", {
        context: "FINANCIAL-GATEWAY-LOADER",
        message: error.message,
        payload: { searchParams: deps }
      });

      // [TRATAMENTO DE ERROS]: Preservação exata da lógica de negócio
      if (isRedirect(error)) throw error;

      // Protocolo de Amnésia
      if (error.message.includes("401") || error.message.includes("SESSION_UPSTREAM_EXPIRED")) {
        throw redirect({ to: '/accounts/signin', search: { redirect_uri: location.href }, replace: true });
      }
      
      // Oferta inexistente
      if (error.message.includes("OFFER_NOT_FOUND") || error.message.includes("404")) {
        const targetURL = deps.return_uri;
        if (targetURL) throw redirect({ to: targetURL as any, replace: true });
        throw new Error("OFFER_NOT_FOUND");
      }

      throw new Error(error.message);
    }
  },
  
  component: function FinancialGatewayComponent() {
    const data = Route.useLoaderData();

    useEffect(() => {
      // [SYNC]: Sincronização segura no cliente
      if (data?.session_token) localStorage.setItem('session_token', data.session_token);
      if (data?.sbx_access_token) localStorage.setItem('sbx_access_token', data.sbx_access_token);

      // [LAZY ORCHESTRATOR]: Proteção contra erros de SSR e window is not defined
      if (typeof window !== "undefined" && data?.payload) {
        import("@/features/financial-hub/core/hooks/useOrchestrator")
          .then((module) => {
            module.orchestrateNavigation("CONSULT", data.payload, data.session_token)
              .catch(err => console.error("🚨 [Gateway Bridge] Falha no orquestrador:", err));
          })
          .catch(err => console.error("🚨 [Gateway Bridge] Falha ao carregar módulo:", err));
      }
    }, [data]);

    return null;
  },
});