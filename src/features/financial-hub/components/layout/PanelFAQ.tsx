/**
 * @fileoverview Componente: PanelFAQ (Seção Institucional de Dúvidas Frequentes)
 * @module features/financial-hub/components/layout
 * @path src/features/financial-hub/components/layout/PanelFAQ.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS, ACCORDION ENGINE & SURFACE ALT
 * =========================================================================
 * @description Seção informativa e tira-dúvidas integrada ao funil de simulação.
 * Apresenta perguntas, respostas explicativas e listas técnicas em uma
 * estrutura de acordeão responsiva de duas colunas balanceadas sobre fundo cinza (`bg-surface-alt`).
 * 
 * [MECÂNICA ARQUITETURAL V3 - BLINDAGEM NEUTRA AUTOCONTIDA & SBX DESIGN SYSTEM]:
 * 1. {Surface Alternative Background}: Utiliza `bg-surface-alt` no container externo,
 *    alinhando-se ao padrão visual de seções alternadas como a Wallet (`#wallet`).
 * 2. {Zero-Radius Strict Governance}: Aplica cantos retos estritos (`rounded-none`)
 *    em cada cartão de acordeão, alinhando-se aos tokens do SBX Design System.
 * 3. {Bilateral Grid Partitioning}: Divide a coleção de itens balanceadamente
 *    entre duas colunas no desktop, preservando a ordenação ordinal via prop `position`.
 * 4. {Hairline Neutral Border System}: Cartões brancos (`bg-white`) com bordas sutis (`border-neutral-200`)
 *    e transições de contraste no hover (`hover:border-neutral-400`) e foco (`focus-within:border-neutral-900`).
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 * @version 9.3.0 (Surface Alt Background Integration)
 */

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

// =========================================================================
// [CONTRATOS E INTERFACES TIPADAS]
// =========================================================================
interface FAQItem {
  question: string;
  answer: string;
  bullets?: string[]; 
  position?: number;
}

interface PanelFAQProps {
  items?: FAQItem[];
}

// =========================================================================
// [COMPONENTE PRINCIPAL: PANEL FAQ]
// =========================================================================
export function PanelFAQ({ items }: PanelFAQProps) {
  if (!items || items.length === 0) return null;

  // Ordenação determinística baseada na chave ordinal definida no manifesto/BFF
  const sortedItems = [...items].sort((a, b) => (a.position || 0) - (b.position || 0));
  const half = Math.ceil(sortedItems.length / 2);

  return (
    <section id="duvidas" className="py-16 md:py-24 border-t border-neutral-200 bg-surface-alt text-neutral-900 relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 relative z-10">
        {/* Título Institucional da Seção */}
        <h2 className="text-center font-mono text-base md:text-lg uppercase tracking-[0.18em] text-neutral-400 mb-12 md:mb-16">
          Dúvidas Frequentes
        </h2>
        
        {/* Grid Bilateral Balanceado */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4 items-start">
          
          {/* =================================================================
              COLUNA 1 (Primeira Metade)
             ================================================================= */}
          <div className="w-full">
            <Accordion type="single" collapsible className="w-full space-y-3">
              {sortedItems.slice(0, half).map((item, i) => (
                <AccordionItem 
                  key={i} 
                  value={`item-col1-${i}`} 
                  className="border border-neutral-200 rounded-none px-5 bg-white transition-colors hover:border-neutral-400 focus-within:border-neutral-900"
                >
                  <AccordionTrigger className="text-left text-sm font-normal text-neutral-500 hover:no-underline hover:text-neutral-700 data-[state=open]:text-neutral-900 py-3 transition-colors focus-visible:outline-none">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-neutral-600 leading-relaxed text-xs pb-4 pt-1">
                    <div className="mb-2">{item.answer}</div>
                    {item.bullets && item.bullets.length > 0 && (
                      <ul className="space-y-1.5 mt-2 pl-1">
                        {item.bullets.map((bullet, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            {/* Bullet discreto mantido */}
                            <span className="text-neutral-400 select-none mt-[1px]">•</span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          {/* =================================================================
              COLUNA 2 (Segunda Metade)
             ================================================================= */}
          <div className="w-full">
            <Accordion type="single" collapsible className="w-full space-y-3">
              {sortedItems.slice(half).map((item, i) => (
                <AccordionItem 
                  key={i} 
                  value={`item-col2-${i}`} 
                  className="border border-neutral-200 rounded-none px-5 bg-white transition-colors hover:border-neutral-400 focus-within:border-neutral-900"
                >
                  <AccordionTrigger className="text-left text-sm font-normal text-neutral-500 hover:no-underline hover:text-neutral-700 data-[state=open]:text-neutral-900 py-3 transition-colors focus-visible:outline-none">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-neutral-600 leading-relaxed text-xs pb-4 pt-1">
                    <div className="mb-2">{item.answer}</div>
                    {item.bullets && item.bullets.length > 0 && (
                      <ul className="space-y-1.5 mt-2 pl-1">
                        {item.bullets.map((bullet, idx) => (
                          <li key={idx} className="flex items-start gap-2">
                            {/* Bullet discreto mantido */}
                            <span className="text-neutral-400 select-none mt-[1px]">•</span>
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
          
        </div>
      </div>
    </section>
  );
}