/**
 * @fileoverview Rota: financialEntry (Gateway de Entrada e Reidratação de Contexto)
 * * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Implementa o padrão "Entry Point Gateway" (DMZ). Atua como um "Porteiro" 
 * protetor entre o ecossistema externo e o núcleo interno do Financial Hub.
 * * [RESPONSABILIDADES]:
 * 1. Segurança: Intercepta a requisição, valida o token e evita execuções duplicadas.
 * 2. Reidratação (BFF): Busca perfil do usuário e dados consolidados da oferta.
 * 3. Orquestração: Monta o SimulationPayload e delega decisão ao Core.
 * 4. Resiliência: Trata expiração de oferta com degradação graciosa e fallback (PT-BR).
 */

import { useEffect, useState, useRef } from "react";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { fetchMyProfile } from "@/services/user";
import { fetchOfferDetails } from "@/services/offer";
import { callOrchestration } from "@/features/financial-hub/core/orchestrator";
import { callNavigation } from "@/features/financial-hub/core/navigator";
import { Loader2, Clock } from "lucide-react";

import type { 
  UserProfile, 
  Offer, 
  Seller, 
  Event, 
  Manager, 
  InteractionContext,
  SimulationPayload 
} from "@/features/financial-hub/shared/types";

// =========================================================================
// [CONTRATO DE ENTRADA]: Validação estrita via TanStack Router
// =========================================================================
export const Route = createLazyFileRoute("/financialEntry")({
  validateSearch: (search: Record<string, unknown>) => ({
    environment: search.environment as string | undefined,
    sbx_token: search.sbx_token as string | undefined,
    offer_id: search.offer_id as string | undefined,
    product_id: search.product_id as string | undefined,
    utm_source: search.utm_source as string | undefined,     
    utm_medium: search.utm_medium as string | undefined,     
    utm_campaign: search.utm_campaign as string | undefined, 
  }),
  component: FinancialEntry,
});

