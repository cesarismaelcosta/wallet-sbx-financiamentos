/**
 * @fileoverview Rota Pai: /seguros
 * @description Wrapper de segurança e layout para as jornadas de seguros.
 * @context Garante a integridade da sessão do usuário antes de renderizar qualquer sub-rota de seguro.
 * @compliance Proteção de acesso e controle de sessão (Auth Guard) para evitar exposição de dados.
 * 
 * * [ATUALIZAÇÃO DE ARQUITETURA - Híbrido Consciente]:
 * O Route Guard agora respeita a flag `USE_COOKIE`. Em produção, o token 
 * fica inacessível ao JS (HttpOnly). Logo, o Guard confia no backend para 
 * validar a sessão, evitando expulsões prematuras por falta de token no storage.
 */

import { createLazyFileRoute, Outlet, useNavigate, useLocation } from '@tanstack/react-router';
import { FinancialHubLayout } from "@/features/financial-hub/components/layout/FinancialHubLayout";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { useEffect } from "react";
import { jwtDecode } from "jwt-decode"; 
import { USE_COOKIE, getTokenForPayload, getTimeDelta } from "@/services/session";  

/**
 * SegurosGuard
 * Componente responsável por proteger o acesso às rotas de seguro.
 * Interrompe a renderização caso o usuário não esteja autenticado ou a sessão tenha expirado.
 */
const SegurosGuard = () => {
  // [ARQUITETURA]: sessionToken do contexto global
  const { sessionToken: contextToken, isLoading } = useFinancialAuth();
  
  // 🔑 [SECURITY GATE]: Resgate encapsulado e seguro utilizando getTokenForPayload com proteção contra SSR
  const sessionToken = contextToken || getTokenForPayload();

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // 0. Ignora validações enquanto o estado inicial está hidratando
    if (isLoading) return;

    // 1. [BUSINESS LOGIC]: Bloqueio proativo de acesso não autenticado (Somente em DEV).
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

    // 2. [SECURITY]: Validação Passiva de Expiração (UX Guard)
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
  }, [sessionToken, isLoading, navigate, location.pathname]);

  // =========================================================================
  // [UX REFINEMENT]: Substituição do Loader Bruto por Skeleton Estrutural
  // Rationale: Evita Layout Shift e a sensação de "duplo carregamento" na tela,
  // mantendo o container principal visível enquanto valida a sessão em background.
  // =========================================================================
  if (isLoading) {
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