/**
 * @fileoverview Componente: WizardHeader
 * @path src/features/financial-hub/components/shared/WizardHeader.tsx
 * * @description Cabeçalho de progresso da jornada. 
 * Responsável por renderizar a régua de progresso visual, barra de 
 * carregamento e descrição contextual do passo atual.
 * * @responsibilities
 * - Renderiza círculos de progresso com estados (Ativo/Concluído/Pendente).
 * - Exibe título e descrição dinâmica injetada via manifesto.
 * - Gerencia o percentual da barra de progresso baseado no step atual.
 * * @dependencies
 * - lucide-react (Check icon)
 * - @/lib/utils (cn function)
 */

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface WizardHeaderProps {
  currentStep: number;
  stepsInfo: Record<number, { label: string; title: string; description: string }>;
}

export function WizardHeader({ currentStep, stepsInfo }: WizardHeaderProps) {
  // Ajuste dinâmico: conta as etapas baseadas nas chaves do manifesto
  const stepKeys = Object.keys(stepsInfo).map(Number);
  const totalSteps = stepKeys.length;

  const visualStep = Math.min(currentStep, totalSteps);
  const pct = totalSteps > 0 ? (visualStep / totalSteps) * 100 : 0;
  
  const content = stepsInfo[currentStep] || { title: "", description: "" };

  return (
    <div className="w-full">
      {/* Régua de progresso: Mapeamento dinâmico pelo manifesto */}
      <ol className="mb-3 flex items-center justify-between gap-2">
        {stepKeys.map((idx) => {
          const l = stepsInfo[idx]?.label;
          const done = idx < currentStep;
          const active = idx === currentStep;
          
          return (
            <li key={idx} className="flex flex-1 items-center gap-1.5">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold transition-all duration-300",
                  done && "border-[var(--brand-primary)] bg-[var(--brand-primary)] text-white",
                  active && "border-[var(--brand-primary)] bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]",
                  !done && !active && "border-border bg-background text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3 w-3" /> : idx}
              </span>
              <span
                className={cn(
                  "hidden truncate text-xs sm:inline-block transition-colors duration-300",
                  active ? "font-semibold text-[var(--brand-primary)]" : "text-muted-foreground font-medium",
                )}
              >
                {l}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Barra de progresso visual */}
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[var(--brand-primary)] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Título e Descrição */}
      <div className="mb-4">
        <h2 className="text-lg font-semibold leading-tight text-foreground">
          {content.title}
        </h2>
        <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
          {content.description}
        </p>
      </div>
    </div>
  );
}