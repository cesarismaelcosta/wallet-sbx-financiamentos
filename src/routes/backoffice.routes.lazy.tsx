/**
 * ============================================================================
 * @fileoverview Consulta e Gestão de Rotas / Orchestrator (Backoffice)
 * @module Backoffice/OrchestratorConfigs
 * @route /backoffice/routes
 *
 * @description
 * Este módulo atua como o painel central de governança e inspeção das rotas e
 * configurações do Orchestrator. Ele realiza a listagem e edição de JSONs vitais.
 *
 * NOVO: Inclui um Editor Híbrido (Split-Screen) com Live Preview em tempo real
 * para criação e edição fluida de JSONs complexos.
 *
 * [ENTERPRISE ZERO-TRUST - OBFUSCATION V3]:
 * - (LEITURA): A orquestração exigia 4 requisições separadas que travavam o client
 *   e expunham os dicionários. Tudo foi envelopado na RPC `get_backoffice_orchestrator_data`.
 * - (ESCRITA): Inserções e Atualizações (Upserts) são roteadas para a RPC 
 *   `save_backoffice_orchestrator_config`, blindando as regras de parsing e o 
 *   nome da tabela contra inspeção via DevTools.
 * 
 * =========================================================================
 * ⚙️ DEPENDÊNCIA DE INFRAESTRUTURA (POSTGRESQL RPCs)
 * =========================================================================
 * 
 * -------------------------------------------------------------------------
 * PROCEDURE 1: Busca Consolidada (4 em 1)
 * -------------------------------------------------------------------------
 * CREATE OR REPLACE FUNCTION get_backoffice_orchestrator_data() 
 * RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$ 
 * DECLARE v_result JSONB; 
 * BEGIN 
 *   SELECT jsonb_build_object(
 *     'configs', (SELECT COALESCE(jsonb_agg(row_to_json(oc)), '[]'::jsonb) FROM (SELECT * FROM orchestrator_configs ORDER BY id ASC) oc), 
 *     'products', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', pt.id, 'name', pt.name)), '[]'::jsonb) FROM product_types pt), 
 *     'categories', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', ct.id, 'name', ct.name)), '[]'::jsonb) FROM category_types ct), 
 *     'partners', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', p.id, 'name', p.name, 'logo_url', p.logo_url)), '[]'::jsonb) FROM partners p)
 *   ) INTO v_result; 
 *   RETURN v_result; 
 * END; 
 * $$;
 * 
 * -------------------------------------------------------------------------
 * PROCEDURE 2: Delegação de Upsert de JSON
 * -------------------------------------------------------------------------
 * CREATE OR REPLACE FUNCTION save_backoffice_orchestrator_config(p_payload JSONB) 
 * RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$ 
 * BEGIN 
 *   IF p_payload ? 'id' THEN 
 *     UPDATE orchestrator_configs SET 
 *       lookup_id = p_payload->>'lookup_id', 
 *       config_type = p_payload->>'config_type', 
 *       entity_type = p_payload->>'entity_type', 
 *       page_url = p_payload->>'page_url', 
 *       integration_method = p_payload->>'integration_method', 
 *       partner_id = (p_payload->>'partner_id')::INT, 
 *       is_active = (p_payload->>'is_active')::BOOLEAN, 
 *       is_integrated = (p_payload->>'is_integrated')::BOOLEAN, 
 *       integration_details = p_payload->'integration_details', 
 *       rules = p_payload->'rules', 
 *       page_configs = p_payload->'page_configs', 
 *       consent_configs = p_payload->'consent_configs', 
 *       page_faqs = p_payload->'page_faqs', 
 *       updated_at = NOW() 
 *     WHERE id = (p_payload->>'id')::INT; 
 *   ELSE 
 *     INSERT INTO orchestrator_configs (
 *       lookup_id, config_type, entity_type, page_url, integration_method, partner_id, is_active, is_integrated, 
 *       integration_details, rules, page_configs, consent_configs, page_faqs
 *     ) VALUES (
 *       p_payload->>'lookup_id', p_payload->>'config_type', p_payload->>'entity_type', p_payload->>'page_url', 
 *       p_payload->>'integration_method', (p_payload->>'partner_id')::INT, COALESCE((p_payload->>'is_active')::BOOLEAN, true), 
 *       COALESCE((p_payload->>'is_integrated')::BOOLEAN, true), p_payload->'integration_details', p_payload->'rules', 
 *       p_payload->'page_configs', p_payload->'consent_configs', p_payload->'page_faqs'
 *     ); 
 *   END IF; 
 * END; 
 * $$;
 * ============================================================================
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  Loader2, RefreshCw, Search, Layers, FileText, HelpCircle, X, CheckCircle2,
  Code2, SlidersHorizontal, Filter, ChevronDown, Plus, Edit, Save, LayoutTemplate,
  Settings2, AlertTriangle, Copy, Printer,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { supabase } from "@/integrations/supabase/client";
import { ICON_MAP } from "@/features/financial-hub/components/shared/icons-map";

export const Route = createLazyFileRoute("/backoffice/routes")({
  component: OrchestratorConfigsBackofficePage,
});

type OrchestratorRow = {
  id?: string | number;
  lookup_id: string;
  config_type: string;
  entity_type: string;
  page_url: string;
  integration_method: string;
  partner_id?: string | number | null;
  is_active?: boolean;
  is_integrated?: boolean;
  page_configs?: any;
  integration_details?: any;
  rules?: any;
  consent_configs?: any[];
  page_faqs?: any[];
  created_at?: string;
};

// =========================================================================
// [RENDERIZADORES NATIVOS DO ORCHESTRATOR]
// =========================================================================

function OfferPanelRender({ config }: { config: any }) {
  const panel = config?.offer_panel || config;
  if (!panel?.headline?.parts || !panel?.description?.parts) return null;

  const brandColor = config?.theme?.primary_color || "var(--brand-primary)";

  const getTextStyle = (type: string) => {
    switch (type) {
      case "highlight": return "text-[#B300FF]";
      case "bold": return "font-bold text-foreground";
      default: return "text-foreground";
    }
  };

  return (
    <div className="space-y-4" style={{ "--brand-primary": brandColor } as React.CSSProperties}>
      <div className="space-y-2">
        <h2 className="text-base font-semibold leading-tight text-foreground sm:text-lg">
          {panel.headline.parts.map((part: any, i: number) => (
            <span key={i} className={getTextStyle(part.type)}>{part.text}</span>
          ))}
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {panel.description.parts.map((part: any, i: number) => (
            <span key={i} className={getTextStyle(part.type)}>{part.text}</span>
          ))}
        </p>
      </div>

      {panel.benefits && Array.isArray(panel.benefits) && (
        <ul className="flex flex-col gap-2.5">
          {panel.benefits.map((b: any, i: number) => {
            const Icon = ICON_MAP[b.icon] || ICON_MAP[b.icon?.toLowerCase()] || CheckCircle2;
            return (
              <li key={i} className="flex items-start gap-2.5 text-xs">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-[#B300FF]/10 text-[#B300FF]">
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                </span>
                <div>
                  <p className="font-medium text-foreground text-xs">{b.title}</p>
                  <p className="text-[10px] text-muted-foreground">{b.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {panel.partner?.name && (
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 flex flex-col items-start gap-0.5 overflow-hidden w-full">
          <span className="text-[11px] text-muted-foreground">{panel.partner.label}</span>
          <strong className="text-[clamp(8px,3.5vw,10px)] sm:text-xs text-foreground truncate w-full block">
            {panel.partner.name}
          </strong>
        </div>
      )}
    </div>
  );
}

function FAQSection({ items, isPrint = false }: { items?: any[]; isPrint?: boolean }) {
  if (!items || items.length === 0) return null;
  const sortedItems = [...items].sort((a, b) => (a.position || 0) - (b.position || 0));

  if (isPrint) {
    return (
      <section className="py-2 bg-white">
        <div className="grid grid-cols-1 gap-y-3">
          {sortedItems.map((item, i) => (
            <div key={`print-faq-${i}`} className="border border-slate-200 rounded-xl px-4 py-3 bg-white shadow-sm break-inside-avoid">
              <div className="font-bold text-xs text-slate-800 pb-2">{item.question}</div>
              <div className="text-slate-600 text-[11px] leading-relaxed pt-2 border-t border-slate-100">
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
      </section>
    );
  }

  return (
    <section className="py-1 overflow-hidden bg-white">
      <div className="max-w-full">
        <div className="grid grid-cols-1 gap-y-2">
          <Accordion type="single" collapsible className="w-full space-y-2">
            {sortedItems.map((item, i) => (
              <AccordionItem key={i} value={`faq-item-${i}`} className="border border-border rounded-xl px-3 bg-white shadow-sm transition-all">
                <AccordionTrigger className="text-left font-semibold text-xs text-foreground/90 py-2.5">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-[11px] leading-relaxed pb-2">
                  <div className="mb-2">{item.answer}</div>
                  {item.bullets && item.bullets.length > 0 && (
                    <div className="space-y-1 mt-1">
                      {item.bullets.map((bullet: string, idx: number) => (
                        <div key={idx} className="flex gap-1.5"><span>•</span><span>{bullet}</span></div>
                      ))}
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </div>
    </section>
  );
}

function FooterRender({ config }: { config?: any }) {
  if (!config?.template_text) return null;
  const { template_text, links = [] } = config;

  const renderText = () => {
    const parts = template_text.split(/\{([^}]+)\}/g);
    return parts.map((part: string, index: number) => {
      const linkMatch = links.find((l: any) => l.text === part);
      if (linkMatch) {
        return (
          <a key={index} href={linkMatch.url} target="_blank" rel="noopener noreferrer" className="underline font-medium text-slate-500 hover:text-slate-800 transition-colors">
            {part}
          </a>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="space-y-2">
      <h4 className="text-[11px] font-bold uppercase text-purple-600 flex items-center gap-1.5">
        <FileText size={14} /> Rodapé Legal (Footer)
      </h4>
      <footer className="py-3 px-3 text-center text-[10px] text-muted-foreground bg-slate-50 border rounded-xl">
        <p className="leading-relaxed text-justify sm:text-center text-slate-400">{renderText()}</p>
      </footer>
    </div>
  );
}

function DynamicConsentsStatic({ configs }: { configs: any[] }) {
  if (!configs || configs.length === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col rounded-lg border border-border bg-muted/10 p-3 space-y-2.5">
        {[...configs]
          .sort((a, b) => (a.position || 0) - (b.position || 0))
          .map((opt) => (
            <div key={opt.id} className="flex gap-2 items-start py-0.5 text-xs">
              <div className="flex items-center mt-0.5">
                <Checkbox disabled checked={false} className="h-4 w-4 shrink-0 rounded-[4px] border-slate-400" />
              </div>
              <label className="text-[11px] text-muted-foreground leading-snug flex-1">
                {opt.template_text
                  ? opt.template_text.split(/(\{.*?\})/g).map((part: string, i: number) => {
                      if (part.startsWith("{") && part.endsWith("}")) {
                        const cleanText = part.replace(/[{}]/g, "");
                        const linkConfig = opt.links?.find((l: any) => l.text === cleanText);
                        if (!linkConfig) {
                          return <span key={i} className="underline font-bold inline mx-0.5 text-[#B300FF]">{cleanText}</span>;
                        }
                        if (linkConfig.type === "web" || linkConfig.url) {
                          return (
                            <a key={i} href={linkConfig.url} target="_blank" rel="noopener noreferrer" className="underline font-bold inline mx-0.5 hover:opacity-80" style={{ color: "var(--brand-primary)" }} onClick={(e) => e.stopPropagation()}>
                              {cleanText}
                            </a>
                          );
                        }
                        if (linkConfig.type === "tooltip" || linkConfig.tooltip_text) {
                          return (
                            <Popover key={i}>
                              <PopoverTrigger asChild>
                                <span className="underline font-bold cursor-pointer border-b border-dashed inline mx-0.5 hover:opacity-80" style={{ color: "var(--brand-primary)", borderColor: "var(--brand-primary)" }} onClick={(e) => e.stopPropagation()}>
                                  {cleanText}
                                </span>
                              </PopoverTrigger>
                              <PopoverContent side="bottom" align="start" sideOffset={6} className="max-w-xs p-3 bg-white text-slate-700 text-[11px] rounded-xl border border-slate-200 shadow-xl leading-relaxed z-[100]" onClick={(e) => e.stopPropagation()}>
                                <p className="font-normal">{linkConfig.tooltip_text}</p>
                              </PopoverContent>
                            </Popover>
                          );
                        }
                      }
                      return <span key={i}>{part}</span>;
                    })
                  : null}
              </label>
            </div>
          ))}
      </div>
    </TooltipProvider>
  );
}

// =========================================================================
// [SUB-COMPONENTES DE CONSTRUTORES/BUILDERS]
// =========================================================================

function PaymentFactorsBuilder({ factors = {}, onChange }: { factors: Record<string, number>; onChange: (f: Record<string, number>) => void; }) {
  const [entries, setEntries] = useState<Array<{ term: string; factor: any }>>(() => Object.entries(factors || {}).map(([term, factor]) => ({ term, factor })));

  useEffect(() => {
    const currentEntriesObj = Object.entries(factors || {});
    if (currentEntriesObj.length !== entries.length) {
      setEntries(currentEntriesObj.map(([term, factor]) => ({ term, factor })));
    }
  }, [factors]);

  const triggerChange = (newEntries: Array<{ term: string; factor: any }>) => {
    setEntries(newEntries);
    const newObj: Record<string, number> = {};
    newEntries.forEach((item) => {
      if (item.term !== undefined && item.term !== "") newObj[item.term] = Number(item.factor) || 0;
    });
    onChange(newObj);
  };

  const updateEntry = (index: number, field: "term" | "factor", value: string) => {
    const newEntries = [...entries];
    newEntries[index][field] = value;
    triggerChange(newEntries);
  };

  const removeEntry = (index: number) => {
    const newEntries = entries.filter((_, i) => i !== index);
    triggerChange(newEntries);
  };

  const addEntry = () => setEntries([...entries, { term: "", factor: "" }]);

  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-bold text-slate-500 uppercase">Fatores de Pagamento por Prazo</label>
        <button type="button" onClick={addEntry} className="text-[10px] font-bold text-[#B300FF] hover:underline flex items-center">
          <Plus size={12} className="mr-0.5" /> Adicionar Fator
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="text-[10px] text-slate-400 italic">Nenhum fator customizado configurado.</p>
      ) : (
        <div className="space-y-2 bg-slate-50 p-2.5 rounded-lg border">
          {entries.map((entry, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="w-1/3"><Input placeholder="Prazo" value={entry.term} onChange={(e) => updateEntry(idx, "term", e.target.value)} className="h-8 text-xs font-mono bg-white" /></div>
              <div className="flex-1"><Input type="number" step="0.00000001" placeholder="Fator" value={entry.factor} onChange={(e) => updateEntry(idx, "factor", e.target.value)} className="h-8 text-xs font-mono bg-white" /></div>
              <button type="button" onClick={() => removeEntry(idx)} className="text-slate-300 hover:text-red-500 transition-colors p-1" title="Remover"><X size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConsentItemBuilder({ consent, onUpdate, onRemove }: { consent: any; onUpdate: (c: any) => void; onRemove: () => void; }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTextChange = (newText: string) => {
    const matches = newText.match(/\{([^}]+)\}/g) || [];
    const currentTags = matches.map((m) => m.replace(/[{}]/g, ""));
    const existingLinks = consent.links || [];
    const newLinks = currentTags.map((tag) => existingLinks.find((l: any) => l.text === tag) || { text: tag, type: "web", url: "", tooltip_text: "" });
    onUpdate({ ...consent, template_text: newText, links: newLinks });
  };

  const handleInsertTag = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = consent.template_text || "";
    if (start === end) { alert("Selecione uma palavra."); return; }
    const selectedText = text.substring(start, end);
    if (selectedText.includes("{") || selectedText.includes("}")) return;
    handleTextChange(text.substring(0, start) + `{${selectedText}}` + text.substring(end));
    setTimeout(() => textarea.focus(), 0);
  };

  const updateLinkConfig = (index: number, updates: any) => {
    const newLinks = [...(consent.links || [])];
    newLinks[index] = { ...newLinks[index], ...updates };
    onUpdate({ ...consent, links: newLinks });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative group">
      <button onClick={onRemove} className="absolute top-3 right-3 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" title="Remover Termo"><X size={16} /></button>
      <div className="grid gap-4">
        <div className="flex gap-4 items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase">ID do Termo</label>
            <Input value={consent.id} onChange={(e) => onUpdate({ ...consent, id: e.target.value })} className="h-8 text-xs font-mono bg-slate-50" />
          </div>
          <div className="flex items-center gap-2 mb-1.5">
            <Switch checked={consent.is_required} onCheckedChange={(v) => onUpdate({ ...consent, is_required: v })} />
            <span className="text-[10px] font-medium text-slate-500">Obrigatório?</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-bold text-slate-500 uppercase">Texto do Termo</label>
            <button onClick={handleInsertTag} className="text-[10px] font-bold text-[#B300FF] bg-[#B300FF]/10 px-2 py-1 rounded hover:bg-[#B300FF]/20 flex items-center" type="button">🔗 Criar Link</button>
          </div>
          <textarea ref={textareaRef} value={consent.template_text || ""} onChange={(e) => handleTextChange(e.target.value)} className="w-full h-16 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-[#B300FF] resize-none" placeholder="Ex: Concordo com a Política." />
        </div>

        {consent.links && consent.links.length > 0 && (
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-2 mt-1">
            <h5 className="text-[10px] font-bold text-slate-500 uppercase mb-2">Configuração dos Links</h5>
            {consent.links.map((link: any, idx: number) => (
              <div key={idx} className="flex flex-col gap-2.5 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
                <div className="flex items-start justify-between gap-3 w-full">
                  <div className="flex-1">
                    <span className="text-[9px] text-slate-400 block uppercase mb-0.5">Texto Destacado</span>
                    <span className="text-xs font-bold text-slate-800 leading-snug block">{link.text}</span>
                  </div>
                  <div className="w-[120px]">
                    <Select value={link.type} onValueChange={(v) => updateLinkConfig(idx, { type: v })}>
                      <SelectTrigger className="h-8 text-[11px] bg-slate-50"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="web">Link Web</SelectItem>
                        <SelectItem value="tooltip">Tooltip</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="w-full">
                  {link.type === "web" ? (
                    <Input type="url" placeholder="https://..." value={link.url || ""} onChange={(e) => updateLinkConfig(idx, { url: e.target.value })} className="h-8 text-xs w-full bg-slate-50" />
                  ) : (
                    <textarea placeholder="Balão de ajuda..." value={link.tooltip_text || ""} onChange={(e) => updateLinkConfig(idx, { tooltip_text: e.target.value })} className="w-full min-h-[70px] border border-slate-200 rounded-md p-2.5 text-xs outline-none focus:border-[#B300FF] resize-y bg-slate-50" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function TextPartsBuilder({ label, parts = [], onChange }: { label: string; parts: any[]; onChange: (p: any[]) => void; }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-slate-500 uppercase">{label}</label>
      <div className="space-y-2 bg-slate-50/50 p-2.5 border rounded-lg">
        {parts.map((part, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <Input value={part.text} onChange={(e) => { const n = [...parts]; n[idx].text = e.target.value; onChange(n); }} className="h-8 text-xs flex-1 bg-white" placeholder="Digite..." />
            <Select value={part.type || "normal"} onValueChange={(v) => { const n = [...parts]; n[idx].type = v; onChange(n); }}>
              <SelectTrigger className="h-8 w-28 text-[11px] bg-white"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="bold">Negrito</SelectItem>
                <SelectItem value="highlight">Destaque Cor</SelectItem>
              </SelectContent>
            </Select>
            <button onClick={() => onChange(parts.filter((_, i) => i !== idx))} className="text-slate-300 hover:text-red-500"><X size={14} /></button>
          </div>
        ))}
        <Button type="button" onClick={() => onChange([...parts, { text: "", type: "normal" }])} variant="ghost" size="sm" className="h-7 text-[10px] text-[#B300FF] w-full mt-1 border border-dashed border-[#B300FF]/40 hover:bg-[#B300FF]/10">
          <Plus size={12} className="mr-1" /> Adicionar Pedaço de Texto
        </Button>
      </div>
    </div>
  );
}

function BenefitsBuilder({ benefits = [], onChange }: { benefits: any[]; onChange: (b: any[]) => void }) {
  const iconOptions = Object.keys(ICON_MAP);
  return (
    <div className="space-y-3">
      {benefits.map((ben, idx) => (
        <div key={idx} className="bg-slate-50 p-3 rounded-lg border border-slate-200 relative group space-y-3">
          <button onClick={() => onChange(benefits.filter((_, i) => i !== idx))} className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><X size={14} /></button>
          <div className="flex gap-3">
            <div className="w-1/3 space-y-1">
              <label className="text-[9px] font-bold text-slate-500 uppercase">Ícone</label>
              <Select value={ben.icon} onValueChange={(v) => { const n = [...benefits]; n[idx].icon = v; onChange(n); }}>
                <SelectTrigger className="h-8 text-[11px] bg-white"><SelectValue placeholder="Escolha..." /></SelectTrigger>
                <SelectContent className="max-h-60">
                  {iconOptions.map((iconKey) => {
                    const IconComponent = ICON_MAP[iconKey];
                    return (
                      <SelectItem key={iconKey} value={iconKey}>
                        <div className="flex items-center gap-2">{IconComponent && <IconComponent className="w-3.5 h-3.5 text-[#B300FF]" />}<span>{iconKey}</span></div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="w-2/3 space-y-1">
              <label className="text-[9px] font-bold text-slate-500 uppercase">Título</label>
              <Input value={ben.title} onChange={(e) => { const n = [...benefits]; n[idx].title = e.target.value; onChange(n); }} className="h-8 text-xs bg-white" placeholder="Ex: Até 48 meses" />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-bold text-slate-500 uppercase">Descrição</label>
            <Input value={ben.description} onChange={(e) => { const n = [...benefits]; n[idx].description = e.target.value; onChange(n); }} className="h-8 text-xs bg-white" placeholder="Ex: Escolha a parcela" />
          </div>
        </div>
      ))}
      <Button type="button" onClick={() => onChange([...benefits, { icon: "Check", title: "", description: "" }])} variant="outline" size="sm" className="h-8 text-[10px] w-full border-dashed">
        <Plus size={12} className="mr-1" /> Adicionar Benefício
      </Button>
    </div>
  );
}

function FooterBuilder({ footer = {}, onChange }: { footer: any; onChange: (f: any) => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTextChange = (newText: string) => {
    const matches = newText.match(/\{([^}]+)\}/g) || [];
    const currentTags = matches.map((m) => m.replace(/[{}]/g, ""));
    const existingLinks = footer.links || [];
    const newLinks = currentTags.map((tag) => existingLinks.find((l: any) => l.text === tag) || { text: tag, url: "" });
    onChange({ ...footer, template_text: newText, links: newLinks });
  };

  const handleInsertTag = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = footer.template_text || "";
    if (start === end) { alert("Selecione uma palavra."); return; }
    const selectedText = text.substring(start, end);
    if (selectedText.includes("{") || selectedText.includes("}")) return;
    handleTextChange(text.substring(0, start) + `{${selectedText}}` + text.substring(end));
    setTimeout(() => textarea.focus(), 0);
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-bold text-slate-500 uppercase">Texto do Rodapé</label>
        <button onClick={handleInsertTag} className="text-[10px] font-bold text-[#B300FF] bg-[#B300FF]/10 px-2 py-1 rounded flex items-center" type="button">🔗 Criar Link</button>
      </div>
      <textarea ref={textareaRef} value={footer.template_text || ""} onChange={(e) => handleTextChange(e.target.value)} className="w-full h-24 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-[#B300FF] resize-y bg-white" placeholder="© 2026 Wallet sbX." />
      {footer.links && footer.links.length > 0 && (
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-2 mt-2">
          <h5 className="text-[10px] font-bold text-slate-500 uppercase mb-2">URLs Mapeadas</h5>
          {footer.links.map((link: any, idx: number) => (
            <div key={idx} className="flex flex-col gap-2.5 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
              <div className="w-full">
                <span className="text-[9px] text-slate-400 block uppercase mb-0.5">Texto Destacado</span>
                <span className="text-xs font-bold text-slate-800 leading-snug block">{link.text}</span>
              </div>
              <div className="w-full">
                <Input type="url" placeholder="https://..." value={link.url || ""} onChange={(e) => { const newLinks = [...(footer.links || [])]; newLinks[idx].url = e.target.value; onChange({ ...footer, links: newLinks }); }} className="h-8 text-xs w-full bg-slate-50" />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// =========================================================================
// [COMPONENTE DE EDITOR]: OrchestratorConfigEditor (Split-Screen)
// =========================================================================
function OrchestratorConfigEditor({
  initialData = null,
  partnersList = [],
  productsList = [],
  categoriesList = [],
  onClose,
  onSave,
}: {
  initialData?: OrchestratorRow | null;
  partnersList: { id: string | number; name: string }[];
  productsList: { id: string | number; name: string }[];
  categoriesList: { id: string | number; name: string }[];
  onClose: () => void;
  onSave: (data: OrchestratorRow) => Promise<void>;
}) {
  const [isSaving, setIsSaving] = useState(false);

  const [formData, setFormData] = useState({
    config_type: initialData?.config_type || "PRODUCT",
    lookup_id: initialData?.lookup_id || "",
    entity_type: initialData?.entity_type || "PF+PJ",
    page_url: initialData?.page_url || "http://localhost:8080/financiamentos/veiculos",
    integration_method: initialData?.integration_method || "API",
    partner_id: initialData?.partner_id ? String(initialData.partner_id) : "none",
    is_active: initialData?.is_active ?? true,
    is_integrated: initialData?.is_integrated ?? true,
  });

  const [jsonEditors, setJsonEditors] = useState({
    integration_details: initialData?.integration_details && Object.keys(initialData.integration_details).length > 0 ? JSON.stringify(initialData.integration_details, null, 2) : "{\n  \n}",
    rules: initialData?.rules && Object.keys(initialData.rules).length > 0 ? JSON.stringify(initialData.rules, null, 2) : "{\n  \n}",
    page_configs: initialData?.page_configs && Object.keys(initialData.page_configs).length > 0 ? JSON.stringify(initialData.page_configs, null, 2) : "{\n  \n}",
    consent_configs: initialData?.consent_configs && initialData.consent_configs.length > 0 ? JSON.stringify(initialData.consent_configs, null, 2) : "[\n  \n]",
    page_faqs: initialData?.page_faqs && initialData.page_faqs.length > 0 ? JSON.stringify(initialData.page_faqs, null, 2) : "[\n  \n]",
  });

  const [parsedPreview, setParsedPreview] = useState<any>({
    page_configs: initialData?.page_configs || null,
    consent_configs: initialData?.consent_configs || null,
    page_faqs: initialData?.page_faqs || null,
    rules: initialData?.rules || {},
    integration_details: initialData?.integration_details || {},
  });

  const [jsonErrors, setJsonErrors] = useState<Record<string, string | null>>({});

  const handleJsonChange = (field: keyof typeof jsonEditors, value: string) => {
    setJsonEditors((prev) => ({ ...prev, [field]: value }));
    if (!value.trim() || value === "{}" || value === "[]") {
      setJsonErrors((prev) => ({ ...prev, [field]: null }));
      setParsedPreview((prev: any) => ({ ...prev, [field]: null }));
      return;
    }
    try {
      const parsed = JSON.parse(value);
      setJsonErrors((prev) => ({ ...prev, [field]: null }));
      if (["page_configs", "consent_configs", "page_faqs", "rules", "integration_details"].includes(field)) {
        setParsedPreview((prev: any) => ({ ...prev, [field]: parsed }));
      }
    } catch (e: any) {
      setJsonErrors((prev) => ({ ...prev, [field]: `JSON Inválido: ${e.message}` }));
    }
  };

  const handleSaveClick = async () => {
    const hasErrors = Object.values(jsonErrors).some((err) => err !== null);
    if (hasErrors) { alert("Corrija os erros de JSON antes de salvar."); return; }
    if (!formData.lookup_id) { alert("O campo Lookup ID é obrigatório."); return; }
    if (!formData.partner_id || formData.partner_id === "none") { alert("O campo Vincular Parceiro Oficial é obrigatório."); return; }

    const integrationDetailsToSave = parsedPreview.integration_details || JSON.parse(jsonEditors.integration_details || "{}");
    if (formData.integration_method === "EMAIL" && !integrationDetailsToSave.email) {
      alert("O campo E-mail de Destino é obrigatório quando o método for E-mail.");
      return;
    }

    try {
      setIsSaving(true);
      const payload: OrchestratorRow = {
        ...(initialData?.id ? { id: initialData.id } : {}),
        config_type: formData.config_type,
        lookup_id: formData.lookup_id,
        entity_type: formData.entity_type,
        page_url: formData.page_url,
        integration_method: formData.integration_method,
        partner_id: Number(formData.partner_id),
        is_active: formData.is_active,
        is_integrated: formData.is_integrated,
        integration_details: integrationDetailsToSave,
        rules: parsedPreview.rules || JSON.parse(jsonEditors.rules || "{}"),
        page_configs: parsedPreview.page_configs || JSON.parse(jsonEditors.page_configs || "{}"),
        consent_configs: parsedPreview.consent_configs || JSON.parse(jsonEditors.consent_configs || "[]"),
        page_faqs: parsedPreview.page_faqs || JSON.parse(jsonEditors.page_faqs || "[]"),
      };
      await onSave(payload);
    } catch (e: any) { alert(`Erro ao salvar: ${e.message}`); } 
    finally { setIsSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col animate-in fade-in duration-200">
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b shadow-sm shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            {initialData?.id ? <><Edit size={18} className="text-[#B300FF]" /> Editando Rota #{initialData.id}</> : <><Plus size={18} className="text-[#B300FF]" /> Nova Rota</>}
          </h2>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>Cancelar</Button>
          <Button onClick={handleSaveClick} disabled={isSaving} className="bg-[#B300FF] hover:bg-[#9f00e6]">
            {isSaving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />} Salvar Rota
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[60%] flex flex-col bg-white border-r overflow-hidden shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] z-10">
          <Tabs defaultValue="general" className="flex-1 flex flex-col h-full">
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0 h-12 shrink-0">
              <TabsTrigger value="general" className="data-[state=active]:border-b-2 data-[state=active]:border-[#B300FF] rounded-none h-full px-6"><Settings2 className="w-4 h-4 mr-2" /> Geral</TabsTrigger>
              <TabsTrigger value="rules" className="data-[state=active]:border-b-2 data-[state=active]:border-[#B300FF] rounded-none h-full px-6"><Code2 className="w-4 h-4 mr-2" /> Regras & Integração</TabsTrigger>
              <TabsTrigger value="visual" className="data-[state=active]:border-b-2 data-[state=active]:border-[#B300FF] rounded-none h-full px-6"><LayoutTemplate className="w-4 h-4 mr-2" /> Oferta & Rodapé</TabsTrigger>
              <TabsTrigger value="legal" className="data-[state=active]:border-b-2 data-[state=active]:border-[#B300FF] rounded-none h-full px-6"><FileText className="w-4 h-4 mr-2" /> LGPD & FAQs</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto p-6">
              <TabsContent value="general" className="space-y-6 mt-0">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 uppercase">Tipo</label>
                    <Select value={formData.config_type} onValueChange={(v) => setFormData({ ...formData, config_type: v })}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EVENT">Evento (EVENT)</SelectItem>
                        <SelectItem value="SELLER">Seller (SELLER)</SelectItem>
                        <SelectItem value="PRODUCT">Produto (PRODUCT)</SelectItem>
                        <SelectItem value="SUBCATEGORY">Subcategoria (SUBCATEGORY)</SelectItem>
                        <SelectItem value="CATEGORY">Categoria (CATEGORY)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 uppercase">Lookup ID <span className="text-red-500">*</span></label>
                    {formData.config_type === "PRODUCT" ? (
                      <Select value={String(formData.lookup_id || "")} onValueChange={(v) => setFormData({ ...formData, lookup_id: v })}>
                        <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Selecione o produto..." /></SelectTrigger>
                        <SelectContent className="max-h-60">
                          {productsList.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name} <span className="text-slate-400 font-mono text-[10px]">(ID: {p.id})</span></SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : formData.config_type === "CATEGORY" ? (
                      <Select value={String(formData.lookup_id || "")} onValueChange={(v) => setFormData({ ...formData, lookup_id: v })}>
                        <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Selecione a categoria..." /></SelectTrigger>
                        <SelectContent className="max-h-60">
                          {categoriesList.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name} <span className="text-slate-400 font-mono text-[10px]">(ID: {c.id})</span></SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : formData.config_type === "SELLER" ? (
                      <Select value={String(formData.lookup_id || "")} onValueChange={(v) => setFormData({ ...formData, lookup_id: v })}>
                        <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Selecione o parceiro..." /></SelectTrigger>
                        <SelectContent className="max-h-60">
                          {partnersList.map((pt) => <SelectItem key={pt.id} value={String(pt.id)}>{pt.name} <span className="text-slate-400 font-mono text-[10px]">(ID: {pt.id})</span></SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Input value={formData.lookup_id} onChange={(e) => setFormData({ ...formData, lookup_id: e.target.value })} className="h-11 rounded-xl font-mono text-sm" placeholder="Ex: ID ou código..." />
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 uppercase">Público</label>
                    <Select value={formData.entity_type} onValueChange={(v) => setFormData({ ...formData, entity_type: v })}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PF">Pessoa Física</SelectItem>
                        <SelectItem value="PJ">Pessoa Jurídica</SelectItem>
                        <SelectItem value="PF+PJ">Ambos (PF+PJ)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 uppercase">Integração</label>
                    <Select value={formData.integration_method} onValueChange={(v) => setFormData({ ...formData, integration_method: v })}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="API">API</SelectItem>
                        <SelectItem value="EMAIL">E-mail</SelectItem>
                        <SelectItem value="FILE">Arquivo</SelectItem>
                        <SelectItem value="MANUAL">Manual</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <label className="text-xs font-bold text-slate-600 uppercase">URL de Destino</label>
                    <Input value={formData.page_url} onChange={(e) => setFormData({ ...formData, page_url: e.target.value })} className="h-11 rounded-xl font-mono text-sm" />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1.5">Vincular Parceiro <span className="text-red-500">*</span></label>
                    <Select value={String(formData.partner_id || "")} onValueChange={(v) => setFormData({ ...formData, partner_id: v })}>
                      <SelectTrigger className="h-11 rounded-xl"><SelectValue placeholder="Selecione um parceiro..." /></SelectTrigger>
                      <SelectContent className="max-h-60">
                        {partnersList.map((p) => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 grid grid-cols-2 gap-4 pt-4">
                    <div className="p-4 bg-slate-50 border rounded-xl flex items-center justify-between">
                      <div><h4 className="font-bold text-sm text-slate-800">Status Ativo</h4></div>
                      <Switch checked={formData.is_active} onCheckedChange={(v) => setFormData({ ...formData, is_active: v })} />
                    </div>
                    <div className="p-4 bg-slate-50 border rounded-xl flex items-center justify-between">
                      <div><h4 className="font-bold text-sm text-slate-800">É Integrada?</h4></div>
                      <Switch checked={formData.is_integrated} onCheckedChange={(v) => setFormData({ ...formData, is_integrated: v })} />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="rules" className="space-y-6 mt-0 pb-8">
                {(() => {
                  const rules = parsedPreview.rules || {};
                  const integration = parsedPreview.integration_details || {};
                  const updateRules = (newRules: any) => { setParsedPreview({ ...parsedPreview, rules: newRules }); setJsonEditors({ ...jsonEditors, rules: JSON.stringify(newRules, null, 2) }); };
                  const updateIntegration = (newInt: any) => { setParsedPreview({ ...parsedPreview, integration_details: newInt }); setJsonEditors({ ...jsonEditors, integration_details: JSON.stringify(newInt, null, 2) }); };

                  return (
                    <div className="space-y-6">
                      <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
                        <h4 className="text-[11px] font-bold uppercase text-slate-800 border-b pb-2">1. Credenciais & Canais</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-500 uppercase">CNPJ da Loja</label><Input value={integration.cnpjLoja || ""} onChange={(e) => updateIntegration({ ...integration, cnpjLoja: e.target.value })} className="h-8 text-xs font-mono" /></div>
                          <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-500 uppercase">URL do WhatsApp</label><Input value={integration.urlWhatsApp || ""} onChange={(e) => updateIntegration({ ...integration, urlWhatsApp: e.target.value })} className="h-8 text-xs font-mono" /></div>
                        </div>
                        {formData.integration_method === "EMAIL" && (
                          <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5">E-mail de Destino <span className="text-red-500">*</span></label><Input type="email" value={integration.email || ""} onChange={(e) => updateIntegration({ ...integration, email: e.target.value })} className="h-8 text-xs font-mono border-blue-200 bg-blue-50" /></div>
                        )}
                      </div>
                      <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
                        <h4 className="text-[11px] font-bold uppercase text-slate-800 border-b pb-2">2. Regras de Parcelamento</h4>
                        <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-500 uppercase">Opções de Parcelas</label><Input value={Array.isArray(rules.installment_options) ? rules.installment_options.join(", ") : ""} onChange={(e) => { const parsedArray = e.target.value.split(",").map((n) => Number(n.trim())).filter((n) => !isNaN(n) && n > 0); updateRules({ ...rules, installment_options: parsedArray }); }} className="h-8 text-xs font-mono" /></div>
                        <PaymentFactorsBuilder factors={rules.payment_factors || {}} onChange={(newFactors) => updateRules({ ...rules, payment_factors: newFactors })} />
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-500 uppercase">Parcela Padrão</label><Input type="number" value={rules.default_installments ?? ""} onChange={(e) => updateRules({ ...rules, default_installments: Number(e.target.value) })} className="h-8 text-xs" /></div>
                          <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-500 uppercase">Máx Financiado</label><Input type="number" value={rules.max_financed_amount ?? ""} onChange={(e) => updateRules({ ...rules, max_financed_amount: e.target.value ? Number(e.target.value) : undefined })} className="h-8 text-xs" /></div>
                        </div>
                        <div className="grid grid-cols-3 gap-3 pt-2">
                          <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-500 uppercase">Min Entrada (%)</label><Input type="number" value={rules.min_down_payment_percentage ?? 0} onChange={(e) => updateRules({ ...rules, min_down_payment_percentage: Number(e.target.value) })} className="h-8 text-xs" /></div>
                          <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-500 uppercase">Max Entrada (%)</label><Input type="number" value={rules.max_down_payment_percentage ?? 80} onChange={(e) => updateRules({ ...rules, max_down_payment_percentage: Number(e.target.value) })} className="h-8 text-xs" /></div>
                          <div className="space-y-1.5"><label className="text-[10px] font-bold text-slate-500 uppercase">Cap Máximo (%)</label><Input type="number" value={rules.max_offer_cap_percent ?? 50} onChange={(e) => updateRules({ ...rules, max_offer_cap_percent: Number(e.target.value) })} className="h-8 text-xs" /></div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </TabsContent>

              <TabsContent value="visual" className="space-y-6 mt-0 pb-8 min-h-[500px]">
                {(() => {
                  const config = parsedPreview.page_configs || {};
                  const theme = config.theme || { box_bg: "bg-white/80", box_radius: "rounded-3xl", primary_color: "#B300FF" };
                  const offer = config.offer_panel || { partner: {}, headline: { parts: [] }, description: { parts: [] }, benefits: [] };
                  const footer = config.footer || { template_text: "", links: [] };
                  const updateConfig = (newConfig: any) => { setParsedPreview({ ...parsedPreview, page_configs: newConfig }); setJsonEditors({ ...jsonEditors, page_configs: JSON.stringify(newConfig, null, 2) }); };

                  return (
                    <div className="space-y-6">
                      <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
                        <h4 className="text-[11px] font-bold uppercase text-slate-800 border-b pb-2">1. Cores e Estilo do Box</h4>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Cor Principal</label>
                            <Input value={theme.primary_color || ""} onChange={(e) => updateConfig({ ...config, theme: { ...theme, primary_color: e.target.value } })} className="h-8 text-xs font-mono uppercase bg-white" />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Fundo do Box</label>
                            <Select value={theme.box_bg || "bg-white/80"} onValueChange={(v) => updateConfig({ ...config, theme: { ...theme, box_bg: v } })}>
                              <SelectTrigger className="h-8 text-xs bg-white"><SelectValue /></SelectTrigger>
                              <SelectContent><SelectItem value="bg-white">Branco</SelectItem><SelectItem value="bg-white/80">Glass</SelectItem><SelectItem value="bg-slate-50">Cinza</SelectItem></SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>
                      <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
                        <h4 className="text-[11px] font-bold uppercase text-slate-800 border-b pb-2">2. Oferta Principal</h4>
                        <TextPartsBuilder label="Título (Headline)" parts={offer.headline?.parts || []} onChange={(newParts) => updateConfig({ ...config, offer_panel: { ...offer, headline: { parts: newParts } } })} />
                        <TextPartsBuilder label="Subtítulo (Description)" parts={offer.description?.parts || []} onChange={(newParts) => updateConfig({ ...config, offer_panel: { ...offer, description: { parts: newParts } } })} />
                      </div>
                      <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
                        <h4 className="text-[11px] font-bold uppercase text-slate-800 border-b pb-2">3. Benefícios</h4>
                        <BenefitsBuilder benefits={offer.benefits || []} onChange={(newBenefits) => updateConfig({ ...config, offer_panel: { ...offer, benefits: newBenefits } })} />
                      </div>
                      <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
                        <h4 className="text-[11px] font-bold uppercase text-slate-800 border-b pb-2">4. Rodapé e Legal (Footer)</h4>
                        <FooterBuilder footer={footer} onChange={(newFooter) => updateConfig({ ...config, footer: newFooter })} />
                      </div>
                    </div>
                  );
                })()}
              </TabsContent>

              <TabsContent value="legal" className="space-y-8 mt-0 pb-8 flex flex-col">
                <div className="flex flex-col space-y-3">
                  <div className="flex justify-between items-center bg-purple-50 p-3 rounded-xl border border-purple-100">
                    <h3 className="font-bold text-slate-800 uppercase text-xs">Consentimentos (LGPD)</h3>
                    <Button onClick={() => { const current = parsedPreview.consent_configs || []; const updated = [...current, { id: `consent_${Date.now()}`, template_text: "", is_required: true, position: current.length + 1, links: [] }]; setParsedPreview({ ...parsedPreview, consent_configs: updated }); setJsonEditors({ ...jsonEditors, consent_configs: JSON.stringify(updated, null, 2) }); }} size="sm" className="bg-[#B300FF] hover:bg-[#9f00e6] text-white text-[11px] h-8 rounded-lg"><Plus size={14} className="mr-1" /> Add Termo</Button>
                  </div>
                  <div className="space-y-3">
                    {!parsedPreview.consent_configs || parsedPreview.consent_configs.length === 0 ? (
                      <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">Nenhum termo configurado.</div>
                    ) : (
                      parsedPreview.consent_configs.map((consent: any, index: number) => (
                        <ConsentItemBuilder key={index} consent={consent} onUpdate={(updatedConsent) => { const updatedList = [...parsedPreview.consent_configs]; updatedList[index] = updatedConsent; setParsedPreview({ ...parsedPreview, consent_configs: updatedList }); setJsonEditors({ ...jsonEditors, consent_configs: JSON.stringify(updatedList, null, 2) }); }} onRemove={() => { const updatedList = parsedPreview.consent_configs.filter((_: any, i: number) => i !== index); setParsedPreview({ ...parsedPreview, consent_configs: updatedList }); setJsonEditors({ ...jsonEditors, consent_configs: JSON.stringify(updatedList, null, 2) }); }} />
                      ))
                    )}
                  </div>
                </div>

                <div className="flex flex-col space-y-3 border-t pt-6">
                  <div className="flex justify-between items-center bg-purple-50 p-3 rounded-xl border border-purple-100">
                    <h3 className="font-bold text-slate-800 uppercase text-xs">Dúvidas Frequentes (FAQs)</h3>
                    <Button onClick={() => { const current = parsedPreview.page_faqs || []; const updated = [...current, { question: "", answer: "", position: current.length + 1, bullets: [] }]; setParsedPreview({ ...parsedPreview, page_faqs: updated }); setJsonEditors({ ...jsonEditors, page_faqs: JSON.stringify(updated, null, 2) }); }} size="sm" className="bg-[#B300FF] hover:bg-[#9f00e6] text-white text-[11px] h-8 rounded-lg"><Plus size={14} className="mr-1" /> Add FAQ</Button>
                  </div>
                  <div className="space-y-4">
                    {!parsedPreview.page_faqs || parsedPreview.page_faqs.length === 0 ? (
                      <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs">Nenhuma FAQ configurada.</div>
                    ) : (
                      parsedPreview.page_faqs.map((faq: any, index: number) => (
                        <div key={index} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative group">
                          <button onClick={() => { const updated = parsedPreview.page_faqs.filter((_: any, i: number) => i !== index); setParsedPreview({ ...parsedPreview, page_faqs: updated }); setJsonEditors({ ...jsonEditors, page_faqs: JSON.stringify(updated, null, 2) }); }} className="absolute top-3 right-3 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"><X size={16} /></button>
                          <div className="grid gap-4 pr-6">
                            <Input value={faq.question} onChange={(e) => { const updated = [...parsedPreview.page_faqs]; updated[index].question = e.target.value; setParsedPreview({ ...parsedPreview, page_faqs: updated }); setJsonEditors({ ...jsonEditors, page_faqs: JSON.stringify(updated, null, 2) }); }} className="h-8 text-xs font-semibold" placeholder="Pergunta..." />
                            <textarea value={faq.answer} onChange={(e) => { const updated = [...parsedPreview.page_faqs]; updated[index].answer = e.target.value; setParsedPreview({ ...parsedPreview, page_faqs: updated }); setJsonEditors({ ...jsonEditors, page_faqs: JSON.stringify(updated, null, 2) }); }} className="w-full h-16 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-[#B300FF] resize-none" placeholder="Resposta..." />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <div className="w-[40%] bg-slate-50 overflow-y-auto relative flex flex-col">
          <div className="sticky top-0 px-6 pt-6 pb-4 z-20 bg-slate-50 border-b border-slate-200 shadow-xs shrink-0">
            <h3 className="font-black text-sm uppercase text-slate-800 flex items-center gap-2"><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#B300FF] opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-[#B300FF]"></span></span> Live Preview</h3>
          </div>
          <div className="p-6 space-y-6 pb-20 max-w-xl mx-auto w-full">
            {parsedPreview.page_configs && Object.keys(parsedPreview.page_configs).length > 0 ? (
              <div className="bg-white p-5 rounded-2xl shadow-lg border border-slate-100"><OfferPanelRender config={parsedPreview.page_configs} /></div>
            ) : (<div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs">Page Configs vazio.</div>)}
            {parsedPreview.consent_configs && parsedPreview.consent_configs.length > 0 && (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200"><DynamicConsentsStatic configs={parsedPreview.consent_configs} /></div>
            )}
            {parsedPreview.page_faqs && parsedPreview.page_faqs.length > 0 && (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200"><FAQSection items={parsedPreview.page_faqs} /></div>
            )}
            {parsedPreview.page_configs?.footer && (
              <div className="pt-4"><FooterRender config={parsedPreview.page_configs.footer} /></div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =========================================================================
// [COMPONENTE PRINCIPAL]: OrchestratorConfigsBackofficePage
// =========================================================================
function OrchestratorConfigsBackofficePage() {
  const [rows, setRows] = useState<OrchestratorRow[]>([]);
  const [productsMap, setProductsMap] = useState<Record<string, string>>({});
  const [categoriesMap, setCategoriesMap] = useState<Record<string, string>>({});
  const [partnersMap, setPartnersMap] = useState<Record<string, { name: string; logo_url: string }>>({});

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");

  const [isRouteDrawerOpen, setIsRouteDrawerOpen] = useState(false);
  const [activeConfig, setActiveConfig] = useState<OrchestratorRow | null>(null);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<OrchestratorRow | null>(null);

  const printRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    try {
      // ✨ [ZERO-TRUST]: Leitura Blindada 4 em 1
      const { data, error } = await supabase.rpc('get_backoffice_orchestrator_data');
      if (error) throw error;

      if (data) {
        setRows((data.configs as OrchestratorRow[]) || []);
        
        const pMap: Record<string, string> = {};
        (data.products || []).forEach((p: any) => pMap[String(p.id)] = p.name);
        setProductsMap(pMap);

        const cMap: Record<string, string> = {};
        (data.categories || []).forEach((c: any) => cMap[String(c.id)] = c.name);
        setCategoriesMap(cMap);

        const ptMap: Record<string, { name: string; logo_url: string }> = {};
        (data.partners || []).forEach((pt: any) => ptMap[String(pt.id)] = { name: pt.name, logo_url: pt.logo_url });
        setPartnersMap(ptMap);
      }
    } catch (err) {
      console.error("Erro crítico ao carregar dados do orchestrator:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const handleDuplicateRoute = (config: OrchestratorRow) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, ...rest } = config;
    setEditingConfig(rest);
    setIsRouteDrawerOpen(false); 
    setIsEditorOpen(true);
  };

  const handleSaveRoute = async (payload: OrchestratorRow) => {
    try {
      // ✨ [ZERO-TRUST]: Escrita (Upsert) Blindada
      const { error } = await supabase.rpc('save_backoffice_orchestrator_config', {
        p_payload: payload
      });
      if (error) throw error;

      setIsEditorOpen(false);
      load();
    } catch (err: any) {
      console.error("Erro de BD ao salvar a rota:", err);
      throw new Error(err.message || "Erro desconhecido ao comunicar com o banco de dados.");
    }
  };

  const getProductOrCategoryName = (r: OrchestratorRow) => {
    if (r.config_type === "PRODUCT" && productsMap[r.lookup_id]) return productsMap[r.lookup_id];
    if (r.config_type === "CATEGORY" && categoriesMap[r.lookup_id]) return categoriesMap[r.lookup_id];
    if (r.config_type === "SELLER" && partnersMap[r.lookup_id]) return partnersMap[r.lookup_id].name;
    if (r.config_type === "EVENT") return `Evento: ${r.lookup_id}`;
    return r.lookup_id ? `ID #${r.lookup_id}` : "—";
  };

  const getPartnerInfo = (r: OrchestratorRow) => {
    const partnerId = r.partner_id || r.integration_details?.partner_id || r.page_configs?.offer_panel?.partner?.id;
    if (partnerId && partnersMap[String(partnerId)]) return partnersMap[String(partnerId)];
    return null;
  };

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        const isActive = r.is_active !== false;
        if (statusFilter === "active" && !isActive) return false;
        if (statusFilter === "inactive" && isActive) return false;
        if (!query) return true;
        const prodName = getProductOrCategoryName(r).toLowerCase();
        return (
          (String(r.id) ?? "").toLowerCase().includes(query) ||
          (r.lookup_id ?? "").toLowerCase().includes(query) ||
          (r.page_url ?? "").toLowerCase().includes(query) ||
          (r.config_type ?? "").toLowerCase().includes(query) ||
          (r.entity_type ?? "").toLowerCase().includes(query) ||
          prodName.includes(query)
        );
      })
      .sort((a, b) => {
        const idA = Number(a.id) || 0;
        const idB = Number(b.id) || 0;
        return idA - idB;
      });
  }, [rows, search, statusFilter, productsMap, categoriesMap]);

  const partnersList = useMemo(() => Object.entries(partnersMap).map(([id, p]) => ({ id, name: p.name })), [partnersMap]);
  const productsList = useMemo(() => Object.entries(productsMap).map(([id, name]) => ({ id, name })), [productsMap]);
  const categoriesList = useMemo(() => Object.entries(categoriesMap).map(([id, name]) => ({ id, name })), [categoriesMap]);

  const handlePrintSheet = () => {
    if (!printRef.current) return;
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed"; iframe.style.right = "0"; iframe.style.bottom = "0"; iframe.style.width = "0"; iframe.style.height = "0"; iframe.style.border = "0";
    document.body.appendChild(iframe);
    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) return;
    const headHTML = document.head.innerHTML;
    const reportHTML = printRef.current.innerHTML;
    iframeDoc.open();
    iframeDoc.write(`<!DOCTYPE html><html lang="pt-BR"><head>${headHTML}<style>@page { margin: 15mm; } body { background-color: white !important; color: #0f172a !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }</style></head><body>${reportHTML}</body></html>`);
    iframeDoc.close();
    setTimeout(() => { if (iframe.contentWindow) { iframe.contentWindow.focus(); iframe.contentWindow.print(); } setTimeout(() => { document.body.removeChild(iframe); }, 1000); }, 500);
  };

  return (
    <div className="space-y-6 font-sans">
      <style>{`@media print { body > *:not(#root) { display: none !important; } #main-app-content { display: none !important; } html, body, #root { background: white !important; height: auto !important; min-height: 100% !important; overflow: visible !important; position: static !important; } }`}</style>

      <div id="main-app-content" className="space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Consulta de Rotas</h1>
            <p className="text-sm text-muted-foreground">Gerenciamento e inspeção ordenada das configurações de rotas.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={load} className="rounded-xl bg-white" disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            <Button onClick={() => { setEditingConfig(null); setIsEditorOpen(true); }} className="rounded-xl bg-[#B300FF] hover:bg-[#9f00e6] hidden sm:flex">
              <Plus className="mr-2 h-4 w-4" /> Nova Rota
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 border-b border-border p-4">
            <div className="relative w-full lg:flex-1 lg:max-w-md">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por ID, URL, Produto..." className="h-11 w-full rounded-full bg-slate-100/70 border-transparent pl-5 pr-12 text-[13px] text-slate-700 placeholder:text-slate-500 focus-visible:ring-primary/20 focus-visible:bg-white focus-visible:border-primary/30 shadow-none" />
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-[#B300FF]" />
            </div>
            <div className="flex items-center gap-2 lg:ml-auto">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10 rounded-xl gap-2 bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8] hover:bg-[#fce7f3] transition-colors">
                    <Filter className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Status: {statusFilter === "active" ? "Ativas" : statusFilter === "inactive" ? "Inativas" : "Todas"}</span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-48 bg-[#fdf2f8] border-[#fbcfe8] z-50" align="start">
                  <Command className="bg-transparent">
                    <CommandList>
                      <CommandGroup>
                        <CommandItem onSelect={() => setStatusFilter("active")} className="cursor-pointer text-[#d946ef] hover:bg-[#fce7f3] aria-selected:bg-[#fce7f3]">Apenas Ativas</CommandItem>
                        <CommandItem onSelect={() => setStatusFilter("inactive")} className="cursor-pointer text-[#d946ef] hover:bg-[#fce7f3] aria-selected:bg-[#fce7f3]">Apenas Inativas</CommandItem>
                        <CommandItem onSelect={() => setStatusFilter("all")} className="cursor-pointer text-[#d946ef] hover:bg-[#fce7f3] aria-selected:bg-[#fce7f3]">Todas</CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 w-[80px]">ID</th>
                  <th className="px-3 py-3 w-[260px]">Regra</th>
                  <th className="px-3 py-3 w-[150px]">Parceiro</th>
                  <th className="px-3 py-3 w-[300px]">URL da Página</th>
                  <th className="px-3 py-3 w-[220px] text-right hidden sm:table-cell">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="p-10 text-center text-muted-foreground"><div className="flex items-center justify-center gap-2"><Loader2 className="h-4 w-4 animate-spin text-primary" /> Carregando informações...</div></td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="p-10 text-center text-muted-foreground">Nenhuma rota encontrada.</td></tr>
                ) : (
                  filtered.map((r) => {
                    const prodName = getProductOrCategoryName(r);
                    const partner = getPartnerInfo(r);
                    return (
                      <tr key={r.id} className="border-b border-border/60 hover:bg-accent/40 transition-colors group cursor-pointer" onClick={() => { setActiveConfig(r); setIsRouteDrawerOpen(true); }}>
                        <td className="px-3 py-3 font-mono text-sm text-foreground">{r.id || "—"}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5"><span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-[#B300FF]/10 text-[#B300FF]">{r.config_type || "—"}</span><span className="text-[11px] text-muted-foreground">({r.entity_type || "N/A"})</span></div>
                          <div className="text-xs text-foreground mt-1 font-normal truncate" title={prodName}>{prodName}</div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5 truncate">
                            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-transparent overflow-hidden shrink-0 border bg-white" title={partner?.name}>
                              {partner?.logo_url ? <img src={partner.logo_url} className="h-full w-full object-cover" alt={partner.name} /> : <span className="flex items-center justify-center h-full w-full text-[10px] font-bold uppercase">{partner?.name ? partner.name.slice(0, 3) : "—"}</span>}
                            </div>
                            <span className="text-xs font-medium text-slate-700 truncate" title={partner?.name}>{partner?.name || "N/A"}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-muted-foreground truncate" title={r.page_url}>{r.page_url || "—"}</td>
                        <td className="px-3 py-3 text-right hidden sm:table-cell">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setActiveConfig(r); setIsRouteDrawerOpen(true); }} className="rounded-lg text-slate-500 hover:text-slate-900 px-2 h-8 text-[11px]"><Search className="w-3.5 h-3.5 mr-1" /> Insp.</Button>
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); handleDuplicateRoute(r); }} className="rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 h-8 text-[11px]"><Copy className="w-3.5 h-3.5 mr-1" /> Duplicar</Button>
                            <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditingConfig(r); setIsEditorOpen(true); }} className="rounded-lg text-[#B300FF] hover:text-[#9a00db] hover:bg-[#B300FF]/10 px-2 h-8 text-[11px]"><Edit className="w-3.5 h-3.5 mr-1" /> Edit</Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {isRouteDrawerOpen && activeConfig && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-all">
            <div className="w-full sm:max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
              <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-slate-50 shrink-0">
                <div className="flex items-center gap-2 truncate pr-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#B300FF] shrink-0" />
                  <h3 className="text-xs sm:text-sm font-black uppercase text-slate-800 truncate">Consulta de Rota: ID #{activeConfig.id} - {getProductOrCategoryName(activeConfig)}</h3>
                </div>
                <button onClick={() => setIsRouteDrawerOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer shrink-0"><X size={18} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                <div className="space-y-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-[10px] sm:text-xs space-y-1.5 font-mono">
                    <p><b>ID Config:</b> {activeConfig.id} | <b>Lookup ID:</b> {activeConfig.lookup_id}</p>
                    <p><b>Tipo:</b> {activeConfig.config_type} ({activeConfig.entity_type})</p>
                    <p><b>Método:</b> {activeConfig.integration_method || "—"}</p>
                    <p className="break-words pt-1 border-t border-slate-200"><b>URL:</b> {activeConfig.page_url}</p>
                  </div>

                  {activeConfig.page_configs?.offer_panel && (
                    <div className="bg-white p-4 rounded-xl border shadow-sm"><h4 className="text-[11px] font-bold uppercase tracking-wider text-[#B300FF] flex items-center gap-1.5 mb-3"><Layers size={14} /> Offer Panel</h4><OfferPanelRender config={activeConfig.page_configs} /></div>
                  )}

                  <div className="flex flex-col gap-4">
                    {activeConfig.integration_details && Object.keys(activeConfig.integration_details).length > 0 && (
                      <div className="bg-slate-50 p-4 rounded-xl border text-xs overflow-hidden"><h4 className="font-bold text-slate-700 mb-2 uppercase text-[10px] tracking-wide flex items-center gap-1.5"><Code2 size={12} /> Integration Details</h4><pre className="font-mono text-[9px] text-slate-600 whitespace-pre-wrap break-all overflow-x-auto bg-white p-2.5 rounded border">{JSON.stringify(activeConfig.integration_details, null, 2)}</pre></div>
                    )}
                    {activeConfig.rules && Object.keys(activeConfig.rules).length > 0 && (
                      <div className="bg-slate-50 p-4 rounded-xl border text-xs overflow-hidden"><h4 className="font-bold text-slate-700 mb-2 uppercase text-[10px] tracking-wide flex items-center gap-1.5"><SlidersHorizontal size={12} /> Rules</h4><pre className="font-mono text-[9px] text-slate-600 whitespace-pre-wrap break-all overflow-x-auto bg-white p-2.5 rounded border">{JSON.stringify(activeConfig.rules, null, 2)}</pre></div>
                    )}
                  </div>

                  {activeConfig.consent_configs && activeConfig.consent_configs.length > 0 && (
                    <div className="bg-white p-4 rounded-xl border shadow-sm"><h4 className="text-[11px] font-bold uppercase tracking-wider text-[#B300FF] flex items-center gap-1.5 mb-3"><FileText size={14} /> Consentimentos</h4><DynamicConsentsStatic configs={activeConfig.consent_configs} /></div>
                  )}

                  {activeConfig.page_faqs && activeConfig.page_faqs.length > 0 && (
                    <div className="bg-white p-4 rounded-xl border shadow-sm"><h4 className="text-[11px] font-bold uppercase tracking-wider text-[#B300FF] flex items-center gap-1.5 mb-3"><HelpCircle size={14} /> FAQs</h4><FAQSection items={activeConfig.page_faqs} /></div>
                  )}

                  {activeConfig.page_configs?.footer && (
                    <div className="pt-2"><FooterRender config={activeConfig.page_configs.footer} /></div>
                  )}
                </div>
              </div>

              <div className="p-3 sm:p-4 border-t border-gray-200 bg-slate-50 flex flex-col gap-2 shrink-0 shadow-lg w-full">
                <div className="flex items-center gap-2 w-full">
                  <Button variant="outline" onClick={() => handleDuplicateRoute(activeConfig)} className="hidden sm:flex flex-1 rounded-xl text-xs gap-1.5 border-blue-500/35 text-blue-600 hover:bg-blue-50 h-10 font-semibold px-2"><Copy className="h-3.5 w-3.5 shrink-0" /> Duplicar</Button>
                  <Button variant="outline" onClick={handlePrintSheet} className="flex-1 rounded-xl text-xs gap-1.5 border-[#B300FF]/35 text-[#B300FF] hover:bg-[#B300FF]/5 h-10 font-semibold px-2"><Printer className="h-3.5 w-3.5 shrink-0" /> Imprimir</Button>
                </div>
                <Button onClick={() => setIsRouteDrawerOpen(false)} className="w-full rounded-xl text-xs bg-[#B300FF] hover:bg-[#9f00e6] text-white h-10 font-semibold">Fechar</Button>
              </div>
            </div>
          </div>
        )}

        {isEditorOpen && (
          <OrchestratorConfigEditor initialData={editingConfig} partnersList={partnersList} productsList={productsList} categoriesList={categoriesList} onClose={() => setIsEditorOpen(false)} onSave={handleSaveRoute} />
        )}
      </div>

      <div style={{ display: "none" }}>
        <div ref={printRef} className="w-full text-slate-900 bg-white p-8">
          {activeConfig && (() => {
            const r = activeConfig;
            const prodName = getProductOrCategoryName(r);
            return (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1"><span className="text-xs font-bold text-[#B300FF] uppercase">Consulta de Rota</span><span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border bg-slate-50 uppercase`}>{r.is_active ? "Ativa" : "Inativa"}</span></div>
                    <h1 className="text-2xl font-bold">{prodName}</h1>
                  </div>
                  <div className="text-right text-xs text-slate-500 font-mono">ID: {r.id}<br />Lookup ID: {r.lookup_id}</div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-1.5 font-mono">
                  <p><b>Tipo:</b> {r.config_type} ({r.entity_type})</p><p><b>URL:</b> {r.page_url}</p><p><b>Método:</b> {r.integration_method || "—"}</p>
                </div>

                {r.page_configs?.offer_panel && (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm break-inside-avoid"><h4 className="text-[11px] font-bold uppercase tracking-wider text-[#B300FF] flex items-center gap-1.5 mb-3"><Layers size={14} /> Offer Panel</h4><OfferPanelRender config={r.page_configs} /></div>
                )}
                {r.integration_details && Object.keys(r.integration_details).length > 0 && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs overflow-hidden break-inside-avoid"><h4 className="font-bold text-slate-700 mb-2 uppercase text-[10px] tracking-wide flex items-center gap-1.5"><Code2 size={12} /> Integration Details</h4><pre className="font-mono text-[9px] text-slate-600 whitespace-pre-wrap break-all bg-white p-2.5 rounded border">{JSON.stringify(r.integration_details, null, 2)}</pre></div>
                )}
                {r.rules && Object.keys(r.rules).length > 0 && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs overflow-hidden break-inside-avoid"><h4 className="font-bold text-slate-700 mb-2 uppercase text-[10px] tracking-wide flex items-center gap-1.5"><SlidersHorizontal size={12} /> Rules</h4><pre className="font-mono text-[9px] text-slate-600 whitespace-pre-wrap break-all bg-white p-2.5 rounded border">{JSON.stringify(r.rules, null, 2)}</pre></div>
                )}
                {r.consent_configs && r.consent_configs.length > 0 && (
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm break-inside-avoid"><h4 className="text-[11px] font-bold uppercase tracking-wider text-[#B300FF] flex items-center gap-1.5 mb-3"><FileText size={14} /> Consentimentos</h4><DynamicConsentsStatic configs={r.consent_configs} /></div>
                )}
                {r.page_faqs && r.page_faqs.length > 0 && (
                  <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm break-inside-avoid"><h4 className="text-[11px] font-bold uppercase tracking-wider text-[#B300FF] flex items-center gap-1.5 mb-3"><HelpCircle size={14} /> FAQs</h4><FAQSection items={r.page_faqs} isPrint={true} /></div>
                )}
                {r.page_configs?.footer && (
                  <div className="pt-2 break-inside-avoid"><FooterRender config={r.page_configs.footer} /></div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}