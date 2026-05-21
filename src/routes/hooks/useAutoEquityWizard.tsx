import { createContext, useContext, useState, type ReactNode } from "react";
import type { WizardState } from "@/components/auto-equity/schemas";

/**
 * Estado global do wizard Auto Equity.
 * Mantido em Context (sem persistência) — fluxo curto e linear.
 */
type Ctx = {
  state: WizardState;
  update: (patch: Partial<WizardState>) => void;
  goTo: (step: WizardState["step"]) => void;
  next: () => void;
  back: () => void;
  reset: () => void;
};

const initial: WizardState = { step: 1 };
const WizardCtx = createContext<Ctx | null>(null);

export function AutoEquityWizardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WizardState>(initial);

  const update: Ctx["update"] = (patch) => setState((s) => ({ ...s, ...patch }));
  const goTo: Ctx["goTo"] = (step) => setState((s) => ({ ...s, step }));
  const next: Ctx["next"] = () =>
    setState((s) => ({ ...s, step: Math.min(4, s.step + 1) as WizardState["step"] }));
  const back: Ctx["back"] = () =>
    setState((s) => ({ ...s, step: Math.max(1, s.step - 1) as WizardState["step"] }));
  const reset: Ctx["reset"] = () => setState(initial);

  return (
    <WizardCtx.Provider value={{ state, update, goTo, next, back, reset }}>
      {children}
    </WizardCtx.Provider>
  );
}

export function useAutoEquityWizard() {
  const ctx = useContext(WizardCtx);
  if (!ctx) throw new Error("useAutoEquityWizard fora do Provider");
  return ctx;
}
