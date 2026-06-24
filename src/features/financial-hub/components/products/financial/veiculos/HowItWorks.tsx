/**
 * @fileoverview Componente: HowItWorks
 * * PROPÓSITO:
 * Exibir os passos de funcionamento da jornada de Veículos.
 * Serve como o painel informativo lateral (chamariz) que ajuda na conversão.
 * * INTEGRAÇÃO:
 * - Injetado na coluna esquerda (`left`) do `VeiculosLayout`.
 */

import { Sparkles, MessageCircle, ShieldCheck } from "lucide-react";

export function HowItWorks() {
  const steps = [
    {
      t: "Simule suas condições",
      d: "Escolha a entrada e o prazo ideais para o seu momento no nosso simulador inteligente.",
      i: <Sparkles className="h-7 w-7" />,
    },
    {
      t: "Negocie e garanta seu crédito",
      d: "Fale com um especialista no WhatsApp para validar sua análise de crédito sem custos.",
      i: <MessageCircle className="h-7 w-7" />,
    },
    {
      t: "Pague com seu financiamento",
      d: "Após a confirmação da sua proposta, nossa equipe apoia você em toda a formalização.",
      i: <ShieldCheck className="h-7 w-7" />,
    },
  ];

  return (
    <section id="como-funciona" className="scroll-mt-24 bg-background py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="text-center text-3xl font-bold mb-12 text-slate-800 tracking-tight">
          Em <span style={{ color: "var(--primary)" }}>3 passos</span> você compra na{" "}
          <span style={{ color: "var(--primary)" }} className="font-black">
            Superbid
          </span>{" "}
          com seu financiamento.
        </h2>
        
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <div
              key={i}
              className="bg-white p-8 shadow-sm transition-all hover:shadow-md border border-slate-200 rounded-3xl"
            >
              <div className="mb-5" style={{ color: "var(--primary)" }}>
                {s.i}
              </div>

              <h3 className="font-bold text-lg text-slate-800 mb-2">{s.t}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}