/**
 * @fileoverview Rota Pai: /financiamentos
 * @path src/routes/financiamentos.lazy.tsx
 * 
 * * * * ÁRVORE DE DEPENDÊNCIAS (ROUTING):
 * --------------------------------------------------------------------------------
 * src/routes/
 * ├── financiamentos.lazy.tsx      # [AQUI] Layout Pai (Mestre)
 * │   ├── /cartao.tsx              # Rota Filha (Herda a estrutura)
 * │   ├── /veiculos.tsx            # Rota Filha (Herda a estrutura)
 * │   ├── /simulacao.tsx           # Rota Filha (Herda a estrutura)
 * │   └── /auto-equity.tsx         # Rota Filha (Herda a estrutura)
 * --------------------------------------------------------------------------------
 * * * PROPÓSITO:
 * Atuar como o "Wrapper" (Envoltório) global para todas as jornadas de crédito.
 * Define o `FinancialHubLayout` como a base visual comum e garante que a
 * estrutura base de todas as rotas financeiras seja consistente.
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
import { USE_COOKIE, getTokenForPayload, getTimeDelta } from "@/services/session";  // 👈 Resolução segura de ambiente, flag híbrida e encapsulamento de token

const FinanciamentosGuard = () => {
  // [ARQUITETURA]: sessionToken do contexto global
  const { sessionToken: contextToken, isLoading } = useFinancialAuth();
  
  // 🔑 [SECURITY GATE]: Resgate encapsulado do token utilizando getTokenForPayload com proteção anti-SSR
  const sessionToken = contextToken || getTokenForPayload();

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // 0. Ignora enquanto hidrata o estado inicial de auth
    if (isLoading) return;

    // 1. [BUSINESS LOGIC]: Bloqueio proativo de acesso não autenticado (Somente em DEV).
    // Se USE_COOKIE for true (Prod), o token não estará no JS. Confiamos que o backend (gateway)
    // devolverá 401 se o cookie for inválido, e o próprio interceptor fará o redirect.
    if (!USE_COOKIE && !sessionToken && location.pathname !== '/accounts/signin') {
      navigate({ 
        to: '/accounts/signin',
        search: { redirect_uri: window.location.pathname + window.location.search}
      });
      return;
    }

    // 2. [SECURITY]: Validação Passiva de Expiração (UX Guard)
    // Se o JS tiver acesso ao token (DEV/Lovable), realiza a validação de Clock Drift.
    // Em Produção, essa validação será feita exclusivamente na Borda (Edge Function).
    if (sessionToken) {
      try {
        const decoded = jwtDecode<{ exp?: number }>(sessionToken);
        
        // Resgata o desvio do relógio salvo no momento do login
        const timeDelta = getTimeDelta();
        
        // Hora da máquina + diferença = Hora Real sincronizada com o Servidor
        const syncedCurrentTimeInSeconds = Math.floor((Date.now() + timeDelta) / 1000);

        if (decoded.exp && decoded.exp < syncedCurrentTimeInSeconds) {
          console.warn("🚨 [UX Guard] sessionToken expirado localmente. Acionando Amnésia.");
          window.dispatchEvent(new CustomEvent('session_expired'));
          return;
        }
      } catch (error) {
        console.warn("⚠️ [UX Guard] sessionToken malformado. Expulsando por segurança.");
        window.dispatchEvent(new CustomEvent('session_expired'));
        return;
      }
    }
  }, [sessionToken, isLoading, navigate, location.pathname]);

  // [COMPLIANCE]: Fail-safe de segurança durante carregamento
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

  // [COMPLIANCE]: Fail-safe de segurança caso não haja sessionToken (Apenas em DEV).
  // Em PROD (USE_COOKIE = true), permitimos renderizar o <Outlet /> para que a chamada
  // fetch ao gateway dispare enviando o cookie e descubra a real situação da sessão.
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