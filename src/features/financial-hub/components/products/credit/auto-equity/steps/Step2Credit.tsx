/**
 * @fileoverview Step 2 — Seu crédito (Car Equity · FlowCredi)
 * @path src/features/financial-hub/components/products/credit/auto-equity/steps/Step2Credit.tsx
 *
 * Saldo devedor e banco do financiamento (veículo não quitado, informado no Step 1), valor do
 * crédito (até o valor do veículo menos o saldo devedor),
 * parcelas (até 70 meses) e motivo. Não há simulador de auto na FlowCredi: os dados seguem no
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
import { TERMS, PURPOSES, OUTSTANDING_BANKS, OTHER_BANK, inputClass, labelClass, selectItemClass, digitsToMoney, maxCreditOf } from "../auto-equity.types";

const MIN_CREDIT = 1000;

export function Step2Credit() {
  const { state, update, back } = useWizard<FlowWizardData>();
  const data = state?.data ?? {};
  const saved: Partial<FlowInputs> = data.flowInputs ?? {};
  const vehicleValue = saved.vehicle_value ?? 0;
  const paid = saved.vehicle_paid === true;
  const [balanceInput, setBalanceInput] = useState<number>(saved.outstanding_balance ?? 0);
  // Banco do financiamento: da lista ou, em "Outros", digitado pelo cliente
  const savedBank = saved.outstanding_bank ?? "";
  const savedIsListed = !savedBank || OUTSTANDING_BANKS.includes(savedBank);
  const [bank, setBank] = useState<string>(savedIsListed ? savedBank : OTHER_BANK);
  const [otherBank, setOtherBank] = useState<string>(savedIsListed ? "" : savedBank);
  const bankName = bank === OTHER_BANK ? otherBank.trim().replace(/\s+/g, " ") : bank;
  const balance = paid ? 0 : balanceInput;
  const maxCredit = maxCreditOf(vehicleValue, balance);

  const [creditInput, setCreditInput] = useState<number>(saved.requested_value ?? 0);
  const credit = Math.min(creditInput || maxCredit, maxCredit);
  const [term, setTerm] = useState<string>(saved.installments ? String(saved.installments) : "");
  const [purpose, setPurpose] = useState<string>(saved.loan_purpose ?? "");

  const valid =
    vehicleValue > 0 &&
    (paid || bankName.length >= 2) &&
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
          outstanding_balance: balance,
          outstanding_bank: paid ? undefined : bankName,
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
            {[saved.vehicle_plate, saved.vehicle_state, saved.vehicle_year].filter(Boolean).join(" · ")}
          </p>
        </div>

        <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-none p-4 sm:p-5 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 sm:gap-x-6 gap-y-3">
            {!paid && (
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
            )}

            {!paid && (
              <div className="space-y-1">
                <Label className={labelClass}>Banco do financiamento</Label>
                <Select value={bank} onValueChange={setBank}>
                  <SelectTrigger className={inputClass}>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent className="rounded-none border-neutral-200 dark:border-neutral-800 max-h-72">
                    {OUTSTANDING_BANKS.map((b) => (
                      <SelectItem key={b} value={b} className={selectItemClass}>
                        {b}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!paid && bank === OTHER_BANK && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="ae-other-bank" className={labelClass}>
                    Qual banco?
                  </Label>
                  <Input
                    id="ae-other-bank"
                    autoComplete="off"
                    maxLength={100}
                    placeholder="Nome do banco"
                    value={otherBank}
                    onChange={(e) => setOtherBank(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="hidden md:block" />
              </>
            )}

            {/* Valor do crédito */}
            <div className="space-y-1 md:col-span-2">
              <Label className={labelClass}>Valor do crédito *</Label>
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

          {/* * Teto do crédito */}
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
            * Crédito até {BRL(maxCredit)} (valor do veículo menos o saldo devedor)
          </p>
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
