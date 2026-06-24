/**
 * @fileoverview Componente: DynamicConsents
 * @path src/components/financial/DynamicConsents.tsx
 * * ESTRUTURA DO PROJETO:
 * --------------------------------------------------------------------------------
 * src/
 * ├── components/
 * │   ├── financial/
 * │   │   └── DynamicConsents.tsx   # [AQUI] Renderizador de termos dinâmicos
 * │   └── ui/
 * │       ├── checkbox.tsx
 * │       └── tooltip.tsx
 * └── ...
 * --------------------------------------------------------------------------------
 * * PROPÓSITO:
 * Renderiza uma lista de termos de consentimento (LGPD) injetados via API.
 * Suporta templates de texto com links dinâmicos e Tooltips via Radix UI.
 * * * INTEGRAÇÃO:
 * - Recebe `configs` (array), `value` (objeto de estado do form) e `onChange` (callback).
 * * * INTERDEPENDÊNCIAS:
 * - `@/components/ui/checkbox`: Checkbox customizado Shadcn.
 * - `@/components/ui/tooltip`: Wrapper do Radix UI.
 * - `@radix-ui/react-tooltip`: Necessário para o `Portal` do Tooltip.
 */

import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

// Define o contrato dos links/tooltips
interface ConsentLink {
  text: string;
  type: 'web' | 'tooltip';
  url?: string;
  tooltip_text?: string;
}

// Define a estrutura do objeto de configuração
interface ConsentConfig {
  id: string;
  position: number;
  template_text: string;
  is_required?: boolean;
  links?: ConsentLink[];
  // Campos legados para suporte (opcionais)
  prefix?: string;
  suffix?: string;
  link_text?: string;
  url?: string;
}

interface DynamicConsentsProps {
  configs: ConsentConfig[]; // Aqui substituímos o any[]
  value: Record<string, boolean>;
  onChange: (value: Record<string, boolean>) => void;
}

export function DynamicConsents({ configs, value, onChange }: DynamicConsentsProps) {
  if (!configs || configs.length === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col rounded-lg border border-border bg-muted/10 p-2">
        {[...configs]
          .sort((a, b) => a.position - b.position)
          .map((opt) => (
            <div key={opt.id} className="flex gap-2 items-start py-0.5 px-1 group">
              
              {/* Checkbox Container */}
              <div className="flex items-center mt-0.5">
                <Checkbox
                  id={`consent-${opt.id}`}
                  checked={!!value[opt.id]}
                  onCheckedChange={(checked) => onChange({ ...value, [opt.id]: !!checked })}
                  className="h-5 w-5 shrink-0 mt-0.5 rounded-[4px] border-2 border-slate-400 transition-all focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
                  style={
                    value[opt.id]
                      ? { backgroundColor: "var(--brand-primary)", borderColor: "var(--brand-primary)" }
                      : {}
                  }
                />
              </div>

              {/* Label & Dynamic Content */}
              <label 
                htmlFor={`consent-${opt.id}`} 
                className="text-xs text-muted-foreground leading-snug cursor-pointer select-none flex-1 mt-[2px]"
              >
                {opt.template_text ? (
                  /* Parsing do texto via Regex para identificar {Tags} */
                  opt.template_text.split(/(\{.*?\})/g).map((part: string, i: number) => {
                    
                    // Caso: É uma tag dinâmica (link ou tooltip)
                    if (part.startsWith("{") && part.endsWith("}")) {
                      const cleanText = part.replace(/[{}]/g, "");
                      const linkConfig = opt.links?.find((l: any) => l.text === cleanText);

                      if (!linkConfig) return <span key={i} className="font-bold text-foreground">{cleanText}</span>;

                      // Tipo: WEB (Link externo)
                      if (linkConfig.type === "web") {
                        return (
                          <a
                            key={i}
                            href={linkConfig.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline font-bold hover:opacity-80 inline mx-0.5"
                            style={{ color: "var(--brand-primary)" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {cleanText}
                          </a>
                        );
                      }

                      // Tipo: TOOLTIP (Interativo com Portal)
                      if (linkConfig.type === "tooltip") {
                        return (
                          <Tooltip key={i}>
                            <TooltipTrigger asChild>
                              <span
                                className="underline font-bold cursor-help border-b border-dashed inline mx-0.5 hover:opacity-80"
                                style={{ color: "var(--brand-primary)", borderColor: "var(--brand-primary)" }}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {cleanText}
                              </span>
                            </TooltipTrigger>
                            <TooltipPrimitive.Portal>
                              <TooltipContent
                                side="bottom"
                                align="start"
                                sideOffset={6}
                                className="max-w-xs p-3 bg-white text-slate-700 text-[11px] rounded-xl border border-slate-200 shadow-lg leading-relaxed z-[100] animate-in fade-in-0 zoom-in-95"
                              >
                                <p className="font-normal">{linkConfig.tooltip_text}</p>
                              </TooltipContent>
                            </TooltipPrimitive.Portal>
                          </Tooltip>
                        );
                      }
                    }

                    // Caso: Texto estático normal
                    return <span key={i}>{part}</span>;
                  })
                ) : (
                  /* Fallback legado para suporte a modelos antigos */
                  <>
                    {(opt as any).prefix}
                    <a href={(opt as any).url} target="_blank" className="underline mx-1 font-bold" style={{ color: "var(--brand-primary)" }}>
                      {(opt as any).link_text}
                    </a>
                    {(opt as any).suffix}
                  </>
                )}
              </label>
            </div>
          ))}
      </div>
    </TooltipProvider>
  );
}