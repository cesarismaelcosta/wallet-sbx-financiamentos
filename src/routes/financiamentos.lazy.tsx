/**
 * @fileoverview Rota Pai: /financiamentos
 * @path src/routes/financiamentos.lazy.tsx
 * * * ÁRVORE DE DEPENDÊNCIAS (ROUTING):
 * --------------------------------------------------------------------------------
 * src/routes/
 * ├── financiamentos.lazy.tsx       # [AQUI] Layout Pai (Mestre)
 * │   ├── /cartao.tsx               # Rota Filha (Herda a estrutura)
 * │   ├── /veiculos.tsx             # Rota Filha (Herda a estrutura)
 * │   ├── /simulacao.tsx             # Rota Filha (Herda a estrutura)
 * │   └── /auto-equity.tsx          # Rota Filha (Herda a estrutura)
 * --------------------------------------------------------------------------------
 * * * PROPÓSITO:
 * Atuar como o "Wrapper" (Envoltório) global para todas as jornadas de crédito.
 * Define o `SimulationLayout` como a base visual comum (Header, FAQ, Footer) e 
 * garante que a estrutura base de todas as rotas financeiras seja consistente.
 * * * ARQUITETURA E FLUXO:
 * - O `SimulationLayout` é o componente pai que envelopa o `<Outlet />`.
 * - Qualquer rota filha (ex: /cartao) será renderizada dentro da área de conteúdo 
 * do Layout, garantindo que o cabeçalho e rodapé não precisem de ser re-renderizados 
 * durante a navegação entre passos.
 */

import { createLazyFileRoute, Outlet } from '@tanstack/react-router';
import { FinancialHubLayout } from "@/features/financial-hub/components/layout/FinancialHubLayout";
import { useProductConsult } from "@/features/financial-hub/core/contexts/FinancialHubContext";

export const Route: any = createLazyFileRoute('/financiamentos')({
  component: () => (
    <FinancialHubLayout>
      <Outlet />
    </FinancialHubLayout>
  ),
});

