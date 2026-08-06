import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { HelpCircle } from "lucide-react";

export function PanelFAQ({ faqs, isPrint = false }: { faqs?: any[], isPrint?: boolean }) {
  if (!faqs || faqs.length === 0) return null;
  const sortedItems = [...faqs].sort((a, b) => (a.position || 0) - (b.position || 0));

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm break-inside-avoid">
      <h4 className="text-[11px] font-bold uppercase text-[#B300FF] mb-3 flex items-center gap-1.5">
        <HelpCircle size={14} /> Perguntas Frequentes
      </h4>
      
      {isPrint ? (
        <div className="grid grid-cols-1 gap-y-3">
          {sortedItems.map((item, i) => (
            <div key={`print-faq-${i}`} className="border border-slate-200 rounded-xl px-4 py-3 bg-slate-50 shadow-sm break-inside-avoid">
              <div className="font-bold text-xs text-slate-800 pb-2">{item.question}</div>
              <div className="text-slate-600 text-[11px] leading-relaxed pt-2 border-t border-slate-200">
                <div className="mb-1">{item.answer}</div>
                {item.bullets && item.bullets.length > 0 && (
                  <div className="space-y-1 mt-2">
                    {item.bullets.map((bullet: string, idx: number) => (
                      <div key={`bullet-${idx}`} className="flex gap-1.5">
                        <span className="text-[#B300FF] font-bold">•</span>
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
        <Accordion type="single" collapsible className="w-full space-y-2">
          {sortedItems.map((item, i) => (
            <AccordionItem key={i} value={`faq-item-${i}`} className="border border-border rounded-xl px-3 bg-white shadow-sm">
              <AccordionTrigger className="text-left font-semibold text-xs text-foreground/90 py-2.5 hover:text-[#B300FF] transition-colors">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground text-[11px] leading-relaxed pb-2">
                <div className="mb-2">{item.answer}</div>
                {item.bullets && item.bullets.length > 0 && (
                  <div className="space-y-1 mt-1">
                    {item.bullets.map((bullet: string, idx: number) => (
                      <div key={idx} className="flex gap-1.5">
                        <span className="text-[#B300FF] font-bold">•</span>
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