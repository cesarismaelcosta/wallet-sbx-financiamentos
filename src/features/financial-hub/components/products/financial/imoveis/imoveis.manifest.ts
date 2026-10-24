/**
 * @fileoverview Manifesto da Jornada de Financiamento Imobiliário (FlowCredi)
 * @path src/features/financial-hub/components/products/financial/imoveis/imoveis.manifest.ts
 *
 * 1. Simulação (sem aceites) · 2. Ofertas dos bancos (Detalhar / Seguir)
 * 3. Seus dados e aceites (envio do lead) · 4. Solicitação enviada
 */

import { WizardManifest } from "@/features/financial-hub/components/shared/manifest.types";
import { Step1Simulation } from "./steps/Step1Simulation";
import { Step2Offers } from "./steps/Step2Offers";
import { Step3PersonalData } from "./steps/Step3PersonalData";
import { Step4Confirm } from "./steps/Step4Confirm";

export const ImoveisManifest: WizardManifest = {
  meta: {
    showProgress: true, // régua de etapas + título/descrição no WizardHeader (padrão Auto Equity)
    layout: {
      gridTemplate: "lg:grid-cols-[1fr_1.2fr]", // mesma proporção de Veículos (painel × steps)
    },
    steps: {
      1: {
        label: "Simulação",
        title: "Simulação de Financiamento Imobiliário",
        description: "",
      },
      2: {
        label: "Ofertas",
        title: "Ofertas disponíveis",
        description: "", // frase com o prazo é montada no próprio Step2Offers
      },
      3: {
        label: "Seus dados",
        title: "Seus dados e autorizações",
        description: "Confira seus dados e autorize o envio da solicitação.",
      },
      4: {
        // Passo de conclusão fora da régua (sem label), como no Auto Equity
        title: "Solicitação enviada",
        description: "",
      },
    },
  },
  steps: {
    1: Step1Simulation,
    2: Step2Offers,
    3: Step3PersonalData,
    4: Step4Confirm,
  },
};
