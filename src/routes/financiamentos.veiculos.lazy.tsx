/**
 * @fileoverview Rota: /financiamentos/veiculos
 * @path src/routes/financiamentos/veiculos.lazy.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: STATELESS WIZARD & DATA INJECTION
 * =========================================================================
 * Ponto de entrada estrutural para a jornada de Financiamento de Veículos.
 * Este componente atua como um "Palco Oco" (Dumb Component), delegando
 * toda a regra de negócio para a injeção do Orquestrador via Contexto.
 * 
 * [MECÂNICA ARQUITETURAL]:
 * 1. {Global State Hydration}: Consome `simData` hidratado pelo Guardião 
 *    Pai (`financiamentos.lazy.tsx`), garantindo zero roundtrips na API local.
 * 2. {Engine Ignition}: Envolve o contexto no `WizardProvider` injetando
 *    `initialData` como base imutável da jornada.
 * 3. {Dynamic Rendering}: Utiliza o `BaseWizardLayout` pareado com o 
 *    `VeiculosManifest` (JSON-driven UX) para montar as telas dinamicamente,
 *    eliminando a necessidade de dezenas de componentes específicos no DOM.
 * 4. {Anti-Shift Container}: O `StepLayout` isola a renderização em um palco
 *    estável, prevenindo Cumulative Layout Shift (CLS) durante a navegação.
 * 
 * [ATUALIZAÇÃO DE CONFORMIDADE]:
 * - Injeção da wrapper `.dark w-full` no componente `<HowItWorks />` para 
 *   garantir o contraste correto na cauda da página, em simetria absoluta
 *   com as outras rotas (Cartão, Simulação, Auto-Equity).
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect } from "react"; // ✨ FIX: Import adicionado

// Motor Genérico (Infraestrutura)
import { WizardProvider } from "@/features/financial-hub/components/shared/WizardProvider";
import { StepLayout } from "@/features/financial-hub/components/shared/StepLayout";
import { FinancialHubDataInjector } from "@/features/financial-hub/components/layout/FinancialHubDataInjector";
import { BaseWizardLayout } from "@/features/financial-hub/components/layout/BaseWizardLayout";

// Domínio (Específico da jornada Veículos)
import { HowItWorks } from "@/features/financial-hub/components/products/financial/veiculos/HowItWorks";
import { VeiculosManifest } from "@/features/financial-hub/components/products/financial/veiculos/veiculos.manifest";

// Hook de Contexto (Motor de Dados)
import { useProductConsult } from "@/features/financial-hub/core/contexts/FinancialHubContext";

export const Route = createLazyFileRoute("/financiamentos/veiculos")({
  component: VeiculosConsultPage,
});

function VeiculosConsultPage() {
  // 1. [RESGATE]: Consome os dados PII e do Carrinho providos pelo Guardião Pai
  const simData = useProductConsult();

  // Guard Clause Estrito: Se a entidade não foi hidratada, aborta a montagem
  if (!simData?.entity) return null; 

  // =========================================================================
  // ✨ FIX: O INTERRUPTOR DA CORTINA (ZERO-FLICKER)
  // =========================================================================
  // Assim que a tela possui dados e a árvore do DOM nasce invisível,
  // avisamos o Layout Pai para abrir a cortina e cancelar o timeout de 10s.
  useEffect(() => {
    if (simData?.setIsOrchestratorHydrating) {
      const timer = setTimeout(() => simData.setIsOrchestratorHydrating(false), 50);
      return () => clearTimeout(timer);
    }
  }, [simData?.setIsOrchestratorHydrating]);
  // =========================================================================

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
                <BaseWizardLayout manifest={VeiculosManifest} />
              </StepLayout>

            </FinancialHubDataInjector>
            
          </WizardProvider>
        </main>
      </section>

      {/* 5. [SUPORTE]: Seção estática de educação do consumidor envolta em .dark */}
      <div className="dark w-full" id="como-funciona">
        <HowItWorks />
      </div>
    </>
  );
}