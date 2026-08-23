/**
 * @fileoverview Rota Pai: /financiamentos (Layout Mestre e Guardião de Handoff Stateless)
 * @path src/routes/financiamentos.lazy.tsx
 * 
 * =========================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: FINANCIAMENTOS STATELESS HANDOFF
 * =========================================================================
 * Este módulo atua como o Guardião e Layout Pai para todas as sub-rotas 
 * da vertical de financiamentos. Garante o resgate tático do token efêmero (#xt=)
 * caso o usuário aterrissie diretamente em uma sub-rota cross-domain.
 * 
 * [FLUXO DE SEGURANÇA E EXECUÇÃO]:
 * 1. {Sniper Tático}: Inspeciona o fragmento da URL em prioridade máxima. 
 *    Se detectar o token `#xt=`, intercepta o ciclo, executa o redeem via AJAX
 *    e hidrata o sessionStorage antes de qualquer decisão do Guard.
 * 2. {Zero-Trust Guard}: Valida a presença do session_token ou respeita a flag 
 *    `USE_COOKIE` para evitar falsos positivos.
 * 3. {State Rehydration}: Gerencia o ciclo de expiração via Handoff Token (Backend).
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { createLazyFileRoute, Outlet, useNavigate, useLocation } from '@tanstack/react-router';
import { useEffect, useState } from "react";
import { FinancialHubLayout } from "@/features/financial-hub/components/layout/FinancialHubLayout";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { USE_COOKIE, getTokenForPayload } from "@/services/session"; 
import { useHandoffRedeem } from "@/features/financial-hub/core/hooks/useHandoffRedeem";

// Importando os componentes visuais para replicar o Layout Pixel-Perfect
import { PanelHeader } from "@/features/financial-hub/components/layout/PanelHeader";
import { PanelProductOfferSkeleton } from "@/features/financial-hub/components/layout/PanelProductOfferSkeleton";
import { PanelStepSkeleton } from "@/features/financial-hub/components/layout/PanelStepSkeleton";
import { PanelFAQSkeleton } from "@/features/financial-hub/components/layout/PanelFAQSkeleton";
import { PanelFooterSkeleton } from "@/features/financial-hub/components/layout/PanelFooterSkeleton";

// =========================================================================
// [ANTI-RACE CONDITION]: Skeleton Puro Desacoplado do Orquestrador
// =========================================================================
// Esta marcação usa os mesmos sub-componentes do FinancialHubLayout.
// O usuário NÃO sente a transição de montagem, pois os pixels são idênticos.
function RouteSkeleton() {
  return (
    <div className="min-h-screen bg-white text-foreground flex flex-col transition-colors duration-300 relative">
      <PanelHeader showNav={true} showAuth={true} links={[]} />
      
      <main className="flex-1 w-full flex flex-col pt-16">
        <div className="max-w-7xl mx-auto px-6 py-12 w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <PanelProductOfferSkeleton />
          <PanelStepSkeleton />
        </div>
      </main>

      <PanelFAQSkeleton />
      <PanelFooterSkeleton />
    </div>
  );
}

const FinanciamentosGuard = () => {
  const { sessionToken: contextToken, isLoading } = useFinancialAuth();
  const sessionToken = contextToken || getTokenForPayload();

  const navigate = useNavigate();
  const location = useLocation();
  
  // 1. Extraímos o status e reason do hook para log e UX
  const { isExchanging, status, reason } = useHandoffRedeem();

  // ✨ FIX: Log de segurança simétrico ao do sbxpay (rastreabilidade no Datadog/Sentry)
  useEffect(() => {
    if (status === "error") {
      console.error(`[AUTH GATEKEEPER - Financiamentos] Falha Crítica no Resgate Tático: ${reason}. Redirecionando para login.`);
    }
  }, [status, reason]);

  // 2. Estado de montagem para mitigar Hydration Mismatch entre SSR e Cliente
  const [isClientMounted, setIsClientMounted] = useState(false);
  useEffect(() => {
    setIsClientMounted(true);
  }, []);

  useEffect(() => {
    // 🛡️ Previne vazamento de estado e bloqueia o Guard até o Sniper resolver
    if (!isClientMounted || isLoading || isExchanging) return;
    
    // =========================================================================
    // 🛡️ [STEP 1]: ZERO-TRUST GUARD & REDIRECIONAMENTO PROATIVO
    // =========================================================================
    if (!USE_COOKIE && !sessionToken && location.pathname !== '/accounts/signin') {
      
      const currentPath = typeof window !== "undefined" 
        ? window.location.pathname + window.location.search 
        : "/financiamentos";

      navigate({ 
        to: '/accounts/signin',
        search: { 
          redirect_uri: currentPath,
          // 3. Injeta a causa do erro de resgate se houver
          handoff_error: reason 
        } as any,
        // ✨ FIX: Previne que o botão "Voltar" do navegador reentre numa URL desprotegida
        replace: true
      });
      return;
    }
  }, [isClientMounted, sessionToken, isLoading, navigate, location.pathname, isExchanging, reason]);

  // =========================================================================
  // [OUTPUT]: RENDERIZAÇÃO DE SKELETON OU ROTA FILHA
  // =========================================================================
  
  // ✨ FIX: Montagem isolada. O Orquestrador só "nasce" depois dessa barreira visual.
  if (!isClientMounted || isLoading || isExchanging) {
    return <RouteSkeleton />;
  }

  // [COMPLIANCE]: Fail-safe de renderização
  if (!USE_COOKIE && !sessionToken) return null;

  return (
    <FinancialHubLayout>
      <Outlet />
    </FinancialHubLayout>
  );
};

export const Route = createLazyFileRoute('/financiamentos')({
  component: FinanciamentosGuard,
});