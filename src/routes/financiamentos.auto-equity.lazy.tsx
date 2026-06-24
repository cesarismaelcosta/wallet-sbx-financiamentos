/**
 * @fileoverview Rota: /financiamentos/auto-equity
 * @path src/routes/financiamentos/auto-equity.tsx
 * * * ESTRUTURA DO PROJETO:
 * --------------------------------------------------------------------------------
 * src/
 * ├── api/
 * │   ├── gateway.ts            # O "Transportador" (lógica de rede)
 * ├── components/
 * │   ├── auto-equity/          # [Domínio] Componentes exclusivos do Auto-Equity
 * │   │   ├── WizardLayout.tsx  # O "Financial Layout" (Engine de renderização)
 * │   │   └── HowItWorks.tsx    # Componente informativo
 * │   └── common/
 * │       ├── StepLayout.tsx    # O "Palco" (Container estável)
 * │       └── FinancialHubDataInjector.tsx # Injetor de estado
 * ├── hooks/
 * │   └── useOrchestratorHydration.ts    # A "Lógica de API"
 * └── routes/                   # Páginas (Auto-Equity, Veículos, Simulação, etc)
 * --------------------------------------------------------------------------------
 * * * PROPÓSITO:
 * Ponto de entrada para a jornada de Auto-Equity.
 * * * ARQUITETURA E FLUXO (ATUALIZADA):
 * 1. SimulaçãoContext:    [Global] Dados hidratados pelo SimulationLayout pai.
 * 2. WizardProvider:      [Estado] Gerencia o fluxo da jornada local.
 * 3. FinancialHubDataInjector:  [Injeção] Popula o Wizard com o simData do contexto.
 * 4. StepLayout:          [Palco] Container estável que elimina Layout Shift.
 * 5. WizardLayout:        [Engine] Renderiza os passos dentro do StepLayout.
 */

import { createLazyFileRoute, useSearch } from "@tanstack/react-router";
import React from "react";

// Motor Genérico (Infraestrutura)
import { FinancialHubDataInjector } from "@/features/financial-hub/components/layout/FinancialHubDataInjector";

// Domínio (Específico da jornada Auto-Equity)
import { BaseWizardLayout } from "@/features/financial-hub/components/shared/BaseWizardLayout";
import { HowItWorks } from "@/features/financial-hub/components/products/credit/auto-equity/HowItWorks";
import { AutoEquityManifest } from "@/features/financial-hub/components/products/credit/auto-equity/auto-equity.manifest";
import { WizardProvider } from "@/features/financial-hub/components/shared/WizardProvider";
import { StepLayout } from "@/features/financial-hub/components/shared/StepLayout";

// Hook de Contexto (Nova Arquitetura de Dados)
import { useProductConsult } from "@/features/financial-hub/core/contexts/FinancialHubContext";

export const Route = createLazyFileRoute("/financiamentos/auto-equity")({
  component: AutoEquityPage,
});

function AutoEquityPage() {
  const search = useSearch({ strict: false });
  
  // 1. RESGATE: Consome os dados já hidratados pelo SimulationLayout (Pai).
  // Removemos o OrchestratorWrapper local para evitar chamadas duplicadas e alinhar ao padrão global.
  const simData = useProductConsult();

  if (!simData?.entity) return null; // Guard simplificado
  
  return (
    <>
      <section className="relative py-12 px-4 min-h-[85vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0 bg-white" />
        
        <main className="relative z-10 w-full max-w-6xl">
          {/* 2. MOTOR: Injeta o estado global (initialData) necessário para o Wizard */}
          <WizardProvider initialData={simData?.entity || {}}>
            
            {/* 3. INJEÇÃO: Popula o Wizard com dados da API e ID da simulação atual */}
            <FinancialHubDataInjector>
            
              {/* 4. PALCO ESTÁVEL: Container consistente para evitar Layout Shift */}
              <StepLayout>
                <BaseWizardLayout manifest={AutoEquityManifest} />
              </StepLayout>

            </FinancialHubDataInjector>

          </WizardProvider>

        </main>

      </section>

      {/* Seções complementares (Contexto da Jornada) */}
      <HowItWorks />
    </>
  );
}