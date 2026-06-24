/**
 * @fileoverview Manifest da Jornada de Cartão
 * @path src/components/cartao/card.manifest.ts
 */

import { WizardManifest } from "@/features/financial-hub/components/shared/manifest.types";
import { Step1Simulation } from "@/features/financial-hub/components/products/financial/card/steps/Step1Simulation";

export const CardManifest: WizardManifest = {
  meta: {
    showProgress: false, 
    layout: {
      gridTemplate: "lg:grid-cols-[1fr_1.2fr]" // Proporção entre OfferPanel e Steps
    },
    steps: {
      1: { 
        title: "Simulação de Cartão", 
        description: "Configure os detalhes da sua solicitação de cartão." 
      },
    }
  },
  steps: {
    1: Step1Simulation,
  }
};