/**
 * @fileoverview Step 1 — Simulação (Financiamento Imobiliário · FlowCredi)
 * @path src/features/financial-hub/components/products/financial/imoveis/steps/Step1Simulation.tsx
 *
 * Simulação SEM aceites: o simulador da FlowCredi só usa valor do imóvel,
 * valor a financiar, prazo, data de nascimento (do cadastro), renda e UF.
 *  - Valor do imóvel: da oferta (somente leitura).
 *  - Valor a financiar / prazo: sliders limitados por `rules`.
 *  - Renda mensal: digitada (também vai no lead do step 3).
 * Com o resultado, avança para o step 2 (FlowOffersStep), como em Veículos.
 * Inputs e resultados ficam no wizard para sobreviver ao "Voltar".
 */

import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SliderCustomizado } from "@/features/financial-hub/components/shared/SliderCustomizado";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { setFastPathState } from "@/features/financial-hub/core/services/fastPathCache";
import { callSimulation } from "@/features/financial-hub/core/services/gateway";
import { useSafeCall } from "@/features/financial-hub/core/hooks/useSafeCall";
import { termLabel, FlowInputs, FlowWizardData, FlowConsult } from "@/features/financial-hub/components/shared/flowcredi/flowcredi.types";
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

const inputClass =
  "h-10 rounded-none bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-brand-accent font-semibold disabled:bg-neutral-100 dark:disabled:bg-neutral-900 disabled:text-neutral-500";
const labelClass =
  "text-[11px] font-medium text-neutral-900 dark:text-neutral-100 uppercase tracking-wider font-sans";
const digitsToMoney = (v: string) => Number(v.replace(/\D/g, "") || "0") / 100;

