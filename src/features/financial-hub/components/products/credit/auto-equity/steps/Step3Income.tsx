/**
 * @fileoverview Step 3 — Sua renda (Car Equity · FlowCredi)
 * @path src/features/financial-hub/components/products/credit/auto-equity/steps/Step3Income.tsx
 *
 * Renda, situação profissional, profissão e restrição no SPC/Serasa (POST /processos,
 * produto CGA). CEP e endereço vêm do cadastro (data.address); só são pedidos se faltarem.
 * Ficam em `data.flowInputs`.
 */

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { FlowInputs, FlowWizardData } from "@/features/financial-hub/components/shared/flowcredi/flowcredi.types";
import { PROFESSIONAL_STATUS, inputClass, labelClass, selectItemClass, digitsToMoney } from "../auto-equity.types";

/** Endereço do cadastro em uma linha (logradouro, número, complemento, bairro, cidade/UF). */
const addressLine = (a: FlowWizardData["address"] | undefined) =>
  a?.street
    ? [`${a.street}${a.number ? `, ${a.number}` : ""}`, a.complement, a.neighborhood, a.city && `${a.city}${a.state ? `/${a.state}` : ""}`]
        .filter(Boolean)
        .join(" · ")
    : "";

export function Step3Income() {
  const { state, update, back } = useWizard<FlowWizardData>();
  const data = state?.data ?? {};
  const saved: Partial<FlowInputs> = data.flowInputs ?? {};
  const registryZip = String(data.address?.zip_code ?? "").replace(/\D/g, "");
  const registryAddress = addressLine(data.address);
  const hasRegistryAddress = registryZip.length === 8 && !!registryAddress;

  const [income, setIncome] = useState<number>(saved.monthly_income ?? 0);
  const [status, setStatus] = useState<string>(saved.professional_status ?? "");
  const [profession, setProfession] = useState<string>(saved.profession ?? "");
  const [restriction, setRestriction] = useState<boolean | null>(saved.credit_restriction ?? null);
  const [zip, setZip] = useState<string>(saved.customer_zip ?? "");
  const [address, setAddress] = useState<string>(saved.customer_address ?? "");

  const valid =
    income > 0 &&
    !!status &&
    profession.trim().length >= 2 &&
    restriction !== null &&
    (hasRegistryAddress || (zip.replace(/\D/g, "").length === 8 && address.trim().length >= 5));

  const handleContinue = () => {
    if (!valid) return;
    update({
      meta: { ...state.meta, step: Number(state.meta?.step ?? 3) + 1 },
      data: {
        ...data,
        flowInputs: {
          ...saved,
          monthly_income: income,
          professional_status: status,
          profession: profession.trim().replace(/\s+/g, " "),
          credit_restriction: restriction === true,
          customer_zip: hasRegistryAddress ? registryZip : zip.replace(/\D/g, ""),
          customer_address: hasRegistryAddress ? registryAddress : address.trim().replace(/\s+/g, " "),
        },
      },
    });
  };

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      <div className="bg-white dark:bg-neutral-950 space-y-4">
        <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-none p-4 sm:p-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-3">
            <div className="space-y-1">
              <Label htmlFor="ae-income" className={labelClass}>
                Renda bruta familiar
              </Label>
              <Input
                id="ae-income"
                autoComplete="off"
                inputMode="numeric"
                placeholder="R$ 0,00"
                value={income ? BRL(income) : ""}
                onChange={(e) => setIncome(digitsToMoney(e.target.value))}
                className={inputClass}
              />
            </div>

            <div className="space-y-1">
              <Label className={labelClass}>Situação profissional</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className={inputClass}>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent className="rounded-none border-neutral-200 dark:border-neutral-800">
                  {PROFESSIONAL_STATUS.map((s) => (
                    <SelectItem key={s} value={s} className={selectItemClass}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="ae-profession" className={labelClass}>
                Profissão
              </Label>
              <Input
                id="ae-profession"
                autoComplete="off"
                maxLength={80}
                placeholder="Ex.: Engenheira"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="space-y-1">
              <Label className={labelClass}>Tem restrição no SPC/Serasa?</Label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: true, l: "Sim" },
                  { v: false, l: "Não" },
                ].map((o) => (
                  <button
                    key={o.l}
                    type="button"
                    onClick={() => setRestriction(o.v)}
                    className={`h-10 border rounded-none text-sm font-semibold transition-colors ${
                      restriction === o.v
                        ? "border-[#2246A7] bg-[#EEF3FC] text-[#2246A7] dark:bg-neutral-800 dark:text-blue-400"
                        : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700"
                    }`}
                  >
                    {o.l}
                  </button>
                ))}
              </div>
            </div>

            {!hasRegistryAddress && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="ae-zip" className={labelClass}>
                    CEP
                  </Label>
                  <Input
                    id="ae-zip"
                    autoComplete="off"
                    inputMode="numeric"
                    placeholder="00000-000"
                    value={zip}
                    onChange={(e) => {
                      const d = e.target.value.replace(/\D/g, "").slice(0, 8);
                      setZip(d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d);
                    }}
                    className={inputClass}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ae-address" className={labelClass}>
                    Endereço
                  </Label>
                  <Input
                    id="ae-address"
                    autoComplete="off"
                    maxLength={160}
                    placeholder="Rua, número, bairro, cidade/UF"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className={inputClass}
                  />
                </div>
              </>
            )}
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
