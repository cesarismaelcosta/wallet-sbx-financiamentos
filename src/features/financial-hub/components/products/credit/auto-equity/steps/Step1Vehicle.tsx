/**
 * @fileoverview Step 1 — Seu veículo (Car Equity · FlowCredi)
 * @path src/features/financial-hub/components/products/credit/auto-equity/steps/Step1Vehicle.tsx
 *
 * Veículo em garantia, digitado pelo cliente: placa, UF de licenciamento, ano de fabricação,
 * valor e situação (no nome do cliente, quitado). Elegibilidade (ano mínimo, valor mínimo,
 * UFs aceitas) vem de `rules`. Ficam em `data.flowInputs`.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { FlowInputs, FlowWizardData } from "@/features/financial-hub/components/shared/flowcredi/flowcredi.types";
import { UF_LIST, PLATE_RE, inputClass, labelClass, selectItemClass, vehicleEligibility, digitsToMoney } from "../auto-equity.types";

const YEAR_NOW = new Date().getFullYear();
const yearsFrom = (min: number) => Array.from({ length: YEAR_NOW + 1 - min + 1 }, (_, i) => String(YEAR_NOW + 1 - i));

export function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean) => void }) {
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

export function Step1Vehicle() {
  const { state, update } = useWizard<FlowWizardData>();
  const data = state?.data ?? {};
  const saved: Partial<FlowInputs> = data.flowInputs ?? {};
  const elig = vehicleEligibility(data.rules);
  const states = elig.states ?? UF_LIST;
  const years = yearsFrom(elig.minYear ?? 1950);

  const [plate, setPlate] = useState<string>(saved.vehicle_plate ?? "");
  const [uf, setUf] = useState<string>(states.includes(saved.vehicle_state ?? "") ? (saved.vehicle_state as string) : "");
  const [year, setYear] = useState<string>(years.includes(saved.vehicle_year ?? "") ? (saved.vehicle_year as string) : "");
  const [vehicleValue, setVehicleValue] = useState<number>(saved.vehicle_value ?? 0);
  const [owner, setOwner] = useState<boolean | null>(saved.vehicle_owner ?? null);
  const [paid, setPaid] = useState<boolean | null>(saved.vehicle_paid ?? null);

  const valid =
    PLATE_RE.test(plate) &&
    states.includes(uf) &&
    years.includes(year) &&
    vehicleValue > 0 &&
    vehicleValue >= (elig.minValue ?? 0) &&
    owner !== null &&
    paid !== null;

  const handleContinue = () => {
    if (!valid) return;
    update({
      meta: { ...state.meta, step: Number(state.meta?.step ?? 1) + 1 },
      data: {
        ...data,
        flowProduct: "auto_equity",
        flowInputs: {
          ...saved,
          vehicle_plate: plate,
          vehicle_state: uf,
          vehicle_year: year,
          vehicle_value: vehicleValue,
          vehicle_owner: owner === true,
          vehicle_paid: paid === true,
        },
      },
    });
  };

  const field = (id: string, label: string, value: string, onChange: (v: string) => void, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div className="space-y-1">
      <Label htmlFor={id} className={labelClass}>
        {label}
      </Label>
      <Input id={id} autoComplete="off" value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} {...extra} />
    </div>
  );

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-none p-4 sm:p-5 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-3">
          {field("ae-plate", "Placa", plate, (v) => setPlate(v.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 8)))}

          <div className="space-y-1">
            <Label className={labelClass}>UF de licenciamento{elig.states ? " *" : ""}</Label>
            <Select value={uf} onValueChange={setUf}>
              <SelectTrigger className={inputClass}>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-neutral-200 dark:border-neutral-800 max-h-72">
                {states.map((u) => (
                  <SelectItem key={u} value={u} className={selectItemClass}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className={labelClass}>Ano de fabricação{elig.minYear ? " *" : ""}</Label>
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className={inputClass}>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-neutral-200 dark:border-neutral-800 max-h-72">
                {years.map((y) => (
                  <SelectItem key={y} value={y} className={selectItemClass}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {field("ae-value", `Valor do veículo${elig.minValue ? " *" : ""}`, vehicleValue ? BRL(vehicleValue) : "", (v) => setVehicleValue(digitsToMoney(v)), { inputMode: "numeric" })}

          <div className="space-y-1">
            <Label className={labelClass}>Está no seu nome?</Label>
            <YesNo value={owner} onChange={setOwner} />
          </div>

          <div className="space-y-1">
            <Label className={labelClass}>Está quitado?</Label>
            <YesNo value={paid} onChange={setPaid} />
          </div>
        </div>

        {/* * Elegibilidade do parceiro (rules): só aparece o que estiver configurado */}
        {(elig.minYear || elig.minValue || elig.states) && (
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            * Somente veículos{" "}
            {[
              elig.minYear ? `a partir de ${elig.minYear}` : "",
              elig.minValue ? `com valor mínimo de ${BRL(elig.minValue)}` : "",
              elig.states
                ? `licenciados em ${elig.states.length > 1 ? `${elig.states.slice(0, -1).join(", ")} ou ${elig.states[elig.states.length - 1]}` : elig.states[0]}`
                : "",
            ]
              .filter(Boolean)
              .join(", ")}
            .
          </p>
        )}
      </div>

      <Button
        type="button"
        onClick={handleContinue}
        disabled={!valid}
        className="w-full h-12 rounded-none text-white shadow-xs transition-all active:scale-[0.98] cta-gradient disabled:opacity-50"
      >
        Continuar
      </Button>
    </div>
  );
}
