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
 * 4. Resiliência: Trata expiração de oferta com degradação graciosa e fallback.
 */

import { useEffect, useState, useRef } from "react";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { fetchMyProfile } from "@/services/user";
import { fetchOfferDetails } from "@/services/offer";
import { Loader2, Clock } from "lucide-react";

// =========================================================================
// [DEPENDÊNCIAS DE DOMÍNIO]: Hooks do Hub Financeiro
// =========================================================================
import { orchestrateNavigation } from "@/features/financial-hub/core/hooks/useOrchestrator";

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

  // [STATE]: Estados de UX e Controle de Fluxo
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
    // 1. Aguarda o Contexto terminar de ler o localStorage
    if (auth.isLoading) return;

    // 2. Trava de segurança: impede o disparo duplo da simulação
    if (hasInitialized.current) return;
    
    const bootstrapContext = async () => {
      hasInitialized.current = true;
      
      const currentEnvironment = searchEnv;
      const activeToken = searchToken || auth.token;

      if (!activeToken) {
        setStatusText("Redirecionando para acesso seguro...");
        navigate({ to: "/login" });
        return;
      }

      if (searchToken) {
        auth.setSession(searchToken);
      }

      try {
        setStatusText("Validando seus dados na Wallet sbX...");
        const userProfile = await fetchMyProfile(activeToken);

        let offerData = null;
        
        if (searchOfferId) {
          setStatusText("Buscando informações da oferta...");
          offerData = await fetchOfferDetails(activeToken, searchOfferId);
        }

        const interactionContext: InteractionContext = {
          utm_source: searchUtmSource,
          utm_medium: searchUtmMedium,
          utm_campaign: searchUtmCampaign,
          origin_url: window.location.href, 
        };

        const payload: SimulationPayload = {
          action: "SIMULATE",
          timestamp: new Date().toISOString(),
          environment: currentEnvironment, 
          entity: userProfile as UserProfile,
          product_id: searchProductId,
          offer: offerData?.offer as Offer,
          seller: offerData?.seller as Seller,
          event: offerData?.event as Event,
          manager: offerData?.manager as Manager,
          interaction_context: interactionContext,
        };

        setStatusText("Carregando informações do produto...");
        
        console.log("[FINANCIAL_ENTRY] Payload de Orquestração:", payload);

        // Dispara o núcleo do sistema
        await orchestrateNavigation("CONSULT", payload);
        
      } catch (error: any) {
        console.error(`[FINANCIAL_ENTRY ERROR]:`, error);
        
        // Unifica o comportamento: qualquer erro dispara o fallback de resiliência
        setOfferExpired(true);
        setStatusText("Ocorreu uma instabilidade momentânea ao processar a simulação.");
      }
    };

    const timer = setTimeout(() => {
      bootstrapContext();
    }, 400);

    return () => clearTimeout(timer);
  }, [searchEnv, searchToken, searchOfferId, searchProductId, searchUtmSource, searchUtmMedium, searchUtmCampaign, auth, navigate]);

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
  // [VIEW 1]: Lote Indisponível (Spinner + Título Slate-800 + Link Roxo + Inter)
  // =========================================================================
  if (offerExpired) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Inter'] p-6 text-center">
        {/* Spinner posicionado antes do título */}
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#B300FF] mb-6"></div>
        <h2 className="text-xl font-bold text-slate-800 mb-4">Oferta Indisponível</h2>
        <p className="text-slate-500 mb-6 max-w-sm leading-relaxed">
          Este lote pode já ter sido arrematado, suspenso ou o período de avaliação foi encerrado.
        </p>
        <p className="text-sm text-slate-400 mb-6">Redirecionando em {countdown} segundos...</p>
        
        <button 
          onClick={() => window.history.length > 2 ? window.history.back() : navigate({ to: "/sandbox", replace: true })}
          className="text-sm text-[#B300FF] underline underline-offset-2 hover:opacity-80 font-medium"
        >
          Voltar agora
        </button>
      </div>
    );
  }


  // =========================================================================
  // [VIEW 2]: Progresso (Spinner + Cor Roxo + Inter)
  // =========================================================================
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Inter']">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#B300FF] mb-4"></div>
      <p className="text-slate-500 font-medium">{statusText}</p>
    </div>
  );
}