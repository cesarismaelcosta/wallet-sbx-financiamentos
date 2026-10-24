/**
 * @fileoverview Tela final — Solicitação enviada (Financiamento Imobiliário · FlowCredi)
 * @path src/features/financial-hub/components/products/financial/imoveis/steps/Step4Confirm.tsx
 *
 * Mesma estrutura do Step5Confirm do Auto Equity (título, ilustração, frase com
 * o e-mail do cadastro), com o lote e o link "Ver oferta original na Superbid"
 * como no Step2Confirm de Veículos. Ações: Voltar + WhatsApp (quando configurado).
 *
 * @author César Ismael Pereira da Costa
 */

import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { Button } from "@/components/ui/button";
import { ButtonWhatsApp } from "@/features/financial-hub/components/layout/ButtonWhatsApp";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import { useTheme } from "@/design-system/sbx-design-system-9f1c03/components/ThemeProvider";
import type { FlowWizardData } from "@/features/financial-hub/components/shared/flowcredi/flowcredi.types";
import type { ConsentConfig, GatewayConsult, Offer } from "@/features/financial-hub/components/shared/types";

const getSuperbidUrl = (offerData: Partial<Offer> | undefined) => {
  if (!offerData?.offer_id) return "#";
  const slug = (offerData.offer_description || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `https://www.superbid.net/oferta/${slug}-${offerData.offer_id}`;
};

export function Step4Confirm() {
  const { state, update, goTo } = useWizard<FlowWizardData>();
  const { resolvedTheme } = useTheme();
  const nightMode = resolvedTheme === "dark";
  const data = state.data ?? {};
  const offer = data.offer;
  const offerDescText = offer?.offer_description ? offer.offer_description.replace(/[.,]+$/, "") : "";
  const loteSubIndex = offer?.lote_index || offer?.lote_numero || offer?.lot_number || "1";

  // Volta ao início (não ao step de dados, para não reenviar a solicitação)
  const handleBack = () => {
    update({ data: { ...data, simulation_id: null } });
    goTo(1);
  };

  return (
    <div className="w-full space-y-4 animate-in fade-in duration-300">
      {/* Cabeçalho da oferta (mesmo padrão do Step1Simulation) */}
      {offer && (
        <div className="-mt-3 flex items-start gap-4">
          <div className="space-y-0.5 flex-1 w-0 min-w-0">
            <p className="text-[clamp(10px,3vw,12px)] sm:text-xs text-neutral-600 dark:text-neutral-400 truncate pt-0.5 w-full block" title={offerDescText}>
              {offerDescText}
            </p>
            <div className="flex items-center pt-0.5">
              <p className="text-sm text-neutral-600 dark:text-neutral-400 truncate">
                Lote {loteSubIndex} •{" "}
                <strong className="text-neutral-900 dark:text-neutral-100 font-bold mr-2">
                  {BRL(Number(offer.offer_value ?? 0))}
                </strong>
              </p>
              <a
                href={getSuperbidUrl(offer)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors flex items-center ml-1"
                title="Ver oferta original na Superbid"
              >
                <ExternalLink size={18} strokeWidth={1.5} />
              </a>
            </div>
          </div>
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
            onClick={handleBack}
            className="w-full sm:w-auto rounded-none text-[#2246A7] hover:bg-[#E7F2FD] dark:hover:bg-neutral-800 hover:text-[#2246A7] font-medium transition-colors"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Voltar
          </Button>

          <div className="w-full sm:w-auto flex-1 flex justify-end">
            <ButtonWhatsApp
              productName="Financiamento Imobiliário"
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
