/**
 * @fileoverview Componente: HowItWorks
 * @path src/components/card/HowItWorks.tsx
 * 
 * Exibir os passos de funcionamento da jornada de Card.
 * Serve como o painel informativo lateral (chamariz) que ajuda na conversão.
 * * INTEGRAÇÃO:
 * - Injetado conforme necessidade na jornada de card.
 */

import { ShoppingCart, CreditCard, CheckCircle } from "lucide-react";

export function HowItWorks() {
  const steps = [
    {
      t: "Faça sua compra",
      d: "Selecione os itens desejados na nossa plataforma e aguarde a liberação para o pagamento.",
      i: <ShoppingCart className="h-7 w-7" />,
    },
    {
      t: "Cadastre seu cartão",
      d: "No checkout, selecione um cartão salvo ou insira os dados de um novo. Se usar cartões virtuais, lembre-se de cadastrar um novo a cada compra.",
      i: <CreditCard className="h-7 w-7" />,
    },
    {
      t: "Autorize o pagamento",
      d: "Siga as instruções do seu banco para confirmar a compra. A liberação pode ocorrer via app, WhatsApp, SMS ou na própria tela.",
      i: <CheckCircle className="h-7 w-7" />,
    },
  ];

  return (
    <section id="como-funciona" className="scroll-mt-24 bg-background py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <h2 className="text-center text-3xl font-bold mb-12 text-slate-800 tracking-tight">
          Em <span style={{ color: "var(--primary)" }}>3 passos</span> você realiza seu pagamento na{" "}
          <span style={{ color: "var(--primary)" }} className="font-black">
            Superbid
          </span>{" "}
          com cartão de crédito.
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