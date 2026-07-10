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
 * * * [RESPONSABILIDADES DA REFATORAÇÃO SSR]:
 * 1. Segurança: Intercepta a requisição, faz o Token Exchange no backend.
 * 2. SSR-Safe: O loader NÃO toca no localStorage e NÃO executa navegações em janela (window).
 * 3. Client Sync: O componente fantasma hidrata o storage e DELEGA a orquestração via useEffect.
 * 4. Lazy Import [NOVO]: Isola módulos dependentes do DOM (Orquestrador) via Importação Dinâmica.
 *    -> [APROFUNDAMENTO SSR]: No ecossistema Node/Deno, imports estáticos no topo do arquivo 
 *       forçam o servidor a baixar e compilar toda a árvore de dependências (Fase de Avaliação)
 *       antes do Roteador iniciar. O 'Lazy Import' esconde esse arquivo do servidor.
 */

import { createFileRoute, redirect, isRedirect } from "@tanstack/react-router";
import { useEffect } from "react"; // [NOVO] Necessário para a sincronização Client-Side
import { exchangeAuthSBX } from "@/services/authSBX";
import { fetchMyProfile } from "@/services/user";
import { fetchOfferDetails } from "@/services/offer";
import { logSystemError } from "@/services/notification";

// =========================================================================
// [BLINDAGEM SSR - IMPORT ESTÁTICO REMOVIDO]
// =========================================================================
// import { orchestrateNavigation } from "@/features/financial-hub/core/hooks/useOrchestrator";
// MOTIVO DA REMOÇÃO: Impedir o Efeito Cascata de Avaliação. 
// O módulo foi retirado do escopo global para evitar que o servidor Node.js leia e 
// avalie referências de 'window' prematuramente durante o F5, erradicando o Erro 500.

// Tipagens de Domínio 
// (Seguro para SSR: 'import type' é removido pelo TypeScript no build e não gera código JS)
import type { 
  UserProfile, Offer, Seller, Event, Manager, SimulationPayload 
} from "@/features/financial-hub/shared/types";

