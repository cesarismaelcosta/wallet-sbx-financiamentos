/**
 * @fileoverview Rota: /financiamentos/simulacao
 * * * PROPÓSITO:
 * Ponto de entrada para a jornada de Simulação (Parceiros/Genérico).
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
import { WizardProvider } from "@/features/financial-hub/components/shared/WizardProvider";
import { StepLayout } from "@/features/financial-hub/components/shared/StepLayout";

// Domínio (Específico da jornada Simulação/Partner)
import { WizardLayout } from "@/features/financial-hub/components/products/financial/veiculos/WizardLayout";
import { HowItWorks } from "@/features/financial-hub/components/products/financial/veiculos/HowItWorks";
import { FinancialHubDataInjector } from "@/features/financial-hub/components/layout/FinancialHubDataInjector";
import { BaseWizardLayout } from "@/features/financial-hub/components/shared/BaseWizardLayout";
import { VeiculosManifest } from "@/features/financial-hub/components/products/financial/veiculos/veiculos.manifest";

// Hook de Contexto (Nova Arquitetura de Dados)
import { useProductConsult } from "@/features/financial-hub/core/contexts/FinancialHubContext";

export const Route = createLazyFileRoute("/financiamentos/veiculos")({
  component: ProductConsultPage,
});

function ProductConsultPage() {
  const search = useSearch({ strict: false });
  
  // 1. RESGATE: Consome os dados já hidratados pelo SimulationLayout (Pai).
  const simData = useProductConsult();

  if (!simData?.entity) return null; // Guard simplificado

  return (
    <>
      <section className="relative py-12 px-4 min-h-[85vh] flex items-center justify-center overflow-hidden">
        
        <main className="relative z-10 w-full max-w-6xl">
          {/* 2. MOTOR: Injeta o estado global (initialData) necessário para o Wizard */}
          <WizardProvider initialData={simData?.entity || {}}>
            
            {/* 3. INJEÇÃO: Popula o Wizard com dados da API e ID da simulação atual */}
            <FinancialHubDataInjector>
            
              {/* 4. PALCO ESTÁVEL: Container consistente para evitar Layout Shift */}
              <StepLayout>
                <BaseWizardLayout manifest={VeiculosManifest} />
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