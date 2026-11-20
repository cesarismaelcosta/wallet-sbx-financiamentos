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
 * 5. {Termos oficiais do parceiro}: link `type: "terms"` abre o texto oficial (API de termos
 *    em `terms_url`, termo `terms_type`) num modal. O texto é carregado ao montar e a versão
 *    exibida fica registrada (partner-terms.shownTermsVersion) para seguir junto com o aceite.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 * @version 9.2.0 (Neutral Purity & LGPD Compliance Enforcement)
 */

import React, { Fragment, useEffect, useState, type ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PartnerTerm, loadPartnerTerms, rememberShownVersion } from "@/features/financial-hub/components/shared/partner-terms";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

// =========================================================================
// [CONTRATOS E INTERFACES TIPADAS]
// =========================================================================
interface ConsentLink {
  text: string;
  type: "web" | "tooltip" | "terms";
  url?: string;
  tooltip_text?: string;
  terms_url?: string; // type "terms": API pública dos termos do parceiro (GET /terms)
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
  terms_type?: string; // termo oficial do parceiro (tipo na API de termos)
}

interface DynamicConsentsProps {
  configs: ConsentConfig[] | null | undefined; // null quando o produto não tem aceites (tratado abaixo)
  value: Record<string, boolean>;
  onChange: (value: Record<string, boolean>) => void;
}

// =========================================================================
// [COMPONENTE PRINCIPAL: DYNAMIC CONSENTS]
// =========================================================================
/** Endereço dos termos oficiais do aceite (primeiro link `terms`). */
const termsUrlOf = (opt: ConsentConfig) => opt.links?.find((l) => l.type === "terms" && l.terms_url)?.terms_url;

export function DynamicConsents({ configs, value, onChange }: DynamicConsentsProps) {
  // Termos oficiais por aceite (consent id → termo carregado)
  const [terms, setTerms] = useState<Record<string, PartnerTerm | null>>({});
  const [openTerm, setOpenTerm] = useState<{ title: string; consentId: string } | null>(null);
  const [termsError, setTermsError] = useState(false);

  const termsKey = (configs ?? []).map((c) => `${c.id}:${c.terms_type ?? ""}:${termsUrlOf(c) ?? ""}`).join("|");
  useEffect(() => {
    let alive = true;
    for (const opt of configs ?? []) {
      const url = termsUrlOf(opt);
      if (!url || !opt.terms_type) continue;
      loadPartnerTerms(url)
        .then((list) => {
          const term = list.find((t) => t.type === opt.terms_type) ?? null;
          if (term) rememberShownVersion(opt.id, term.version);
          if (alive) setTerms((prev) => ({ ...prev, [opt.id]: term }));
        })
        .catch(() => {
          if (alive) setTermsError(true);
        });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termsKey]);

  if (!configs || configs.length === 0) return null;
  const shownTerm = openTerm ? terms[openTerm.consentId] : undefined;

  return (
    <TooltipProvider delayDuration={200}>
      {/* Contêiner Estrutural Hairline: cantos retos e superfície neutra suave */}
      <div className="flex flex-col border border-neutral-200 dark:border-neutral-800 bg-neutral-50/60 dark:bg-neutral-900/60 p-2.5 space-y-1 rounded-none">
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
                    isChecked ? "border-transparent fill-gradient" : "border-neutral-300 dark:border-neutral-600"
                  }`}
                />
              </div>

              {/* Rótulo e Parser Dinâmico de Termos */}
              <label 
                htmlFor={`consent-${opt.id}`} 
                className="text-xs text-neutral-600 dark:text-neutral-400 leading-snug cursor-pointer select-none flex-1 mt-[2px]"
              >
                {opt.template_text ? (
                  /* Parsing do template dinâmico para extração de tags {identificador} */
                  opt.template_text.split(/(\{.*?\})/g).map((part: string, i: number) => {
                    
                    if (part.startsWith("{") && part.endsWith("}")) {
                      const cleanText = part.replace(/[{}]/g, "");
                      const linkConfig = opt.links?.find((l: ConsentLink) => l.text === cleanText);

                      if (!linkConfig) {
                        return (
                          <span key={i} className="font-semibold text-neutral-900 dark:text-neutral-100">
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

                      // Ação Termos: texto oficial do parceiro num modal (não marca o aceite)
                      if (linkConfig.type === "terms") {
                        return (
                          <button
                            key={i}
                            type="button"
                            className="font-semibold text-brand-accent underline underline-offset-2 inline mx-0.5 hover:opacity-70 bg-transparent p-0 text-left outline-none transition-colors"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setOpenTerm({ title: cleanText, consentId: opt.id });
                            }}
                          >
                            {cleanText}
                          </button>
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
                                className="max-w-xs p-3 bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 text-[11px] rounded-none border border-neutral-200 dark:border-neutral-700 shadow-md leading-relaxed z-[100] animate-in fade-in-0 zoom-in-95"
                              >
                                <p className="font-normal text-neutral-600 dark:text-neutral-400">
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
                    {opt.prefix}
                    <a 
                      href={opt.url} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="font-semibold text-neutral-900 dark:text-neutral-100 underline underline-offset-2 mx-1 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {opt.link_text}
                    </a>
                    {opt.suffix}
                  </>
                )}
              </label>
            </div>
            );
          })}
      </div>

      {/* Texto oficial do termo (versão registrada junto com o aceite) */}
      <Dialog open={!!openTerm} onOpenChange={(o) => !o && setOpenTerm(null)}>
        <DialogContent className="rounded-none max-w-2xl max-h-[85vh] flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle className="text-base">{openTerm?.title}</DialogTitle>
            <DialogDescription className="text-xs">
              {shownTerm ? `Texto oficial · versão ${shownTerm.version}` : "Texto oficial"}
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto pr-2 -mr-2">
            {shownTerm ? (
              <TermsMarkdown text={shownTerm.text} />
            ) : (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {termsError || shownTerm === null ? "Não foi possível carregar o texto agora. Tente novamente em instantes." : "Carregando..."}
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}

// =========================================================================
// [TEXTO DO TERMO]: Markdown simples (títulos #, listas -, **negrito**), sem HTML cru
// =========================================================================
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

function TermsMarkdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (lines.length === 0) return null;
        const h = /^(#{1,6})\s+(.*)$/.exec(lines[0]);
        if (h && lines.length === 1) {
          const cls = h[1].length <= 1 ? "text-base" : h[1].length === 2 ? "text-[15px]" : "text-sm";
          return <p key={i} className={`${cls} font-semibold text-neutral-900 dark:text-neutral-100`}>{inline(h[2])}</p>;
        }
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*]\s+/, ""))}</li>)}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l.replace(/^#{1,6}\s+/, ""))}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
