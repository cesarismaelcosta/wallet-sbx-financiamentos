/**
 * @fileoverview Componente: HowItWorks (Jornada Simulação / Partners)
 * @path src/components/simulacao/HowItWorks.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS, CLEAN ICONS & WHITE HIGHLIGHTS
 * =========================================================================
 * 1. {Zero-Radius Strict Governance}: Eliminação total de arredondamentos (`rounded-3xl` virou `rounded-none`).
 * 2. {Solid Black Region}: Fundo preto institucional explícito (`bg-[#1D1D1B]`) com 
 *    cartões em `bg-neutral-900` e bordas refinadas.
 * 3. {SBX Typography}: Títulos monoespaçados, uppercase e espaçados (tracking), com 
 *    ícones mutados (neutral-400) e descrições em branco puro para leitura fluida.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { Sparkles, MessageCircle, ShieldCheck } from "lucide-react";

export function HowItWorks() {
  const steps = [
    { 
      t: "Simule suas condições", 
      d: "Escolha a entrada e o prazo ideais para o seu momento no nosso simulador inteligente.", 
      i: <Sparkles className="h-6 w-6 text-neutral-400 shrink-0" strokeWidth={1.5} />, 
    },
    { 
      t: "Negocie seu crédito", 
      d: "Entramos em contato com você para seguir com a análise de crédito sem custos adicionais.", 
      i: <MessageCircle className="h-6 w-6 text-neutral-400 shrink-0" strokeWidth={1.5} />, 
    },
    { 
      t: "Pague com financiamento", 
      d: "Após a confirmação da sua proposta, nossa equipe apoia você em toda a formalização.", 
      i: <ShieldCheck className="h-6 w-6 text-neutral-400 shrink-0" strokeWidth={1.5} />, 
    },
  ];

  return (
    <section id="como-funciona" className="scroll-mt-24 bg-[#1D1D1B] text-white py-16 lg:py-16 relative overflow-hidden border-b border-white/20 rounded-none">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 relative z-10">
        <h2 className="text-center text-2xl sm:text-3xl font-semibold mb-16 text-white tracking-tight leading-snug">
          Em <span className="serif font-normal text-white">3 passos</span> você compra na{" "}
          <span className="serif font-normal text-white">
            Superbid
          </span>{" "}
          com seu financiamento.
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