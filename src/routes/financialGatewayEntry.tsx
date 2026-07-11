/**
 * @fileoverview Rota: financialGatewayEntry (Gateway de Entrada e Reidratação de Contexto)
 * 
 * * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE: "THIN CLIENT"]
 * =========================================================================
 * Evolução da arquitetura para mitigar gargalos em redes 3G e blindar o SSR (F5).
 * A responsabilidade de orquestração foi movida do Client-Side (JS dinâmico) para
 * o Server-Side (Edge Functions), transformando o frontend em um receptor de comandos.
 * 
 * * [RESPONSABILIDADES TÉCNICAS]:
 * 1. [ATOMICIDADE BACKEND]: O loader consome o `sbx-loader` (para autenticação/payload)
 *    e, IMEDIATAMENTE, consome o `orchestrator` (regras de negócio). Tudo no servidor.
 * 2. [PERFORMANCE 3G]: O cliente faz apenas 1 requisição para a rota. O servidor 
 *    resolve a rede pesada (Supabase) e devolve apenas a "Ordem Final" (Redirecionamento).
 * 3. [SSR-SAFE ABSOLUTO]: A lógica pesada não desce para o browser, eliminando 
 *    downloads de "JS Chunks" e zerando o risco de 'window is not defined'.
 * 4. [CLIENT SYNC]: O componente fantasma retém o papel essencial de sincronizar 
 *    os tokens no localStorage para os legados, e executa a navegação decidida pela Edge.
 */

