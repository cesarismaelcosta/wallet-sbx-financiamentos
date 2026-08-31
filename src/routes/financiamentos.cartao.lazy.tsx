/**
 * @fileoverview Rota: /financiamentos/cartao
 * @path src/routes/financiamentos/cartao.lazy.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: STATELESS WIZARD & DATA INJECTION
 * =========================================================================
 * Ponto de entrada estrutural para a jornada de Cartão.
 * Este componente atua como um "Palco Oco" (Dumb Component), delegando
 * toda a regra de negócio para a injeção do Orquestrador via Contexto.
 * 
 * [MECÂNICA ARQUITETURAL]:
 * 1. {Global State Hydration}: Consome `simData` hidratado pelo Guardião 
 *    Pai (`financiamentos.lazy.tsx`), garantindo zero roundtrips na API local.
 * 2. {Engine Ignition}: Envolve o contexto no `WizardProvider` injetando
 *    `initialData` como base imutável da jornada.
 * 3. {Dynamic Rendering}: Utiliza o `BaseWizardLayout` pareado com o 
 *    `CardManifest` (JSON-driven UX) para montar as telas dinamicamente,
 *    eliminando a necessidade de dezenas de componentes específicos no DOM.
 * 4. {Anti-Shift Container}: O `StepLayout` isola a renderização em um palco
 *    estável, prevenindo Cumulative Layout Shift (CLS) durante a navegação.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { createLazyFileRoute } from "@tanstack/react-router";

// Motor Genérico (Infraestrutura)
import { WizardProvider } from "@/features/financial-hub/components/shared/WizardProvider";
import { StepLayout } from "@/features/financial-hub/components/shared/StepLayout";
import { FinancialHubDataInjector } from "@/features/financial-hub/components/layout/FinancialHubDataInjector";
import { BaseWizardLayout } from "@/features/financial-hub/components/layout/BaseWizardLayout";

// Domínio (Específico da jornada Cartão)
import { HowItWorks } from "@/features/financial-hub/components/products/financial/card/HowItWorks";
import { CardManifest } from "@/features/financial-hub/components/products/financial/card/card.manifest";

// Hook de Contexto (Motor de Dados)
import { useProductConsult } from "@/features/financial-hub/core/contexts/FinancialHubContext";

export const Route = createLazyFileRoute("/financiamentos/cartao")({
  component: CardConsultPage,
});

function CardConsultPage() {
  // 1. [RESGATE]: Consome os dados PII e do Carrinho providos pelo Guardião Pai
  const simData = useProductConsult();

  // Guard Clause Estrito: Se a entidade não foi hidratada, aborta a montagem
  if (!simData?.entity) return null; 
  
  return (
    <>
      <section id="simulacao" className="relative -mt-8 pb-12 px-4 w-full flex justify-center overflow-hidden">
        <main className="relative z-10 w-full max-w-6xl">
          {/* 2. [MOTOR]: Inicializa a máquina de estados local do formulário */}
          <WizardProvider initialData={simData?.entity || {}}>
            
            {/* 3. [INJEÇÃO]: Anexa o contexto temporal (visit_update_id) ao Wizard */}
            <FinancialHubDataInjector>

              {/* 4. [RENDERIZAÇÃO]: Palco anti-CLS com Engine JSON-driven */}
              <StepLayout>
                <BaseWizardLayout manifest={CardManifest} />
              </StepLayout>
              
            </FinancialHubDataInjector>

          </WizardProvider>
        </main>
      </section>

      {/* 5. [SUPORTE]: Seção estática de educação do consumidor */}
      <div id="como-funciona">
        <HowItWorks />
      </div>
    </>
  );
}