/**
 * @fileoverview Manifesto da Jornada de Veículos
 * @path src/features/financial-hub/components/products/financial/veiculos/veiculos.manifest.ts
 */

import { WizardManifest } from "@/features/financial-hub/components/shared/manifest.types";
import { Step1Simulation } from "./steps/Step1Simulation";
import { Step2Confirm } from "./steps/Step2Confirm";

export const VeiculosManifest: WizardManifest = {
  meta: {
    showProgress: false,
    layout: {
      gridTemplate: "lg:grid-cols-[1fr_1.2fr]" // Proporção OfferPanel e Steps
    },
    steps: {
      1: { 
        label: "Simulação",
        title: "Simulação de Veículos", 
        description: "Configure os detalhes do financiamento do seu veículo." 
      },
      2: { 
        label: "Confirmação",
        title: "Resultado", 
        description: "Revise as condições da sua proposta." 
      },
    }
  },
  steps: {
    1: Step1Simulation,
    2: Step2Confirm,
  }
};