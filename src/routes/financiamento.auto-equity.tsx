import { createFileRoute, Link } from "@tanstack/react-router";

import {
  AutoEquityWizardProvider,
  useAutoEquityWizard,
} from "@/hooks/useAutoEquityWizard";
import { OfferPanel } from "@/components/auto-equity/OfferPanel";
import { WizardHeader } from "@/components/auto-equity/WizardHeader";
import { Step1Eligibility } from "@/components/auto-equity/steps/Step1Eligibility";
import { Step2VehicleIncome } from "@/components/auto-equity/steps/Step2VehicleIncome";
import { Step3Simulation } from "@/components/auto-equity/steps/Step3Simulation";
import { Step4Confirm } from "@/components/auto-equity/steps/Step4Confirm";

/**
 * /auto-equity — Crédito com Garantia de Veículo.
 * Layout: card único, oferta à esquerda, wizard de 4 passos à direita.
 */
export const Route = createFileRoute("/financiamento/auto-equity")({
  head: () => ({
    meta: [
      { title: "Crédito com Garantia de Veículo — Wallet sbX" },
      {
        name: "description",
        content:
          "Use seu carro como garantia e libere crédito com as melhores taxas. Simule em 4 passos.",
      },
      { property: "og:title", content: "Crédito com Garantia de Veículo — Wallet sbX" },
      {
        property: "og:description",
        content: "Simule seu crédito com garantia de veículo em parceria com a Creditas.",
      },
    ],
  }),
  component: AutoEquityPage,
});

function AutoEquityPage() {
  return (
    <div className="min-h-screen bg-muted/30">
      <Header />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
        <AutoEquityWizardProvider>
          <div className="overflow-hidden rounded-3xl border border-border bg-card shadow-xl">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.1fr]">
              {/* Coluna esquerda — oferta */}
              <aside className="border-b border-border p-8 sm:p-10 lg:border-b-0 lg:border-r">
                <OfferPanel />
              </aside>

              {/* Coluna direita — wizard */}
              <section className="bg-background p-8 sm:p-10">
                <WizardBody />
              </section>
            </div>
          </div>
        </AutoEquityWizardProvider>
      </main>
    </div>
  );
}

function WizardBody() {
  const { state } = useAutoEquityWizard();
  // Esconde o header quando estamos em telas de bloqueio/sucesso
  const hideHeader = state.blocked || state.proposalId;
  return (
    <div>
      {!hideHeader && <WizardHeader step={state.step} />}
      {state.step === 1 && <Step1Eligibility />}
      {state.step === 2 && <Step2VehicleIncome />}
      {state.step === 3 && <Step3Simulation />}
      {state.step === 4 && <Step4Confirm />}
    </div>
  );
}

function Header() {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link to="/" className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
            W
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-foreground">Wallet sbX</p>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Financiamentos & Seguros
            </p>
          </div>
        </Link>
        <Link
          to="/"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Ajuda
        </Link>
      </div>
    </header>
  );
}
