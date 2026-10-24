/**
 * @fileoverview Manifesto da jornada de Home Equity (Crédito com garantia de imóvel · FlowCredi)
 * @path src/features/financial-hub/components/products/credit/home-equity/home-equity.manifest.ts
 *
 * 1. Seu imóvel · 2. Simulação · 3. Ofertas (Step3Offers) · 4. Seus dados e autorizações
 * (Step4PersonalData, envio do lead /cgi/lead) · 5. Proposta enviada (fora da régua).
 */

import { WizardManifest } from "@/features/financial-hub/components/shared/manifest.types";
import { Step1Property } from "./steps/Step1Property";
import { Step2Simulation } from "./steps/Step2Simulation";
import { Step3Offers } from "./steps/Step3Offers";
import { Step4PersonalData } from "./steps/Step4PersonalData";
import { Step5Confirm } from "./steps/Step5Confirm";

export const HomeEquityManifest: WizardManifest = {
  meta: {
    showProgress: true,
    layout: {
      gridTemplate: "lg:grid-cols-[1fr_1.2fr]",
    },
    steps: {
      1: {
        label: "Seu imóvel",
        title: "Dados do imóvel em garantia",
        description: "Informe os dados do imóvel. O valor do crédito é calculado a partir dele.",
      },
      2: {
        label: "Simulação",
        title: "Simulação de crédito com garantia de imóvel",
        description: "",
      },
      3: {
        label: "Ofertas",
        title: "Ofertas disponíveis",
        description: "", // frase com o valor e o prazo é montada no próprio Step3Offers
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
    1: Step1Property,
    2: Step2Simulation,
    3: Step3Offers,
    4: Step4PersonalData,
    5: Step5Confirm,
  },
};
