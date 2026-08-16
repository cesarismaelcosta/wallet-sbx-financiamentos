/**
 * @fileoverview Rota Pai: /seguros (Layout Mestre e Guardião de Handoff Stateless)
 * @path src/routes/seguros.lazy.tsx
 * 
 * =========================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: SEGUROS STATELESS HANDOFF
 * =========================================================================
 * Este módulo atua como o Guardião e Layout Pai para todas as sub-rotas 
 * de seguros. Garante o resgate tático do token efêmero (#xt=)
 * caso o usuário aterrissie diretamente em uma sub-rota cross-domain.
 * 
 * [FLUXO DE SEGURANÇA E EXECUÇÃO]:
 * 1. {Sniper Tático}: Inspeciona o fragmento da URL em prioridade máxima. 
 *    Se detectar o token `#xt=`, intercepta o ciclo, executa o redeem via AJAX
 *    e hidrata o sessionStorage antes de qualquer decisão do Guard.
 * 2. {Zero-Trust Guard}: Valida a presença do session_token ou respeita a flag 
 *    `USE_COOKIE` para evitar falsos positivos.
 * 3. {State Rehydration}: Gerencia o ciclo de expiração via JWT e relógio sincronizado.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { createLazyFileRoute, Outlet, useNavigate, useLocation } from '@tanstack/react-router';
import { FinancialHubLayout } from "@/features/financial-hub/components/layout/FinancialHubLayout";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { useEffect, useState } from "react";
import { jwtDecode } from "jwt-decode"; 
import { USE_COOKIE, getTokenForPayload, getTimeDelta } from "@/services/session"; 
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

/**
 * SegurosGuard
 * Componente responsável por proteger o acesso às rotas de seguro.
 * Interrompe a renderização caso o usuário não esteja autenticado ou a sessão tenha expirado.
 */
const SegurosGuard = () => {
  // [ARQUITETURA]: sessionToken do contexto global
  const { sessionToken: contextToken, isLoading } = useFinancialAuth();
  
  // 🔑 [SECURITY GATE]: Resgate encapsulado e seguro
  const sessionToken = contextToken || getTokenForPayload();

  const navigate = useNavigate();
  const location = useLocation();

  const { isExchanging, status, reason } = useHandoffRedeem();

  // ✨ FIX: Log de segurança simétrico para rastreabilidade
  useEffect(() => {
    if (status === "error") {
      console.error(`[AUTH GATEKEEPER - Seguros] Falha Crítica no Resgate Tático: ${reason}. Redirecionando para login.`);
    }
  }, [status, reason]);

  const [isClientMounted, setIsClientMounted] = useState(false);
  useEffect(() => {
    setIsClientMounted(true);
  }, []);

  useEffect(() => {
    // 🛡️ Previne vazamento de estado SSR antes da validação do Sniper
    if (!isClientMounted || isLoading || isExchanging) return;

    // =========================================================================
    // 🛡️ [STEP 1]: ZERO-TRUST GUARD & REDIRECIONAMENTO PROATIVO
    // =========================================================================
    if (!USE_COOKIE && !sessionToken && location.pathname !== '/accounts/signin') {
      
      const currentPath = typeof window !== "undefined" 
        ? window.location.pathname + window.location.search 
        : "/seguros";

      navigate({ 
        to: '/accounts/signin',
        search: { 
          redirect_uri: currentPath,
          env: undefined,
          handoff_error: reason 
        } as any,
        replace: true // ✨ FIX: Higiene de Histórico (Impede reentrada inválida via botão "Voltar")
      });
      return;
    }

    // =========================================================================
    // ⏱️ [STEP 2]: VALIDAÇÃO PASSIVA DE EXPIRAÇÃO (UX Guard)
    // =========================================================================
    if (sessionToken && typeof sessionToken === "string") {
      try {
        const decoded = jwtDecode<{ exp?: number }>(sessionToken);
        const timeDelta = getTimeDelta();
        
        // Sincroniza a hora local do usuário com o relógio do servidor
        const syncedCurrentTimeInSeconds = Math.floor((Date.now() + timeDelta) / 1000);

        if (decoded.exp && decoded.exp < syncedCurrentTimeInSeconds) {
          console.warn("🚨 [UX Guard - Seguros] sessionToken expirado localmente. Acionando Amnésia.");
          window.dispatchEvent(new CustomEvent('session_expired'));
          return;
        }
      } catch (error) {
        console.error("⚠️ [UX Guard - Seguros] Erro crítico na validação (não é necessariamente o token):", error);
        window.dispatchEvent(new CustomEvent('session_expired'));
        return;
      }
    }
  }, [isClientMounted, sessionToken, isLoading, navigate, location.pathname, isExchanging, reason]);

  // =========================================================================
  // [UX REFINEMENT & ANTI-RACE CONDITION]: Renderização do Skeleton
  // =========================================================================
  
  // ✨ FIX: Montagem isolada. O Orquestrador só "nasce" depois dessa barreira visual.
  if (!isClientMounted || isLoading || isExchanging) {
    return <RouteSkeleton />;
  }

  // [COMPLIANCE]: Fail-safe de renderização (Apenas em DEV).
  if (!USE_COOKIE && !sessionToken) return null;

  return (
    <FinancialHubLayout>
      <Outlet />
    </FinancialHubLayout>
  );
};

export const Route = createLazyFileRoute('/seguros')({
  component: SegurosGuard,
});