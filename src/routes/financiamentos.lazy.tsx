/**
 * @fileoverview Rota Pai: /financiamentos (Layout Mestre e Guardião de Handoff Stateless)
 * @path src/routes/financiamentos.lazy.tsx
 * 
 * =========================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: FINANCIAMENTOS STATELESS HANDOFF
 * =========================================================================
 * Este módulo atua como o Guardião e Layout Pai para todas as sub-rotas 
 * de crédito e financiamentos. Garante o resgate tático do token efêmero (#xt=)
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
import { useEffect } from "react";
import { jwtDecode } from "jwt-decode"; 
import { USE_COOKIE, getTokenForPayload, getTimeDelta } from "@/services/session"; 
import { useHandoffRedeem } from "@/features/financial-hub/core/hooks/useHandoffRedeem";

const FinanciamentosGuard = () => {
  const { sessionToken: contextToken, isLoading, refreshSession } = useFinancialAuth();
  const sessionToken = contextToken || getTokenForPayload();

  const navigate = useNavigate();
  const location = useLocation();
  
  // Sniper Tático isolado no hook unificado (sem reload)
  const { isExchanging } = useHandoffRedeem(() => {
    if (refreshSession) refreshSession();
  });

  useEffect(() => {
    if (isLoading || isExchanging) return;
    
    // =========================================================================
    // 🛡️ [STEP 1]: ZERO-TRUST GUARD & REDIRECIONAMENTO PROATIVO
    // =========================================================================
    if (!USE_COOKIE && !sessionToken && location.pathname !== '/accounts/signin') {
      const currentPath = window.location.pathname + window.location.search;
      navigate({ 
        to: '/accounts/signin',
        search: { redirect_uri: currentPath } as any
      });
      return;
    }

    // =========================================================================
    // ⏱️ [STEP 2]: VALIDAÇÃO DE EXPIRAÇÃO DE SESSÃO
    // =========================================================================
    if (sessionToken && typeof sessionToken === "string") {
      try {
        const decoded = jwtDecode<{ exp?: number }>(sessionToken);
        const timeDelta = getTimeDelta();
        const syncedCurrentTimeInSeconds = Math.floor((Date.now() + timeDelta) / 1000);

        if (decoded.exp && decoded.exp < syncedCurrentTimeInSeconds) {
          console.warn("🚨 [UX Guard] sessionToken expirado localmente. Acionando Amnésia.");
          window.dispatchEvent(new CustomEvent('session_expired'));
        }
      } catch (error) {
        console.warn("⚠️ [UX Guard] sessionToken malformado. Expulsando por segurança.");
        window.dispatchEvent(new CustomEvent('session_expired'));
      }
    }
  }, [sessionToken, isLoading, navigate, location.pathname, isExchanging]);

  // =========================================================================
  // [OUTPUT]: RENDERIZAÇÃO DE SKELETON OU ROTA FILHA
  // =========================================================================
  if (isLoading || isExchanging) {
    return (
      <FinancialHubLayout>
        <div className="max-w-7xl mx-auto px-6 py-16 space-y-8 animate-pulse">
          <div className="h-8 w-64 bg-slate-200 rounded-lg"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
            <div className="h-48 bg-slate-100 rounded-2xl"></div>
            <div className="h-48 bg-slate-100 rounded-2xl"></div>
            <div className="h-48 bg-slate-100 rounded-2xl"></div>
          </div>
        </div>
      </FinancialHubLayout>
    );
  }

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