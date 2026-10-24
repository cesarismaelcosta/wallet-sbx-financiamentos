/**
 * @fileoverview Step 1 — Seu veículo (Car Equity · FlowCredi)
 * @path src/features/financial-hub/components/products/credit/auto-equity/steps/Step1Vehicle.tsx
 *
 * Identificação do veículo em garantia, digitada pelo cliente: placa, UF de
 * licenciamento, marca, modelo, anos e portas. Valor e situação do veículo ficam
 * no Step 2 (definem o limite do crédito). Ficam em `data.flowInputs`.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { FlowInputs, FlowWizardData } from "@/features/financial-hub/components/shared/flowcredi/flowcredi.types";
import { UF_LIST, DOORS, PLATE_RE, inputClass, labelClass, selectItemClass } from "../auto-equity.types";

const YEAR_NOW = new Date().getFullYear();
const validYear = (y: string) => /^\d{4}$/.test(y) && Number(y) >= 1950 && Number(y) <= YEAR_NOW + 1;

export function Step1Vehicle() {
  const { state, update } = useWizard<FlowWizardData>();
  const data = state?.data ?? {};
  const saved: Partial<FlowInputs> = data.flowInputs ?? {};

  const [plate, setPlate] = useState<string>(saved.vehicle_plate ?? "");
  const [uf, setUf] = useState<string>(saved.vehicle_state ?? "");
  const [brand, setBrand] = useState<string>(saved.vehicle_brand ?? "");
  const [model, setModel] = useState<string>(saved.vehicle_model ?? "");
  const [year, setYear] = useState<string>(saved.vehicle_year ?? "");
  const [modelYear, setModelYear] = useState<string>(saved.vehicle_model_year ?? "");
  const [doors, setDoors] = useState<string>(saved.vehicle_doors ?? "");

  const valid =
    PLATE_RE.test(plate) &&
    !!uf &&
    brand.trim().length >= 2 &&
    model.trim().length >= 1 &&
    validYear(year) &&
    validYear(modelYear) &&
    !!doors;

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
          vehicle_brand: brand.trim().replace(/\s+/g, " "),
          vehicle_model: model.trim().replace(/\s+/g, " "),
          vehicle_year: year,
          vehicle_model_year: modelYear,
          vehicle_doors: doors,
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
            <Label className={labelClass}>UF de licenciamento</Label>
            <Select value={uf} onValueChange={setUf}>
              <SelectTrigger className={inputClass}>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-neutral-200 dark:border-neutral-800 max-h-72">
                {UF_LIST.map((u) => (
                  <SelectItem key={u} value={u} className={selectItemClass}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {field("ae-brand", "Marca", brand, setBrand, { maxLength: 60 })}
          {field("ae-model", "Modelo", model, setModel, { maxLength: 80 })}
        </div>

        <div className="grid grid-cols-3 gap-x-4 sm:gap-x-6 gap-y-3">
          {field("ae-year", "Ano fab.", year, (v) => setYear(v.replace(/\D/g, "").slice(0, 4)), { inputMode: "numeric" })}
          {field("ae-model-year", "Ano modelo", modelYear, (v) => setModelYear(v.replace(/\D/g, "").slice(0, 4)), { inputMode: "numeric" })}

          <div className="space-y-1">
            <Label className={labelClass}>Portas</Label>
            <Select value={doors} onValueChange={setDoors}>
              <SelectTrigger className={inputClass}>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-neutral-200 dark:border-neutral-800">
                {DOORS.map((d) => (
                  <SelectItem key={d} value={d} className={selectItemClass}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
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
