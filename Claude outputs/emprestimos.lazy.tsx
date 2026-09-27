/**
 * @fileoverview Rota Pai: /emprestimos (Layout Mestre)
 * @path src/routes/emprestimos.lazy.tsx
 *
 * =========================================================================
 * A guarda de sessão (zero-trust, resgate de handoff #xt=) e o skeleton de
 * carregamento vivem em FinancialHubLayout, compartilhados por todas as
 * verticais (financiamentos, seguros, emprestimos) — não há mais lógica
 * duplicada aqui. Este arquivo é só o registro da rota.
 * =========================================================================
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { createLazyFileRoute, Outlet } from '@tanstack/react-router';
import { FinancialHubLayout } from "@/features/financial-hub/components/layout/FinancialHubLayout";

export const Route = createLazyFileRoute('/emprestimos')({
  component: () => (
    <FinancialHubLayout>
      <Outlet />
    </FinancialHubLayout>
  ),
});
