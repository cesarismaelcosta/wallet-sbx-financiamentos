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
import { USE_COOKIE, getTokenForPayload, getTimeDelta } from "@/services/session";  

const FinanciamentosGuard = () => {
  const { sessionToken: contextToken, isLoading } = useFinancialAuth();
  const sessionToken = contextToken || getTokenForPayload();

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (isLoading) return;

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

    if (sessionToken) {
      try {
        const decoded = jwtDecode<{ exp?: number }>(sessionToken);
        const timeDelta = getTimeDelta();
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