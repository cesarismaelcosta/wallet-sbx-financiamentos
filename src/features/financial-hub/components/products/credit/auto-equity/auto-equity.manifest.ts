/**
 * @fileoverview Manifesto da Jornada de Auto Equity
 * @path src/components/auto-equity/auto-equity.manifest.ts
 * * @description Configuração unificada da jornada Auto Equity seguindo o contrato WizardManifest.
 * Separa a configuração de metadados visuais (utilizados pelo WizardHeader) do 
 * motor de injeção de componentes (utilizados pelo WizardEngine).
 * * * @dependencies
 * - WizardManifest (tipagem estrutural do hub)
 * - Componentes de Step da rota de auto-equity
 */

import { WizardManifest } from "@/features/financial-hub/components/shared/manifest.types";
import { Step1Eligibility } from "@/features/financial-hub/components/products/credit/auto-equity/steps/Step1Eligibility";
import { Step2PersonalData } from "@/features/financial-hub/components/products/credit/auto-equity/steps/Step2PersonalData";
import { Step3Vehicle } from "@/features/financial-hub/components/products/credit/auto-equity/steps/Step3Vehicle";
import { Step4Simulation } from "@/features/financial-hub/components/products/credit/auto-equity/steps/Step4Simulation";
import { Step5Confirm } from "@/features/financial-hub/components/products/credit/auto-equity/steps/Step5Confirm";

export const AutoEquityManifest: WizardManifest = {
  meta: {
    showProgress: true, // Habilita a régua de progresso no WizardHeader global
    layout: {
      gridTemplate: "lg:grid-cols-[1fr_1.2fr]" // Propoção entre OfferPanel e Steps
    },
    steps: {
      1: { 
        label: "Elegibilidade", 
        title: "Verifique sua elegibilidade", 
        description: "Precisamos da sua autorização para enviarmos os dados da sua Conta sbXPAY para a Creditas. Vamos checar se existe alguma oferta disponível para você:" 
      },
      2: { 
        label: "Seus dados", 
        title: "Complete seu perfil", 
        description: "Estas informações complementares ajudam a procuramos a melhor sua taxa de juros e a garantir as melhores condições de pagamento." 
      },
      3: { 
        label: "Sua garantia", 
        title: "Dados da garantia", 
        description: "Informe os dados da garantia que você deseja utilizar. O limite máximo do seu empréstimo será calculado com base no valor do veículo." 
      },
      4: { 
        label: "Simulação", 
        title: "Personalize seu crédito", 
        description: "Ajuste o valor desejado e nos informe o motivo do empréstimo. Vamos analisar as melhores opções para você." 
      },
      5: { 
        // Passo de conclusão omitido propositalmente da régua visual (ausência de 'label')
        title: "Análise concluída", 
        description: "Confira abaixo o resultado da sua solicitação e os detalhes da proposta." 
      },
    }
  },
  steps: {
    1: Step1Eligibility,
    2: Step2PersonalData,
    3: Step3Vehicle,
    4: Step4Simulation,
    5: Step5Confirm,
  }
};