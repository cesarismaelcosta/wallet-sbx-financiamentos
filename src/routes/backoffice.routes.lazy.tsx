/**
 * ============================================================================
 * @fileoverview Consulta e Gestão de Rotas / Orchestrator (Backoffice)
 * @module Backoffice/OrchestratorConfigs
 * @route /backoffice/routes
 *
 * @description
 * Este módulo atua como o painel central de governança e inspeção das rotas e
 * configurações do Orchestrator. Ele realiza a listagem direta de registros na tabela
 * `orchestrator_configs`, cruzando informações relacionais com as tabelas de domínio
 * (`product_types`, `category_types` e `partners`). Inclui suporte a ordenação por ID,
 * filtragem dinâmica por status (Ativas/Inativas) e inspeção aprofundada via painel
 * lateral (Sheet/Drawer) estruturado com blocos visuais de propostas, regras, FAQs e LGPD.
 *
 * NOVO: Inclui um Editor Híbrido (Split-Screen) com Live Preview em tempo real
 * para criação e edição fluida de JSONs complexos.
 *
 * @architecture
 * - Data Fetching: Consultas relacionais diretas via PostgREST (Supabase Client).
 * - State Management: Hooks reativos do React (useState, useEffect, useMemo).
 * - Design System: Componentes padronizados do Tailwind CSS e Shadcn/UI.
 * - Funcionalidade de Duplicação: Permite clonar rotas existentes removendo IDs únicos.
 * - Impressão Avançada: Renderização isolada em Iframe Virtual (`printRef`)
 *   garantindo 100% de herança do Tailwind e blindagem contra portais do Radix UI.
 * ============================================================================
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  Loader2,
  RefreshCw,
  Search,
  Layers,
  FileText,
  HelpCircle,
  X,
  CheckCircle2,
  Code2,
  SlidersHorizontal,
  Filter,
  ChevronDown,
  Plus,
  Edit,
  Save,
  LayoutTemplate,
  Settings2,
  AlertTriangle,
  Copy,
  Printer,
} from "lucide-react";

// Componentes da Interface (Design System Shadcn/UI)
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

// Camada de Persistência (BaaS) e Dicionários Gráficos
import { supabase } from "@/integrations/supabase/client";
import { ICON_MAP } from "@/features/financial-hub/components/shared/icons-map";

// ============================================================================
// [REGISTRO DA ROTA TANSTACK ROUTER]
// ============================================================================
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

/**
 * =========================================================================
 * [RENDERIZADORES NATIVOS DO ORCHESTRATOR]
 * =========================================================================
 */

