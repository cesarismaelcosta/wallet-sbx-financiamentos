/**
 * @fileoverview Componente: HowItWorks (Financiamento Imobiliário · FlowCredi)
 * @path src/features/financial-hub/components/products/financial/imoveis/HowItWorks.tsx
 *
 * Mesmo padrão visual de veiculos/HowItWorks.tsx, com as etapas do processo
 * de financiamento imobiliário conduzido pela FlowCredi.
 */

import { Landmark, FileSearch, FileSignature, Banknote } from "lucide-react";

export function HowItWorks() {
  const steps = [
    {
      t: "Crédito analisado",
      d: "Nossos especialistas levam sua proposta aos principais bancos e buscam a melhor condição.",
      i: <Landmark className="h-6 w-6 text-neutral-400 shrink-0" strokeWidth={1.5} />,
    },
    {
      t: "Avaliação",
      d: "Com o crédito aprovado, o banco faz a análise jurídica e a avaliação do imóvel.",
      i: <FileSearch className="h-6 w-6 text-neutral-400 shrink-0" strokeWidth={1.5} />,
    },
    {
      t: "Formalização",
      d: "Você assina o contrato e acompanhamos o registro no Cartório de Registro de Imóveis.",
      i: <FileSignature className="h-6 w-6 text-neutral-400 shrink-0" strokeWidth={1.5} />,
    },
    {
      t: "Pagamento",
      d: "Com o contrato registrado, o banco libera o valor financiado ao vendedor.",
      i: <Banknote className="h-6 w-6 text-neutral-400 shrink-0" strokeWidth={1.5} />,
    },
  ];

  return (
    <section
      id="como-funciona"
      className="scroll-mt-24 bg-[#1D1D1B] dark:bg-neutral-50 text-white dark:text-neutral-900 py-16 relative overflow-hidden border-b border-white/20 dark:border-neutral-900/20 rounded-none"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 relative z-10">
        <h2 className="text-center text-2xl sm:text-3xl font-semibold mb-16 text-white dark:text-neutral-900 tracking-tight leading-snug">
          Do <span className="serif font-normal">crédito</span> ao{" "}
          <span className="serif font-normal">registro</span>, nossos especialistas acompanham você.
        </h2>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <div
              key={i}
              className="bg-neutral-900 dark:bg-neutral-100 p-6 sm:p-8 transition-all hover:bg-neutral-800/80 dark:hover:bg-neutral-200/80 border border-white/20 dark:border-neutral-900/20 rounded-none flex flex-col shadow-xs"
            >
              <div className="flex items-center gap-3 mb-4">
                {s.i}
                <h3 className="font-mono text-sm uppercase tracking-[0.18em] text-white dark:text-neutral-900 mt-0.5">
                  {s.t}
                </h3>
              </div>
              <p className="text-sm leading-relaxed text-white dark:text-neutral-900">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
