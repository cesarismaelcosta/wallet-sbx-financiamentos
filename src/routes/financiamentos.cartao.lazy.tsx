/**
 * @fileoverview Rota: /financiamentos/cartao
 * @path src/routes/financiamentos/cartao.tsx
 * * * ESTRUTURA DO PROJETO:
 * --------------------------------------------------------------------------------
 * src/
 * ├── api/
 * │   ├── gateway.ts            # O "Transportador" (lógica de rede)
 * ├── components/
 * │   ├── cartao/               # [Domínio] Componentes exclusivos do Cartão
 * │   │   ├── WizardLayout.tsx  # O "Financial Layout" (Engine de renderização)
 * │   │   ├── OfferPanel.tsx    # Exibição de ofertas
 * │   │   └── card.manifest.ts  # Definição dos passos (JSON/Config)
 * │   └── common/
 * │       ├── StepLayout.tsx    # O "Palco" (Container estável)
 * │       └── FinancialHubDataInjector.tsx # Injetor de estado
 * ├── hooks/
 * │   └── useOrchestratorHydration.ts    # A "Lógica de API"
 * └── routes/                   # Páginas (Auto-Equity, Veículos, Cartão, etc)
 * --------------------------------------------------------------------------------
 * * * PROPÓSITO:
 * Ponto de entrada para a jornada de Cartão.
 * * * ARQUITETURA E FLUXO:
 * 1. SimulaçãoContext:    [Global] Dados hidratados pelo SimulationLayout pai.
 * 2. WizardProvider:      [Estado] Gerencia o fluxo da jornada local.
 * 3. FinancialHubDataInjector:  [Injeção] Popula o Wizard com o simData do contexto.
 * 4. StepLayout:          [Palco] Container estável que elimina Layout Shift.
 * 5. WizardLayout:        [Engine] Renderiza os passos dentro do StepLayout.
 */

import { createLazyFileRoute, useSearch } from "@tanstack/react-router";

// Motor Genérico (Infraestrutura)
import { WizardProvider } from "@/features/financial-hub/components/shared/WizardProvider";
import { StepLayout } from "@/features/financial-hub/components/shared/StepLayout";

// Domínio (Específico da jornada Cartão)
import { FinancialHubDataInjector } from "@/features/financial-hub/components/layout/FinancialHubDataInjector";
import { HowItWorks } from "@/features/financial-hub/components/products/financial/card/HowItWorks";
import { BaseWizardLayout } from "@/features/financial-hub/components/shared/BaseWizardLayout";
import { CardManifest } from "@/features/financial-hub/components/products/financial/card/card.manifest";

// Hook de Contexto (Nova Arquitetura de Dados)
import { useProductConsult } from "@/features/financial-hub/core/contexts/FinancialHubContext";


export const Route = createLazyFileRoute("/financiamentos/cartao")({
  component: CardPage,
});

function CardPage() {
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
                <BaseWizardLayout manifest={CardManifest}/>
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