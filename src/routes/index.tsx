import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, Car, MessageCircle, ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/")({
  component: SimulacaoPage,
});

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

function calcParcela(valorFinanciado: number, taxaMensal: number, meses: number) {
  if (taxaMensal === 0) return valorFinanciado / meses;
  const i = taxaMensal;
  return (valorFinanciado * i) / (1 - Math.pow(1 + i, -meses));
}

function SimulacaoPage() {
  const [valorVeiculo, setValorVeiculo] = useState(80000);
  const [percEntrada, setPercEntrada] = useState(20);
  const [parcelas, setParcelas] = useState(48);

  const entrada = useMemo(() => (valorVeiculo * percEntrada) / 100, [valorVeiculo, percEntrada]);
  const financiado = useMemo(() => valorVeiculo - entrada, [valorVeiculo, entrada]);
  const taxa = 0.0189; // 1,89% a.m. — referência
  const valorParcela = useMemo(
    () => calcParcela(financiado, taxa, parcelas),
    [financiado, parcelas],
  );
  const totalPago = valorParcela * parcelas + entrada;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* NAV */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <WalletLogo size="md" withTagline />
          <nav className="hidden items-center gap-8 md:flex">
            <a href="#simulador" className="text-sm font-medium text-muted-foreground hover:text-foreground">Simular</a>
            <a href="#como-funciona" className="text-sm font-medium text-muted-foreground hover:text-foreground">Como funciona</a>
            <a href="#faq" className="text-sm font-medium text-muted-foreground hover:text-foreground">Dúvidas</a>
          </nav>
          <Button size="sm" className="rounded-full px-5">Entrar</Button>
        </div>
      </header>

      {/* HERO */}
      <section className="relative overflow-hidden">
        <div
          className="absolute inset-0 -z-10"
          style={{ background: "var(--gradient-hero)" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -top-24 right-[-10%] -z-10 h-[520px] w-[520px] rounded-full opacity-50 blur-3xl"
          style={{ background: "var(--primary-glow)" }}
          aria-hidden
        />
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:gap-12 lg:py-24">
          <div className="lg:col-span-7">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium uppercase tracking-wider text-white/90 backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-glow" />
              Simulação sem compromisso
            </span>
            <h1 className="mt-5 text-balance text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
              Simule como seria <span className="bg-primary px-2 text-primary-foreground">financiar</span> o seu próximo veículo.
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-white/80 sm:text-lg">
              Negocie com um especialista as melhores condições — entrada a partir de 20% e parcelas
              que cabem no seu bolso. Tudo em poucos cliques.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg" className="rounded-full px-7 shadow-[var(--shadow-glow)]">
                <a href="#simulador">
                  Simule agora <ArrowRight className="ml-1 h-4 w-4" />
                </a>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="rounded-full border-white/30 bg-white/0 px-7 text-white hover:bg-white/10 hover:text-white"
              >
                <a href="#como-funciona">Como funciona</a>
              </Button>
            </div>

            <div className="mt-10 grid max-w-xl grid-cols-3 gap-4 text-white/90">
              {[
                { k: "20%", v: "entrada mín." },
                { k: "60x", v: "parcelas" },
                { k: "100%", v: "online" },
              ].map((s) => (
                <div key={s.k} className="rounded-2xl border border-white/15 bg-white/5 p-4 backdrop-blur">
                  <div className="text-2xl font-bold">{s.k}</div>
                  <div className="text-xs uppercase tracking-wider text-white/70">{s.v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* HERO CARD */}
          <div className="lg:col-span-5">
            <div className="relative rounded-3xl border border-white/10 bg-white p-6 shadow-[var(--shadow-card)] sm:p-7">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Pré-aprovado
                  </span>
                </div>
                <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-[11px] font-semibold text-success">
                  até R$ 150.000
                </span>
              </div>
              <p className="mt-3 text-lg font-semibold leading-snug">
                Seu crédito pode estar pré-aprovado para financiar.
              </p>

              <div className="mt-6 space-y-1">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Valor do crédito</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm text-muted-foreground">R$</span>
                  <span className="text-4xl font-bold tracking-tight">**.000,00</span>
                </div>
              </div>

              <Button asChild size="lg" className="mt-6 w-full rounded-xl bg-ink text-ink-foreground hover:bg-ink/90">
                <a href="#simulador">Simular financiamento</a>
              </Button>

              <p className="mt-3 text-center text-[11px] text-muted-foreground">
                Resposta em segundos · Sem afetar seu score
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SIMULADOR */}
      <section id="simulador" className="border-b border-border bg-background py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Simulador
            </span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Confira sua simulação <span className="text-primary">sem compromisso</span>.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Ajuste o valor do veículo, a entrada e o prazo. Mostramos a parcela na hora.
            </p>
          </div>

          <div className="mt-10 grid gap-6 lg:grid-cols-5">
            {/* Inputs */}
            <div className="rounded-3xl border border-border bg-card p-6 shadow-[var(--shadow-card)] sm:p-8 lg:col-span-3">
              <div className="space-y-8">
                {/* Valor do veículo */}
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Valor do veículo</Label>
                    <span className="text-sm font-bold text-primary">{BRL(valorVeiculo)}</span>
                  </div>
                  <div className="mt-3 flex items-center gap-3">
                    <Input
                      type="number"
                      value={valorVeiculo}
                      min={10000}
                      max={500000}
                      step={1000}
                      onChange={(e) => setValorVeiculo(Math.max(10000, Number(e.target.value) || 0))}
                      className="h-11 rounded-xl"
                    />
                  </div>
                  <Slider
                    className="mt-4"
                    value={[valorVeiculo]}
                    min={10000}
                    max={300000}
                    step={1000}
                    onValueChange={(v) => setValorVeiculo(v[0])}
                  />
                  <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                    <span>R$ 10 mil</span>
                    <span>R$ 300 mil</span>
                  </div>
                </div>

                {/* Entrada */}
                <div>
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Entrada</Label>
                    <span className="text-sm font-bold text-primary">
                      {percEntrada}% · {BRL(entrada)}
                    </span>
                  </div>
                  <Slider
                    className="mt-4"
                    value={[percEntrada]}
                    min={20}
                    max={70}
                    step={1}
                    onValueChange={(v) => setPercEntrada(v[0])}
                  />
                  <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                    <span>20%</span>
                    <span>70%</span>
                  </div>
                </div>

                {/* Parcelas */}
                <div>
                  <Label className="text-sm font-semibold">Parcelas</Label>
                  <div className="mt-3">
                    <Select
                      value={String(parcelas)}
                      onValueChange={(v) => setParcelas(Number(v))}
                    >
                      <SelectTrigger className="h-11 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[24, 36, 48, 60].map((p) => (
                          <SelectItem key={p} value={String(p)}>
                            {p}x
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </div>

            {/* Resultado */}
            <div className="lg:col-span-2">
              <div
                className="relative overflow-hidden rounded-3xl p-7 text-primary-foreground shadow-[var(--shadow-glow)]"
                style={{ background: "var(--gradient-primary)" }}
              >
                <div className="absolute -right-12 -top-12 h-48 w-48 rounded-full bg-white/15 blur-2xl" aria-hidden />
                <div className="relative">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-90">
                    <Car className="h-4 w-4" /> Sua parcela estimada
                  </div>
                  <div className="mt-4 flex items-baseline gap-2">
                    <span className="text-5xl font-bold tracking-tight">
                      {BRL(valorParcela)}
                    </span>
                    <span className="text-base font-medium opacity-80">/mês</span>
                  </div>
                  <div className="mt-1 text-sm opacity-80">
                    em {parcelas}x · taxa ref. {(taxa * 100).toFixed(2)}% a.m.
                  </div>

                  <div className="mt-6 space-y-3 rounded-2xl bg-white/10 p-4 backdrop-blur">
                    <Row label="Valor financiado" value={BRL(financiado)} />
                    <Row label="Entrada" value={BRL(entrada)} />
                    <Row label="Total a pagar" value={BRL(totalPago)} />
                  </div>

                  <Button
                    size="lg"
                    className="mt-6 w-full rounded-xl bg-white text-primary hover:bg-white/90"
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Falar com especialista
                  </Button>

                  <p className="mt-3 text-center text-[11px] opacity-80">
                    Simulação sujeita à análise. Valores meramente ilustrativos.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="bg-[image:var(--gradient-soft)] py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
              Como funciona
            </span>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
              Em 3 passos você sai com uma proposta na mão.
            </h2>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {[
              {
                n: "01",
                t: "Simule online",
                d: "Informe valor, entrada e prazo. Veja a parcela em segundos.",
                i: <Sparkles className="h-5 w-5" />,
              },
              {
                n: "02",
                t: "Fale com especialista",
                d: "Negocie taxa, prazo e condições direto pelo WhatsApp.",
                i: <MessageCircle className="h-5 w-5" />,
              },
              {
                n: "03",
                t: "Aprovação rápida",
                d: "Análise sem afetar score. Resposta no mesmo dia.",
                i: <ShieldCheck className="h-5 w-5" />,
              },
            ].map((s) => (
              <div
                key={s.n}
                className="group rounded-3xl border border-border bg-card p-7 transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-card)]"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    {s.i}
                  </div>
                  <span className="text-2xl font-bold text-muted-foreground/40">{s.n}</span>
                </div>
                <h3 className="mt-5 text-xl font-bold">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-border bg-background py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-4 px-4 sm:flex-row sm:items-center sm:px-6">
          <WalletLogo size="sm" withTagline />
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} SBX Crédito · Simulações meramente ilustrativas, sujeitas à análise.
          </p>
        </div>
      </footer>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="opacity-80">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
