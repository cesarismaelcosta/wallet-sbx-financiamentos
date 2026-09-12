/**
 * @fileoverview Componente: HowItWorks
 * @path src/components/card/HowItWorks.tsx
 * 
 * Exibir os passos de funcionamento da jornada de Card.
 * Serve como o painel informativo lateral (chamariz) que ajuda na conversão.
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS, CLEAN ICONS & WHITE HIGHLIGHTS
 * =========================================================================
 * 1. {Zero-Radius Strict Governance}: Eliminação total de arredondamentos (`rounded-none`).
 * 2. {Solid Black Region}: Fundo preto institucional explícito (`bg-[#1D1D1B]`) com 
 *    cartões em `bg-neutral-900` e bordas refinadas.
 * 3. {SBX Typography}: Títulos monoespaçados, uppercase e espaçados (tracking), com 
 *    descrições em branco puro para leitura fluida.
 */

import { ShoppingCart, CreditCard, CheckCircle } from "lucide-react";

export function HowItWorks() {
  const steps = [
    {
      t: "Faça sua compra",
      d: "Selecione os itens desejados na nossa plataforma e aguarde a liberação para o pagamento.",
      i: <ShoppingCart className="h-6 w-6 text-neutral-400 shrink-0" strokeWidth={1.5} />,
    },
    {
      t: "Cadastre seu cartão",
      d: "No checkout, selecione um cartão salvo ou insira os dados de um novo. Se usar cartões virtuais, lembre-se de cadastrar um novo a cada compra.",
      i: <CreditCard className="h-6 w-6 text-neutral-400 shrink-0" strokeWidth={1.5} />,
    },
    {
      t: "Autorize o pagamento",
      d: "Siga as instruções do seu banco para confirmar a compra. A liberação pode ocorrer via app, WhatsApp, SMS ou na própria tela.",
      i: <CheckCircle className="h-6 w-6 text-neutral-400 shrink-0" strokeWidth={1.5} />,
    },
  ];

  return (
    <section id="como-funciona" className="scroll-mt-24 bg-[#1D1D1B] text-white py-24 lg:py-24 relative overflow-hidden border-b border-white/20 rounded-none">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 relative z-10">
        <h2 className="text-center text-2xl sm:text-3xl font-semibold mb-16 text-white tracking-tight leading-snug">
          Em <span className="serif font-normal text-white">3 passos</span> você usa{" "}
          <span className="serif font-normal text-white">
            com cartão de crédito
          </span>{" "}
          na Superbid.
        </h2>
        
        <div className="grid gap-6 md:grid-cols-3">
          {steps.map((s, i) => (
            <div
              key={i}
              className="bg-neutral-900 p-6 sm:p-8 transition-all hover:bg-neutral-800/80 border border-white/20 rounded-none flex flex-col shadow-xs"
            >
              {/* Ícones com cor mutada (neutral-400), Títulos brancos e em destaque */}
              <div className="flex items-center gap-3 mb-4">
                {s.i}
                <h3 className="font-mono text-sm uppercase tracking-[0.18em] text-white mt-0.5">
                  {s.t}
                </h3>
              </div>

              {/* Descrição: Branco puro para destaque total da ação */}
              <p className="text-sm leading-relaxed text-white">
                {s.d}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}