// Interface EXATAMENTE com os campos da URI
interface SearchSchema {
  environment?: string;
  sbx_access_token?: string;
  offer_id?: string;
  product_id?: string;
  return_uri?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

// =========================================================================
// [CONTRATO DE ENTRADA]: Validação estrita via TanStack Router
// =========================================================================
export const Route = createFileRoute("/financialGatewayEntry")({
  // 1. O validateSearch com a SINTAXE DE BLOCO CORRETA
  validateSearch: (search: Record<string, unknown>) => {
    console.log("🚀 [financialGatewayEntry] Validate Search:", search);

    return {
      environment: search.environment as string | undefined,
      sbx_access_token: search.sbx_access_token as string | undefined,
      offer_id: search.offer_id as string | undefined,
      product_id: search.product_id as string | undefined,
      return_uri: search.return_uri as string | undefined,
      utm_source: search.utm_source as string | undefined,      
      utm_medium: search.utm_medium as string | undefined,      
      utm_campaign: search.utm_campaign as string | undefined, 
    };
  },

  // 2. BOA PRÁTICA TANSTACK: Declarar dependências do loader
  loaderDeps: ({ search }) => search,

  // 3. O Loader recebe os dados através de 'deps' e 'request' para ler o Cookie
  loader: async ({ deps, location, request }) => {
    console.log("🚀 [financialGatewayEntry] Loader disparado. Payload mapeado:", deps);

    // [AJUSTE ESTRATÉGICO]: Tenta ler o cookie caso a página sofra um F5 (Refresh) sem os tokens na URL
    const cookieHeader = request?.headers?.get("Cookie") || "";
    const cookieToken = cookieHeader
      ?.split('; ')
      .find(row => row.startsWith('session_token='))
      ?.split('=')[1] || null;

    // Se não há token na URL E não há cookie, o usuário não tem contexto
    if (!deps?.sbx_access_token && !cookieToken) {
       console.error("🚨 [Gateway Loader] Falha crítica: Roteador perdeu o contexto e não há sessão ativa.");
       throw redirect({ to: '/accounts/signin', replace: true });
    }

    const currentEnvironment = deps.environment || "production";
    let activeSBXAccessToken = deps.sbx_access_token;
    
    // Inicia a sessão com o token do cookie (se existir). Será sobrescrito se houver exchange.
    let session_token: string | null = cookieToken;

    try {
      // 1. TRATAMENTO DE LOGIN & AUTH EXCHANGE
      // Só faz o exchange se um NOVO token da SBX veio na URL
      if (activeSBXAccessToken) {
        console.log("🔐 [financialGatewayEntry Loader] Tentando exchange do token:", activeSBXAccessToken.substring(0, 10) + "...")
        const exchangeResult = await exchangeAuthSBX(activeSBXAccessToken, currentEnvironment as "staging" | "production");
        
        console.log("✅ [financialGatewayEntry Loader] Resultado do Exchange:", exchangeResult);

        if (!exchangeResult.success || !exchangeResult.session_token) {
          throw new Error(`AUTH_EXCHANGE_FAILED: ${exchangeResult.message || "Unknown error"}`);
        }
        
        session_token = exchangeResult.session_token; 
        // [CRÍTICO]: localStorage.setItem removido daqui. Será feito no componente.
      }

      // [GUARD CLAUSE DE SEGURANÇA FINAL]
      if (!session_token) {
        throw redirect({ 
          to: '/accounts/signin',
          search: { redirect_uri: location.href }, 
          replace: true 
        });
      }

      // 2. REIDRATAÇÃO (BFF): Busca de dados consolidados
      const userProfile = await fetchMyProfile(session_token);
      let offerData: any = null;

      if (deps.offer_id) {
        console.log("🔍 [financialGatewayEntry Loader] Buscando oferta:", deps.offer_id);
        offerData = await fetchOfferDetails(session_token, deps.offer_id);
        if (!offerData || !offerData.offer) {
          throw new Error("OFFER_NOT_FOUND");
        }
        console.log("🎉 [financialGatewayEntry Loader] Oferta carregada com sucesso.");
      }

      // 3. MONTAGEM DE NEGÓCIO (DATA PREPARATION)
      const payload: SimulationPayload = {
        action: "SIMULATE",
        timestamp: new Date().toISOString(),
        environment: currentEnvironment,
        entity: userProfile as UserProfile,
        product_id: deps.product_id || "",
        offer: offerData?.offer as Offer,
        seller: offerData?.seller as Seller,
        event: offerData?.event as Event,
        manager: offerData?.manager as Manager,
        interaction_context: {
          utm_source: deps.utm_source || "",
          utm_medium: deps.utm_medium || "",
          utm_campaign: deps.utm_campaign || "",
          origin_url: deps.return_uri,
        },
      };

      console.log("🚀 [financialGatewayEntry Loader] Tudo OK. Payload construído. Delegando execução para o Client-Side.");
      
      // [CORE UPDATE - SSR SAFE]: O orquestrador de navegação NÃO PODE ser chamado aqui.
      // Retornamos os tokens e o payload completo para a SPA hidratar e navegar com segurança.
      return { 
        session_token, 
        sbx_access_token: activeSBXAccessToken,
        payload // Injetado para travessia segura
      };

    } catch (error: any) {
      // 1. Identificação do Erro
      const isResponse = error instanceof Response;
      const status = isResponse ? error.status : 0;
      const errorMessage = error?.message || (isResponse ? `HTTP_${status}` : "Unknown error");

      console.error("🚨 [financialGatewayEntry Loader] CRITICAL FAILURE. Erro:", errorMessage);

      // 2. Se for Redirect do TanStack, deixa passar
      if (isRedirect(error)) throw error;

      // 3. LOGAGEM: Enviamos o log ANTES de qualquer throw
      try {
        await logSystemError(activeSBXAccessToken || "NO_TOKEN", {
          context: "FINANCIAL-GATEWAY-LOADER",
          message: errorMessage,
          details: { status, stack: error?.stack },
          payload: { searchParams: deps }
        });
      } catch (logErr) {
        console.error("Falha ao enviar log:", logErr);
      }

      // 4. TRATAMENTO DE NEGÓCIO: 404 / OFFER_NOT_FOUND
      if (errorMessage.includes("OFFER_NOT_FOUND") || status === 404) {
        const targetURL = deps.return_uri;
        if (targetURL) throw redirect({ to: targetURL as any, replace: true });
        throw new Error("OFFER_NOT_FOUND");
      }

      // 5. TRATAMENTO DE AUTH: Erros de segurança
      if (status === 401 || status === 403 || errorMessage.includes("AUTH")) {
        // [CRÍTICO]: localStorage.removeItem removido daqui. O servidor não pode apagar o cache.
        // A página de login (/accounts/signin) deve ter a lógica de limpar o storage ao carregar.
        throw redirect({ 
          to: '/accounts/signin', 
          search: { redirect_uri: location.href }, 
          replace: true 
        });
      }

      // 7. SE o erro for VISIT_NOT_FOUND, redireciona o usuário para um estado inicial
      if (error.message === 'VISIT_NOT_FOUND') {
        const targetURL = deps.return_uri;
        if (targetURL) throw redirect({ to: targetURL as any, replace: true });
        console.warn("Visita inválida. Resetando para fluxo de início.");
        throw new Error("VISIT_NOT_FOUND'");        
      }

      // 6. ERROS DE REDE (307, 500, etc): 
      throw new Error(errorMessage);
    }
  },
  
  // =========================================================================
  // [COMPONENTE FANTASMA]: A Ponte Híbrida para a SPA
  // =========================================================================
  component: function FinancialGatewayComponent() {
    const data = Route.useLoaderData() as { 
      session_token: string | null; 
      sbx_access_token: string | undefined; 
      payload: SimulationPayload; 
    };

    useEffect(() => {
      // 1. Sincronização Segura de Storage (Apenas no cliente)
      if (data?.session_token) {
        localStorage.setItem('session_token', data.session_token);
      }
      if (data?.sbx_access_token) {
        localStorage.setItem('sbx_access_token', data.sbx_access_token);
      }

      // 2. [CORE UPDATE - SSR SAFE]: Orquestração protegida por Lazy Loading
      // A checagem dupla (window + dados) antecede o download do script sob demanda.
      if (typeof window !== "undefined" && data?.payload && data?.session_token) {
        console.log("🚀 [Gateway Bridge] Iniciando navegação client-side...");
        
        import("@/features/financial-hub/core/hooks/useOrchestrator")
          .then((module) => {
            // Chamamos a função apenas após o módulo carregar isoladamente no navegador
            module.orchestrateNavigation("CONSULT", data.payload, data.session_token as string)
              .catch(err => console.error("🚨 [Gateway Bridge] Falha no orquestrador:", err));
          })
          .catch(err => console.error("🚨 [Gateway Bridge] Falha ao carregar módulo:", err));
      }
    }, [data]);

    return null;
  },
});