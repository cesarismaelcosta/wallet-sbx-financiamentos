/**
 * @fileoverview Rota: /seguros/auto
 * @path src/routes/seguros/auto.tsx
 * 
 * * ÁRVORE DE DEPENDÊNCIAS (ROTA):
 * --------------------------------------------------------------------------------
 * src/
 * ├── routes/
 * │   └── seguros/auto.tsx                        # [AQUI] Ponto de entrada
 * ├── contexts/
 * │   └── FinancialHubContext.tsx                   # Contexto Global (Loading/Status)
 * ├── components/
 * │   ├── engine/WizardProvider.tsx               # Gerenciador de Estado Local
 * │   ├── simulacao/FinancialHubDataInjector.tsx        # A "Cortina de Hidratação" (API)
 * │   └── insurance-auto/SeguroAutoLayout.tsx     # O Layout principal da página
 * --------------------------------------------------------------------------------
 * 
 * * PROPÓSITO:
 * Inicializar a página de Seguros envelopada pelo motor de estado.
 * O FinancialHubDataInjector fará o fetch no Orquestrador usando o `visit_id` da URL,
 * e só baixará a cortina de loading quando os dados estiverem prontos.
 */

import { createLazyFileRoute, useSearch } from "@tanstack/react-router";
import { WizardProvider } from "@/features/financial-hub/components/shared/WizardProvider";
import { StepLayout } from "@/features/financial-hub/components/shared/StepLayout";

// Importações do Domínio de Seguros
import { WizardLayout } from "@/features/financial-hub/components/products/insurance/auto/WizardLayout";
import { FinancialHubDataInjector } from "@/features/financial-hub/components/layout/FinancialHubDataInjector";
import { HowItWorks } from "@/features/financial-hub/components/products/insurance/auto/HowItWorks";
import { BaseWizardLayout } from "@/features/financial-hub/components/shared/BaseWizardLayout";
import { SeguroAutoManifest } from "@/features/financial-hub/components/products/insurance/auto/seguro-auto.manifest";

// Importação do Contexto (O MESMO DA JORNADA QUE FUNCIONA)
import { useProductConsult } from "@/features/financial-hub/core/contexts/FinancialHubContext";

export const Route = createLazyFileRoute("/seguros/auto")({
  component: ProductConsultPage,
});

function ProductConsultPage() {
  // Extrai o visit_id da URL
  const search = useSearch({ strict: false });
  
  // 1. RESGATE: Consome os dados já hidratados pelo SimulationLayout (Pai).
  const simData = useProductConsult();

  console.log("SimData no ProductConsultPage:", simData); // Debug: Verificar se os dados estão chegando
  
  // Guard Clause de segurança
  if (!simData?.entity) return null; 

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
                <BaseWizardLayout manifest={SeguroAutoManifest} />
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