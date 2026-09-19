/**
 * @fileoverview Passo 2: Dados Pessoais / Renda (Jornada Auto Equity)
 * @path src/features/financial-hub/components/products/credit/auto-equity/steps/Step2PersonalData.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO: ZERO-RADIUS GOVERNANCE & NEUTRAL PURITY
 * =========================================================================
 * [MECÂNICA ARQUITETURAL]:
 * - Engine: Renderizado pela WizardEngine.
 * - Estado: Consome WizardProvider.
 * - Conformidade: Zero-Radius Strict Governance & Neutral Purity (Sem tokens de marca corrompidos).
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider"; 
import { personalIncomeSchema, type PersonalIncomeData } from "../schemas";
import { BRL } from "@/features/financial-hub/components/shared/formatters";

// Classe padronizada para unificar tamanho, fonte e zero-radius estrito
const commonInputClass = "h-11 text-sm rounded-none border-neutral-200 bg-white transition-all duration-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900";

// Labels para o mapeamento visual dos Selects
const LABELS: Record<string, string> = {
  CLT: "CLT", PJ: "PJ", AUTONOMOUS: "Autônomo", RETIRED: "Aposentado",
  PUBLIC_SERVANT: "Servidor público", ENTREPRENEUR: "Empresário",
  LESS_THAN_SIX_MONTHS: "Menos de 6 meses", SIX_TO_TWELVE_MONTHS: "6 a 12 meses",
  ONE_TO_THREE_YEARS: "1 a 3 anos", MORE_THAN_THREE_YEARS: "Mais de 3 anos"
};

const maskMoney = (v: string) => {
  const n = Number(v.replace(/\D/g, "")) / 100;
  return Number.isFinite(n) ? n : 0;
};

export function Step2PersonalData() {
  // Acedemos ao motor genérico
  const { state, next, back, update } = useWizard<any>();

  // Acedemos aos dados guardados em state.data.personalIncome
  const initialData = state.data?.personalIncome;

  const form = useForm<PersonalIncomeData>({
    resolver: zodResolver(personalIncomeSchema),
    defaultValues: initialData || {
      monthlyIncome: 0,
      professionalStatus: undefined,
      timeOfEmployment: undefined,
    },
  });

  const income = form.watch("monthlyIncome");
  const err = form.formState.errors;

  const onSubmit = (data: PersonalIncomeData) => {
    // ATUALIZAÇÃO NO MOTOR:
    // Mantemos o que já existia em state.data e adicionamos/sobrescrevemos 'personalIncome'
    update({ 
      data: { 
        ...state.data, 
        personalIncome: data 
      } 
    });
    next();
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <section className="rounded-none border border-neutral-200 bg-surface-alt p-5 sm:p-6 shadow-xs space-y-4">
        <header className="flex items-center gap-2 text-sm font-bold text-neutral-900 uppercase tracking-wider">
          <Wallet className="h-4 w-4 text-neutral-900" strokeWidth={1.5} /> Sua renda
        </header>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Renda Mensal */}
          <div className="sm:col-span-2 space-y-1.5">
            <Label htmlFor="income" className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">Renda mensal</Label>
            <Input
              id="income"
              placeholder="Sua renda total mensal sem descontos..."
              autoComplete="off"
              className={commonInputClass}
              value={income ? BRL(income) : ""}
              onChange={(e) =>
                form.setValue("monthlyIncome", maskMoney(e.target.value), { shouldValidate: true })
              }
            />
            {err.monthlyIncome && (
              <p className="mt-1 text-xs text-destructive font-medium">{err.monthlyIncome.message}</p>
            )}
          </div>

          {/* Vínculo profissional */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">Vínculo profissional</Label>
            <Select
              value={form.watch("professionalStatus") ?? ""}
              onValueChange={(v) => form.setValue("professionalStatus", v as any, { shouldValidate: true })}
            >
              <SelectTrigger className={commonInputClass}>
                <SelectValue placeholder="Escolher..." />
              </SelectTrigger>
              <SelectContent className="rounded-none border-neutral-200">
                {personalIncomeSchema.shape.professionalStatus.options.map((opt) => (
                  <SelectItem 
                    key={opt} 
                    value={opt}
                    className="rounded-none data-[highlighted]:bg-neutral-100 data-[highlighted]:text-neutral-900 cursor-pointer"
                  >
                    {LABELS[opt] || opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tempo de vínculo */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">Tempo de vínculo</Label>
            <Select
              value={form.watch("timeOfEmployment") ?? ""}
              onValueChange={(v) => form.setValue("timeOfEmployment", v as any, { shouldValidate: true })}
            >
              <SelectTrigger className={commonInputClass}>
                <SelectValue placeholder="Escolher..." />
              </SelectTrigger>
              <SelectContent className="rounded-none border-neutral-200">
                {personalIncomeSchema.shape.timeOfEmployment.options.map((opt) => (
                  <SelectItem 
                    key={opt} 
                    value={opt}
                    className="rounded-none data-[highlighted]:bg-neutral-100 data-[highlighted]:text-neutral-900 cursor-pointer"
                  >
                    {LABELS[opt] || opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Botões de Navegação com Zero-Radius e Neutral Purity */}
      <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4 pt-2">
        <Button 
          type="button" 
          variant="ghost" 
          onClick={back}
          className="w-full sm:w-auto rounded-none text-neutral-900 hover:bg-neutral-100 hover:text-neutral-900 font-medium"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> 
          Voltar
        </Button>
        <Button 
          type="submit" 
          size="lg" 
          className="h-12 w-full sm:w-auto flex-1 rounded-none bg-neutral-900 hover:bg-neutral-800 text-white font-bold shadow-xs transition-all active:scale-[0.98]"
        >
          Continuar
        </Button>
      </div>
    </form>
  );
}