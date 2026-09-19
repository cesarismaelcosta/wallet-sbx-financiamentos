import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "../../lib/utils";

export interface StepperStep {
  label: string;
}

export interface StepperProps extends React.HTMLAttributes<HTMLOListElement> {
  steps: StepperStep[];
  /** 1-indexed current step. Steps before it are completed; after it are upcoming. */
  currentStep: number;
}

export const Stepper = React.forwardRef<HTMLOListElement, StepperProps>(
  ({ steps, currentStep, className, ...props }, ref) => {
    return (
      <ol
        ref={ref}
        role="list"
        aria-label={`Etapa ${currentStep} de ${steps.length}`}
        className={cn("flex w-full items-start overflow-visible py-1", className)}
        {...props}
      >
        {steps.map((step, idx) => {
          const stepNumber = idx + 1;
          const isCompleted = stepNumber < currentStep;
          const isCurrent = stepNumber === currentStep;
          const isLast = idx === steps.length - 1;

          return (
            <li
              key={`${step.label}-${idx}`}
              aria-current={isCurrent ? "step" : undefined}
              className="flex flex-1 flex-col items-center gap-2 min-w-[80px]"
            >
              <div className="flex w-full items-center">
                {idx === 0 ? (
                  <div className="flex-1" aria-hidden />
                ) : (
                  <div
                    aria-hidden
                    className={cn(
                      "h-px flex-1",
                      stepNumber <= currentStep ? "fill-gradient" : "bg-muted-foreground/30",
                    )}
                  />
                )}
                <div
                  className={cn(
                    "relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors",
                    (isCompleted || isCurrent)
                      ? "fill-gradient text-white"
                      : "bg-muted-foreground/20 text-muted-foreground",
                    isCurrent && "ring-4 ring-[#64A1E7]/25",
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" strokeWidth={3} aria-hidden />
                  ) : (
                    <span>{stepNumber}</span>
                  )}
                </div>
                {!isLast && (
                  <div
                    aria-hidden
                    className={cn(
                      "h-px flex-1",
                      stepNumber < currentStep ? "fill-gradient" : "bg-muted-foreground/30",
                    )}
                  />
                )}
                {isLast && <div className="flex-1" aria-hidden />}
              </div>
              <span
                className={cn(
                  "text-sm text-center transition-colors",
                  isCompleted || isCurrent
                    ? "text-foreground font-semibold"
                    : "text-muted-foreground font-medium",
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    );
  },
);
Stepper.displayName = "Stepper";