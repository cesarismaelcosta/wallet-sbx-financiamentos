/**
 * @fileoverview Componente: HowItWorks (Jornada Simulação)
 * @path src/components/simulacao/HowItWorks.tsx
 * 
 * * PROPÓSITO:
 * Exibir os passos da jornada de simulação.
 * * INTEGRAÇÃO:
 * - Renderizado no `simulacao.tsx` (Entry Point da rota).
 * * RESPONSABILIDADE:
 * 1. Renderizar os steps da jornada de forma modular e visualmente consistente.
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS, CLEAN ICONS & WHITE HIGHLIGHTS
 * =========================================================================
 * 1. {Zero-Radius Strict Governance}: Eliminação total de arredondamentos (`rounded-3xl` virou `rounded-none`).
 * 2. {Solid Black Region}: Fundo preto institucional explícito (`bg-[#1D1D1B]`) com 
 *    cartões em `bg-neutral-900` e bordas refinadas.
 * 3. {SBX Typography}: Títulos monoespaçados, uppercase e espaçados (tracking), com 
 *    ícones mutados (neutral-400) e descrições em branco puro para leitura fluida.
 */

import { Sparkles, MessageCircle, ShieldCheck } from "lucide-react";

export function HowItWorks() {
  const steps = [
    { 
      t: "Simule", 
      d: "Escolha a entrada e o prazo ideais para o seu momento no nosso simulador inteligente.", 
      i: <Sparkles className="h-6 w-6 text-neutral-400 shrink-0" strokeWidth={1.5} />, 
    },
    { 
      t: "Negocie", 
      d: "Entramos em contato com você para seguir com a análise de crédito", 
      i: <MessageCircle className="h-6 w-6 text-neutral-400 shrink-0" strokeWidth={1.5} />, 
    },
    { 
      t: "Pague", 
      d: "Após a confirmação da sua proposta, nossa equipe apoia você em toda a formalização.", 
      i: <ShieldCheck className="h-6 w-6 text-neutral-400 shrink-0" strokeWidth={1.5} />, 
    },
  ];

  return (
    <section id="como-funciona" className="scroll-mt-24 bg-[#1D1D1B] text-white py-16 relative overflow-hidden border-t border-white/20 rounded-none">
      <div className="mx-auto max-w-7xl px-4 grid md:grid-cols-3 gap-6 relative z-10">
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
    </section>
  );
}