import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const labels = ["Elegibilidade", "Seus dados", "Simulação", "Confirmação"];

/**
 * Cabeçalho do wizard: barra de progresso fina + indicador de passo.
 */
export function WizardHeader({ step }: { step: 1 | 2 | 3 | 4 }) {
  const pct = (step / 4) * 100;
  return (
    <div className="mb-6">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Passo {step} de 4
        </span>
        <span className="text-xs font-medium text-primary">{labels[step - 1]}</span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>

      <ol className="mt-4 flex items-center justify-between gap-2">
        {labels.map((l, i) => {
          const idx = i + 1;
          const done = idx < step;
          const active = idx === step;
          return (
            <li key={l} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold transition-colors",
                  done && "border-primary bg-primary text-primary-foreground",
                  active && "border-primary bg-primary/10 text-primary",
                  !done && !active && "border-border bg-background text-muted-foreground",
                )}
              >
                {done ? <Check className="h-3 w-3" /> : idx}
              </span>
              <span
                className={cn(
                  "hidden truncate text-xs sm:inline",
                  active ? "font-medium text-foreground" : "text-muted-foreground",
                )}
              >
                {l}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
