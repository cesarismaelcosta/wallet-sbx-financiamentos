/**
 * @fileoverview Step 2 — Seu crédito (Car Equity · FlowCredi)
 * @path src/features/financial-hub/components/products/credit/auto-equity/steps/Step2Credit.tsx
 *
 * Valor e situação do veículo (no nome do cliente, quitado, saldo devedor), valor do
 * crédito (até o valor do veículo menos o saldo devedor), parcelas (lista fechada do
 * /auto/lead) e motivo. Não há simulador de auto na FlowCredi: os dados seguem no
 * lead. Ficam em `data.flowInputs`.
 */

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SliderCustomizado } from "@/features/financial-hub/components/shared/SliderCustomizado";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { FlowInputs, FlowWizardData } from "@/features/financial-hub/components/shared/flowcredi/flowcredi.types";
import { TERMS, PURPOSES, inputClass, labelClass, selectItemClass, digitsToMoney, maxCreditOf } from "../auto-equity.types";

const MIN_CREDIT = 1000;

function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {[
        { v: true, l: "Sim" },
        { v: false, l: "Não" },
      ].map((o) => (
        <button
          key={o.l}
          type="button"
          onClick={() => onChange(o.v)}
          className={`h-10 border rounded-none text-sm font-semibold transition-colors ${
            value === o.v
              ? "border-[#2246A7] bg-[#EEF3FC] text-[#2246A7] dark:bg-neutral-800 dark:text-blue-400"
              : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700"
          }`}
        >
          {o.l}
        </button>
      ))}
    </div>
  );
}

