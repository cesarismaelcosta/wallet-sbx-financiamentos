import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

import { useAutoEquityWizard } from "@/hooks/useAutoEquityWizard";
import { BRL } from "../schemas";
import { createOffer, getOffer, type Offer } from "@/lib/auto-equity.mock";

const INSTALLMENTS = [12, 24, 36, 48, 60];

/**
 * Passo 3 — Simulação. Slider de valor + chips de parcela.
 * Dispara POST /offers (mock) e GET /offers/{id}, calcula parcela escolhida.
 */
export function Step3Simulation() {
  const { state, update, next, back } = useAutoEquityWizard();
  const fipe = state.vehicleIncome?.fipeValue ?? 50000;
  const maxLoan = Math.round(fipe * 0.9);
  const minLoan = Math.max(5000, Math.round(fipe * 0.2));

  const [amount, setAmount] = useState<number>(state.desiredAmount ?? Math.round(fipe * 0.6));
  const [installments, setInstallments] = useState<number>(state.selectedInstallments ?? 48);
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(false);

  // Recarrega oferta sempre que o valor muda (debounce simples)
  useEffect(() => {
    let cancel = false;
    setLoading(true);
    const t = setTimeout(async () => {
      const { id } = await createOffer({ amount });
      const data = await getOffer(id, amount);
      if (cancel) return;
      setOffer(data);
      update({ offerId: id });
      setLoading(false);
    }, 400);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount]);

  const selected = offer?.options.find((o) => o.installments === installments);

  const handleNext = () => {
    update({ desiredAmount: amount, selectedInstallments: installments });
    next();
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Card de resumo (destaque roxo, como na home) */}
      <div className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-lg">
        <p className="text-xs uppercase tracking-wider opacity-80">Valor financiado</p>
        <p className="mt-1 text-3xl font-semibold">
          <span className="text-base opacity-80">R$ </span>
          {amount.toLocaleString("pt-BR")}
        </p>
        {loading ? (
          <p className="mt-3 inline-flex items-center gap-2 text-sm opacity-90">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando condições...
          </p>
        ) : selected ? (
          <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
            <span>
              em <strong className="text-lg">{installments}x</strong> de{" "}
              <strong>{BRL(selected.monthlyPayment)}</strong>
            </span>
            <span className="opacity-80">
              Taxa {selected.monthlyInterestRate.toFixed(2)}% a.m.
            </span>
          </div>
        ) : null}
      </div>

      {/* Slider de valor */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label>Quanto você precisa?</Label>
          <span className="text-sm font-medium text-primary">{BRL(amount)}</span>
        </div>
        <Slider
          min={minLoan}
          max={maxLoan}
          step={500}
          value={[amount]}
          onValueChange={([v]) => setAmount(v)}
        />
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>{BRL(minLoan)}</span>
          <span>{BRL(maxLoan)}</span>
        </div>
      </div>

      {/* Chips de parcela */}
      <div>
        <Label className="mb-2 block">Parcelas</Label>
        <div className="grid grid-cols-5 gap-2">
          {INSTALLMENTS.map((n) => {
            const active = n === installments;
            return (
              <button
                key={n}
                type="button"
                onClick={() => setInstallments(n)}
                className={cn(
                  "rounded-xl border py-3 text-sm font-medium transition-all",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:border-primary/50",
                )}
              >
                {n}x
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={back}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <Button
          size="lg"
          className="h-12 flex-1 rounded-xl sm:flex-none sm:px-10"
          onClick={handleNext}
          disabled={loading || !selected}
        >
          Continuar
        </Button>
      </div>
    </div>
  );
}