// =========================================================================
// [COMPONENTE PRINCIPAL]: Controlador de Bootstrapping e UX
// =========================================================================
export function FinancialEntry() {
  const search = Route.useSearch();
  const auth = useFinancialAuth();
  const navigate = useNavigate();
  
  // [SEGURANÇA]: Cadeado para evitar execução duplicada (React 18 Strict Mode)
  const hasInitialized = useRef(false);

  // [STATE]: Estados de UX e Controle de Fluxo (Localizados para PT-BR)
  const [statusText, setStatusText] = useState("Preparando um ambiente seguro...");
  const [offerExpired, setOfferExpired] = useState(false);
  const [countdown, setCountdown] = useState(5); // 5 segundos de espera amigável

  // [OTIMIZAÇÃO]: Extração de primitivos para evitar loop infinito de re-renderização
  const searchEnv = search.environment;
  const searchToken = search.sbx_token;
  const searchOfferId = search.offer_id;
  const searchProductId = search.product_id;
  const searchUtmSource = search.utm_source;
  const searchUtmMedium = search.utm_medium;
  const searchUtmCampaign = search.utm_campaign;

  // -----------------------------------------------------------------------
  // [CORE]: Orquestração e Validação de Dados
  // -----------------------------------------------------------------------
  useEffect(() => {
    // Trava de segurança: impede o disparo duplo da simulação
    if (hasInitialized.current) return;
    
    const bootstrapContext = async () => {
      hasInitialized.current = true;
      
      const currentEnvironment = searchEnv || "prd";
      const activeToken = searchToken || auth.token || auth.accessToken;

      if (!activeToken) {
        setStatusText("Redirecionando para acesso seguro...");
        callNavigation({ target: "/login" });
        return;
      }

      if (searchToken) {
        auth.setToken(searchToken);
      }

      try {
        setStatusText("Validando seu perfil financeiro...");
        const userProfile = await fetchMyProfile(activeToken);

        let offerData = null;
        
        if (searchOfferId) {
          setStatusText("Sincronizando as informações do lote...");
          offerData = await fetchOfferDetails(activeToken, searchOfferId);
        }

        const interactionContext: InteractionContext = {
          utm_source: searchUtmSource || "sbx_external_unknown",
          utm_medium: searchUtmMedium || "financial_gateway",
          utm_campaign: searchUtmCampaign || (searchProductId ? `product_${searchProductId}_flow` : "generic_flow"),
          origin_url: window.location.href, 
        };

        const payload: SimulationPayload = {
          action: "SIMULATE",
          timestamp: new Date().toISOString(),
          environment: currentEnvironment, 
          entity: userProfile as UserProfile,
          product_id: searchProductId || null,
          offer: (offerData?.offer as Offer) || null,
          seller: (offerData?.seller as Seller) || null,
          event: (offerData?.event as Event) || null,
          manager: (offerData?.manager as Manager) || null,
          interaction_context: interactionContext,
        };

        setStatusText("Processando as melhores condições para você...");
        
        const decision = await callOrchestration("SIMULATE", payload);

        if (decision) {
          callNavigation(decision);
        }
        
      } catch (error: any) {
        console.error(`[FINANCIAL_ENTRY ERROR]:`, error);
        
        const errorMsg = error.message.toUpperCase();
        
        // Trata lote finalizado, removido ou expirado
        if (errorMsg.includes("NOT_FOUND") || errorMsg.includes("EXPIRED") || errorMsg.includes("410") || errorMsg.includes("404")) {
          setOfferExpired(true);
          return; 
        }
        
        // Trata instabilidades sistêmicas (Gateway, Rede)
        setStatusText("Ocorreu uma instabilidade momentânea.");
        callNavigation({ 
          target: "/error", 
          params: { code: "ENTRY_BOOTSTRAP_FAILED", message: error.message } 
        });
      }
    };

    const timer = setTimeout(() => {
      bootstrapContext();
    }, 400);

    return () => clearTimeout(timer);
  }, [searchEnv, searchToken, searchOfferId, searchProductId, searchUtmSource, searchUtmMedium, searchUtmCampaign, auth]);

  // -----------------------------------------------------------------------
  // [UX FALLBACK]: Timer de Redirecionamento Automático
  // -----------------------------------------------------------------------
  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (offerExpired) {
      if (countdown > 0) {
        timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      } else {
        // Fallback Inteligente: Garante que o usuário não fique preso em uma rota sem saída
        if (window.history.length > 2) {
          window.history.back(); 
        } else {
          navigate({ to: "/sandbox", replace: true }); 
        }
      }
    }
    
    return () => clearTimeout(timer);
  }, [offerExpired, countdown, navigate]);


  // =========================================================================
  // [VIEW 1]: Lote Indisponível (Degradação Graciosa com Timer)
  // =========================================================================
  if (offerExpired) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-50 p-6 font-['Plus_Jakarta_Sans'] text-center">
        <div className="w-20 h-20 bg-slate-200/50 rounded-full flex items-center justify-center mb-6 shadow-inner">
          <Clock className="w-8 h-8 text-slate-400 animate-pulse" />
        </div>
        <h2 className="text-2xl font-black text-slate-800 mb-3 tracking-tight">Oferta Indisponível</h2>
        <p className="text-sm text-slate-500 max-w-sm mx-auto mb-10 leading-relaxed">
          Este lote pode já ter sido arrematado, suspenso ou o período de avaliação foi encerrado.
        </p>
        
        <div className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 bg-white px-6 py-3 rounded-full border border-slate-200 shadow-sm transition-all">
          <Loader2 className="w-3 h-3 animate-spin text-[#B300FF]" />
          Redirecionando em <span className="text-[#B300FF] text-sm w-4">{countdown}</span> segundos
        </div>
        
        <button 
          onClick={() => window.history.length > 2 ? window.history.back() : navigate({ to: "/sandbox", replace: true })}
          className="mt-6 text-xs text-slate-400 hover:text-slate-600 underline underline-offset-2 transition-colors"
        >
          Voltar agora
        </button>
      </div>
    );
  }

  // =========================================================================
  // [VIEW 2]: Progresso Padrão do Gateway (Spinner)
  // =========================================================================
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-md">
      <div className="relative flex items-center justify-center mb-6">
        <div className="absolute inset-0 border-4 border-[#B300FF]/20 rounded-full blur-sm"></div>
        <Loader2 className="h-12 w-12 animate-spin text-[#B300FF] relative z-10" strokeWidth={2.5} />
      </div>
      <p className="text-sm text-slate-600 font-semibold tracking-wide animate-pulse">
        {statusText}
      </p>
    </div>
  );
}