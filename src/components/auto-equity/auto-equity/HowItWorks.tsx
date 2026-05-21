import { ThumbsUp, Sparkles, Calculator, Hourglass } from "lucide-react";

const steps = [
  {
    icon: ThumbsUp,
    title: "Verifique sua elegibilidade",
    desc: "Confirme sua elegibilidade com CPF e e-mail em segundos.",
  },
  {
    icon: Sparkles,
    title: "Cadastre veículo e renda",
    desc: "Informe os dados do seu veículo e sua renda mensal.",
  },
  {
    icon: Calculator,
    title: "Simule valor e parcela",
    desc: "Escolha quanto quer pegar e em quantas parcelas pagar.",
  },
  {
    icon: Hourglass,
    title: "Receba o crédito",
    desc: "Confirme a proposta e receba o valor na sua conta.",
  },
];

export function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-24 bg-background py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4">
        <div className="mb-10 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">
            Como funciona
          </p>
          <h2 className="mt-2 text-3xl font-semibold text-foreground sm:text-4xl">
            4 passos simples e 100% online
          </h2>
        </div>

        <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => {
            const Icon = s.icon;
            return (
              <li
                key={s.title}
                className="relative flex flex-col gap-3 rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="absolute right-4 top-4 text-xs font-semibold text-muted-foreground/60">
                  0{i + 1}
                </span>
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="text-base font-semibold text-foreground">{s.title}</h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
