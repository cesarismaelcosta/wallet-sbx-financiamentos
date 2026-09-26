/**
 * @fileoverview Componente: PanelFAQ (Shared Renderer para Backoffice)
 * @module features/financial-hub/components/shared/renderes
 * @path src/features/financial-hub/components/shared/renderes/PanelFAQ.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS & NEUTRAL PURITY
 * =========================================================================
 * @description Renderizador compartilhado de FAQs para modais de auditoria 
 * (Consults, Simulations, Routes).
 * 
 * [ATUALIZAÇÃO DE DESIGN SYSTEM]:
 * 1. Zero-Radius: Remoção total de `rounded-xl` / `rounded-md`.
 * 2. Neutral Purity: Remoção de `#B300FF` e afins. Adoção estrita de tons 
 *    `neutral-900` e `neutral-500`.
 * =========================================================================
 */

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HelpCircle } from "lucide-react";

interface FAQItem {
  question: string;
  answer: string;
  bullets?: string[];
  position?: number;
}

interface PanelFAQProps {
  faqs?: FAQItem[];
  isPrint?: boolean;
}

export function PanelFAQ({ faqs, isPrint = false }: PanelFAQProps) {
  if (!faqs || faqs.length === 0) return null;
  const sortedItems = [...faqs].sort((a, b) => (a.position || 0) - (b.position || 0));

  return (
    <div className="bg-white dark:bg-neutral-900 p-4 border border-neutral-200 dark:border-neutral-800 shadow-sm break-inside-avoid rounded-none">
      <h4 className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-400 dark:text-neutral-500 mb-3 border-b border-neutral-100 dark:border-neutral-800 pb-2">
        <HelpCircle size={14} /> Perguntas Frequentes
      </h4>
      
      {isPrint ? (
        <div className="grid grid-cols-1 gap-y-3 pt-2">
          {sortedItems.map((item, i) => (
            <div key={`print-faq-${i}`} className="border border-neutral-200 dark:border-neutral-800 px-4 py-3 bg-white dark:bg-neutral-900 shadow-xs break-inside-avoid rounded-none">
              <div className="text-xs font-normal text-neutral-900 dark:text-neutral-100 pb-2">{item.question}</div>
              
              <div className="text-neutral-600 dark:text-neutral-400 leading-relaxed text-[11px] pt-2 border-t border-neutral-100 dark:border-neutral-800">
                <div className="mb-1">{item.answer}</div>
                {item.bullets && item.bullets.length > 0 && (
                  <div className="space-y-1 mt-2 pl-1">
                    {item.bullets.map((bullet: string, idx: number) => (
                      <div key={`bullet-${idx}`} className="flex items-start gap-1.5">
                        <span className="text-neutral-400 dark:text-neutral-500 select-none mt-[1px]">•</span>
                        <span>{bullet}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Accordion type="single" collapsible className="w-full space-y-2 pt-2">
          {sortedItems.map((item, i) => (
            <AccordionItem 
              key={i} 
              value={`faq-item-${i}`} 
              className="border border-neutral-200 dark:border-neutral-800 rounded-none px-4 bg-white dark:bg-neutral-900 transition-colors hover:border-neutral-400 dark:hover:border-neutral-600 focus-within:border-neutral-900 dark:focus-within:border-neutral-100"
            >
              <AccordionTrigger className="text-left text-xs font-normal text-neutral-500 dark:text-neutral-400 hover:no-underline hover:text-neutral-700 dark:hover:text-neutral-300 data-[state=open]:text-neutral-900 dark:data-[state=open]:text-neutral-100 py-2.5 transition-colors focus-visible:outline-none">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-neutral-600 dark:text-neutral-400 leading-relaxed text-[11px] pb-3 pt-1">
                <div className="mb-2">{item.answer}</div>
                {item.bullets && item.bullets.length > 0 && (
                  <div className="space-y-1.5 mt-2 pl-1">
                    {item.bullets.map((bullet: string, idx: number) => (
                      <div key={idx} className="flex items-start gap-1.5">
                        <span className="text-neutral-400 dark:text-neutral-500 select-none mt-[1px]">•</span>
                        <span>{bullet}</span>
                      </div>
                    ))}
                  </div>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}
    </div>
  );
}