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
 */

import { createLazyFileRoute, Outlet, useNavigate, useLocation } from '@tanstack/react-router';
import { FinancialHubLayout } from "@/features/financial-hub/components/layout/FinancialHubLayout";
import { useProductConsult } from "@/features/financial-hub/core/contexts/FinancialHubContext";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { useEffect } from "react";
import { jwtDecode } from "jwt-decode"; 

const FinanciamentosGuard = () => {
  // [ARQUITETURA]: Apenas o token do app (JWT Próprio) é acessível aqui.
  const { sessionToken, isLoading } = useFinancialAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const productConsult = useProductConsult();

  useEffect(() => {
    // 0. Ignora enquanto hidrata o estado
    if (isLoading) return;

    // 1. [BUSINESS LOGIC]: Bloqueio de acesso não autenticado.
    if (!sessionToken && location.pathname !== '/accounts/signin') {
      navigate({ 
        to: '/accounts/signin',
        search: { redirect_uri: window.location.pathname + window.location.search}
      });
      return;
    }

    // 2. [SECURITY]: Validação Passiva de Expiração (UX Guard)
    // Valida o seu JWT localmente contra a expiração, usando o Clock Drift calculado no login.
    if (sessionToken) {
      try {
        const decoded = jwtDecode<{ exp?: number }>(sessionToken);
        
        // Resgata o desvio do relógio salvo no momento do login
        const timeDelta = parseInt(localStorage.getItem('time_delta') || '0', 10);
        
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

  // [COMPLIANCE]: Fail-safe de segurança caso não haja sessionToken
  if (!sessionToken) return null;

  return (
    <FinancialHubLayout>
      <Outlet />
    </FinancialHubLayout>
  );
};

export const Route = createLazyFileRoute('/financiamentos')({
  component: FinanciamentosGuard,
});