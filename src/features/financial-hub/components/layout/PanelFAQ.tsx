/**
 * @fileoverview Componente: PanelFAQ
 * @path src/features/financial-hub/components/layout/PanelFAQ.tsx
 * 
 * =========================================================================
 * [DOCUMENTAÇÃO DO COMPONENTE]
 * =========================================================================
 * @description Exibe perguntas e respostas frequentes em um layout de acordeão 
 * de duas colunas (no desktop). Ordenação baseada na propriedade 'position'.
 * 
 * @responsibilities
 * 1. Ordenação Dinâmica: Ordena os itens pela prop 'position'.
 * 2. Divisão de Grid: Divide os itens igualmente em duas colunas.
 * 3. Acessibilidade: Integração com Shadcn Accordion.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

interface FAQItem {
  question: string;
  answer: string;
  bullets?: string[]; 
  position?: number;
}

interface PanelFAQProps {
  items?: FAQItem[];
}

export function PanelFAQ({ items }: PanelFAQProps) {
  if (!items || items.length === 0) return null;

  const sortedItems = [...items].sort((a, b) => (a.position || 0) - (b.position || 0));
  const half = Math.ceil(sortedItems.length / 2);

  return (
    <section id="duvidas" className="py-20 relative overflow-hidden bg-white">
      <div className="mx-auto max-w-7xl px-2 sm:px-6 relative z-10">
        <h2 className="text-center text-3xl font-bold mb-16 text-foreground/90">
          Dúvidas Frequentes
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
          
          {/* Coluna 1 */}
          <div className="space-y-4">
            <Accordion type="single" collapsible className="w-full space-y-4">
              {sortedItems.slice(0, half).map((item, i) => (
                <AccordionItem 
                  key={i} 
                  value={`item-col1-${i}`} 
                  className="border border-border rounded-xl px-4 bg-white/60 shadow-sm transition-all focus-within:border-[var(--brand-primary)]"
                >
                  <AccordionTrigger className="text-left font-semibold text-foreground/90 hover:text-[var(--brand-primary)] transition-colors focus-visible:outline-none focus-visible:text-[var(--brand-primary)]">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">
                    <div className="mb-2">{item.answer}</div>
                    {item.bullets && item.bullets.length > 0 && (
                      <div className="space-y-1 mt-2">
                        {item.bullets.map((bullet, idx) => (
                          <div key={idx} className="flex gap-2">
                            <span>•</span>
                            <span>{bullet}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          {/* Coluna 2 */}
          <div className="space-y-4">
            <Accordion type="single" collapsible className="w-full space-y-4">
              {sortedItems.slice(half).map((item, i) => (
                <AccordionItem 
                  key={i} 
                  value={`item-col2-${i}`} 
                  className="border border-border rounded-xl px-4 bg-white/60 shadow-sm transition-all focus-within:border-[var(--brand-primary)]"
                >
                  <AccordionTrigger className="text-left font-semibold text-foreground/90 hover:text-[var(--brand-primary)] transition-colors focus-visible:outline-none focus-visible:text-[var(--brand-primary)]">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">
                    <div className="mb-2">{item.answer}</div>
                    {item.bullets && item.bullets.length > 0 && (
                      <div className="space-y-1 mt-2">
                        {item.bullets.map((bullet, idx) => (
                          <div key={idx} className="flex gap-2">
                            <span>•</span>
                            <span>{bullet}</span>
                          </div>
                        ))}
                      </div>
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