/**
 * @fileoverview Rota Pai: /financiamentos
 * @path src/routes/financiamentos.lazy.tsx
 * 
 * * * ÁRVORE DE DEPENDÊNCIAS (ROUTING):
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
 * Define o `FinancialHubLayout` como a base visual comum (Header, FAQ, Footer) e 
 * garante que a estrutura base de todas as rotas financeiras seja consistente.
 * * * ARQUITETURA E FLUXO:
 * - O `FinancialHubLayout` é o componente pai que envelopa o `<Outlet />`.
 * - Qualquer rota filha (ex: /cartao) será renderizada dentro da área de conteúdo 
 * do Layout, garantindo que o cabeçalho e rodapé não precisem de ser re-renderizados 
 * durante a navegação entre passos.
 */

import { createLazyFileRoute, Outlet, useNavigate, useLocation } from '@tanstack/react-router';
import { FinancialHubLayout } from "@/features/financial-hub/components/layout/FinancialHubLayout";
import { useProductConsult } from "@/features/financial-hub/core/contexts/FinancialHubContext";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

const FinanciamentosGuard = () => {
  // Corrigido para usar as variáveis reais do contexto (token/isLoading)
  const { token, isLoading } = useFinancialAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const productConsult = useProductConsult();
  
  // Congelamos o caminho inicial assim que o componente nasce.
  // Isso impede que o React sobrescreva o destino no meio do redirecionamento.
  const [originalPath] = useState(location.pathname);

  useEffect(() => {
    // Evita loop caso o componente não desmonte a tempo
    if (originalPath === '/accounts/signin') return;

    if (!isLoading && !token) {
      navigate({ 
        to: '/accounts/signin',
        search: { redirect: originalPath } // Usa o caminho congelado
      });
    }
  }, [token, isLoading, navigate, originalPath]);

  // [COMPLIANCE]: Fail-safe de segurança durante carregamento
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // [COMPLIANCE]: Fail-safe de segurança caso não haja token
  if (!token) return null;

  return (
    <FinancialHubLayout>
      <Outlet />
    </FinancialHubLayout>
  );
};

export const Route = createLazyFileRoute('/financiamentos')({
  component: FinanciamentosGuard,
});