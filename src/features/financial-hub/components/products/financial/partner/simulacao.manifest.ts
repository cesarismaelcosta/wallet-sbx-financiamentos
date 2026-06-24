/**
 * @fileoverview Manifesto de Navegação: Simulação
 * @path src/components/simulacao/simulacao.manifest.ts
 */

import { WizardManifest } from "@/features/financial-hub/components/shared/manifest.types";
import { Step1Simulation } from "./steps/Step1Simulation";
import { Step2Confirm } from "./steps/Step2Confirm";

export const SimulacaoManifest: WizardManifest = {
  meta: {
    showProgress: false,
    layout: {
      gridTemplate: "lg:grid-cols-[1fr_1.2fr]" // Proporção entre OfferPanel e Steps
    },
    steps: {
      1: { 
        label: "Simulação",
        title: "Simulação", 
        description: "Configure os valores da sua solicitação." 
      },
      2: { 
        label: "Confirmação",
        title: "Resultado", 
        description: "Veja as condições disponíveis." 
      },
    }
  },
  steps: {
    1: Step1Simulation,
    2: Step2Confirm,
  }
};