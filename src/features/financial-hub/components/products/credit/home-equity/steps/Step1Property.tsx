/**
 * @fileoverview Step 1 — Seu imóvel (Home Equity · FlowCredi)
 * @path src/features/financial-hub/components/products/credit/home-equity/steps/Step1Property.tsx
 *
 * Dados do imóvel em garantia, informados pelo cliente (não há oferta da Superbid):
 * tipo, estado, cidade, valor de mercado, se está quitado e o saldo devedor.
 * Ficam em `data.flowInputs` (enviados inteiros nas chamadas ao gateway).
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { FlowInputs, FlowWizardData } from "@/features/financial-hub/components/shared/flowcredi/flowcredi.types";
import { CityInput } from "../CityInput";
import { PROPERTY_TYPES, UF_LIST, inputClass, labelClass, digitsToMoney, maxCreditOf } from "../home-equity.types";

const selectItemClass =
  "rounded-none data-[highlighted]:bg-neutral-100 dark:data-[highlighted]:bg-neutral-800 data-[highlighted]:text-neutral-900 dark:data-[highlighted]:text-neutral-100 cursor-pointer";

export function Step1Property() {
  const { state, update } = useWizard<FlowWizardData>();
  const data = state?.data ?? {};
  const rules = data.rules ?? {};
  const maxPct = Number(rules.max_loan_percentage ?? 60);
  const saved: Partial<FlowInputs> = data.flowInputs ?? {};

  const [type, setType] = useState<string>(saved.property_type ?? "");
  const [uf, setUf] = useState<string>(saved.property_state ?? "");
  const [city, setCity] = useState<string>(saved.property_city ?? "");
  const [value, setValue] = useState<number>(saved.property_value ?? 0);
  const [paid, setPaid] = useState<boolean | null>(saved.property_paid ?? null);
  const [balance, setBalance] = useState<number>(saved.outstanding_balance ?? 0);

  const maxCredit = maxCreditOf(value, paid ? 0 : balance, maxPct);
  const valid =
    !!type && !!uf && city.trim().length >= 2 && value > 0 && paid !== null && (paid || balance >= 0) && maxCredit > 0;

  const handleContinue = () => {
    if (!valid) return;
    update({
      meta: { ...state.meta, step: Number(state.meta?.step ?? 1) + 1 },
      data: {
        ...data,
        flowProduct: "home_equity",
        flowInputs: {
          ...saved,
          property_type: type,
          property_state: uf,
          property_city: city.trim().replace(/\s+/g, " "),
          property_value: value,
          property_paid: paid === true,
          outstanding_balance: paid ? 0 : balance,
        },
      },
    });
  };

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-none p-4 sm:p-5 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-3">
          {/* Tipo */}
          <div className="space-y-1">
            <Label className={labelClass}>Tipo do imóvel</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className={inputClass}>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-neutral-200 dark:border-neutral-800">
                {PROPERTY_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className={selectItemClass}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Valor */}
          <div className="space-y-1">
            <Label htmlFor="he-value" className={labelClass}>
              Valor de mercado do imóvel
            </Label>
            <Input
              id="he-value"
              autoComplete="off"
              inputMode="numeric"
              placeholder="R$ 0,00"
              value={value ? BRL(value) : ""}
              onChange={(e) => setValue(digitsToMoney(e.target.value))}
              className={inputClass}
            />
          </div>

          {/* Estado */}
          <div className="space-y-1">
            <Label className={labelClass}>Estado do imóvel</Label>
            <Select value={uf} onValueChange={(v) => { if (v !== uf) setCity(""); setUf(v); }}>
              <SelectTrigger className={inputClass}>
                <SelectValue placeholder="Selecione o estado" />
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

          {/* Cidade */}
          <div className="space-y-1">
            <Label htmlFor="he-city" className={labelClass}>
              Cidade do imóvel
            </Label>
            <CityInput uf={uf} value={city} onChange={setCity} className={inputClass} />
          </div>

          {/* Quitado */}
          <div className="space-y-1">
            <Label className={labelClass}>O imóvel está quitado?</Label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: true, l: "Sim" },
                { v: false, l: "Não" },
              ].map((o) => (
                <button
                  key={o.l}
                  type="button"
                  onClick={() => setPaid(o.v)}
                  className={`h-10 border rounded-none text-sm font-semibold transition-colors ${
                    paid === o.v
                      ? "border-[#2246A7] bg-[#EEF3FC] text-[#2246A7] dark:bg-neutral-800 dark:text-blue-400"
                      : "border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700"
                  }`}
                >
                  {o.l}
                </button>
              ))}
            </div>
          </div>

          {/* Saldo devedor */}
          {paid === false && (
            <div className="space-y-1">
              <Label htmlFor="he-balance" className={labelClass}>
                Saldo devedor
              </Label>
              <Input
                id="he-balance"
                inputMode="numeric"
                placeholder="R$ 0,00"
                value={balance ? BRL(balance) : ""}
                onChange={(e) => setBalance(digitsToMoney(e.target.value))}
                className={inputClass}
              />
            </div>
          )}
        </div>

        {value > 0 && paid !== null && (
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            {maxCredit > 0 ? (
              <>
                Crédito de até <strong className="text-neutral-900 dark:text-neutral-100">{BRL(maxCredit)}</strong> · {maxPct}%
                do imóvel{paid ? "" : " menos o saldo devedor"}
              </>
            ) : (
              "O saldo devedor não permite crédito com este imóvel em garantia."
            )}
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
