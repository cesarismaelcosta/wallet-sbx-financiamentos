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
    return_uri: search.return_uri as string | undefined,
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
  
  // [SEGURANÇA]: Cadeado para evitar execução duplicada
  const hasInitialized = useRef(false);
  // [TRAVA DE LOOP]: Bloqueador de chamadas concorrentes ou repetidas
  const isFetching = useRef(false);

  // [STATE]: Estados de UX e Controle de Fluxo
  const [statusText, setStatusText] = useState("Preparando simulação...");
  const [gatewayError, setGatewayError] = useState<'OFFER_EXPIRED' | 'TECHNICAL_INSTABILITY' | 'AUTH_EXPIRED' | null>(null);
  const [countdown, setCountdown] = useState(5);

  // [OTIMIZAÇÃO]: Extração de primitivos
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
    // [GUARD CLAUSE]: Bloqueio estrito contra loops. Se já houver erro, para imediatamente.
    if (auth.isLoading || hasInitialized.current || isFetching.current || gatewayError) return;
    
    const bootstrapContext = async () => {
      // [TRAVA DE FLUXO]: Ativa bloqueio de novas chamadas
      isFetching.current = true;
      hasInitialized.current = true;
      
      const currentEnvironment = searchEnv;
      const activeToken = searchToken || auth.token;

      if (!activeToken) {
        setStatusText("[financialGatewayEntryLazy.lazy.tsx] Redirecionando para login da Wallet sbX...");
        navigate({ to: "/login" });
        return;
      }

      if (searchToken) {
        auth.setSession(searchToken);
      }

      let userProfile = null;
      let offerData: any = null;

      try {
        setStatusText("Validando seus dados na Wallet sbX...");
        userProfile = await fetchMyProfile(activeToken);
        
        if (searchOfferId) {
          setStatusText("Buscando informações da oferta...");
          offerData = await fetchOfferDetails(activeToken, searchOfferId);
        }

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
          interaction_context: { 
            utm_source: searchUtmSource, 
            utm_medium: searchUtmMedium, 
            utm_campaign: searchUtmCampaign, 
            origin_url: window.location.href 
          },
        };

        setStatusText("Carregando informações da simulação...");
        await orchestrateNavigation("CONSULT", payload);

      } catch (error: any) {
        // [PROPAGAÇÃO DE ERRO]: Log explícito e captura bruta da mensagem
        const errorMessage = error?.message || error?.error || JSON.stringify(error);
        const isOfferNotFound = errorMessage.includes("OFFER_NOT_FOUND");

        console.error("[financialGatewayEntryLazy.lazy.tsx] Erro crítico capturado:", errorMessage);

        // Dispara o monitoramento antes de qualquer outra ação de UI
        logSystemError(activeToken || "NO_TOKEN", {
          context: 'FINANCIAL-GATEWAY',
          message: errorMessage,
          details: { error, stack: error?.stack },
          payload: { gatewayContext: { url: window.location.href, code: isOfferNotFound ? 'OFFER_NOT_FOUND' : 'TECHNICAL_INSTABILITY' } },
          visit_id: null,
          simulation_id: null
        });

        // [ESTADO TERMINAL]: Define o erro e para o loop via Guard Clause
        setGatewayError(isOfferNotFound ? 'OFFER_EXPIRED' : 'TECHNICAL_INSTABILITY');
        setStatusText("Ocorreu uma instabilidade momentânea.");

      } finally {
        // [TRAVA DE FLUXO]: Libera, mas o gatewayError (state) impedirá novas chamadas pelo Guard Clause
        isFetching.current = false;
      }
    };
    
    bootstrapContext();
  }, [searchEnv, searchToken, searchOfferId, searchProductId, searchUtmSource, searchUtmMedium, searchUtmCampaign, auth, navigate, gatewayError]);

  // -----------------------------------------------------------------------
  // [UX FALLBACK]: Timer de Redirecionamento Automático
  // -----------------------------------------------------------------------
  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (gatewayError) {
      if (countdown > 0) {
        timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      } else {
        if (search.return_to) {
          navigate({ to: search.return_uri as any, replace: true });
        } else if (window.history.length > 1) {
          window.history.back();
        } else {
          navigate({ to: "/", replace: true });
        }
      }
    }
    
    return () => clearTimeout(timer);
  }, [gatewayError, countdown, navigate, search]);

  // =========================================================================
  // [VIEW 1]: Lote Indisponível
  // =========================================================================
  if (gatewayError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Inter'] p-6 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#B300FF] mb-6"></div>
        
        <h2 className="text-xl font-bold text-slate-800 mb-4">
          {gatewayError === 'OFFER_EXPIRED' ? "Oferta Indisponível" : "Sistema Indisponível"}
        </h2>
        
        <p className="text-slate-500 mb-6 max-w-sm leading-relaxed">
          {gatewayError === 'OFFER_EXPIRED' 
            ? "Este lote pode já ter sido arrematado, suspenso ou o período de avaliação foi encerrado." 
            : "Ocorreu uma instabilidade momentânea ao processar sua solicitação."}
        </p>
        
        <p className="text-sm text-slate-400 mb-6">Redirecionando em {countdown} segundos...</p>
        
        <button 
          onClick={() => {
            if (gatewayError === 'TECHNICAL_INSTABILITY') {
              hasInitialized.current = false; 
              window.location.reload();
            } else {
              window.history.length > 2 ? window.history.back() : navigate({ to: "/sandbox", replace: true });
            }
          }}
          className="text-sm text-[#B300FF] underline underline-offset-2 hover:opacity-80 font-medium"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // =========================================================================
  // [VIEW 2]: Progresso
  // =========================================================================
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Inter']">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#B300FF] mb-4"></div>
      <p className="text-slate-500 font-medium">{statusText}</p>
    </div>
  );
}