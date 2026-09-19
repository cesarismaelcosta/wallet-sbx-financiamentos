/**
 * @fileoverview Componente: DynamicConsents (Motor de Termos & Consentimentos LGPD)
 * @module components/financial
 * @path src/components/financial/DynamicConsents.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: COMPLIANCE, LGPD & NEUTRAL PURITY
 * =========================================================================
 * @description Renderizador dinâmico de termos de consentimento, políticas
 * de privacidade e autorizações regulatórias (BACEN/LGPD) injetadas via BFF.
 * Suporta parsing de templates com interpolação de links externos e tooltips contextuais.
 * 
 * [MECÂNICA ARQUITETURAL V3 - BLINDAGEM NEUTRA AUTOCONTIDA & SBX DESIGN SYSTEM]:
 * 1. {Bypass de Tokens Globais Contaminados}: Substitui `bg-muted/20`, `border-border`,
 *    `text-foreground` e `data-[state=checked]:bg-primary` por classes utilitárias
 *    neutras autocontidas (`bg-neutral-50/80`, `border-neutral-200`, `bg-neutral-900`),
 *    imunizando o motor de consentimento contra o tema lilás herdado do CSS raiz.
 * 2. {Zero-Radius Strict Governance}: Aplica cantos retos estritos (`rounded-none`)
 *    no contêiner estrutural, nos checkboxes e nas janelas flutuantes de Tooltip.
 * 3. {Event Decoupling & Isolation}: Preserva o cancelamento determinístico
 *    de eventos (`e.stopPropagation()` e `e.preventDefault()`) nos gatilhos de Tooltip,
 *    prevenindo mutações indesejadas no estado do Checkbox em toque e clique.
 * 4. {Tipografia Institucional & Legal Clarity}: Escala reduzida (`text-xs`) com
 *    entrelinhamento `leading-snug`, contraste em `text-neutral-900` (#1D1D1B) e
 *    sublinhados técnicos offset para hyperlinks de conformidade legal.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 * @version 9.2.0 (Neutral Purity & LGPD Compliance Enforcement)
 */

import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

// =========================================================================
// [CONTRATOS E INTERFACES TIPADAS]
// =========================================================================
interface ConsentLink {
  text: string;
  type: "web" | "tooltip";
  url?: string;
  tooltip_text?: string;
}

interface ConsentConfig {
  id: string;
  position: number;
  template_text: string;
  is_required?: boolean;
  links?: ConsentLink[];
  // Campos legados para compatibilidade reversa com manifests antigos
  prefix?: string;
  suffix?: string;
  link_text?: string;
  url?: string;
}

interface DynamicConsentsProps {
  configs: ConsentConfig[];
  value: Record<string, boolean>;
  onChange: (value: Record<string, boolean>) => void;
}

// =========================================================================
// [COMPONENTE PRINCIPAL: DYNAMIC CONSENTS]
// =========================================================================
export function DynamicConsents({ configs, value, onChange }: DynamicConsentsProps) {
  if (!configs || configs.length === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      {/* Contêiner Estrutural Hairline: cantos retos e superfície neutra suave */}
      <div className="flex flex-col border border-neutral-200 bg-neutral-50/60 p-2.5 space-y-1 rounded-none">
        {[...configs]
          .sort((a, b) => a.position - b.position)
          .map((opt) => {
            const isChecked = !!value[opt.id];
            return (
            <div key={opt.id} className="flex gap-2.5 items-start py-1 px-1 group">
              
              {/* Contêiner do Checkbox: Geometria institucional (cantos retos e neutral styling) */}
              <div className="flex items-center pt-0.5">
                <Checkbox
                  id={`consent-${opt.id}`}
                  checked={isChecked}
                  onCheckedChange={(checked) => onChange({ ...value, [opt.id]: !!checked })}
                  className={`h-4 w-4 shrink-0 rounded-none border transition-colors focus-visible:ring-1 focus-visible:ring-neutral-900 ${
                    isChecked ? "border-transparent fill-gradient" : "border-neutral-300"
                  }`}
                />
              </div>

              {/* Rótulo e Parser Dinâmico de Termos */}
              <label 
                htmlFor={`consent-${opt.id}`} 
                className="text-xs text-neutral-600 leading-snug cursor-pointer select-none flex-1 mt-[2px]"
              >
                {opt.template_text ? (
                  /* Parsing do template dinâmico para extração de tags {identificador} */
                  opt.template_text.split(/(\{.*?\})/g).map((part: string, i: number) => {
                    
                    if (part.startsWith("{") && part.endsWith("}")) {
                      const cleanText = part.replace(/[{}]/g, "");
                      const linkConfig = opt.links?.find((l: ConsentLink) => l.text === cleanText);

                      if (!linkConfig) {
                        return (
                          <span key={i} className="font-semibold text-neutral-900">
                            {cleanText}
                          </span>
                        );
                      }

                      // Ação Web: Hyperlink externo seguro
                      if (linkConfig.type === "web") {
                        return (
                          <a
                            key={i}
                            href={linkConfig.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-semibold text-brand-accent underline underline-offset-2 hover:opacity-70 inline mx-0.5 transition-colors"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {cleanText}
                          </a>
                        );
                      }

                      // Ação Tooltip: Explicação contextual em Portal
                      if (linkConfig.type === "tooltip") {
                        return (
                          <Tooltip key={i}>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="font-semibold text-brand-accent underline underline-offset-2 border-b border-dashed border-brand-accent/40 cursor-help inline mx-0.5 hover:opacity-70 bg-transparent p-0 text-left outline-none transition-colors"
                                onClick={(e) => {
                                  // Impede que o clique de abertura do tooltip acione o checkbox pai
                                  e.preventDefault();
                                  e.stopPropagation();
                                }}
                              >
                                {cleanText}
                              </button>
                            </TooltipTrigger>
                            <TooltipPrimitive.Portal>
                              <TooltipContent
                                side="bottom"
                                align="start"
                                sideOffset={6}
                                className="max-w-xs p-3 bg-white text-neutral-900 text-[11px] rounded-none border border-neutral-200 shadow-md leading-relaxed z-[100] animate-in fade-in-0 zoom-in-95"
                              >
                                <p className="font-normal text-neutral-600">
                                  {linkConfig.tooltip_text}
                                </p>
                              </TooltipContent>
                            </TooltipPrimitive.Portal>
                          </Tooltip>
                        );
                      }
                    }

                    // Texto estático de preenchimento
                    return <span key={i}>{part}</span>;
                  })
                ) : (
                  /* Fallback de compatibilidade para contratos legados */
                  <>
                    {(opt as any).prefix}
                    <a 
                      href={(opt as any).url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="font-semibold text-neutral-900 underline underline-offset-2 mx-1 hover:text-neutral-700 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(opt as any).link_text}
                    </a>
                    {(opt as any).suffix}
                  </>
                )}
              </label>
            </div>
            );
          })}
      </div>
    </TooltipProvider>
  );
}