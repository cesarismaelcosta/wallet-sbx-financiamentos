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
 * Define o `FinancialHubLayout` como a base visual comum e garante a proteção
 * de acesso (Auth Guard) antes da renderização da árvore de rotas financeiras.
 * 
 * * * COMPLIANCE & SEGURANÇA:
 * Garante que a sessão do usuário seja validada antes de expor qualquer layout
 * ou dado sensível do Financial Hub.
 */

import { createLazyFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { FinancialHubLayout } from "@/features/financial-hub/components/layout/FinancialHubLayout";
import { useProductConsult } from "@/features/financial-hub/core/contexts/FinancialHubContext";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { useEffect } from "react";

/**
 * FinanciamentosGuard
 * Componente de proteção de rotas para o módulo de Financiamentos.
 * Interrompe a montagem do layout caso a sessão do usuário seja inválida.
 */
const FinanciamentosGuard = () => {
  const { sbxToken } = useFinancialAuth();
  const navigate = useNavigate();
  // Mantemos o acesso ao contexto do produto conforme arquitetura original
  const productConsult = useProductConsult();

  useEffect(() => {
    // [BUSINESS LOGIC]: Bloqueio de acesso não autenticado.
    // Redireciona para o fluxo de autenticação para evitar inconsistência de estado
    // e exposição de dados financeiros.
    if (!sbxToken) {
      navigate({ to: '/accounts/signin' });
    }
  }, [sbxToken, navigate]);

  // [COMPLIANCE]: Fail-safe de segurança.
  // Evita o "flash" de conteúdo não autorizado retornando null precocemente.
  if (!sbxToken) return null;

  return (
    <FinancialHubLayout>
      <Outlet />
    </FinancialHubLayout>
  );
};

export const Route = createLazyFileRoute('/financiamentos')({
  component: FinanciamentosGuard,
});