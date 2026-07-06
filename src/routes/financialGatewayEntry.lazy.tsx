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
import { Loader2, Clock } from "lucide-react";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { fetchMyProfile } from "@/services/user";
import { fetchOfferDetails } from "@/services/offer";
import { logSystemError } from "@/services/notification";

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
export const Route = createLazyFileRoute("/financialGatewayEntry")({
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
  const [statusText, setStatusText] = useState("Preparando simulação...");
  // [UX]: Estado unificado de erro para resiliência do Gateway
  const [gatewayError, setGatewayError] = useState<'OFFER_EXPIRED' | 'TECHNICAL_INSTABILITY' | 'AUTH_EXPIRED' | null>(null);
  const [countdown, setCountdown] = useState(5);

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
        setStatusText("Redirecionando para login da Wallet sbX...");
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

        setStatusText("Carregando informações do simulação...");
        
        console.log("[FINANCIAL_GATEWAY_ENTRY] Payload de Orquestração:", payload);

        // Dispara o núcleo do sistema
        await orchestrateNavigation("CONSULT", payload);
        
    } catch (error: any) {
      console.error(`[FINANCIAL_GATEWAY_ENTRY ERROR]:`, error);

      // Payload enriquecido com contexto transacional e de ambiente
      const monitorPayload = {
        userId: user?.id || null,
        userProfile: user || null,
        offerData: offer || null,
        offerId: offer?.id || offer_id_produto || null,
        productId: offer?.product_id || null,
        // Identificação do ambiente atual
        environment: import.meta.env.MODE, 
        gatewayContext: {
          url: window.location.href,
          timestamp: new Date().toISOString(),
          errorCode: error?.code || 'UNKNOWN_ERROR'
        }
      };

      logSystemError(sessionToken, {
        context: 'FINANCIAL-GATEWAY',
        message: error.message || 'Erro não identificado',
        details: error,
        payload: monitorPayload,
        visit_id: activeVisitId || null,
        simulation_id: activeSimulationId || null
      });

      // Protocolo de Resiliência (UI)
      if (error?.code === 'OFFER_NOT_FOUND') {
        setGatewayError('OFFER_EXPIRED');
      } else {
        setGatewayError('TECHNICAL_INSTABILITY');
      }
      
      setStatusText("Ocorreu uma instabilidade momentânea.");
    }

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
    
    if (gatewayError) {
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
  }, [gatewayError, countdown, navigate]);


  // =========================================================================
  // [VIEW 1]: Lote Indisponível (Spinner + Título Slate-800 + Link Roxo + Inter)
  // =========================================================================
  } catch (error: any) {
    console.error(`[FINANCIAL_GATEWAY_ENTRY ERROR]:`, error);

    // Snapshot do contexto no momento da falha
    const monitorPayload = {
      user: userProfile || null,
      offerData: offerData || null,
      attemptedOfferId: searchOfferId || null,
      productId: searchProductId || null,
      environment: import.meta.env.MODE,
      gatewayContext: {
        url: window.location.href,
        timestamp: new Date().toISOString(),
        errorCode: error?.code || 'UNKNOWN_ERROR'
      }
    };

    // [LOGGING]: Envio assíncrono (não bloqueante)
    logSystemError(activeToken, {
      context: 'FINANCIAL-GATEWAY',
      message: error.message || 'Erro não identificado',
      details: error,
      payload: monitorPayload,
      visit_id: null,             // Não disponível neste escopo
      visit_update_id: null,      // Não disponível neste escopo
      simulation_id: null,        // Não disponível neste escopo
      simulation_update_id: null  // Não disponível neste escopo
    });

    // [RESILIÊNCIA]: Tratamento de UI
    if (error?.code === 'OFFER_NOT_FOUND') {
      setGatewayError('OFFER_EXPIRED');
    } else {
      setGatewayError('TECHNICAL_INSTABILITY');
    }
    
    setStatusText("Ocorreu uma instabilidade momentânea.");
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