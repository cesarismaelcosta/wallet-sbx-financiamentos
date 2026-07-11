/**
 * @fileoverview Rota Pai: /seguros
 * @description Wrapper de segurança e layout para as jornadas de seguros.
 * @context Garante a integridade da sessão do usuário antes de renderizar qualquer sub-rota de seguro.
 * @compliance Proteção de acesso e controle de sessão (Auth Guard) para evitar exposição de dados.
 */

import { createLazyFileRoute, Outlet, useNavigate, useLocation } from '@tanstack/react-router';
import { FinancialHubLayout } from "@/features/financial-hub/components/layout/FinancialHubLayout";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { useEffect } from "react";
import { jwtDecode } from "jwt-decode"; 

/**
 * SegurosGuard
 * Componente responsável por proteger o acesso às rotas de seguro.
 * Interrompe a renderização caso o usuário não esteja autenticado ou a sessão tenha expirado.
 */
const SegurosGuard = () => {
  // [CORREÇÃO]: Apenas 'token' (JWT Próprio) é acessível no front.
  const { token, isLoading } = useFinancialAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // 0. Ignora validações enquanto o estado inicial está hidratando
    if (isLoading) return;

    // 1. [BUSINESS LOGIC]: Se não houver token, bloqueio imediato.
    if (!token && location.pathname !== '/accounts/signin') {
      navigate({ 
        to: '/accounts/signin',
        search: { redirect_uri: location.pathname + location.search}
      });
      return;
    }

    // 2. [SECURITY]: Validação Passiva de Expiração (UX Guard)
    // Valida o seu JWT localmente, usando o Clock Drift para evitar requests falhos (401).
    if (token) {
      try {
        const decoded = jwtDecode<{ exp?: number }>(token);
        const timeDelta = parseInt(localStorage.getItem('time_delta') || '0', 10);
        
        // Sincroniza a hora local do usuário com o relógio do servidor
        const syncedCurrentTimeInSeconds = Math.floor((Date.now() + timeDelta) / 1000);

        if (decoded.exp && decoded.exp < syncedCurrentTimeInSeconds) {
          console.warn("🚨 [UX Guard - Seguros] Token expirado localmente. Acionando Amnésia.");
          window.dispatchEvent(new CustomEvent('session_expired'));
          return;
        }
      } catch (error) {
        console.warn("⚠️ [UX Guard - Seguros] Token malformado. Expulsando por segurança.");
        window.dispatchEvent(new CustomEvent('session_expired'));
        return;
      }
    }
  }, [token, isLoading, navigate, location.pathname]);

  // [COMPLIANCE]: Estado de carregamento seguro.
  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-slate-500 font-medium text-sm">
          Carregando informações...
        </p>
      </div> 
    );
  }

  // [COMPLIANCE]: Fail-safe de renderização.
  if (!token) return null;

  return (
    <FinancialHubLayout>
      <Outlet />
    </FinancialHubLayout>
  );
};

export const Route = createLazyFileRoute('/seguros')({
  component: SegurosGuard,
});