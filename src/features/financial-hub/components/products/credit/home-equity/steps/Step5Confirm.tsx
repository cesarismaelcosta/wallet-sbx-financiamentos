/**
 * @fileoverview Tela final — Solicitação enviada (Home Equity · FlowCredi)
 * @path src/features/financial-hub/components/products/credit/home-equity/steps/Step5Confirm.tsx
 *
 * Mesma estrutura do Step5Confirm do Auto Equity: título, ilustração, frase com
 * o e-mail do cadastro e ações (Voltar ao início + WhatsApp, quando configurado).
 *
 * @author César Ismael Pereira da Costa
 */

import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { Button } from "@/components/ui/button";
import { ButtonWhatsApp } from "@/features/financial-hub/components/layout/ButtonWhatsApp";
import { ArrowLeft } from "lucide-react";
import { useTheme } from "@/design-system/sbx-design-system-9f1c03/components/ThemeProvider";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import type { FlowWizardData, FlowInputs } from "@/features/financial-hub/components/shared/flowcredi/flowcredi.types";

export function Step5Confirm() {
  const { state, update, goTo } = useWizard<FlowWizardData>();
  const { resolvedTheme } = useTheme();
  const nightMode = resolvedTheme === "dark";
  const data = state.data ?? {};
  const saved: Partial<FlowInputs> = data.flowInputs ?? {};
  const propertyValue = Number(saved.property_value ?? 0);
  const balance = saved.property_paid ? 0 : Number(saved.outstanding_balance ?? 0);

  const handleRestart = () => {
    update({ data: { ...data, simulation_id: null } });
    goTo(1);
  };

  return (
    <div className="w-full space-y-4 animate-in fade-in duration-300">
      {/* Imóvel em garantia (mesmo padrão do Step2Simulation) */}
      {propertyValue > 0 && (
        <div className="-mt-3 space-y-0.5 min-w-0">
          <p className="text-xs text-neutral-600 dark:text-neutral-400 truncate">
            {saved.property_type} · {saved.property_city}/{saved.property_state}
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 truncate">
            Imóvel de <strong className="text-neutral-900 dark:text-neutral-100 font-bold">{BRL(propertyValue)}</strong>
            {balance > 0 && <> · saldo devedor {BRL(balance)}</>}
          </p>
        </div>
      )}

    <div className="flex flex-col items-center justify-center py-4 text-center w-full max-w-lg mx-auto">
      <div className="flex flex-col items-center w-full space-y-6">
        <div className="w-36 h-36 flex items-center justify-center">
          <img
            src={nightMode ? "/assets/home/financiamentoimoveis-dark-240.webp" : "/assets/home/financiamentoimoveis-240.webp"}
            alt="Solicitação enviada"
            className={`w-full h-auto object-contain relative ${nightMode ? "" : "mix-blend-multiply"}`}
          />
        </div>

        <p className="max-w-sm mx-auto text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
          Um especialista da FlowCredi vai falar com você pelo <span className="whitespace-nowrap">e-mail</span>{" "}
          <strong className="text-neutral-900 dark:text-neutral-100">{data.email}</strong> ou pelo celular.
        </p>

        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4 pt-6 w-full border-t border-neutral-200 dark:border-neutral-800">
          <Button
            variant="ghost"
            onClick={handleRestart}
            className="w-full sm:w-auto rounded-none text-[#2246A7] hover:bg-[#E7F2FD] dark:hover:bg-neutral-800 hover:text-[#2246A7] font-medium transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar ao início
          </Button>

          <div className="w-full sm:w-auto flex-1 flex justify-end">
            <ButtonWhatsApp
              productName="Home Equity"
              variant="button"
              config={data.integration_details}
              data={data}
              className="border-[#2246A7] text-[#2246A7] hover:bg-[#2246A7] hover:text-white"
            />
          </div>
        </div>
      </div>
    </div>
    </div>
  );
}
