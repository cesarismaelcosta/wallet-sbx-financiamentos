/**
 * @fileoverview Step 3 — Seus dados e aceites (Financiamento Imobiliário · FlowCredi)
 * @path src/features/financial-hub/components/products/flowcredi/FlowLeadStep.tsx
 *
 * Tudo o que o lead da FlowCredi pede já está no cadastro (nome, CPF,
 * nascimento, celular, e-mail — somente leitura) ou veio da simulação (renda,
 * valor a financiar). Aqui o cliente revisa, marca os aceites da FlowCredi
 * (consent_configs) e envia a proposta (step SUBMIT_LEAD). O gateway recalcula
 * a condição escolhida e confere os aceites obrigatórios antes de enviar.
 */

import { useMemo, useRef, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { DynamicConsents } from "@/features/financial-hub/components/layout/DynamicConsents";
import { setFastPathState } from "@/features/financial-hub/core/services/fastPathCache";
import { callSimulation } from "@/features/financial-hub/core/services/gateway";
import { useSafeCall } from "@/features/financial-hub/core/hooks/useSafeCall";
import { termLabel, FlowInputs, FlowWizardData } from "./flowcredi.types";
import { STATUS } from "@/features/financial-hub/components/shared/types";
import type { ConsentConfig, GatewayConsult, Offer } from "@/features/financial-hub/components/shared/types";

const formatBirthDateBR = (dateStr?: string) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(d);
};
const formatCpf = (v?: string) =>
  (v || "").replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
const formatPhone = (v?: string) =>
  (v || "")
    .replace(/\D/g, "")
    .replace(/^55(?=\d{10,11}$)/, "")
    .replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3");

const Field = ({ label, value }: { label: string; value?: string }) => (
  <div className="min-w-0">
    <p className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
      {label}
    </p>
    <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mt-0.5 break-words">
      {value || "—"}
    </p>
  </div>
);

export function FlowLeadStep() {
  const { state, update, back } = useWizard<FlowWizardData>();
  const { execute } = useSafeCall();
  const data = state.data ?? {};
  const entity = data; // o wizard nasce com a entidade do cadastro (initialData)
  const consentConfigs = data.consent_configs || [];
  const inputs = data.flowInputs as FlowInputs | undefined; // completo ao chegar em "Seus dados"
  const propertyValue = Number(data.offer?.offer_value ?? 0);

  const [accepted, setAccepted] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const sending = useRef(false);

  // Validação dos aceites (mesmo padrão de Veículos)
  const consentsValid = useMemo(() => {
    const configs = data.consent_configs || [];
    return configs.filter((c: ConsentConfig) => c.is_required).every((c: ConsentConfig) => accepted[c.id] === true);
  }, [data.consent_configs, accepted]);

  if (!inputs) {
    return (
      <div className="text-center py-10 space-y-4">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Faça a simulação para continuar.
        </p>
        <Button
          variant="ghost"
          onClick={back}
          className="rounded-none text-[#2246A7] hover:bg-[#E7F2FD] dark:hover:bg-neutral-800"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar à simulação
        </Button>
      </div>
    );
  }

  const handleSend = async () => {
    if (!consentsValid || loading || sending.current) return;
    sending.current = true;
    setLoading(true);
    try {
      const consents = consentConfigs
        .filter((c: ConsentConfig) => accepted[c.id])
        .map((c: ConsentConfig) => ({
          consent_id: c.id,
          acceptedConsents: true,
          acceptedConsents_at: new Date().toISOString(),
          legal_text_snapshot: { template_text: c.template_text, links: c.links },
        }));

      const urlParams = new URLSearchParams(window.location.search);
      const payload = {
        action: "SIMULATE",
        visit_id: urlParams.get("visit_id") || data.visit_id,
        visit_update_id: urlParams.get("visit_update_id") || data.visit_update_id,
        offer_id: data.offer?.offer_id,
        simulation_id: data.simulation_id,
        product_id: data.product_id,
        partner_id: data.partner_id,
        step: "SUBMIT_LEAD",
        // mesmos inputs da simulação (imóveis: valor/prazo/renda; home equity: + dados do imóvel)
        simulation_details: { ...inputs },
        consents,
      };
      const result = await execute(() => callSimulation(payload, "SUBMIT_LEAD"));
      if (result?.state) setFastPathState(result.state);

      // Lead · Enviado, ou Lead · Pendente envio enquanto o envio à FlowCredi está desligado
      if (result?.success && ([STATUS.ENVIADO, STATUS.PENDENTE_ENVIO] as (number | null | undefined)[]).includes(result?.consults?.[0]?.status_id)) {
        update({
          meta: { ...state.meta, step: Number(state.meta?.step ?? 0) + 1 },
          data: {
            ...data,
            acceptedConsentIds: Object.keys(accepted).filter((k) => accepted[k]),
            simulationResult: result,
            simulation_id: result.simulation_id ?? data.simulation_id,
            simulation_update_id: result.simulation_update_id ?? data.simulation_update_id,
            flowLeadSent: true,
          },
        });
      } else {
        window.dispatchEvent(
          new CustomEvent("app-error", {
            detail: new Error(result?.mensagem || "Não foi possível enviar a solicitação."),
          }),
        );
      }
    } catch (error) {
      window.dispatchEvent(new CustomEvent("app-error", { detail: error }));
    } finally {
      setLoading(false);
      sending.current = false;
    }
  };

  return (
    <div className="flex flex-col gap-4 animate-in fade-in duration-500">
      {/* desktop: linha 1 CPF · Nome; linha 2 Celular · Nascimento · E-mail. CPF alinhado com
          Celular e Nome com Nascimento; nome e e-mail ficam à direita, com o espaço livre. celular: um campo por linha */}
      <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-[auto_auto_1fr] border border-neutral-200 dark:border-neutral-800 p-4">
        <Field label="CPF" value={formatCpf(entity?.document)} />
        <div className="sm:col-span-2 min-w-0">
          <Field label="Nome completo" value={entity?.name} />
        </div>
        <Field label="Celular" value={formatPhone(entity?.phone)} />
        <Field label="Nascimento" value={formatBirthDateBR(entity?.birth_date)} />
        <Field label="E-mail" value={entity?.email} />
      </div>

      <div
        className={`transition-opacity duration-200 ${loading ? "pointer-events-none opacity-50" : "opacity-100"}`}
      >
        <DynamicConsents configs={consentConfigs} value={accepted} onChange={setAccepted} />
      </div>

      <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4">
        <Button
          type="button"
          variant="ghost"
          onClick={back}
          disabled={loading}
          className="w-full sm:w-auto rounded-none text-[#2246A7] hover:bg-[#E7F2FD] dark:hover:bg-neutral-800 hover:text-[#2246A7] font-medium"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={handleSend}
          disabled={!consentsValid || loading}
          className="h-12 w-full sm:w-auto flex-1 rounded-none cta-gradient text-white font-bold shadow-xs transition-all active:scale-[0.98] disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin mr-2 h-4 w-4" /> Enviando...
            </>
          ) : (
            "Enviar solicitação"
          )}
        </Button>
      </div>
    </div>
  );
}
