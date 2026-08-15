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
import { useEffect } from "react";
import { jwtDecode } from "jwt-decode"; 
import { USE_COOKIE, getTokenForPayload, getTimeDelta } from "@/services/session"; 
import { useHandoffRedeem } from "@/features/financial-hub/core/hooks/useHandoffRedeem";

/**
 * SegurosGuard
 * Componente responsável por proteger o acesso às rotas de seguro.
 * Interrompe a renderização caso o usuário não esteja autenticado ou a sessão tenha expirado.
 */
const SegurosGuard = () => {
  // [ARQUITETURA]: sessionToken do contexto global
  const { sessionToken: contextToken, isLoading, refreshSession } = useFinancialAuth();
  
  // 🔑 [SECURITY GATE]: Resgate encapsulado e seguro utilizando getTokenForPayload com proteção contra SSR
  const sessionToken = contextToken || getTokenForPayload();

  const navigate = useNavigate();
  const location = useLocation();

  // Sniper Tático isolado no hook unificado (sem reload)
  const { isExchanging } = useHandoffRedeem(() => {
    if (refreshSession) refreshSession();
  });

  useEffect(() => {
    // 0. Ignora validações enquanto o estado inicial está hidratando ou trocando o token
    if (isLoading || isExchanging) return;

    // =========================================================================
    // 🛡️ [STEP 1]: ZERO-TRUST GUARD & REDIRECIONAMENTO PROATIVO
    // =========================================================================
    if (!USE_COOKIE && !sessionToken && location.pathname !== '/accounts/signin') {
      
      // ✨ FIX: Usa o window.location nativo para garantir que o search é uma string
      // e não o objeto parseado pelo TanStack Router.
      const currentPath = typeof window !== "undefined" 
        ? window.location.pathname + window.location.search 
        : "/seguros";

      navigate({ 
        to: '/accounts/signin',
        search: { 
          redirect_uri: currentPath,
          env: undefined 
        } as any // Correção de tipagem do TanStack
      });
      return;
    }

    // =========================================================================
    // ⏱️ [STEP 2]: VALIDAÇÃO PASSIVA DE EXPIRAÇÃO (UX Guard)
    // =========================================================================
    // ✨ FIX: Trava que impede o React de jogar o erro 'Cannot convert object to primitive value'
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
  }, [sessionToken, isLoading, navigate, location.pathname, isExchanging]);

  // =========================================================================
  // [UX REFINEMENT]: Substituição do Loader Bruto por Skeleton Estrutural
  // Rationale: Evita Layout Shift e a sensação de "duplo carregamento" na tela,
  // mantendo o container principal visível enquanto valida a sessão em background.
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