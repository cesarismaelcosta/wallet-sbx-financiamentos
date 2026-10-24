/**
 * @fileoverview Step 2 — Simulação (Home Equity · FlowCredi)
 * @path src/features/financial-hub/components/products/credit/home-equity/steps/Step2Simulation.tsx
 *
 * Valor do crédito (até 60% do imóvel menos o saldo devedor), prazo (até 240 meses,
 * limitado pela idade: o contrato termina até 80 anos e 6 meses) e renda bruta familiar.
 * Envia todos os inputs (imóvel + crédito) ao gateway (step EXECUTE_SIMULATION) e
 * avança para "Ofertas disponíveis" (FlowOffersStep), como em imóveis.
 */

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
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
import { inputClass, labelClass, digitsToMoney, maxCreditOf } from "../home-equity.types";

const MIN_CREDIT = 1000; // passo do slider (não é regra da FlowCredi)

export function Step2Simulation() {
  const { state, update, back } = useWizard<FlowWizardData>();
  const { execute } = useSafeCall();

  const data = state?.data ?? {};
  const rules = data.rules ?? {};
  const saved = (data.flowInputs ?? {}) as FlowInputs;
  const propertyValue = Number(saved.property_value ?? 0);
  const balance = saved.property_paid ? 0 : Number(saved.outstanding_balance ?? 0);

  const maxPct = Number(rules.max_loan_percentage ?? 60);
  const maxCredit = Math.max(MIN_CREDIT, maxCreditOf(propertyValue, balance, maxPct));
  const termStep = Number(rules.term_step_months ?? 12);
  const ruleMaxTerm = Number(rules.max_term_months ?? 240);
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
  const maxTerm = Math.max(termStep, Math.min(ruleMaxTerm, ageMaxTerm));

  const [credit, setCredit] = useState<number>(Math.min(saved.requested_value ?? maxCredit, maxCredit));
  const [term, setTerm] = useState<number>(Math.min(saved.installments ?? Number(rules.default_term_months ?? maxTerm), maxTerm));
  const [income, setIncome] = useState<number>(saved.monthly_income ?? 0);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("Iniciando simulação...");
  const sending = useRef(false);

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

  useEffect(() => {
    setCredit((v) => Math.min(Math.max(v, MIN_CREDIT), maxCredit));
  }, [maxCredit]);
  useEffect(() => {
    setTerm((t) => Math.min(Math.max(t, termStep), maxTerm));
  }, [termStep, maxTerm]);

  const current: FlowInputs = { ...saved, requested_value: credit, installments: term, monthly_income: income };
  const canSimulate = propertyValue > 0 && credit >= MIN_CREDIT && credit <= maxCredit && income > 0 && !loading;

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
        simulation_id: data.simulation_id,
        product_id: data.product_id,
        partner_id: data.partner_id,
        step: "EXECUTE_SIMULATION",
        simulation_details: { ...current },
      };
      const result = await execute(() => callSimulation(payload, "EXECUTE_SIMULATION"));
      if (result?.state) setFastPathState(result.state);
      update({
        meta: { ...state.meta, step: Number(state.meta?.step ?? 2) + 1 },
        data: {
          ...data,
          flowProduct: "home_equity",
          flowInputs: current,
          flowSimulatedWith: current,
          flowResults: (result?.consults ?? []) as FlowConsult[],
          simulationResult: result,
          simulation_id: result?.simulation_id ?? data.simulation_id,
          simulation_update_id: result?.simulation_update_id ?? data.simulation_update_id,
          ...(result?.state && { rules: result.state.rules }),
        },
      });
    } catch (error) {
      window.dispatchEvent(new CustomEvent("app-error", { detail: error }));
    } finally {
      setLoading(false);
      sending.current = false;
    }
  };

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      <div className="bg-white dark:bg-neutral-950 space-y-4">
        {/* Imóvel em garantia */}
        <div className="-mt-3 space-y-0.5 min-w-0">
          <p className="text-xs text-neutral-600 dark:text-neutral-400 truncate">
            {saved.property_type} · {saved.property_city}/{saved.property_state}
          </p>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 truncate">
            Imóvel de <strong className="text-neutral-900 dark:text-neutral-100 font-bold">{BRL(propertyValue)}</strong>
            {balance > 0 && <> · saldo devedor {BRL(balance)}</>}
          </p>
        </div>

        <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-none p-4 sm:p-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-3">
            {/* Valor do crédito */}
            <div className="space-y-1">
              <Label className={labelClass}>Valor do crédito</Label>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Até <strong className="text-neutral-900 dark:text-neutral-100">{BRL(maxCredit)}</strong> · {maxPct}% do imóvel
                {balance > 0 ? " menos o saldo devedor" : ""}
              </p>
              <Input
                disabled={loading}
                inputMode="numeric"
                value={BRL(credit)}
                onChange={(e) => setCredit(Math.min(digitsToMoney(e.target.value), maxCredit))}
                onBlur={() => setCredit((v) => Math.min(Math.max(Math.round(v), MIN_CREDIT), maxCredit))}
                className={inputClass}
              />
              <div className="pt-1 px-1">
                <SliderCustomizado
                  value={credit}
                  onValueChange={(v: number) => setCredit(v)}
                  min={MIN_CREDIT}
                  max={maxCredit}
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
                  loading ? "bg-neutral-100 dark:bg-neutral-900 text-neutral-500" : "bg-white dark:bg-neutral-800 text-brand-accent"
                }`}
              >
                {term} meses{" "}
                <span className="ml-2 font-normal text-neutral-500 dark:text-neutral-400">({termLabel(term)})</span>
              </div>
              <div className="pt-1 px-1">
                <SliderCustomizado
                  value={term}
                  onValueChange={(v: number) => setTerm(v)}
                  min={termStep}
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
            <Label htmlFor="he-income" className={labelClass}>
              Renda bruta familiar
            </Label>
            <Input
              id="he-income"
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
            onClick={handleSimulate}
            disabled={!canSimulate}
            className="h-12 w-full sm:w-auto flex-1 rounded-none text-white shadow-xs transition-all active:scale-[0.98] cta-gradient disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="flex items-center gap-2 animate-pulse">
                <Loader2 className="h-4 w-4 animate-spin" /> {loadingMessage}
              </span>
            ) : (
              "Simular crédito"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
