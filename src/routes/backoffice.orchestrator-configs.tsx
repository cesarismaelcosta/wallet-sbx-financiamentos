/**
 * ============================================================================
 * @fileoverview Consulta e Gestão de Rotas / Orchestrator (Backoffice)
 * @route /backoffice/orchestrator-configs
 * @description Painel administrativo integrado com consulta direta ao banco de dados
 *              para inspecionar rotas, com o mesmo layout rico e polido do Sandbox.
 * ============================================================================
 */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { 
  RefreshCw, 
  Search, 
  Layers, 
  FileText, 
  HelpCircle, 
  X,
  CheckCircle2,
  Code2,
  SlidersHorizontal
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { TooltipProvider } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { ICON_MAP } from "@/features/financial-hub/components/shared/icons-map";

export const Route = createFileRoute("/backoffice/orchestrator-configs")({
  component: OrchestratorConfigsBackofficePage,
});

type OrchestratorRow = {
  id: string;
  lookup_id: string;
  config_type: string;
  entity_type: string;
  page_url: string;
  integration_method: string;
  page_configs?: any;
  integration_details?: any;
  rules?: any;
  consent_configs?: any[];
  page_faqs?: any[];
  created_at?: string;
};

/**
 * =========================================================================
 * [SUB-COMPONENTES DA ROTA]: Renderizadores de UI fiéis ao Sandbox
 * =========================================================================
 */
function FAQSection({ items }: { items?: any[] }) {
  if (!items || items.length === 0) return null;
  const sortedItems = [...items].sort((a, b) => (a.position || 0) - (b.position || 0));
  const half = Math.ceil(sortedItems.length / 2);

  return (
    <section className="py-2 overflow-hidden bg-white">
      <div className="max-w-full">
        <div className="grid md:grid-cols-2 gap-x-4 gap-y-3">
          <div className="space-y-3">
            <Accordion type="single" collapsible className="w-full">
              {sortedItems.slice(0, half).map((item, i) => (
                <AccordionItem 
                  key={i} 
                  value={`item-col1-${i}`} 
                  className="border border-border rounded-xl px-3 bg-white/60 shadow-sm transition-all mb-2"
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
          <div className="space-y-3">
            <Accordion type="single" collapsible className="w-full">
              {sortedItems.slice(half).map((item, i) => (
                <AccordionItem 
                  key={i} 
                  value={`item-col2-${i}`} 
                  className="border border-border rounded-xl px-3 bg-white/60 shadow-sm transition-all mb-2"
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
      <footer className="py-3 px-3 text-center text-[10px] text-muted-foreground bg-slate-50 border rounded-xl">
        <p className="leading-relaxed text-justify sm:text-center text-slate-400">
          {renderText()}
        </p>
      </footer>
    </div>
  );
}

function OfferPanelRender({ config }: { config: any }) {
  if (!config?.offer_panel?.headline?.parts || !config?.offer_panel?.description?.parts) return null;
  const { offer_panel, theme } = config;
  const brandColor = theme?.primary_color || "var(--brand-primary)";

  const getTextStyle = (type: string) => {
    switch (type) {
      case "highlight": return "text-[var(--brand-primary)]";
      case "bold": return "font-bold text-foreground";
      default: return "text-foreground";
    }
  };

  return (
    <div className="space-y-3" style={{ '--brand-primary': brandColor } as React.CSSProperties}>
      <div className="space-y-1.5">
        <h2 className="text-base font-semibold leading-tight text-foreground">
          {offer_panel.headline.parts.map((part: any, i: number) => (
            <span key={i} className={getTextStyle(part.type)}>{part.text}</span>
          ))}
        </h2>
        <p className="text-xs text-muted-foreground">
          {offer_panel.description.parts.map((part: any, i: number) => (
            <span key={i} className={getTextStyle(part.type)}>{part.text}</span>
          ))}
        </p>
      </div>

      {offer_panel.benefits && Array.isArray(offer_panel.benefits) && (
        <ul className="grid grid-cols-1 gap-2">
          {offer_panel.benefits.map((b: any, i: number) => {
            const IconComponent = ICON_MAP[b.icon] || ICON_MAP[b.icon?.toLowerCase()] || CheckCircle2;
            return (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                  <IconComponent className="h-3.5 w-3.5" />
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

      {offer_panel.partner?.name && (
        <div className="rounded-xl border border-border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
          {offer_panel.partner.label}{" "}
          <strong className="text-foreground">{offer_panel.partner.name}</strong>.
        </div>
      )}
    </div>
  );
}

function DynamicConsentsStatic({ configs }: { configs: any[] }) {
  if (!configs || configs.length === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col rounded-lg border border-border bg-muted/10 p-3 space-y-2.5">
        {[...configs]
          .sort((a, b) => a.position - b.position)
          .map((opt) => (
            <div key={opt.id} className="flex gap-2 items-start py-0.5 text-xs">
              <div className="flex items-center mt-0.5">
                <Checkbox disabled checked={false} className="h-4 w-4 shrink-0 rounded-[4px] border-slate-400" />
              </div>
              <label className="text-[11px] text-muted-foreground leading-snug flex-1">
                {opt.template_text ? (
                  opt.template_text.split(/(\{.*?\})/g).map((part: string, i: number) => {
                    if (part.startsWith("{") && part.endsWith("}")) {
                      const cleanText = part.replace(/[{}]/g, "");
                      const linkConfig = opt.links?.find((l: any) => l.text === cleanText);
                      if (!linkConfig) return <span key={i} className="font-bold text-foreground">{cleanText}</span>;
                      return (
                        <span key={i} className="underline font-bold inline mx-0.5" style={{ color: "var(--brand-primary)" }}>
                          {cleanText}
                        </span>
                      );
                    }
                    return <span key={i}>{part}</span>;
                  })
                ) : null}
              </label>
            </div>
          ))}
      </div>
    </TooltipProvider>
  );
}

/**
 * =========================================================================
 * COMPONENTE PRINCIPAL DO BACKOFFICE
 * =========================================================================
 */
function OrchestratorConfigsBackofficePage() {
  const [rows, setRows] = useState<OrchestratorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  
  // Estado do Drawer lateral idêntico ao Sandbox
  const [isRouteDrawerOpen, setIsRouteDrawerOpen] = useState(false);
  const [activeConfig, setActiveConfig] = useState<OrchestratorRow | null>(null);

  async function load() {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("orchestrator_configs")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erro ao carregar orchestrator_configs:", error.message);
        setRows([]);
      } else {
        setRows((data as OrchestratorRow[]) || []);
      }
    } catch (err) {
      console.error("Erro crítico:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((r) =>
      (r.lookup_id ?? "").toLowerCase().includes(query) ||
      (r.page_url ?? "").toLowerCase().includes(query) ||
      (r.config_type ?? "").toLowerCase().includes(query) ||
      (r.entity_type ?? "").toLowerCase().includes(query)
    );
  }, [rows, search]);

  const handleOpenDrawer = (config: OrchestratorRow) => {
    setActiveConfig(config);
    setIsRouteDrawerOpen(true);
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* HEADER DA TELA */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Consulta de Rotas & Orchestrator</h1>
          <p className="text-sm text-muted-foreground">
            Inspeção direta das configurações de rotas gravadas no banco de dados.
          </p>
        </div>
        <Button onClick={load} className="rounded-xl" disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {/* TABELA DE DADOS */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              placeholder="Buscar por Lookup ID, URL ou Tipo..." 
              className="h-10 rounded-xl pl-9" 
            />
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-3">Lookup ID</th>
                <th className="px-3 py-3">Tipo / Entidade</th>
                <th className="px-3 py-3">URL da Página</th>
                <th className="px-3 py-3">Método de Integração</th>
                <th className="px-3 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-muted-foreground">
                    Carregando configurações...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-muted-foreground">
                    Nenhuma rota encontrada.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr 
                    key={r.id} 
                    onClick={() => handleOpenDrawer(r)}
                    className="border-b border-border/60 hover:bg-accent/40 cursor-pointer transition-colors"
                    title="Clique para ver detalhes completos"
                  >
                    <td className="px-3 py-3 font-mono font-semibold text-[#B300FF]">{r.lookup_id || "—"}</td>
                    <td className="px-3 py-3">
                      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold bg-[#B300FF]/10 text-[#B300FF]">
                        {r.config_type || "—"}
                      </span>
                      <span className="ml-1.5 text-xs text-muted-foreground">({r.entity_type || "N/A"})</span>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-muted-foreground truncate max-w-[250px]" title={r.page_url}>
                      {r.page_url || "—"}
                    </td>
                    <td className="px-3 py-3 text-xs font-medium uppercase text-slate-700">
                      {r.integration_method || "—"}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Button variant="ghost" size="sm" className="rounded-lg text-[#B300FF] hover:text-[#9a00db]">
                        consultar rota
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===================================================================== */}
      <span className="hidden">PAINEL LATERAL IDÊNTICO AO SANDBOX</span>
      {/* ===================================================================== */}
      {isRouteDrawerOpen && activeConfig && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-all">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
            
            {/* Cabeçalho */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-slate-50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#B300FF]" />
                <h3 className="text-sm font-black uppercase text-slate-800">Consulta de Rota: {activeConfig.lookup_id}</h3>
              </div>
              <button onClick={() => setIsRouteDrawerOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            {/* Conteúdo do Drawer */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="space-y-6">
                
                {/* Metadados da Tabela */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-1.5 font-mono">
                  <p><b>ID Config:</b> {activeConfig.id} | <b>Lookup ID:</b> {activeConfig.lookup_id}</p>
                  <p><b>Tipo:</b> {activeConfig.config_type} ({activeConfig.entity_type})</p>
                  <p><b>URL:</b> {activeConfig.page_url}</p>
                  <p><b>Método:</b> {activeConfig.integration_method}</p>
                </div>

                {/* 1. OfferPanel (Proposta de Valor / Header) */}
                {activeConfig.page_configs?.offer_panel && (
                  <div className="bg-white p-4 rounded-xl border shadow-sm">
                    <h4 className="text-[11px] font-bold uppercase text-purple-600 mb-3 flex items-center gap-1.5">
                      <Layers size={14} /> Offer Panel (Painel de Proposta)
                    </h4>
                    <OfferPanelRender config={activeConfig.page_configs} />
                  </div>
                )}

                {/* 2. Integration Details & Rules */}
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

                {/* 3. Consentimentos Dinâmicos */}
                {activeConfig.consent_configs && activeConfig.consent_configs.length > 0 && (
                  <div className="bg-white p-4 rounded-xl border shadow-sm">
                    <h4 className="text-[11px] font-bold uppercase text-purple-600 mb-3 flex items-center gap-1.5">
                      <FileText size={14} /> Consentimentos da Rota (LGPD)
                    </h4>
                    <DynamicConsentsStatic configs={activeConfig.consent_configs} />
                  </div>
                )}

                {/* 4. FAQ Section */}
                {activeConfig.page_faqs && activeConfig.page_faqs.length > 0 && (
                  <div className="bg-white p-4 rounded-xl border shadow-sm">
                    <h4 className="text-[11px] font-bold uppercase text-purple-600 mb-1 flex items-center gap-1.5">
                      <HelpCircle size={14} /> FAQ & Perguntas Frequentes
                    </h4>
                    <FAQSection items={activeConfig.page_faqs} />
                  </div>
                )}

                {/* 5. Footer Legal */}
                {activeConfig.page_configs?.footer && (
                  <div className="pt-2">
                    <FooterRender config={activeConfig.page_configs.footer} />
                  </div>
                )}

              </div>
            </div>

            <div className="p-4 border-t border-gray-200 bg-slate-50 flex justify-end flex-shrink-0">
              <Button onClick={() => setIsRouteDrawerOpen(false)} className="bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-xl px-5">
                Fechar Painel
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}