import { createFileRoute, redirect, isRedirect, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { logSystemError } from "@/services/notification";
import type { UserProfile, Offer, Seller, Event, Manager, SimulationPayload } from "@/features/financial-hub/shared/types";

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

  loader: async ({ deps, location, request }) => {
    // 1. [PERSISTÊNCIA SSR]: Lê o cookie injetado automaticamente pelo navegador após o primeiro acesso
    const cookieHeader = request?.headers?.get("Cookie") || "";
    const cookieToken = cookieHeader.split('; ').find(row => row.startsWith('session_token='))?.split('=')[1] || null;

    if (!deps?.sbx_access_token && !cookieToken) {
       throw redirect({ to: '/accounts/signin', replace: true });
    }

    const currentEnvironment = deps.environment || "production";
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";

    try {
      // =====================================================================
      // FASE 1: HIDRATAÇÃO (sbx-loader)
      // =====================================================================
      const sbxResponse = await fetch(`${supabaseUrl}/functions/v1/sbx-loader`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` 
        },
        body: JSON.stringify({
          sbx_access_token: deps.sbx_access_token,
          environment: currentEnvironment,
          offer_id: deps.offer_id
        }),
      });

      const sbxData = await sbxResponse.json();
      
      if (!sbxResponse.ok) {
        // Cria o erro padrão do JS (que captura o stack trace)
        const error = new Error(sbxData.message || `HTTP_SBX_${sbxResponse.status}`);
        
        // Adiciona as suas propriedades customizadas nele
        (error as any).type = "SBX_LOADER_FAIL";
        (error as any).status = sbxResponse.status;
        (error as any).details = sbxData;
        
        throw error;
      }

      // 🐛 [DEBUG CRÍTICO]: Inspecionando o retorno exato da Edge Function
      console.log("🐛 [financialGatewayEntry] sbxData RAW:\n", JSON.stringify(sbxData, null, 2));

      // Montagem do Contrato
      const payload: SimulationPayload = {
        action: "CONSULT",
        timestamp: new Date().toISOString(),
        origin_url: deps.return_uri,
        environment: currentEnvironment,
        entity: sbxData.rehydration_payload.user_profile as UserProfile,
        product_id: deps.product_id || "",
        offer: sbxData.rehydration_payload.offer_details?.offer as Offer,
        seller: sbxData.rehydration_payload.offer_details?.seller as Seller,
        event: sbxData.rehydration_payload.offer_details?.event as Event,
        manager: sbxData.rehydration_payload.offer_details?.manager as Manager,
        interaction_context: {
          utm_source: deps.utm_source || "",
          utm_medium: deps.utm_medium || "",
          utm_campaign: deps.utm_campaign || "",
          origin_url: deps.return_uri,
        },
      };

      // 🛑 [TESTE DE FALHA]: Categoria inexistente
      payload.offer.category = "888888888888888888888888888888888888888888888888888888888"; // Força erro de categoria inexistente para teste

      // =====================================================================
      // FASE 2: ORQUESTRAÇÃO NA EDGE (Substitui o Lazy Import)
      // =====================================================================
      // O Servidor faz a chamada pesada, poupando a rede 3G do cliente
      const orchestratorResponse = await fetch(`${supabaseUrl}/functions/v1/orchestrator`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          "x-session-token": sbxData.session_token // Usa o token recém-criado
        },
        body: JSON.stringify({
           ...payload
        }),
      });

      const orchestratorData = await orchestratorResponse.json();

      if (!orchestratorResponse.ok) {
         const error = new Error(orchestratorData.message || `HTTP_ORCH_${orchestratorResponse.status}`);
         (error as any).status = orchestratorResponse.status;
         (error as any).details = orchestratorData;
         throw error;
      }

      // =====================================================================
      // FASE 3: ENTREGA PARA O COMPONENTE
      // =====================================================================
      // O Loader devolve tudo pronto. O frontend só precisa salvar o token e navegar.
      return { 
        session_token: sbxData.session_token, 
        sbx_access_token: deps.sbx_access_token,
        orchestration_result: orchestratorData // O Comando retornado pela Edge
      };

    } catch (error: any) {
      // 1. O logSystemError não se importa se veio de SBX ou ORCH
      // Ele vai ler o error.details (que agora sempre existe) e o error.message
      const sessionToken = deps.sbx_access_token;
      const msg = error.message || "";
      const errorContext = msg.includes("HTTP_ORCH") ? "ORCHESTRATOR_FAIL" : "SBX_LOADER_FAIL";

      await logSystemError(sessionToken, {
        context: "financialGatewayEntry",
        message: `Sistema encontrou uma falha ao ser chamado de ${deps.return_uri} : ${errorContext}`,
        details: error.details || {},
        payload: {
          api_details: error.details || "Sem detalhes adicionais",
          searchParams: deps
        }
      });

      // 2. Sua lógica de controle continua funcionando 100%
      // O .includes() olha para o message, que está preservado em ambos
      if (error.message.includes("HTTP_SBX_401") || error.message.includes("SESSION_UPSTREAM_EXPIRED")) {
          return { status: "ERROR_LOGIN", redirect_url: `/accounts/signin` };
      }

      // 3. Fail-safe padrão para o que não é login
      return { status: "ERROR_FAIL_SAFE", redirect_url: deps.return_uri || "/" };
    }
  },
  
  // =========================================================================
  // [COMPONENTE FANTASMA]: Executor de Ordens
  // =========================================================================
  component: function FinancialGatewayComponent() {
    const data = Route.useLoaderData();
    const navigate = useNavigate();

    useEffect(() => {
      // 🛑 [TRATAMENTO UNIFICADO DE ERROS]: Login, Orquestrador ou Oferta
      // Se o loader devolveu uma URL de redirecionamento de erro, o browser executa imediatamente
      if (data?.redirect_url) {
        console.warn(`🛑 [Gateway Bridge] Forçando saída por erro (${data.status}) para:`, data.redirect_url);
        window.location.replace(data.redirect_url);
        return;
      }

      // ✅ [FLUXO DE SUCESSO]: Só executa se não caiu em nenhum erro acima
      if (data?.session_token) localStorage.setItem('session_token', data.session_token);
      if (data?.sbx_access_token) localStorage.setItem('sbx_access_token', data.sbx_access_token);

      if (data?.orchestration_result?.url) {
        console.log("🚀 [Gateway Bridge] Executando comando do Orchestrator Edge para:", data.orchestration_result.url);
        window.location.replace(data.orchestration_result.url);
      } else {
        console.warn("⚠️ Orchestrator não devolveu um caminho de redirecionamento válido.");
      }
    }, [data, navigate]);

    return null;
  },
});