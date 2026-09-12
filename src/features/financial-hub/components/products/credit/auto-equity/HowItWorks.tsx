/**
 * @fileoverview Componente: HowItWorks (Auto Equity)
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS, CLEAN ICONS & DARK INSTITUTIONAL
 * =========================================================================
 * Exibe o fluxo da jornada em 4 passos claros, utilizando ícones e descrições 
 * para reduzir a ansiedade do utilizador e esclarecer o processo.
 * 
 * [MECÂNICA ARQUITETURAL]:
 * 1. {Zero-Radius Strict Governance}: Eliminação total de arredondamentos (`rounded-none`).
 * 2. {Solid Black Region}: Fundo preto institucional explícito (`bg-[#1D1D1B]`) com 
 *    cartões em `bg-neutral-900` e bordas refinadas.
 * 3. {SBX Typography}: Títulos monoespaçados, uppercase e espaçados (tracking), com 
 *    ícones mutados (neutral-400) e descrições em branco puro para leitura fluida.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 * @version 3.0.0 (Dark Institutional Standard)
 */

import { ThumbsUp, Sparkles, Calculator, Hourglass } from "lucide-react";

// =========================================================================
// [CONFIGURAÇÃO DOS PASSOS DA JORNADA]
// =========================================================================
const steps = [
  {
    t: "Verifique sua elegibilidade",
    d: "Confirme sua elegibilidade com CPF e e-mail em segundos de forma totalmente digital.",
    i: <ThumbsUp className="h-6 w-6 text-neutral-400 shrink-0" strokeWidth={1.5} />,
  },
  {
    t: "Cadastre veículo e renda",
    d: "Informe os dados do seu veículo e sua renda mensal para estruturar a proposta.",
    i: <Sparkles className="h-6 w-6 text-neutral-400 shrink-0" strokeWidth={1.5} />,
  },
  {
    t: "Simule valor e parcela",
    d: "Escolha quanto quer pegar e em quantas parcelas deseja pagar no simulador.",
    i: <Calculator className="h-6 w-6 text-neutral-400 shrink-0" strokeWidth={1.5} />,
  },
  {
    t: "Receba o crédito",
    d: "Confirme a proposta e receba o valor diretamente na sua conta com suporte especializado.",
    i: <Hourglass className="h-6 w-6 text-neutral-400 shrink-0" strokeWidth={1.5} />,
  },
];

// =========================================================================
// [COMPONENTE PRINCIPAL: HOW IT WORKS]
// =========================================================================
export function HowItWorks() {
  return (
    <section id="como-funciona" className="scroll-mt-24 bg-[#1D1D1B] text-white py-16 lg:py-20 relative overflow-hidden border-b border-white/20 rounded-none">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 relative z-10">
        
        {/* Título Institucional com Serifa */}
        <h2 className="text-center text-2xl sm:text-3xl font-semibold mb-16 text-white tracking-tight leading-snug">
          Em <span className="serif font-normal text-white">4 passos</span> você conquista crédito com seu veículo na{" "}
          <span className="serif font-normal text-white">
            Superbid
          </span>.
        </h2>
        
        {/* Grid de Passos com o Padrão Escuro de Cartão e Veículos */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
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