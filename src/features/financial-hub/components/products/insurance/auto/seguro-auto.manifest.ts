/**
 * @fileoverview Manifesto de Navegação: [Nome da Jornada]
 * @path src/components/[caminho]/[nome].manifest.ts
 * * * PROPÓSITO:
 * Centralizar a definição da jornada, garantindo que o WizardHeader 
 * e o WizardEngine consumam a mesma fonte de dados.
 * * * ESTRUTURA:
 * - meta.steps: Dicionário para o cabeçalho (Visual).
 * - steps: Dicionário para o motor de renderização (Funcional).
 */

import { Step1PartnersPanel } from "./steps/Step1PartnersPanel";

export const SeguroAutoManifest = {
  meta: {
    showProgress: false,
    layout: {
      gridTemplate: "lg:grid-cols-[1fr_1.2fr]" // Proporção OfferPanel e Steps
    },
    steps: {
      1: { 
        label: "Parceiros", 
        title: "Seguro Auto", 
        description: "Escolha o parceiro ideal." 
      }
    }
  },
  steps: {
    1: Step1PartnersPanel,
  }
};