function OfferPanelRender({ config }: { config: any }) {
  const panel = config?.offer_panel || config;
  if (!panel?.headline?.parts || !panel?.description?.parts) return null;

  const brandColor = config?.theme?.primary_color || "var(--brand-primary)";

  const getTextStyle = (type: string) => {
    switch (type) {
      case "highlight":
        return "text-[#B300FF]";
      case "bold":
        return "font-bold text-foreground";
      default:
        return "text-foreground";
    }
  };

  return (
    <div className="space-y-4" style={{ "--brand-primary": brandColor } as React.CSSProperties}>
      <div className="space-y-2">
        <h2 className="text-base font-semibold leading-tight text-foreground sm:text-lg">
          {panel.headline.parts.map((part: any, i: number) => (
            <span key={i} className={getTextStyle(part.type)}>
              {part.text}
            </span>
          ))}
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {panel.description.parts.map((part: any, i: number) => (
            <span key={i} className={getTextStyle(part.type)}>
              {part.text}
            </span>
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
            <div
              key={`print-faq-${i}`}
              className="border border-slate-200 rounded-xl px-4 py-3 bg-white shadow-sm break-inside-avoid"
            >
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
              <AccordionItem
                key={i}
                value={`faq-item-${i}`}
                className="border border-border rounded-xl px-3 bg-white shadow-sm transition-all"
              >
                <AccordionTrigger className="text-left font-semibold text-xs text-foreground/90 py-2.5">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground text-[11px] leading-relaxed pb-2">
                  <div className="mb-2">{item.answer}</div>
                  {item.bullets && item.bullets.length > 0 && (
                    <div className="space-y-1 mt-1">
                      {item.bullets.map((bullet: string, idx: number) => (
                        <div key={idx} className="flex gap-1.5">
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
          <a
            key={index}
            href={linkMatch.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
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
                          return (
                            <span key={i} className="underline font-bold inline mx-0.5 text-[#B300FF]">
                              {cleanText}
                            </span>
                          );
                        }

                        if (linkConfig.type === "web" || linkConfig.url) {
                          return (
                            <a
                              key={i}
                              href={linkConfig.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline font-bold inline mx-0.5 hover:opacity-80"
                              style={{ color: "var(--brand-primary)" }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {cleanText}
                            </a>
                          );
                        }

                        if (linkConfig.type === "tooltip" || linkConfig.tooltip_text) {
                          return (
                            <Popover key={i}>
                              <PopoverTrigger asChild>
                                <span
                                  className="underline font-bold cursor-pointer border-b border-dashed inline mx-0.5 hover:opacity-80"
                                  style={{ color: "var(--brand-primary)", borderColor: "var(--brand-primary)" }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {cleanText}
                                </span>
                              </PopoverTrigger>
                              <PopoverContent
                                side="bottom"
                                align="start"
                                sideOffset={6}
                                className="max-w-xs p-3 bg-white text-slate-700 text-[11px] rounded-xl border border-slate-200 shadow-xl leading-relaxed z-[100]"
                                onClick={(e) => e.stopPropagation()}
                              >
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

/**
 * =========================================================================
 * [SUB-COMPONENTES DE CONSTRUTORES/BUILDERS]
 * =========================================================================
 */

function PaymentFactorsBuilder({
  factors = {},
  onChange,
}: {
  factors: Record<string, number>;
  onChange: (f: Record<string, number>) => void;
}) {
  const [entries, setEntries] = useState<Array<{ term: string; factor: any }>>(() =>
    Object.entries(factors || {}).map(([term, factor]) => ({ term, factor })),
  );

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
      if (item.term !== undefined && item.term !== "") {
        newObj[item.term] = Number(item.factor) || 0;
      }
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

  const addEntry = () => {
    setEntries([...entries, { term: "", factor: "" }]);
  };

  return (
    <div className="space-y-2 pt-2 border-t">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-bold text-slate-500 uppercase">
          Fatores de Pagamento por Prazo (Payment Factors)
        </label>
        <button
          type="button"
          onClick={addEntry}
          className="text-[10px] font-bold text-[#B300FF] hover:underline flex items-center"
        >
          <Plus size={12} className="mr-0.5" /> Adicionar Fator
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="text-[10px] text-slate-400 italic">
          Nenhum fator customizado configurado (usará padrão linear se aplicável).
        </p>
      ) : (
        <div className="space-y-2 bg-slate-50 p-2.5 rounded-lg border">
          {entries.map((entry, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <div className="w-1/3">
                <Input
                  placeholder="Prazo (ex: 12)"
                  value={entry.term}
                  onChange={(e) => updateEntry(idx, "term", e.target.value)}
                  className="h-8 text-xs font-mono bg-white"
                />
              </div>
              <div className="flex-1">
                <Input
                  type="number"
                  step="0.00000001"
                  placeholder="Fator (ex: 0.09916667)"
                  value={entry.factor}
                  onChange={(e) => updateEntry(idx, "factor", e.target.value)}
                  className="h-8 text-xs font-mono bg-white"
                />
              </div>
              <button
                type="button"
                onClick={() => removeEntry(idx)}
                className="text-slate-300 hover:text-red-500 transition-colors p-1"
                title="Remover linha"
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ConsentItemBuilder({
  consent,
  onUpdate,
  onRemove,
}: {
  consent: any;
  onUpdate: (c: any) => void;
  onRemove: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleTextChange = (newText: string) => {
    const matches = newText.match(/\{([^}]+)\}/g) || [];
    const currentTags = matches.map((m) => m.replace(/[{}]/g, ""));

    const existingLinks = consent.links || [];
    const newLinks = currentTags.map((tag) => {
      const found = existingLinks.find((l: any) => l.text === tag);
      return found || { text: tag, type: "web", url: "", tooltip_text: "" };
    });

    onUpdate({ ...consent, template_text: newText, links: newLinks });
  };

  const handleInsertTag = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = consent.template_text || "";

    if (start === end) {
      alert("Por favor, selecione uma palavra no texto primeiro para criar o link.");
      return;
    }

    const selectedText = text.substring(start, end);
    if (selectedText.includes("{") || selectedText.includes("}")) return;

    const newText = text.substring(0, start) + `{${selectedText}}` + text.substring(end);

    handleTextChange(newText);
    setTimeout(() => {
      textarea.focus();
    }, 0);
  };

  const updateLinkConfig = (index: number, updates: any) => {
    const newLinks = [...(consent.links || [])];
    newLinks[index] = { ...newLinks[index], ...updates };
    onUpdate({ ...consent, links: newLinks });
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative group">
      <button
        onClick={onRemove}
        className="absolute top-3 right-3 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Remover Termo"
      >
        <X size={16} />
      </button>

      <div className="grid gap-4">
        <div className="flex gap-4 items-end">
          <div className="flex-1 space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase">ID do Termo</label>
            <Input
              value={consent.id}
              onChange={(e) => onUpdate({ ...consent, id: e.target.value })}
              className="h-8 text-xs font-mono bg-slate-50"
            />
          </div>
          <div className="flex items-center gap-2 mb-1.5">
            <Switch checked={consent.is_required} onCheckedChange={(v) => onUpdate({ ...consent, is_required: v })} />
            <span className="text-[10px] font-medium text-slate-500">Obrigatório?</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-bold text-slate-500 uppercase">Texto do Termo</label>
            <button
              onClick={handleInsertTag}
              className="text-[10px] font-bold text-[#B300FF] bg-[#B300FF]/10 px-2 py-1 rounded hover:bg-[#B300FF]/20 transition-colors flex items-center"
              type="button"
            >
              🔗 Criar Link (Selecione o texto)
            </button>
          </div>
          <textarea
            ref={textareaRef}
            value={consent.template_text || ""}
            onChange={(e) => handleTextChange(e.target.value)}
            className="w-full h-16 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-[#B300FF] resize-none"
            placeholder="Ex: Concordo com a Política de Privacidade."
          />
        </div>

        {consent.links && consent.links.length > 0 && (
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-2 mt-1">
            <h5 className="text-[10px] font-bold text-slate-500 uppercase mb-2">Configuração dos Links</h5>
            {consent.links.map((link: any, idx: number) => (
              <div
                key={idx}
                className="flex flex-col gap-2.5 bg-white p-3 rounded-lg border border-slate-200 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3 w-full">
                  <div className="flex-1">
                    <span className="text-[9px] text-slate-400 block uppercase mb-0.5">Texto Destacado</span>
                    <span className="text-xs font-bold text-slate-800 leading-snug block">{link.text}</span>
                  </div>

                  <div className="w-[120px]">
                    <Select value={link.type} onValueChange={(v) => updateLinkConfig(idx, { type: v })}>
                      <SelectTrigger className="h-8 text-[11px] bg-slate-50">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="web">Link Web</SelectItem>
                        <SelectItem value="tooltip">Tooltip</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="w-full">
                  {link.type === "web" ? (
                    <Input
                      type="url"
                      placeholder="https://exemplo.com/url"
                      value={link.url || ""}
                      onChange={(e) => updateLinkConfig(idx, { url: e.target.value })}
                      className="h-8 text-xs w-full bg-slate-50"
                    />
                  ) : (
                    <textarea
                      placeholder="Digite o texto detalhado do balão de ajuda..."
                      value={link.tooltip_text || ""}
                      onChange={(e) => updateLinkConfig(idx, { tooltip_text: e.target.value })}
                      className="w-full min-h-[70px] border border-slate-200 rounded-md p-2.5 text-xs outline-none focus:border-[#B300FF] resize-y leading-relaxed text-slate-700 bg-slate-50"
                    />
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

function TextPartsBuilder({
  label,
  parts = [],
  onChange,
}: {
  label: string;
  parts: any[];
  onChange: (p: any[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-slate-500 uppercase">{label}</label>
      <div className="space-y-2 bg-slate-50/50 p-2.5 border rounded-lg">
        {parts.map((part, idx) => (
          <div key={idx} className="flex gap-2 items-center">
            <Input
              value={part.text}
              onChange={(e) => {
                const newParts = [...parts];
                newParts[idx].text = e.target.value;
                onChange(newParts);
              }}
              className="h-8 text-xs flex-1 bg-white"
              placeholder="Digite o pedaço do texto..."
            />
            <Select
              value={part.type || "normal"}
              onValueChange={(v) => {
                const newParts = [...parts];
                newParts[idx].type = v;
                onChange(newParts);
              }}
            >
              <SelectTrigger className="h-8 w-28 text-[11px] bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="bold">Negrito</SelectItem>
                <SelectItem value="highlight">Destaque Cor</SelectItem>
              </SelectContent>
            </Select>
            <button
              onClick={() => onChange(parts.filter((_, i) => i !== idx))}
              className="text-slate-300 hover:text-red-500 transition-colors"
            >
              <X size={14} />
            </button>
          </div>
        ))}
        {parts.length === 0 && (
          <p className="text-[10px] text-slate-400 italic text-center py-1">Nenhum texto configurado.</p>
        )}
        <Button
          type="button"
          onClick={() => onChange([...parts, { text: "", type: "normal" }])}
          variant="ghost"
          size="sm"
          className="h-7 text-[10px] text-[#B300FF] w-full mt-1 border border-dashed border-[#B300FF]/40 hover:bg-[#B300FF]/10"
        >
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
          <button
            onClick={() => onChange(benefits.filter((_, i) => i !== idx))}
            className="absolute top-2 right-2 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
            title="Remover Benefício"
          >
            <X size={14} />
          </button>

          <div className="flex gap-3">
            <div className="w-1/3 space-y-1">
              <label className="text-[9px] font-bold text-slate-500 uppercase">Ícone</label>
              <Select
                value={ben.icon}
                onValueChange={(v) => {
                  const n = [...benefits];
                  n[idx].icon = v;
                  onChange(n);
                }}
              >
                <SelectTrigger className="h-8 text-[11px] bg-white">
                  <SelectValue placeholder="Escolha..." />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {iconOptions.map((iconKey) => {
                    const IconComponent = ICON_MAP[iconKey];
                    return (
                      <SelectItem key={iconKey} value={iconKey}>
                        <div className="flex items-center gap-2">
                          {IconComponent && <IconComponent className="w-3.5 h-3.5 text-[#B300FF]" />}
                          <span>{iconKey}</span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="w-2/3 space-y-1">
              <label className="text-[9px] font-bold text-slate-500 uppercase">Título</label>
              <Input
                value={ben.title}
                onChange={(e) => {
                  const n = [...benefits];
                  n[idx].title = e.target.value;
                  onChange(n);
                }}
                className="h-8 text-xs bg-white"
                placeholder="Ex: Até 48 meses"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[9px] font-bold text-slate-500 uppercase">Descrição</label>
            <Input
              value={ben.description}
              onChange={(e) => {
                const n = [...benefits];
                n[idx].description = e.target.value;
                onChange(n);
              }}
              className="h-8 text-xs bg-white"
              placeholder="Ex: Escolha a parcela que cabe no seu bolso"
            />
          </div>
        </div>
      ))}
      <Button
        type="button"
        onClick={() => onChange([...benefits, { icon: "Check", title: "", description: "" }])}
        variant="outline"
        size="sm"
        className="h-8 text-[10px] w-full border-dashed"
      >
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
    const newLinks = currentTags.map((tag) => {
      const found = existingLinks.find((l: any) => l.text === tag);
      return found || { text: tag, url: "" };
    });

    onChange({ ...footer, template_text: newText, links: newLinks });
  };

  const handleInsertTag = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = footer.template_text || "";

    if (start === end) {
      alert("Por favor, selecione uma palavra no texto primeiro para criar o link.");
      return;
    }

    const selectedText = text.substring(start, end);
    if (selectedText.includes("{") || selectedText.includes("}")) return;

    const newText = text.substring(0, start) + `{${selectedText}}` + text.substring(end);

    handleTextChange(newText);
    setTimeout(() => {
      textarea.focus();
    }, 0);
  };

  const updateLinkConfig = (index: number, urlValue: string) => {
    const newLinks = [...(footer.links || [])];
    newLinks[index].url = urlValue;
    onChange({ ...footer, links: newLinks });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <label className="text-[10px] font-bold text-slate-500 uppercase">Texto do Rodapé</label>
        <button
          onClick={handleInsertTag}
          className="text-[10px] font-bold text-[#B300FF] bg-[#B300FF]/10 px-2 py-1 rounded hover:bg-[#B300FF]/20 transition-colors flex items-center"
          type="button"
        >
          🔗 Criar Link (Selecione o texto)
        </button>
      </div>

      <textarea
        ref={textareaRef}
        value={footer.template_text || ""}
        onChange={(e) => handleTextChange(e.target.value)}
        className="w-full h-24 border border-slate-200 rounded-lg p-2.5 text-xs outline-none focus:border-[#B300FF] resize-y leading-relaxed text-slate-600 bg-white"
        placeholder="© 2026 Wallet sbX. Autorizado por {Nome da Empresa}."
      />

      {footer.links && footer.links.length > 0 && (
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100 space-y-2 mt-2">
          <h5 className="text-[10px] font-bold text-slate-500 uppercase mb-2">URLs Mapeadas no Texto</h5>
          {footer.links.map((link: any, idx: number) => (
            <div key={idx} className="flex flex-col gap-2.5 bg-white p-3 rounded-lg border border-slate-200 shadow-sm">
              <div className="w-full">
                <span className="text-[9px] text-slate-400 block uppercase mb-0.5">Texto Destacado</span>
                <span className="text-xs font-bold text-slate-800 leading-snug block">{link.text}</span>
              </div>
              <div className="w-full">
                <Input
                  type="url"
                  placeholder="https://exemplo.com/url"
                  value={link.url || ""}
                  onChange={(e) => updateLinkConfig(idx, e.target.value)}
                  className="h-8 text-xs w-full bg-slate-50"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * =========================================================================
 * [COMPONENTE DE EDITOR]: OrchestratorConfigEditor (Split-Screen)
 * =========================================================================
 */
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
    integration_details:
      initialData?.integration_details && Object.keys(initialData.integration_details).length > 0
        ? JSON.stringify(initialData.integration_details, null, 2)
        : "{\n  \n}",
    rules:
      initialData?.rules && Object.keys(initialData.rules).length > 0
        ? JSON.stringify(initialData.rules, null, 2)
        : "{\n  \n}",
    page_configs:
      initialData?.page_configs && Object.keys(initialData.page_configs).length > 0
        ? JSON.stringify(initialData.page_configs, null, 2)
        : "{\n  \n}",
    consent_configs:
      initialData?.consent_configs && initialData.consent_configs.length > 0
        ? JSON.stringify(initialData.consent_configs, null, 2)
        : "[\n  \n]",
    page_faqs:
      initialData?.page_faqs && initialData.page_faqs.length > 0
        ? JSON.stringify(initialData.page_faqs, null, 2)
        : "[\n  \n]",
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
    if (hasErrors) {
      alert("Corrija os erros de JSON antes de salvar.");
      return;
    }

    if (!formData.lookup_id) {
      alert("O campo Lookup ID é obrigatório.");
      return;
    }

    if (!formData.partner_id) {
      alert("O campo Vincular Parceiro Oficial é obrigatório.");
      return;
    }

    const integrationDetailsToSave =
      parsedPreview.integration_details || JSON.parse(jsonEditors.integration_details || "{}");

    if (formData.integration_method === "EMAIL" && !integrationDetailsToSave.email) {
      alert("O campo E-mail de Destino (em Regras & Integração) é obrigatório quando o método for E-mail.");
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
    } catch (e: any) {
      alert(`Erro ao salvar: ${e.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-100 flex flex-col animate-in fade-in duration-200">
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b shadow-sm shrink-0">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            {initialData?.id ? (
              <>
                <Edit size={18} className="text-[#B300FF]" /> Editando Rota #{initialData.id}
              </>
            ) : (
              <>
                <Plus size={18} className="text-[#B300FF]" /> Nova Configuração de Rota
              </>
            )}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure parâmetros, integrações e o visual da oferta.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSaveClick} disabled={isSaving} className="bg-[#B300FF] hover:bg-[#9f00e6]">
            {isSaving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Salvar Rota
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[60%] flex flex-col bg-white border-r overflow-hidden shadow-[4px_0_24px_-12px_rgba(0,0,0,0.1)] z-10">
          <Tabs defaultValue="general" className="flex-1 flex flex-col h-full">
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0 h-12 shrink-0">
              <TabsTrigger value="general" className="data-[state=active]:border-b-2 data-[state=active]:border-[#B300FF] rounded-none h-full px-6">
                <Settings2 className="w-4 h-4 mr-2" /> Geral
              </TabsTrigger>
              <TabsTrigger value="rules" className="data-[state=active]:border-b-2 data-[state=active]:border-[#B300FF] rounded-none h-full px-6">
                <Code2 className="w-4 h-4 mr-2" /> Regras & Integração
              </TabsTrigger>
              <TabsTrigger value="visual" className="data-[state=active]:border-b-2 data-[state=active]:border-[#B300FF] rounded-none h-full px-6">
                <LayoutTemplate className="w-4 h-4 mr-2" /> Oferta & Rodapé
              </TabsTrigger>
              <TabsTrigger value="legal" className="data-[state=active]:border-b-2 data-[state=active]:border-[#B300FF] rounded-none h-full px-6">
                <FileText className="w-4 h-4 mr-2" /> Consentimentos & FAQs
              </TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto p-6">
              <TabsContent value="general" className="space-y-6 mt-0">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 uppercase">Tipo de Configuração</label>
                    <Select value={formData.config_type} onValueChange={(v) => setFormData({ ...formData, config_type: v })}>
                      <SelectTrigger className="h-11 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
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
                    <label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1.5">
                      {formData.config_type === "EVENT" && "ID / Código do Evento"}       
                      {formData.config_type === "SELLER" && "Parceiro / Seller"}
                      {formData.config_type === "PRODUCT" && "Produto Oficial"}
                      {formData.config_type === "SUBCATEGORY" && "ID da Subcategoria"}
                      {formData.config_type === "CATEGORY" && "Categoria Oficial"}
                      <span className="text-red-500">*</span>
                    </label>

                    {formData.config_type === "PRODUCT" ? (
                      <Select value={String(formData.lookup_id || "")} onValueChange={(v) => setFormData({ ...formData, lookup_id: v })}>
                        <SelectTrigger className="h-11 rounded-xl">
                          <SelectValue placeholder="Selecione o produto..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {productsList.length > 0 ? (
                            productsList.map((p) => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                {p.name} <span className="text-slate-400 font-mono text-[10px]">(ID: {p.id})</span>
                              </SelectItem>
                            ))
                          ) : (
                            <div className="p-3 text-xs text-slate-400 text-center">Nenhum produto encontrado</div>
                          )}
                        </SelectContent>
                      </Select>
                    ) : formData.config_type === "CATEGORY" ? (
                      <Select value={String(formData.lookup_id || "")} onValueChange={(v) => setFormData({ ...formData, lookup_id: v })}>
                        <SelectTrigger className="h-11 rounded-xl">
                          <SelectValue placeholder="Selecione a categoria..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {categoriesList.length > 0 ? (
                            categoriesList.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.name} <span className="text-slate-400 font-mono text-[10px]">(ID: {c.id})</span>
                              </SelectItem>
                            ))
                          ) : (
                            <div className="p-3 text-xs text-slate-400 text-center">Nenhuma categoria encontrada</div>
                          )}
                        </SelectContent>
                      </Select>
                    ) : formData.config_type === "SELLER" ? (
                      <Select value={String(formData.lookup_id || "")} onValueChange={(v) => setFormData({ ...formData, lookup_id: v })}>
                        <SelectTrigger className="h-11 rounded-xl">
                          <SelectValue placeholder="Selecione o seller/parceiro..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-60">
                          {partnersList.length > 0 ? (
                            partnersList.map((pt) => (
                              <SelectItem key={pt.id} value={String(pt.id)}>
                                {pt.name} <span className="text-slate-400 font-mono text-[10px]">(ID: {pt.id})</span>
                              </SelectItem>
                            ))
                          ) : (
                            <div className="p-3 text-xs text-slate-400 text-center">Nenhum parceiro encontrado</div>
                          )}
                        </SelectContent>
                      </Select>
                    ) : formData.config_type === "SUBCATEGORY" ? (
                      <Input
                        type="number"
                        value={formData.lookup_id}
                        onChange={(e) => setFormData({ ...formData, lookup_id: e.target.value })}
                        placeholder="Ex: 10102"
                        className="h-11 rounded-xl font-mono text-sm"
                      />
                    ) : (
                      <Input
                        value={formData.lookup_id}
                        onChange={(e) => setFormData({ ...formData, lookup_id: e.target.value })}
                        placeholder="Ex: ID ou código do evento..."
                        className="h-11 rounded-xl font-mono text-sm"
                      />
                    )}
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 uppercase">Público (Entity Type)</label>
                    <Select value={formData.entity_type} onValueChange={(v) => setFormData({ ...formData, entity_type: v })}>
                      <SelectTrigger className="h-11 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PF">Pessoa Física (PF)</SelectItem>
                        <SelectItem value="PJ">Pessoa Jurídica (PJ)</SelectItem>
                        <SelectItem value="PF+PJ">Ambos (PF+PJ)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-600 uppercase">Método de Integração</label>
                    <Select value={formData.integration_method} onValueChange={(v) => setFormData({ ...formData, integration_method: v })}>
                      <SelectTrigger className="h-11 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="API">API</SelectItem>
                        <SelectItem value="EMAIL">E-mail (EMAIL)</SelectItem>
                        <SelectItem value="FILE">Arquivo (FILE)</SelectItem>
                        <SelectItem value="MANUAL">Manual (MANUAL)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2 col-span-2">
                    <label className="text-xs font-bold text-slate-600 uppercase">
                      URL de Destino (Front-end ou Parceiro)
                    </label>
                    <Input
                      value={formData.page_url}
                      onChange={(e) => setFormData({ ...formData, page_url: e.target.value })}
                      className="h-11 rounded-xl font-mono text-sm"
                    />
                  </div>

                  <div className="space-y-2 col-span-2">
                    <label className="text-xs font-bold text-slate-600 uppercase flex items-center gap-1.5">
                      Vincular Parceiro Oficial <span className="text-red-500">*</span>
                    </label>
                    <Select value={String(formData.partner_id || "")} onValueChange={(v) => setFormData({ ...formData, partner_id: v })}>
                      <SelectTrigger className="h-11 rounded-xl">
                        <SelectValue placeholder="Selecione um parceiro obrigatório..." />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {partnersList.length > 0 ? (
                          partnersList.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              {p.name}
                            </SelectItem>
                          ))
                        ) : (
                          <div className="p-3 text-xs text-slate-400 text-center">Nenhum parceiro encontrado</div>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="col-span-2 grid grid-cols-2 gap-4 pt-4">
                    <div className="p-4 bg-slate-50 border rounded-xl flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-sm text-slate-800">Status Ativo</h4>
                        <p className="text-[11px] text-muted-foreground">Define se a rota está online</p>
                      </div>
                      <Switch
                        checked={formData.is_active}
                        onCheckedChange={(v) => setFormData({ ...formData, is_active: v })}
                      />
                    </div>

                    <div className="p-4 bg-slate-50 border rounded-xl flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-sm text-slate-800">É Integrada?</h4>
                        <p className="text-[11px] text-muted-foreground">Exige orquestração sistêmica</p>
                      </div>
                      <Switch
                        checked={formData.is_integrated}
                        onCheckedChange={(v) => setFormData({ ...formData, is_integrated: v })}
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="rules" className="space-y-6 mt-0 pb-8">
                <div className="flex justify-between items-center bg-purple-50 p-3 rounded-xl border border-purple-100">
                  <div>
                    <h3 className="font-bold text-slate-800 uppercase text-xs flex items-center gap-2">
                      <SlidersHorizontal size={14} className="text-[#B300FF]" /> Regras de Negócio & Integração
                    </h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Configure os parâmetros de simulação, limites e webhooks de comunicação.
                    </p>
                  </div>
                </div>

                {(() => {
                  const rules = parsedPreview.rules || {};
                  const integration = parsedPreview.integration_details || {};

                  const updateRules = (newRules: any) => {
                    setParsedPreview({ ...parsedPreview, rules: newRules });
                    setJsonEditors({ ...jsonEditors, rules: JSON.stringify(newRules, null, 2) });
                  };

                  const updateIntegration = (newInt: any) => {
                    setParsedPreview({ ...parsedPreview, integration_details: newInt });
                    setJsonEditors({ ...jsonEditors, integration_details: JSON.stringify(newInt, null, 2) });
                  };

                  return (
                    <div className="space-y-6">
                      <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
                        <h4 className="text-[11px] font-bold uppercase text-slate-800 border-b pb-2">
                          1. Credenciais & Canais (Integração)
                        </h4>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">CNPJ da Loja</label>
                            <Input
                              value={integration.cnpjLoja || ""}
                              onChange={(e) => updateIntegration({ ...integration, cnpjLoja: e.target.value })}
                              className="h-8 text-xs font-mono"
                              placeholder="Ex: 15314890000183"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                              URL do WhatsApp de Atendimento
                            </label>
                            <Input
                              value={integration.urlWhatsApp || ""}
                              onChange={(e) => updateIntegration({ ...integration, urlWhatsApp: e.target.value })}
                              className="h-8 text-xs font-mono"
                              placeholder="Ex: https://wa.me/55..."
                            />
                          </div>
                        </div>

                        {formData.integration_method === "EMAIL" && (
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1.5">
                              E-mail de Destino <span className="text-red-500">*</span>
                            </label>
                            <Input
                              type="email"
                              value={integration.email || ""}
                              onChange={(e) => updateIntegration({ ...integration, email: e.target.value })}
                              className="h-8 text-xs font-mono border-blue-200 bg-blue-50 focus-visible:ring-blue-500"
                              placeholder="Ex: contato@empresa.com"
                            />
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">
                            URL de Redirecionamento Direto (Opcional - ex: Seguros)
                          </label>
                          <Input
                            value={integration.urlRedirect || ""}
                            onChange={(e) => updateIntegration({ ...integration, urlRedirect: e.target.value })}
                            className="h-8 text-xs font-mono"
                            placeholder="https://..."
                          />
                        </div>
                      </div>

                      <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
                        <h4 className="text-[11px] font-bold uppercase text-slate-800 border-b pb-2">
                          2. Regras de Parcelamento e Prazos
                        </h4>

                        <div className="space-y-1.5">
                          <label className="text-[10px] font-bold text-slate-500 uppercase">
                            Opções de Parcelas (Separadas por vírgula)
                          </label>
                          <Input
                            value={Array.isArray(rules.installment_options) ? rules.installment_options.join(", ") : ""}
                            onChange={(e) => {
                              const parsedArray = e.target.value
                                .split(",")
                                .map((n) => Number(n.trim()))
                                .filter((n) => !isNaN(n) && n > 0);
                              updateRules({ ...rules, installment_options: parsedArray });
                            }}
                            className="h-8 text-xs font-mono"
                            placeholder="Ex: 12, 24, 36, 48, 60"
                          />
                          <p className="text-[9px] text-slate-400">
                            Digite os meses aceitos para simulação separados por vírgula.
                          </p>
                        </div>

                        <PaymentFactorsBuilder
                          factors={rules.payment_factors || {}}
                          onChange={(newFactors) => updateRules({ ...rules, payment_factors: newFactors })}
                        />

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                              Parcela Padrão (Default)
                            </label>
                            <Input
                              type="number"
                              value={rules.default_installments ?? ""}
                              onChange={(e) => updateRules({ ...rules, default_installments: Number(e.target.value) })}
                              className="h-8 text-xs"
                              placeholder="Ex: 48"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                              Valor Máximo Financiado (R$)
                            </label>
                            <Input
                              type="number"
                              value={rules.max_financed_amount ?? ""}
                              onChange={(e) =>
                                updateRules({
                                  ...rules,
                                  max_financed_amount: e.target.value ? Number(e.target.value) : undefined,
                                })
                              }
                              className="h-8 text-xs"
                              placeholder="Ex: 120000 (Opcional)"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 pt-2">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Entrada Mínima (%)</label>
                            <Input
                              type="number"
                              value={rules.min_down_payment_percentage ?? 0}
                              onChange={(e) =>
                                updateRules({ ...rules, min_down_payment_percentage: Number(e.target.value) })
                              }
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Entrada Máxima (%)</label>
                            <Input
                              type="number"
                              value={rules.max_down_payment_percentage ?? 80}
                              onChange={(e) =>
                                updateRules({ ...rules, max_down_payment_percentage: Number(e.target.value) })
                              }
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">
                              Cap Máximo Oferta (%)
                            </label>
                            <Input
                              type="number"
                              value={rules.max_offer_cap_percent ?? 50}
                              onChange={(e) => updateRules({ ...rules, max_offer_cap_percent: Number(e.target.value) })}
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>

                        <div className="pt-2 border-t flex items-center justify-between">
                          <div>
                            <h5 className="font-bold text-xs text-slate-800">Permitir Valor Customizado?</h5>
                            <p className="text-[10px] text-muted-foreground">
                              Deixa o usuário digitar um valor livre de financiamento na tela
                            </p>
                          </div>
                          <Switch
                            checked={rules.allow_custom_value ?? true}
                            onCheckedChange={(v) => updateRules({ ...rules, allow_custom_value: v })}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </TabsContent>

              <TabsContent value="visual" className="h-full flex flex-col mt-0 pb-8 min-h-[500px] space-y-6">
                <div className="flex justify-between items-center bg-purple-50 p-3 rounded-xl border border-purple-100">
                  <div>
                    <h3 className="font-bold text-slate-800 uppercase text-xs flex items-center gap-2">
                      <LayoutTemplate size={14} className="text-[#B300FF]" /> Identidade Visual & Painel
                    </h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Construa o visual da página da rota de forma totalmente no-code.
                    </p>
                  </div>
                </div>

                {(() => {
                  const config = parsedPreview.page_configs || {};
                  const theme = config.theme || {
                    box_bg: "bg-white/80",
                    box_radius: "rounded-3xl",
                    primary_color: "#B300FF",
                  };
                  const offer = config.offer_panel || {
                    partner: {},
                    headline: { parts: [] },
                    description: { parts: [] },
                    benefits: [],
                  };
                  const footer = config.footer || { template_text: "", links: [] };

                  const updateConfig = (newConfig: any) => {
                    setParsedPreview({ ...parsedPreview, page_configs: newConfig });
                    setJsonEditors({ ...jsonEditors, page_configs: JSON.stringify(newConfig, null, 2) });
                  };

                  return (
                    <div className="space-y-6">
                      <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
                        <h4 className="text-[11px] font-bold uppercase text-slate-800 border-b pb-2">
                          1. Cores e Estilo do Box
                        </h4>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Cor Principal</label>
                            <div className="flex gap-2 items-center">
                              <div className="relative w-10 h-8 rounded-lg border border-slate-200 shadow-xs overflow-hidden cursor-pointer hover:opacity-90 transition-opacity">
                                <div
                                  className="absolute inset-0 w-full h-full"
                                  style={{ backgroundColor: theme.primary_color || "#B300FF" }}
                                />
                                <input
                                  type="color"
                                  value={theme.primary_color || "#B300FF"}
                                  onChange={(e) =>
                                    updateConfig({ ...config, theme: { ...theme, primary_color: e.target.value } })
                                  }
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                />
                              </div>
                              <Input
                                value={theme.primary_color || ""}
                                onChange={(e) =>
                                  updateConfig({ ...config, theme: { ...theme, primary_color: e.target.value } })
                                }
                                className="h-8 text-xs font-mono uppercase flex-1 bg-white"
                                placeholder="#B300FF"
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Fundo do Box</label>
                            <Select
                              value={theme.box_bg || "bg-white/80"}
                              onValueChange={(v) => updateConfig({ ...config, theme: { ...theme, box_bg: v } })}
                            >
                              <SelectTrigger className="h-8 text-xs bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="bg-white">Branco Sólido</SelectItem>
                                <SelectItem value="bg-white/80">Branco Translúcido (Glass)</SelectItem>
                                <SelectItem value="bg-slate-50">Cinza Suave</SelectItem>
                                <SelectItem value="bg-slate-900">Escuro (Dark)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Raio da Borda</label>
                            <Select
                              value={theme.box_radius || "rounded-3xl"}
                              onValueChange={(v) => updateConfig({ ...config, theme: { ...theme, box_radius: v } })}
                            >
                              <SelectTrigger className="h-8 text-xs bg-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="rounded-none">Reto (Sem borda)</SelectItem>
                                <SelectItem value="rounded-xl">Médio (Padrão)</SelectItem>
                                <SelectItem value="rounded-3xl">Grande (Arredondado)</SelectItem>
                                <SelectItem value="rounded-full">Total (Pílula)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
                        <h4 className="text-[11px] font-bold uppercase text-slate-800 border-b pb-2">
                          2. Oferta Principal (Textos)
                        </h4>

                        <div className="grid grid-cols-2 gap-4 pb-2">
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Rótulo do Parceiro</label>
                            <Input
                              value={offer.partner?.label || ""}
                              onChange={(e) =>
                                updateConfig({
                                  ...config,
                                  offer_panel: { ...offer, partner: { ...offer.partner, label: e.target.value } },
                                })
                              }
                              className="h-8 text-xs"
                              placeholder="Ex: Parceria com:"
                            />
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-slate-500 uppercase">Nome do Parceiro</label>
                            <Input
                              value={offer.partner?.name || ""}
                              onChange={(e) =>
                                updateConfig({
                                  ...config,
                                  offer_panel: { ...offer, partner: { ...offer.partner, name: e.target.value } },
                                })
                              }
                              className="h-8 text-xs text-slate-700"
                              placeholder="Ex: MERESOLVE"
                            />
                          </div>
                        </div>

                        <TextPartsBuilder
                          label="Título Principal (Headline)"
                          parts={offer.headline?.parts || []}
                          onChange={(newParts) =>
                            updateConfig({ ...config, offer_panel: { ...offer, headline: { parts: newParts } } })
                          }
                        />

                        <TextPartsBuilder
                          label="Subtítulo (Description)"
                          parts={offer.description?.parts || []}
                          onChange={(newParts) =>
                            updateConfig({ ...config, offer_panel: { ...offer, description: { parts: newParts } } })
                          }
                        />
                      </div>

                      <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
                        <h4 className="text-[11px] font-bold uppercase text-slate-800 border-b pb-2">
                          3. Benefícios da Solução
                        </h4>
                        <BenefitsBuilder
                          benefits={offer.benefits || []}
                          onChange={(newBenefits) =>
                            updateConfig({ ...config, offer_panel: { ...offer, benefits: newBenefits } })
                          }
                        />
                      </div>

                      <div className="bg-white p-5 rounded-xl border shadow-sm space-y-4">
                        <h4 className="text-[11px] font-bold uppercase text-slate-800 border-b pb-2">
                          4. Rodapé e Legal (Footer)
                        </h4>
                        <FooterBuilder
                          footer={footer}
                          onChange={(newFooter) => updateConfig({ ...config, footer: newFooter })}
                        />
                      </div>
                    </div>
                  );
                })()}
              </TabsContent>

              <TabsContent value="legal" className="space-y-8 mt-0 flex flex-col h-full pb-8">
                {/* --- CONSTRUTOR VISUAL DE CONSENTIMENTOS (LGPD) --- */}
                <div className="flex flex-col space-y-3">
                  <div className="flex justify-between items-center bg-purple-50 p-3 rounded-xl border border-purple-100">
                    <div>
                      <h3 className="font-bold text-slate-800 uppercase text-xs flex items-center gap-2">
                        <FileText size={14} className="text-[#B300FF]" /> Consentimentos (LGPD)
                      </h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Adicione os termos que o usuário precisa aceitar.
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        const current = parsedPreview.consent_configs || [];
                        const newItem = {
                          id: `consent_${Date.now()}`,
                          template_text: "",
                          is_required: true,
                          position: current.length + 1,
                          links: [],
                        };
                        const updated = [...current, newItem];
                        setParsedPreview({ ...parsedPreview, consent_configs: updated });
                        setJsonEditors({ ...jsonEditors, consent_configs: JSON.stringify(updated, null, 2) });
                      }}
                      size="sm"
                      className="bg-[#B300FF] hover:bg-[#9f00e6] text-white text-[11px] h-8 rounded-lg"
                    >
                      <Plus size={14} className="mr-1" /> Adicionar Termo
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {!parsedPreview.consent_configs || parsedPreview.consent_configs.length === 0 ? (
                      <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-medium">
                        Nenhum termo de consentimento configurado.
                      </div>
                    ) : (
                      parsedPreview.consent_configs.map((consent: any, index: number) => (
                        <ConsentItemBuilder
                          key={index}
                          consent={consent}
                          onUpdate={(updatedConsent) => {
                            const updatedList = [...parsedPreview.consent_configs];
                            updatedList[index] = updatedConsent;
                            setParsedPreview({ ...parsedPreview, consent_configs: updatedList });
                            setJsonEditors({ ...jsonEditors, consent_configs: JSON.stringify(updatedList, null, 2) });
                          }}
                          onRemove={() => {
                            const updatedList = parsedPreview.consent_configs.filter(
                              (_: any, i: number) => i !== index,
                            );
                            setParsedPreview({ ...parsedPreview, consent_configs: updatedList });
                            setJsonEditors({ ...jsonEditors, consent_configs: JSON.stringify(updatedList, null, 2) });
                          }}
                        />
                      ))
                    )}
                  </div>
                </div>

                {/* --- CONSTRUTOR VISUAL DE FAQS --- */}
                <div className="flex flex-col space-y-3 border-t pt-6">
                  <div className="flex justify-between items-center bg-purple-50 p-3 rounded-xl border border-purple-100">
                    <div>
                      <h3 className="font-bold text-slate-800 uppercase text-xs flex items-center gap-2">
                        <HelpCircle size={14} className="text-[#B300FF]" /> Dúvidas Frequentes (FAQs)
                      </h3>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        Gerencie as perguntas que aparecem no rodapé.
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        const current = parsedPreview.page_faqs || [];
                        const newItem = { question: "", answer: "", position: current.length + 1, bullets: [] };
                        const updated = [...current, newItem];
                        setParsedPreview({ ...parsedPreview, page_faqs: updated });
                        setJsonEditors({ ...jsonEditors, page_faqs: JSON.stringify(updated, null, 2) });
                      }}
                      size="sm"
                      className="bg-[#B300FF] hover:bg-[#9f00e6] text-white text-[11px] h-8 rounded-lg"
                    >
                      <Plus size={14} className="mr-1" /> Adicionar FAQ
                    </Button>
                  </div>

                  <div className="space-y-4">
                    {!parsedPreview.page_faqs || parsedPreview.page_faqs.length === 0 ? (
                      <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-xl text-slate-400 text-xs font-medium">
                        Nenhuma FAQ configurada.
                      </div>
                    ) : (
                      parsedPreview.page_faqs.map((faq: any, index: number) => (
                        <div
                          key={index}
                          className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative group"
                        >
                          <button
                            onClick={() => {
                              const updated = parsedPreview.page_faqs.filter((_: any, i: number) => i !== index);
                              setParsedPreview({ ...parsedPreview, page_faqs: updated });
                              setJsonEditors({ ...jsonEditors, page_faqs: JSON.stringify(updated, null, 2) });
                            }}
                            className="absolute top-3 right-3 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Remover FAQ"
                          >
                            <X size={16} />
                          </button>

                          <div className="grid gap-4 pr-6">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">Pergunta</label>
                              <Input
                                value={faq.question}
                                onChange={(e) => {
                                  const updated = [...parsedPreview.page_faqs];
                                  updated[index].question = e.target.value;
                                  setParsedPreview({ ...parsedPreview, page_faqs: updated });
                                  setJsonEditors({ ...jsonEditors, page_faqs: JSON.stringify(updated, null, 2) });
                                }}
                                className="h-8 text-xs font-semibold"
                                placeholder="Digite a pergunta..."
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-slate-500 uppercase">
                                Resposta (Texto Principal)
                              </label>
                              <textarea
                                value={faq.answer}
                                onChange={(e) => {
                                  const updated = [...parsedPreview.page_faqs];
                                  updated[index].answer = e.target.value;
                                  setParsedPreview({ ...parsedPreview, page_faqs: updated });
                                  setJsonEditors({ ...jsonEditors, page_faqs: JSON.stringify(updated, null, 2) });
                                }}
                                className="w-full h-16 border border-slate-200 rounded-lg p-2 text-xs outline-none focus:border-[#B300FF] resize-none leading-relaxed"
                                placeholder="Digite a resposta detalhada..."
                              />
                            </div>

                            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-3">
                              <div className="flex justify-between items-center">
                                <label className="text-[10px] font-bold text-slate-500 uppercase">
                                  Tópicos (Bullets)
                                </label>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...parsedPreview.page_faqs];
                                    if (!updated[index].bullets) updated[index].bullets = [];
                                    updated[index].bullets.push("");
                                    setParsedPreview({ ...parsedPreview, page_faqs: updated });
                                    setJsonEditors({ ...jsonEditors, page_faqs: JSON.stringify(updated, null, 2) });
                                  }}
                                  className="text-[10px] font-bold text-[#B300FF] hover:underline flex items-center"
                                >
                                  <Plus size={12} className="mr-0.5" /> Add Tópico
                                </button>
                              </div>

                              <div className="space-y-2">
                                {!faq.bullets || faq.bullets.length === 0 ? (
                                  <p className="text-[10px] text-slate-400 italic">Nenhum tópico adicionado.</p>
                                ) : (
                                  faq.bullets.map((bullet: string, bulletIndex: number) => (
                                    <div key={bulletIndex} className="flex items-start gap-2">
                                      <span className="text-slate-400 mt-2">•</span>
                                      <textarea
                                        value={bullet}
                                        onChange={(e) => {
                                          const updated = [...parsedPreview.page_faqs];
                                          updated[index].bullets[bulletIndex] = e.target.value;
                                          setParsedPreview({ ...parsedPreview, page_faqs: updated });
                                          setJsonEditors({
                                            ...jsonEditors,
                                            page_faqs: JSON.stringify(updated, null, 2),
                                          });
                                        }}
                                        className="flex-1 h-16 border border-slate-200 rounded-md p-2 text-[11px] outline-none focus:border-[#B300FF] resize-none leading-relaxed text-slate-700"
                                        placeholder="Digite o item da lista..."
                                      />
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const updated = [...parsedPreview.page_faqs];
                                          updated[index].bullets = updated[index].bullets.filter(
                                            (_: any, i: number) => i !== bulletIndex,
                                          );
                                          setParsedPreview({ ...parsedPreview, page_faqs: updated });
                                          setJsonEditors({
                                            ...jsonEditors,
                                            page_faqs: JSON.stringify(updated, null, 2),
                                          });
                                        }}
                                        className="mt-2 text-slate-300 hover:text-red-500"
                                        title="Remover Tópico"
                                      >
                                        <X size={14} />
                                      </button>
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
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

        {/* LADO DIREITO: LIVE PREVIEW USANDO OS RENDERIZADORES LOCAIS */}
        <div className="w-[40%] bg-slate-50 overflow-y-auto relative flex flex-col">
          <div className="sticky top-0 px-6 pt-6 pb-4 z-20 bg-slate-50 border-b border-slate-200 shadow-xs shrink-0">
            <h3 className="font-black text-sm uppercase text-slate-800 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#B300FF] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#B300FF]"></span>
              </span>
              Live Preview
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">O layout abaixo reflete o JSON em tempo real.</p>
          </div>

          <div className="p-6 space-y-6 pb-20 max-w-xl mx-auto w-full">
            {parsedPreview.page_configs && Object.keys(parsedPreview.page_configs).length > 0 ? (
              <div className="bg-white p-5 rounded-2xl shadow-lg border border-slate-100">
                <OfferPanelRender config={parsedPreview.page_configs} />
              </div>
            ) : (
              <div className="text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 text-xs font-medium italic">
                Painel Visual (Page Configs) não definido ou JSON inválido.
              </div>
            )}

            {parsedPreview.consent_configs && parsedPreview.consent_configs.length > 0 && (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                <DynamicConsentsStatic configs={parsedPreview.consent_configs} />
              </div>
            )}

            {parsedPreview.page_faqs && parsedPreview.page_faqs.length > 0 && (
              <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
                <FAQSection items={parsedPreview.page_faqs} />
              </div>
            )}

            {parsedPreview.page_configs?.footer && (
              <div className="pt-4">
                <FooterRender config={parsedPreview.page_configs.footer} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * =========================================================================
 * [COMPONENTE PRINCIPAL]: OrchestratorConfigsBackofficePage
 * =========================================================================
 */
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

  // Ref para capturar o HTML exato do relatório de impressão
  const printRef = useRef<HTMLDivElement>(null);

  async function load() {
    setLoading(true);
    try {
      const { data: configData, error: configError } = await supabase.from("orchestrator_configs").select("*");

      if (configError) throw configError;
      setRows((configData as OrchestratorRow[]) || []);

      const { data: prodData } = await supabase.from("product_types").select("id, name");
      if (prodData) {
        const pMap: Record<string, string> = {};
        prodData.forEach((p) => {
          pMap[String(p.id)] = p.name;
        });
        setProductsMap(pMap);
      }

      const { data: catData } = await supabase.from("category_types").select("id, name");
      if (catData) {
        const cMap: Record<string, string> = {};
        catData.forEach((c) => {
          cMap[String(c.id)] = c.name;
        });
        setCategoriesMap(cMap);
      }

      const { data: partData } = await supabase.from("partners").select("id, name, logo_url");
      if (partData) {
        const ptMap: Record<string, { name: string; logo_url: string }> = {};
        partData.forEach((pt) => {
          ptMap[String(pt.id)] = { name: pt.name, logo_url: pt.logo_url };
        });
        setPartnersMap(ptMap);
      }
    } catch (err) {
      console.error("Erro crítico ao carregar dados do orchestrator:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const handleDuplicateRoute = (config: OrchestratorRow) => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, created_at, ...rest } = config;
    setEditingConfig(rest);
    setIsRouteDrawerOpen(false); // Fecha drawer de inspeção se estiver aberto
    setIsEditorOpen(true);
  };

  const handleSaveRoute = async (payload: OrchestratorRow) => {
    try {
      if (payload.id) {
        const { error } = await supabase.from("orchestrator_configs").update(payload).eq("id", payload.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("orchestrator_configs").insert([payload]);
        if (error) throw error;
      }

      setIsEditorOpen(false);
      load();
    } catch (err: any) {
      console.error("Erro de BD ao salvar a rota:", err);
      throw new Error(err.message || "Erro desconhecido ao comunicar com o banco de dados.");
    }
  };

  const getProductOrCategoryName = (r: OrchestratorRow) => {
    if (r.config_type === "PRODUCT" && productsMap[r.lookup_id]) {
      return productsMap[r.lookup_id];
    }
    if (r.config_type === "CATEGORY" && categoriesMap[r.lookup_id]) {
      return categoriesMap[r.lookup_id];
    }
    if (r.config_type === "SELLER" && partnersMap[r.lookup_id]) {
      return partnersMap[r.lookup_id].name;
    }
    if (r.config_type === "EVENT") {
      return `Evento: ${r.lookup_id}`;
    }
    return r.lookup_id ? `ID #${r.lookup_id}` : "—";
  };

  const getPartnerInfo = (r: OrchestratorRow) => {
    const partnerId = r.partner_id || r.integration_details?.partner_id || r.page_configs?.offer_panel?.partner?.id;
    if (partnerId && partnersMap[String(partnerId)]) {
      return partnersMap[String(partnerId)];
    }
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

  const partnersList = useMemo(() => {
    return Object.entries(partnersMap).map(([id, p]) => ({ id, name: p.name }));
  }, [partnersMap]);

  const productsList = useMemo(() => {
    return Object.entries(productsMap).map(([id, name]) => ({ id, name }));
  }, [productsMap]);

  const categoriesList = useMemo(() => {
    return Object.entries(categoriesMap).map(([id, name]) => ({ id, name }));
  }, [categoriesMap]);

  // ============================================================================
  // [HANDLE DE IMPRESSÃO: IFRAME ISOLADO]
  // ============================================================================
  const handlePrintSheet = () => {
    if (!printRef.current) return;

    // 1. Instanciação e ocultação do Iframe no final do fluxo do documento
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) return;

    // 2. Extração heurística de Stylesheets e da Árvore de Impressão
    const headHTML = document.head.innerHTML;
    const reportHTML = printRef.current.innerHTML;

    // 3. Injeção e Compilação
    iframeDoc.open();
    iframeDoc.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          ${headHTML}
          <style>
            @page { margin: 15mm; }
            body { 
              background-color: white !important; 
              color: #0f172a !important;
              -webkit-print-color-adjust: exact !important; 
              print-color-adjust: exact !important; 
            }
          </style>
        </head>
        <body>
          ${reportHTML}
        </body>
      </html>
    `);
    iframeDoc.close();

    // 4. Execução da thread isolada e limpeza subsequente do Garbage Collector
    setTimeout(() => {
      if (iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      }
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 500);
  };

  return (
    <div className="space-y-6 font-sans">
      {/* 
        ===================================================================== 
        [ESTILOS GLOBAIS DE IMPRESSÃO - BLINDAGEM DO REACT DOM E RADIX]
        Mesmo usando Iframe para a ação principal, definimos proteções globais
        para evitar que a tela principal "vaze" em acionamentos acidentais via
        atalho de teclado do usuário (Ctrl+P nativo).
        =====================================================================
      */}
      <style>{`
        @media print {
          body > *:not(#root) { display: none !important; }
          #main-app-content { display: none !important; }
          html, body, #root { 
            background: white !important; 
            height: auto !important; 
            min-height: 100% !important; 
            overflow: visible !important; 
            position: static !important; 
          }
        }
      `}</style>

      {/* ===================================================================== */}
      {/* 1. CONTEÚDO PRINCIPAL (Envelopado por ID para ocultamento no Print)   */}
      {/* ===================================================================== */}
      <div id="main-app-content" className="space-y-6">
        {/* HEADER DA TELA E CONTROLES */}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Consulta de Rotas</h1>
            <p className="text-sm text-muted-foreground">
              Gerenciamento e inspeção ordenada das configurações de rotas do sistema.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={load} className="rounded-xl bg-white" disabled={loading}>
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
            </Button>
            {/* Botão Nova Rota oculto no mobile, exibido apenas a partir de sm (desktop/tablet) */}
            <Button
              onClick={() => {
                setEditingConfig(null);
                setIsEditorOpen(true);
              }}
              className="rounded-xl bg-[#B300FF] hover:bg-[#9f00e6] hidden sm:flex"
            >
              <Plus className="mr-2 h-4 w-4" /> Nova Rota
            </Button>
          </div>
        </div>

        {/* BARRA DE FILTROS E BUSCA: Padronizada no Estilo App (Pílula) */}
        <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4 border-b border-border p-4">
            {/* BARRA DE BUSCA: Estilo Pílula idêntico aos demais monitores */}
            <div className="relative w-full lg:flex-1 lg:max-w-md">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por ID, URL, Nome do Produto..."
                className="h-11 w-full rounded-full bg-slate-100/70 border-transparent pl-5 pr-12 text-[13px] text-slate-700 placeholder:text-slate-500 focus-visible:ring-primary/20 focus-visible:bg-white focus-visible:border-primary/30 transition-all shadow-none"
              />
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-[#B300FF]" />
            </div>

            {/* FILTRO DE STATUS: Estilo Pílula / Botão Arredondado */}
            <div className="flex items-center gap-2 lg:ml-auto">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 rounded-xl gap-2 bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8] hover:bg-[#fce7f3] transition-colors"
                  >
                    <Filter className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      Status:{" "}
                      {statusFilter === "active" ? "Ativas" : statusFilter === "inactive" ? "Inativas" : "Todas"}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-48 bg-[#fdf2f8] border-[#fbcfe8] z-50" align="start">
                  <Command className="bg-transparent">
                    <CommandList>
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => setStatusFilter("active")}
                          className="cursor-pointer text-[#d946ef] hover:bg-[#fce7f3] aria-selected:bg-[#fce7f3]"
                        >
                          Apenas Ativas
                        </CommandItem>
                        <CommandItem
                          onSelect={() => setStatusFilter("inactive")}
                          className="cursor-pointer text-[#d946ef] hover:bg-[#fce7f3] aria-selected:bg-[#fce7f3]"
                        >
                          Apenas Inativas
                        </CommandItem>
                        <CommandItem
                          onSelect={() => setStatusFilter("all")}
                          className="cursor-pointer text-[#d946ef] hover:bg-[#fce7f3] aria-selected:bg-[#fce7f3]"
                        >
                          Todas
                        </CommandItem>
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* TABELA DE ROTAS */}
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
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-muted-foreground">
                      <div className="flex items-center justify-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        Carregando informações...
                      </div>
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-10 text-center text-muted-foreground">
                      Nenhuma rota encontrada com os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => {
                    const prodName = getProductOrCategoryName(r);
                    const partner = getPartnerInfo(r);

                    return (
                      <tr
                        key={r.id}
                        className="border-b border-border/60 hover:bg-accent/40 transition-colors group cursor-pointer"
                        onClick={() => {
                          setActiveConfig(r);
                          setIsRouteDrawerOpen(true);
                        }}
                      >
                        <td className="px-3 py-3 font-mono text-sm text-foreground">{r.id || "—"}</td>

                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold bg-[#B300FF]/10 text-[#B300FF]">
                              {r.config_type || "—"}
                            </span>
                            <span className="text-[11px] text-muted-foreground">({r.entity_type || "N/A"})</span>
                          </div>
                          <div className="text-xs text-foreground mt-1 font-normal truncate" title={prodName}>
                            {prodName}
                          </div>
                        </td>

                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5 truncate">
                            <div
                              className="flex h-10 w-10 items-center justify-center rounded-lg bg-transparent overflow-hidden shrink-0 border bg-white"
                              title={partner?.name}
                            >
                              {partner?.logo_url ? (
                                <img src={partner.logo_url} className="h-full w-full object-cover" alt={partner.name} />
                              ) : (
                                <span className="flex items-center justify-center h-full w-full text-[10px] font-bold uppercase">
                                  {partner?.name ? partner.name.slice(0, 3) : "—"}
                                </span>
                              )}
                            </div>
                            <span className="text-xs font-medium text-slate-700 truncate" title={partner?.name}>
                              {partner?.name || "N/A"}
                            </span>
                          </div>
                        </td>

                        <td className="px-3 py-3 font-mono text-xs text-muted-foreground truncate" title={r.page_url}>
                          {r.page_url || "—"}
                        </td>

                        <td className="px-3 py-3 text-right hidden sm:table-cell">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveConfig(r);
                                setIsRouteDrawerOpen(true);
                              }}
                              className="rounded-lg text-slate-500 hover:text-slate-900 px-2 h-8 text-[11px]"
                            >
                              <Search className="w-3.5 h-3.5 mr-1" /> Insp.
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicateRoute(r);
                              }}
                              className="rounded-lg text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 h-8 text-[11px]"
                            >
                              <Copy className="w-3.5 h-3.5 mr-1" /> Duplicar
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingConfig(r);
                                setIsEditorOpen(true);
                              }}
                              className="rounded-lg text-[#B300FF] hover:text-[#9a00db] hover:bg-[#B300FF]/10 px-2 h-8 text-[11px]"
                            >
                              <Edit className="w-3.5 h-3.5 mr-1" /> Edit
                            </Button>
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

        {/* ===================================================================== */}
        {/* [PAINEL LATERAL / DRAWER DE INSPEÇÃO COM RENDERIZADORES LOCAIS]       */}
        {/* ===================================================================== */}
        {isRouteDrawerOpen && activeConfig && (
          <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-all">
            <div className="w-full sm:max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
              {/* Header do Drawer */}
              <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-slate-50 shrink-0">
                <div className="flex items-center gap-2 truncate pr-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-[#B300FF] shrink-0" />
                  <h3 className="text-xs sm:text-sm font-black uppercase text-slate-800 truncate">
                    Consulta de Rota: ID #{activeConfig.id} - {getProductOrCategoryName(activeConfig)}
                  </h3>
                </div>
                <button
                  onClick={() => setIsRouteDrawerOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer shrink-0"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Conteúdo Rolável */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
                <div className="space-y-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-[10px] sm:text-xs space-y-1.5 font-mono">
                    <p>
                      <b>ID Config:</b> {activeConfig.id} | <b>Lookup ID:</b> {activeConfig.lookup_id}
                    </p>
                    <p>
                      <b>Tipo:</b> {activeConfig.config_type} ({activeConfig.entity_type})
                    </p>
                    <p>
                      <b>Método:</b> {activeConfig.integration_method || "—"}
                    </p>
                    <p className="break-words pt-1 border-t border-slate-200">
                      <b>URL:</b> {activeConfig.page_url}
                    </p>
                  </div>

                  {/* Renderizador Local da Oferta */}
                  {activeConfig.page_configs?.offer_panel && (
                    <div className="bg-white p-4 rounded-xl border shadow-sm">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#B300FF] flex items-center gap-1.5 mb-3">
                        <Layers size={14} /> Offer Panel (Painel de Proposta)
                      </h4>
                      <OfferPanelRender config={activeConfig.page_configs} />
                    </div>
                  )}

                  <div className="flex flex-col gap-4">
                    {activeConfig.integration_details && Object.keys(activeConfig.integration_details).length > 0 && (
                      <div className="bg-slate-50 p-4 rounded-xl border text-xs overflow-hidden">
                        <h4 className="font-bold text-slate-700 mb-2 uppercase text-[10px] tracking-wide flex items-center gap-1.5">
                          <Code2 size={12} /> Integration Details
                        </h4>
                        <pre className="font-mono text-[9px] text-slate-600 whitespace-pre-wrap break-all overflow-x-auto bg-white p-2.5 rounded border">
                          {JSON.stringify(activeConfig.integration_details, null, 2)}
                        </pre>
                      </div>
                    )}
                    {activeConfig.rules && Object.keys(activeConfig.rules).length > 0 && (
                      <div className="bg-slate-50 p-4 rounded-xl border text-xs overflow-hidden">
                        <h4 className="font-bold text-slate-700 mb-2 uppercase text-[10px] tracking-wide flex items-center gap-1.5">
                          <SlidersHorizontal size={12} /> Rules / Installments
                        </h4>
                        <pre className="font-mono text-[9px] text-slate-600 whitespace-pre-wrap break-all overflow-x-auto bg-white p-2.5 rounded border">
                          {JSON.stringify(activeConfig.rules, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>

                  {/* Renderizador Local de LGPD */}
                  {activeConfig.consent_configs && activeConfig.consent_configs.length > 0 && (
                    <div className="bg-white p-4 rounded-xl border shadow-sm">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#B300FF] flex items-center gap-1.5 mb-3">
                        <FileText size={14} /> Consentimentos da Rota (LGPD)
                      </h4>
                      <DynamicConsentsStatic configs={activeConfig.consent_configs} />
                    </div>
                  )}

                  {/* Renderizador Local de FAQs */}
                  {activeConfig.page_faqs && activeConfig.page_faqs.length > 0 && (
                    <div className="bg-white p-4 rounded-xl border shadow-sm">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#B300FF] flex items-center gap-1.5 mb-3">
                        <HelpCircle size={14} /> FAQ & Perguntas Frequentes
                      </h4>
                      <FAQSection items={activeConfig.page_faqs} />
                    </div>
                  )}

                  {/* Renderizador Local de Footer */}
                  {activeConfig.page_configs?.footer && (
                    <div className="pt-2">
                      <FooterRender config={activeConfig.page_configs.footer} />
                    </div>
                  )}
                </div>
              </div>

              {/* Rodapé do Drawer com Duplicar oculto no mobile */}
              <div className="p-3 sm:p-4 border-t border-gray-200 bg-slate-50 flex flex-col gap-2 shrink-0 shadow-lg w-full">
                <div className="flex items-center gap-2 w-full">
                  {/* Botão Duplicar visível apenas no desktop */}
                  <Button
                    variant="outline"
                    onClick={() => handleDuplicateRoute(activeConfig)}
                    className="hidden sm:flex flex-1 rounded-xl text-xs gap-1.5 border-blue-500/35 text-blue-600 hover:bg-blue-50 h-10 font-semibold px-2"
                  >
                    <Copy className="h-3.5 w-3.5 shrink-0" /> Duplicar
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handlePrintSheet}
                    className="flex-1 rounded-xl text-xs gap-1.5 border-[#B300FF]/35 text-[#B300FF] hover:bg-[#B300FF]/5 h-10 font-semibold px-2"
                  >
                    <Printer className="h-3.5 w-3.5 shrink-0" /> Imprimir
                  </Button>
                </div>
                <Button
                  onClick={() => setIsRouteDrawerOpen(false)}
                  className="w-full rounded-xl text-xs bg-[#B300FF] hover:bg-[#9f00e6] text-white h-10 font-semibold"
                >
                  Fechar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ===================================================================== */}
        {/* 3. EDITOR HÍBRIDO (SPLIT-SCREEN) DE CONFIGURAÇÃO DE ROTAS             */}
        {/* ===================================================================== */}
        {isEditorOpen && (
          <OrchestratorConfigEditor
            initialData={editingConfig}
            partnersList={partnersList}
            productsList={productsList}
            categoriesList={categoriesList}
            onClose={() => setIsEditorOpen(false)}
            onSave={handleSaveRoute}
          />
        )}
      </div>

      {/* ===================================================================== */}
      {/* 4. BLOCO DE REFERÊNCIA INVISÍVEL PARA O IFRAME DE IMPRESSÃO           */}
      {/* ===================================================================== */}
      <div style={{ display: "none" }}>
        <div ref={printRef} className="w-full text-slate-900 bg-white p-8">
          {activeConfig &&
            (() => {
              const r = activeConfig;
              const prodName = getProductOrCategoryName(r);

              return (
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-[#B300FF] uppercase">Consulta de Rota</span>
                        <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border bg-slate-50 uppercase`}>
                          {r.is_active ? "Ativa" : "Inativa"}
                        </span>
                      </div>
                      <h1 className="text-2xl font-bold">{prodName}</h1>
                    </div>
                    <div className="text-right text-xs text-slate-500 font-mono">
                      ID: {r.id}
                      <br />
                      Lookup ID: {r.lookup_id}
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-1.5 font-mono">
                    <p>
                      <b>Tipo:</b> {r.config_type} ({r.entity_type})
                    </p>
                    <p>
                      <b>URL:</b> {r.page_url}
                    </p>
                    <p>
                      <b>Método de Integração:</b> {r.integration_method || "—"}
                    </p>
                  </div>

                  {/* Renderizador Local da Oferta */}
                  {r.page_configs?.offer_panel && (
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm break-inside-avoid">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#B300FF] flex items-center gap-1.5 mb-3">
                        <Layers size={14} /> Offer Panel (Painel de Proposta)
                      </h4>
                      <OfferPanelRender config={r.page_configs} />
                    </div>
                  )}

                  {r.integration_details && Object.keys(r.integration_details).length > 0 && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs overflow-hidden break-inside-avoid">
                      <h4 className="font-bold text-slate-700 mb-2 uppercase text-[10px] tracking-wide flex items-center gap-1.5">
                        <Code2 size={12} /> Integration Details
                      </h4>
                      <pre className="font-mono text-[9px] text-slate-600 whitespace-pre-wrap break-all bg-white p-2.5 rounded border">
                        {JSON.stringify(r.integration_details, null, 2)}
                      </pre>
                    </div>
                  )}

                  {r.rules && Object.keys(r.rules).length > 0 && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs overflow-hidden break-inside-avoid">
                      <h4 className="font-bold text-slate-700 mb-2 uppercase text-[10px] tracking-wide flex items-center gap-1.5">
                        <SlidersHorizontal size={12} /> Rules / Installments
                      </h4>
                      <pre className="font-mono text-[9px] text-slate-600 whitespace-pre-wrap break-all bg-white p-2.5 rounded border">
                        {JSON.stringify(r.rules, null, 2)}
                      </pre>
                    </div>
                  )}

                  {/* Renderizador Local de LGPD */}
                  {r.consent_configs && r.consent_configs.length > 0 && (
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm break-inside-avoid">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#B300FF] flex items-center gap-1.5 mb-3">
                        <FileText size={14} /> Consentimentos da Rota (LGPD)
                      </h4>
                      <DynamicConsentsStatic configs={r.consent_configs} />
                    </div>
                  )}

                  {/* Renderizador Local de FAQs */}
                  {r.page_faqs && r.page_faqs.length > 0 && (
                    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm break-inside-avoid">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#B300FF] flex items-center gap-1.5 mb-3">
                        <HelpCircle size={14} /> FAQ & Perguntas Frequentes
                      </h4>
                      <FAQSection items={r.page_faqs} isPrint={true} />
                    </div>
                  )}

                  {/* Renderizador Local de Footer */}
                  {r.page_configs?.footer && (
                    <div className="pt-2 break-inside-avoid">
                      <FooterRender config={r.page_configs.footer} />
                    </div>
                  )}
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}