export function Step1Simulation() {
  const { state, update } = useWizard<FlowWizardData>();
  const { execute } = useSafeCall();

  const data = state?.data ?? {};
  const offer = data.offer;
  const rules = data.rules ?? {};
  const propertyValue = Number(offer?.offer_value ?? 0);

  // Limites (mesmos padrões do gateway quando `rules` não informa)
  const maxPct = Number(rules.max_financing_percentage ?? 80);
  const minLoan = Number(rules.min_financed_amount ?? 50000);
  const maxLoan = Math.max(minLoan, Math.floor((propertyValue * maxPct) / 100 / 1000) * 1000);
  const minTerm = Number(rules.min_term_months ?? 60);
  const ruleMaxTerm = Number(rules.max_term_months ?? 420);
  const termStep = Number(rules.term_step_months ?? 12);
  // Prazo máximo pela idade: o contrato precisa terminar até 80 anos e 6 meses (966 meses).
  const birth = data.birth_date ? new Date(`${String(data.birth_date).slice(0, 10)}T00:00:00Z`) : null;
  const today = new Date();
  const ageMonths =
    birth && !isNaN(birth.getTime())
      ? (today.getUTCFullYear() - birth.getUTCFullYear()) * 12 +
        (today.getUTCMonth() - birth.getUTCMonth()) -
        (today.getUTCDate() < birth.getUTCDate() ? 1 : 0)
      : 0;
  const ageMaxTerm = Math.floor((966 - ageMonths) / termStep) * termStep;
  const maxTerm = Math.max(minTerm, Math.min(ruleMaxTerm, ageMaxTerm));
  const minIncome = Number(rules.min_monthly_income ?? 1000);

  const saved = data.flowInputs as FlowInputs | undefined; // imóveis grava os inputs completos
  const [loan, setLoan] = useState<number>(saved?.requested_value ?? maxLoan);
  const [term, setTerm] = useState<number>(
    Math.min(saved?.installments ?? Number(rules.default_term_months ?? maxTerm), maxTerm),
  );
  const [income, setIncome] = useState<number>(saved?.monthly_income ?? 0);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Iniciando simulação...");
  const sending = useRef(false);

  // Roteiro de loading progressivo (mesmo padrão de Veículos)
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    if (loading) {
      setLoadingMessage("Iniciando simulação...");
      timers.push(setTimeout(() => setLoadingMessage("Consultando bancos..."), 3000));
      timers.push(setTimeout(() => setLoadingMessage("Comparando condições..."), 8000));
      timers.push(setTimeout(() => setLoadingMessage("Finalizando as consultas..."), 15000));
    }
    return () => timers.forEach(clearTimeout);
  }, [loading]);

  // Inicializa valor e prazo quando a oferta chega (mesmo padrão de Veículos):
  // os dados do lote são injetados depois da montagem, então o useState acima
  // nasce sem oferta. Simulação já salva mantém os valores do cliente.
  const defaultTerm = Number(rules.default_term_months ?? maxTerm);
  const initializedOfferIdRef = useRef<unknown>(null);

  useEffect(() => {
    const currentOfferId = offer?.offer_id || offer?.id;

    if (currentOfferId && initializedOfferIdRef.current !== currentOfferId) {
      initializedOfferIdRef.current = currentOfferId;
      if (!saved) {
        setLoan(maxLoan);
        setTerm(Math.min(defaultTerm, maxTerm));
      }
    }
  }, [offer, saved, maxLoan, maxTerm, defaultTerm]);

  // Reajusta o valor a financiar se a oferta/limites mudarem
  useEffect(() => {
    setLoan((v) => Math.min(Math.max(v, minLoan), maxLoan));
  }, [minLoan, maxLoan]);

  // Reajusta o prazo se o limite (regra ou idade) mudar
  useEffect(() => {
    setTerm((t) => Math.min(Math.max(t, minTerm), maxTerm));
  }, [minTerm, maxTerm]);

  const current: FlowInputs = { requested_value: loan, installments: term, monthly_income: income };

  const canSimulate =
    propertyValue > 0 && loan >= minLoan && loan <= maxLoan && income >= minIncome && !loading;

  const handleSimulate = async () => {
    if (!canSimulate || sending.current) return;
    sending.current = true;
    setLoading(true);
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const payload = {
        action: "SIMULATE",
        visit_id: urlParams.get("visit_id") || data.visit_id,
        visit_update_id: urlParams.get("visit_update_id") || data.visit_update_id,
        offer_id: data.offer?.offer_id,
        simulation_id: data.simulation_id,
        product_id: data.product_id,
        partner_id: data.partner_id,
        step: "EXECUTE_SIMULATION",
        simulation_details: {
          requested_value: current.requested_value,
          installments: current.installments,
          monthly_income: current.monthly_income,
        },
      };
      const result = await execute(() => callSimulation(payload, "EXECUTE_SIMULATION"));
      if (result?.state) setFastPathState(result.state);
      update({
        meta: { ...state.meta, step: 2 },
        data: {
          ...data,
          flowInputs: current,
          flowSimulatedWith: current,
          flowResults: (result?.consults ?? []) as FlowConsult[],
          simulationResult: result,
          simulation_id: result?.simulation_id ?? data.simulation_id,
          simulation_update_id: result?.simulation_update_id ?? data.simulation_update_id,
          ...(result?.state && { offer: result.state.offer, rules: result.state.rules }),
        },
      });
    } catch (error) {
      window.dispatchEvent(new CustomEvent("app-error", { detail: error }));
    } finally {
      setLoading(false);
      sending.current = false;
    }
  };

  if (!state?.data || Object.keys(state.data).length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-neutral-400 dark:text-neutral-500">Carregando...</span>
      </div>
    );
  }

  const offerDescText = offer?.offer_description
    ? offer.offer_description.replace(/[.,]+$/, "")
    : "";
  const loteSubIndex = offer?.lote_index || offer?.lote_numero || offer?.lot_number || "1";

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      <div className="bg-white dark:bg-neutral-950 space-y-4">
        {/* Cabeçalho da oferta */}
        <div className="-mt-3 flex items-start gap-4">
          <div className="space-y-0.5 flex-1 w-0 min-w-0">
            <p className="text-[clamp(10px,3vw,12px)] sm:text-xs text-neutral-600 dark:text-neutral-400 truncate pt-0.5 w-full block" title={offerDescText}>
              {offerDescText}
            </p>
            <div className="flex items-center pt-0.5">
              <p className="text-sm text-neutral-600 dark:text-neutral-400 truncate">
                Lote {loteSubIndex} •{" "}
                <strong className="text-neutral-900 dark:text-neutral-100 font-bold mr-2">
                  {BRL(propertyValue)}
                </strong>
              </p>
              {offer && (
                <a
                  href={getSuperbidUrl(offer)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors flex items-center ml-1"
                  title="Ver oferta original na Superbid"
                >
                  <ExternalLink size={18} strokeWidth={1.5} />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Inputs */}
        <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-none p-4 sm:p-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-3">
            {/* Valor a financiar */}
            <div className="space-y-1">
              <Label className={labelClass}>Valor a financiar</Label>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Entrada{" "}
                <strong className="text-neutral-900 dark:text-neutral-100">
                  {BRL(Math.max(0, propertyValue - loan))}
                </strong>{" "}
                · {propertyValue > 0 ? Math.round(((propertyValue - loan) / propertyValue) * 100) : 0}% do imóvel
              </p>
              <Input
                disabled={loading}
                inputMode="numeric"
                value={BRL(loan)}
                onChange={(e) => setLoan(Math.min(digitsToMoney(e.target.value), maxLoan))}
                onBlur={() => setLoan((v) => Math.min(Math.max(Math.round(v), minLoan), maxLoan))}
                className={inputClass}
              />
              <div className="pt-1 px-1">
                <SliderCustomizado
                  value={loan}
                  onValueChange={(v: number) => setLoan(v)}
                  min={minLoan}
                  max={maxLoan}
                  step={1000}
                  isCurrency
                  disabled={loading}
                />
              </div>
            </div>

            {/* Prazo */}
            <div className="space-y-1">
              <Label className={labelClass}>Prazo</Label>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {maxTerm < ruleMaxTerm ? `Máximo para sua idade: ${maxTerm} meses` : `Máximo: ${maxTerm} meses`}
              </p>
              <div
                className={`h-10 flex items-center px-3 border border-neutral-200 dark:border-neutral-700 font-semibold text-sm ${
                  loading
                    ? "bg-neutral-100 dark:bg-neutral-900 text-neutral-500"
                    : "bg-white dark:bg-neutral-800 text-brand-accent"
                }`}
              >
                {term} meses{" "}
                <span className="ml-2 font-normal text-neutral-500 dark:text-neutral-400">
                  ({termLabel(term)})
                </span>
              </div>
              <div className="pt-1 px-1">
                <SliderCustomizado
                  value={term}
                  onValueChange={(v: number) => setTerm(v)}
                  min={minTerm}
                  max={maxTerm}
                  step={termStep}
                  isCurrency
                  disabled={loading}
                />
              </div>
            </div>
          </div>

          {/* Renda */}
          <div className="space-y-1 md:max-w-[calc(50%-1rem)]">
            <Label htmlFor="flow-income" className={labelClass}>
              Renda bruta familiar
            </Label>
            <Input
              id="flow-income"
              autoComplete="off"
              disabled={loading}
              inputMode="numeric"
              placeholder="R$ 0,00"
              value={income ? BRL(income) : ""}
              onChange={(e) => setIncome(digitsToMoney(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>

        <Button
          type="button"
          onClick={handleSimulate}
          disabled={!canSimulate}
          className="w-full h-12 rounded-none text-white shadow-xs transition-all active:scale-[0.98] cta-gradient disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <span className="flex items-center gap-2 animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin" /> {loadingMessage}
            </span>
          ) : (
            "Simular financiamento"
          )}
        </Button>
      </div>
    </div>
  );
}
