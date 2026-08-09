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
// 👇 CORREÇÃO: import do getTimeDelta adicionado aqui!
import { getDefaultSbxEnvironment, USE_COOKIE, getTokenForPayload, getTimeDelta } from "@/services/session";  

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
      navigate({ 
        to: '/accounts/signin',
        search: { 
          redirect_uri: location.pathname + location.search,
          env: undefined 
        }
      });
      return;
    }

    // 2. [SECURITY]: Validação Passiva de Expiração (UX Guard)
    if (sessionToken) {
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
        // 👇 CORREÇÃO: Catch honesto que mostra o erro real se quebrar, em vez de culpar o token
        console.error("⚠️ [UX Guard - Seguros] Erro crítico na validação (não é necessariamente o token):", error);
        window.dispatchEvent(new CustomEvent('session_expired'));
        return;
      }
    }
  }, [sessionToken, isLoading, navigate, location.pathname]);

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