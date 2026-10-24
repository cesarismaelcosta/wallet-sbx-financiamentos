/**
 * @fileoverview Manifesto da Jornada de Car Equity (FlowCredi)
 * @path src/features/financial-hub/components/products/credit/auto-equity/auto-equity.manifest.ts
 *
 * 1. Seu veículo · 2. Seu crédito · 3. Sua renda · 4. Seus dados e autorizações (envio do lead)
 * · 5. Solicitação enviada. A FlowCredi não tem simulador de auto: os dados seguem no lead (/auto/lead).
 */

import { WizardManifest } from "@/features/financial-hub/components/shared/manifest.types";
import { Step1Vehicle } from "./steps/Step1Vehicle";
import { Step2Credit } from "./steps/Step2Credit";
import { Step3Income } from "./steps/Step3Income";
import { Step4PersonalData } from "./steps/Step4PersonalData";
import { Step5Confirm } from "./steps/Step5Confirm";

export const AutoEquityManifest: WizardManifest = {
  meta: {
    showProgress: true,
    layout: {
      gridTemplate: "lg:grid-cols-[1fr_1.2fr]",
    },
    steps: {
      1: {
        label: "Seu veículo",
        title: "Dados do veículo em garantia",
        description: "Informe os dados do veículo. O valor do crédito é calculado a partir dele.",
      },
      2: {
        label: "Seu crédito",
        title: "Quanto você precisa",
        description: "Escolha o valor, as parcelas e o motivo do crédito.",
      },
      3: {
        label: "Sua renda",
        title: "Sua renda e ocupação",
        description: "Essas informações ajudam a buscar a melhor condição para você.",
      },
      4: {
        label: "Seus dados",
        title: "Seus dados e autorizações",
        description: "Confira seus dados e autorize o envio da solicitação.",
      },
      5: {
        // Passo de conclusão fora da régua (sem label)
        title: "Solicitação enviada",
        description: "",
      },
    },
  },
  steps: {
    1: Step1Vehicle,
    2: Step2Credit,
    3: Step3Income,
    4: Step4PersonalData,
    5: Step5Confirm,
  },
};
