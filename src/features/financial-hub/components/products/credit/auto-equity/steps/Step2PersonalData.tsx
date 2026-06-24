/**
 * @fileoverview Passo 1: Elegibilidade (Jornada Auto Equity)
 * * PROPÓSITO:
 * Realizar a validação inicial do cliente antes de prosseguir com a simulação.
 * Este componente orquestra a validação do CPF/E-mail, gestão de consentimentos 
 * (LGPD) e o estado de bloqueio (inelegibilidade).
 * * INTEGRAÇÃO:
 * - Utiliza o `useWizard<any>()` para aceder ao estado global do Motor Genérico.
 * - Lê os dados do utilizador a partir de `state.data` (injetado pelo orquestrador).
 * - Atualiza o fluxo através de `update`, separando navegação (`meta`) de dados (`data`).
 * * INTERDEPENDÊNCIAS:
 * - Engine: `@/components/engine/WizardProvider`
 * - Mock: `@/lib/auto-equity.mock`
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

import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider"; // Motor Genérico
import { personalIncomeSchema, type PersonalIncomeData, BRL } from "../schemas";

// Classe padronizada para unificar tamanho e fonte
const commonInputClass = "h-10 text-sm transition-all duration-300 focus-visible:ring-2 focus-visible:ring-offset-0";

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

  const isIncomeFilled = Number(income) > 0;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <section className="rounded-xl border border-border p-4">
        <header className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Wallet className="h-4 w-4 text-[var(--brand-primary)]" /> Sua renda
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {/* Renda Mensal */}
          <div className="sm:col-span-2">
            <Label htmlFor="income">Renda mensal</Label>
            <Input
              id="income"
              placeholder="Sua renda total mensal sem descontos..."
              autoComplete="off"
              className={`${commonInputClass} ${isIncomeFilled ? "bg-[var(--brand-primary)]/1 border-[var(--brand-primary)]/10" : "border-input"} focus-visible:border-[var(--brand-primary)]`}
              value={income ? BRL(income) : ""}
              onChange={(e) =>
                form.setValue("monthlyIncome", maskMoney(e.target.value), { shouldValidate: true })
              }
            />
            {err.monthlyIncome && (
              <p className="mt-1 text-xs text-destructive">{err.monthlyIncome.message}</p>
            )}
          </div>

          {/* Vínculo profissional */}
          <div>
            <Label>Vínculo profissional</Label>
            <Select
              value={form.watch("professionalStatus") ?? ""}
              onValueChange={(v) => form.setValue("professionalStatus", v as any, { shouldValidate: true })}
            >
              <SelectTrigger 
                className={`${commonInputClass} ${form.watch("professionalStatus") 
                  ? "bg-[var(--brand-primary)]/1 border-[var(--brand-primary)]/10" 
                  : "border-input"
                } focus-visible:border-[var(--brand-primary)]`
                }
              >
                <SelectValue placeholder="Escolher..." />
              </SelectTrigger>
              <SelectContent>
                {personalIncomeSchema.shape.professionalStatus.options.map((opt) => (
                  <SelectItem 
                    key={opt} 
                    value={opt}
                    className="data-[highlighted]:!bg-[var(--brand-primary)]/10 data-[highlighted]:!text-[var(--brand-primary)] cursor-pointer"
                  >
                    {LABELS[opt] || opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Tempo de vínculo */}
          <div>
            <Label>Tempo de vínculo</Label>
            <Select
              value={form.watch("timeOfEmployment") ?? ""}
              onValueChange={(v) => form.setValue("timeOfEmployment", v as any, { shouldValidate: true })}
            >
              <SelectTrigger 
                className={`${commonInputClass} ${form.watch("timeOfEmployment") 
                  ? "bg-[var(--brand-primary)]/1 border-[var(--brand-primary)]/10" 
                  : "border-input"
                } focus-visible:border-[var(--brand-primary)]`
                }
              >
                <SelectValue placeholder="Escolher..." />
              </SelectTrigger>
              <SelectContent>
                {personalIncomeSchema.shape.timeOfEmployment.options.map((opt) => (
                  <SelectItem 
                    key={opt} 
                    value={opt}
                    className="data-[highlighted]:!bg-[var(--brand-primary)]/10 data-[highlighted]:!text-[var(--brand-primary)] cursor-pointer"
                  >
                    {LABELS[opt] || opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      {/* Botões de Navegação */}
      <div className="flex items-center justify-between gap-3">
        <Button 
          type="button" 
          variant="ghost" 
          onClick={back}
          className="text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/10 hover:text-[var(--brand-primary)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> 
          Voltar
        </Button>
        <Button 
          type="submit" 
          size="lg" 
          className="h-12 flex-1 rounded-xl transition-all bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/90 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2"
        >
          Continuar
        </Button>
      </div>
    </form>
  );
}