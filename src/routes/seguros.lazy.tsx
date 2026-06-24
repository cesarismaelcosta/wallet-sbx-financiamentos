/**
 * @fileoverview Rota Pai: /seguros
 * @path src/routes/seguros.lazy.tsx
 * * * PROPÓSITO:
 * Atuar como o Wrapper (Envoltório) para todas as jornadas de Seguro.
 * Garante que o SimulationLayout seja injetado antes de qualquer rota filha (como /seguros/auto).
 */

import { createLazyFileRoute, Outlet } from '@tanstack/react-router';
import { FinancialHubLayout } from "@/features/financial-hub/components/layout/FinancialHubLayout";

export const Route = createLazyFileRoute('/seguros')({
  component: () => (
    <FinancialHubLayout>
      <Outlet />
    </FinancialHubLayout>
  ),
});