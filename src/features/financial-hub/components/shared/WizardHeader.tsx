/**
 * @fileoverview Componente: WizardHeader
 * @path src/features/financial-hub/components/shared/WizardHeader.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO: ZERO-RADIUS GOVERNANCE & NEUTRAL PURITY
 * =========================================================================
 * @description Cabeçalho de progresso da jornada. 
 * Responsável por renderizar a régua de progresso visual, barra de 
 * carregamento e descrição contextual do passo atual.
 * 
 * [MECÂNICA ARQUITETURAL]:
 * 1. {Zero-Radius Strict Governance}: Eliminação total de arredondamentos (`rounded-none`).
 * 2. {Neutral Purity}: Substituição total de tokens de marca por paleta neutra 
 *    monocromática estrita (`neutral-900`, `neutral-600`, `neutral-200`, `bg-surface-alt`).
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 */

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface WizardHeaderProps {
  currentStep: number;
  stepsInfo: Record<number, { label: string; title: string; description: string }>;
}

export function WizardHeader({ currentStep, stepsInfo }: WizardHeaderProps) {
  const stepKeys = Object.keys(stepsInfo).map(Number);
  const totalSteps = stepKeys.length;

  const visualStep = Math.min(currentStep, totalSteps);
  const pct = totalSteps > 0 ? (visualStep / totalSteps) * 100 : 0;
  
  const content = stepsInfo[currentStep] || { title: "", description: "" };

  return (
    <div className="w-full">
      {/* Régua de progresso: Mapeamento dinâmico com Zero-Radius e Neutral Purity */}
      <ol className="mb-3 flex items-center justify-between gap-2">
        {stepKeys.map((idx) => {
          const l = stepsInfo[idx]?.label;
          const done = idx < currentStep;
          const active = idx === currentStep;
          
          return (
            <li key={idx} className="flex flex-1 items-center gap-1.5">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-none border text-[11px] font-semibold transition-all duration-300",
                  done && "border-neutral-900 bg-neutral-900 text-white",
                  active && "border-neutral-900 bg-neutral-900 text-white font-bold",
                  !done && !active && "border-neutral-200 bg-white text-neutral-400",
                )}
              >
                {done ? <Check className="h-3 w-3" /> : idx}
              </span>
              <span
                className={cn(
                  "hidden truncate text-xs sm:inline-block transition-colors duration-300",
                  active ? "font-bold text-neutral-900" : "text-neutral-500 font-medium",
                )}
              >
                {l}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Barra de progresso visual com Zero-Radius e Neutral Purity (Sem roxo) */}
      <div className="mb-4 h-1 w-full overflow-hidden rounded-none bg-neutral-200 relative">
        <div
          className="h-full rounded-none bg-neutral-900 transition-all duration-500 absolute left-0 top-0"
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Título e Descrição */}
      <div className="mb-4">
        <h2 className="text-lg font-bold leading-tight text-neutral-900 tracking-tight">
          {content.title}
        </h2>
        <p className="mt-1 text-[13px] leading-snug text-neutral-600">
          {content.description}
        </p>
      </div>
    </div>
  );
}