import { useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2 } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

import { useAutoEquityWizard } from "@/hooks/useAutoEquityWizard";
import { BRL } from "../schemas";
import { createProposal, getOffer } from "@/lib/auto-equity.mock";
import { useEffect } from "react";
import type { OfferInstallment } from "@/lib/auto-equity.mock";

/**
 * Passo 4 — Resumo final e confirmação da proposta.
 * Após confirmar, exibe tela de sucesso com protocolo.
 */
export function Step4Confirm() {
  const { state, update, back, reset } = useAutoEquityWizard();
  const [accept, setAccept] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selected, setSelected] = useState<OfferInstallment | null>(null);

  // Refaz a busca da oferta para mostrar valores certinhos no resumo
  useEffect(() => {
    if (!state.offerId || !state.desiredAmount) return;
    getOffer(state.offerId, state.desiredAmount).then((o) => {
      const pick = o.options.find((opt) => opt.installments === state.selectedInstallments);
      setSelected(pick ?? null);
    });
  }, [state.offerId, state.desiredAmount, state.selectedInstallments]);

  const submit = async () => {
    setSubmitting(true);
    const { id } = await createProposal();
    update({ proposalId: id });
    setSubmitting(false);
  };

  // Tela de sucesso
  if (state.proposalId) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-semibold text-foreground">Proposta enviada!</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Recebemos sua proposta e nossa equipe entrará em contato pelo e-mail{" "}
          <strong className="text-foreground">{state.eligibility?.email}</strong>.
        </p>
        <div className="mt-4 rounded-lg border border-border bg-muted/40 px-4 py-2 text-xs">
          Protocolo: <strong className="text-foreground">{state.proposalId}</strong>
        </div>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline">
            <Link to="/">Ir para a home</Link>
          </Button>
          <Button onClick={reset}>Fazer nova simulação</Button>
        </div>
      </div>
    );
  }

  const v = state.vehicleIncome;
  const e = state.eligibility;

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-xl border border-border">
        <Row label="Nome" value={e?.fullName} />
        <Row label="CPF" value={e?.cpf} />
        <Row label="E-mail" value={e?.email} />
        <Row label="Veículo" value={`${v?.brand} ${v?.model} ${v?.modelYear}`} />
        <Row label="Placa" value={v?.licensePlate} />
        <Row label="Valor FIPE" value={v ? BRL(v.fipeValue) : ""} />
        <Row label="Renda mensal" value={v ? BRL(v.monthlyIncome) : ""} />
        <Row
          label="Valor solicitado"
          value={state.desiredAmount ? BRL(state.desiredAmount) : ""}
        />
        <Row
          label="Parcelas"
          value={
            selected
              ? `${state.selectedInstallments}x de ${BRL(selected.monthlyPayment)}`
              : "calculando..."
          }
        />
        {selected && (
          <>
            <Row label="Taxa de juros" value={`${selected.monthlyInterestRate.toFixed(2)}% a.m.`} />
            <Row label="CET" value={`${selected.cet.toFixed(2)}% a.a.`} last />
          </>
        )}
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Checkbox
          checked={accept}
          onCheckedChange={(c) => setAccept(Boolean(c))}
          className="mt-0.5"
        />
        <span>
          Confirmo que os dados acima estão corretos e autorizo a Creditas e a Wallet sbX a
          prosseguirem com a análise da proposta.
        </span>
      </label>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={back} disabled={submitting}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <Button
          size="lg"
          className="h-12 flex-1 rounded-xl sm:flex-none sm:px-10"
          disabled={!accept || submitting || !selected}
          onClick={submit}
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Enviando proposta...
            </>
          ) : (
            "Confirmar proposta"
          )}
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, last }: { label: string; value?: string; last?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between px-4 py-2.5 text-sm ${
        last ? "" : "border-b border-border"
      }`}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value ?? "-"}</span>
    </div>
  );
}
