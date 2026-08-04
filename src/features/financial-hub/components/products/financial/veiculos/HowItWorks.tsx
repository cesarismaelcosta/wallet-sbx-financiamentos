/**
 * @fileoverview Componente: HowItWorks
 * * PROPÓSITO:
 * Exibir os passos de funcionamento da jornada de Veículos.
 * Serve como o painel informativo lateral (chamariz) que ajuda na conversão.
 * * INTEGRAÇÃO:
 * - Injetado na coluna esquerda (`left`) do `VeiculosLayout`.
 * 
 * @author César Ismael Pereira da Costa
 */

import { Sparkles, MessageCircle, ShieldCheck } from "lucide-react";

export function HowItWorks() {
  const steps = [
    {
      t: "Simule suas condições",
      d: "Escolha a entrada e o prazo ideais para o seu momento no nosso simulador inteligente.",
      i: <Sparkles className="h-6 w-6 shrink-0" style={{ color: "var(--brand-primary)" }} />,
    },
    {
      t: "Negocie e garanta seu crédito",
      d: "Fale com um especialista no WhatsApp para validar sua análise de crédito sem custos.",
      i: <MessageCircle className="h-6 w-6 shrink-0" style={{ color: "var(--brand-primary)" }} />,
    },
    {
      t: "Pague com seu financiamento",
      d: "Após a confirmação da sua proposta, nossa equipe apoia você em toda a formalização.",
      i: <ShieldCheck className="h-6 w-6 shrink-0" style={{ color: "var(--brand-primary)" }} />,
    },
  ];

  return (
    <section id="como-funciona" className="scroll-mt-24 bg-background py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="text-center text-3xl font-bold mb-12 text-slate-800 tracking-tight">
          Em <span style={{ color: "var(--brand-primary)" }}>3 passos</span> você compra na{" "}
          <span style={{ color: "var(--brand-primary)" }} className="font-black">
            Superbid
          </span>{" "}
          com seu financiamento.
        </h2>
        
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <div
              key={i}
              className="bg-white p-8 shadow-sm transition-all hover:shadow-md border border-slate-200 rounded-3xl flex flex-col justify-between"
            >
              <div>
                {/* Header do Card: Ícone diretamente ao lado do título, sem fundo circular */}
                <div className="flex items-center gap-3 mb-3">
                  {s.i}
                  <h3 className="font-bold text-base sm:text-lg text-slate-900 tracking-tight leading-snug">{s.t}</h3>
                </div>

                <p className="text-sm text-slate-500 leading-relaxed">{s.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}