export function Step2Credit() {
  const { state, update, back } = useWizard<FlowWizardData>();
  const data = state?.data ?? {};
  const saved: Partial<FlowInputs> = data.flowInputs ?? {};
  const [vehicleValue, setVehicleValue] = useState<number>(saved.vehicle_value ?? 0);
  const [owner, setOwner] = useState<boolean | null>(saved.vehicle_owner ?? null);
  const [paid, setPaid] = useState<boolean | null>(saved.vehicle_paid ?? null);
  const [balanceInput, setBalanceInput] = useState<number>(saved.outstanding_balance ?? 0);
  const balance = paid ? 0 : balanceInput;
  const maxCredit = maxCreditOf(vehicleValue, balance);

  const [creditInput, setCreditInput] = useState<number>(saved.requested_value ?? 0);
  const credit = Math.min(creditInput || maxCredit, maxCredit);
  const [term, setTerm] = useState<string>(saved.installments ? String(saved.installments) : "");
  const [purpose, setPurpose] = useState<string>(saved.loan_purpose ?? "");

  const valid =
    vehicleValue > 0 &&
    owner !== null &&
    paid !== null &&
    maxCredit > 0 &&
    credit >= Math.min(MIN_CREDIT, maxCredit) &&
    !!term &&
    !!purpose;

  const handleContinue = () => {
    if (!valid) return;
    update({
      meta: { ...state.meta, step: Number(state.meta?.step ?? 2) + 1 },
      data: {
        ...data,
        flowInputs: {
          ...saved,
          vehicle_value: vehicleValue,
          vehicle_owner: owner === true,
          vehicle_paid: paid === true,
          outstanding_balance: balance,
          requested_value: credit,
          installments: Number(term),
          loan_purpose: purpose,
        },
      },
    });
  };

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      <div className="bg-white dark:bg-neutral-950 space-y-4">
        {/* Veículo em garantia */}
        <div className="-mt-3 min-w-0">
          <p className="text-sm text-neutral-600 dark:text-neutral-400 truncate">
            {saved.vehicle_brand} {saved.vehicle_model} · {saved.vehicle_year}/{saved.vehicle_model_year} · {saved.vehicle_plate}
          </p>
        </div>

        <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-none p-4 sm:p-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-3">
            {/* Valor do veículo */}
            <div className="space-y-1">
              <Label htmlFor="ae-value" className={labelClass}>
                Valor do veículo
              </Label>
              <Input
                id="ae-value"
                autoComplete="off"
                inputMode="numeric"
                value={vehicleValue ? BRL(vehicleValue) : ""}
                onChange={(e) => setVehicleValue(digitsToMoney(e.target.value))}
                className={inputClass}
              />
            </div>

            <div className="space-y-1">
              <Label className={labelClass}>Está no seu nome?</Label>
              <YesNo value={owner} onChange={setOwner} />
            </div>

            <div className="space-y-1">
              <Label className={labelClass}>Está quitado?</Label>
              <YesNo value={paid} onChange={setPaid} />
            </div>

            {paid === false ? (
              <div className="space-y-1">
                <Label htmlFor="ae-balance" className={labelClass}>
                  Saldo devedor
                </Label>
                <Input
                  id="ae-balance"
                  autoComplete="off"
                  inputMode="numeric"
                  value={balanceInput ? BRL(balanceInput) : ""}
                  onChange={(e) => setBalanceInput(digitsToMoney(e.target.value))}
                  className={inputClass}
                />
              </div>
            ) : (
              <div className="hidden md:block" />
            )}

            {/* Valor do crédito */}
            {vehicleValue > 0 && paid !== null && (
            <div className="space-y-1 md:col-span-2">
              <Label className={labelClass}>Valor do crédito</Label>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                Até <strong className="text-neutral-900 dark:text-neutral-100">{BRL(maxCredit)}</strong>
                {balance > 0 ? " · valor do veículo menos o saldo devedor" : ""}
              </p>
              <Input
                autoComplete="off"
                inputMode="numeric"
                value={BRL(credit)}
                onChange={(e) => setCreditInput(Math.min(digitsToMoney(e.target.value), maxCredit))}
                onBlur={() => setCreditInput((v) => Math.min(Math.max(Math.round(v || maxCredit), MIN_CREDIT), maxCredit))}
                className={inputClass}
              />
              {maxCredit > MIN_CREDIT && (
                <div className="pt-1 px-1">
                  <SliderCustomizado
                    value={credit}
                    onValueChange={(v: number) => setCreditInput(v)}
                    min={MIN_CREDIT}
                    max={maxCredit}
                    step={100}
                    isCurrency
                  />
                </div>
              )}
              {maxCredit <= 0 && (
                <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  O saldo devedor não permite crédito com este veículo em garantia.
                </p>
              )}
            </div>
            )}

            {/* Parcelas */}
            <div className="space-y-1">
              <Label className={labelClass}>Parcelas</Label>
              <Select value={term} onValueChange={setTerm}>
                <SelectTrigger className={inputClass}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-neutral-200 dark:border-neutral-800 max-h-72">
                  {TERMS.map((t) => (
                    <SelectItem key={t} value={String(t)} className={selectItemClass}>
                      {t} meses
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Motivo */}
            <div className="space-y-1">
              <Label className={labelClass}>Motivo do crédito</Label>
              <Select value={purpose} onValueChange={setPurpose}>
                <SelectTrigger className={inputClass}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-neutral-200 dark:border-neutral-800">
                  {PURPOSES.map((p) => (
                    <SelectItem key={p} value={p} className={selectItemClass}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4">
          <Button
            type="button"
            variant="ghost"
            onClick={back}
            className="w-full sm:w-auto rounded-none text-[#2246A7] hover:bg-[#E7F2FD] dark:hover:bg-neutral-800 hover:text-[#2246A7] font-medium"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Button>
          <Button
            type="button"
            onClick={handleContinue}
            disabled={!valid}
            className="h-12 w-full sm:w-auto flex-1 rounded-none text-white shadow-xs transition-all active:scale-[0.98] cta-gradient disabled:opacity-50"
          >
            Continuar
          </Button>
        </div>
      </div>
    </div>
  );
}
