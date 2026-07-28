/**
 * ============================================================================
 * @fileoverview Consulta e Gestão de Rotas / Orchestrator (Backoffice)
 * @module Backoffice/OrchestratorConfigs
 * @route /backoffice/orchestrator-configs
 * 
 * @description
 * Este módulo atua como o painel central de governança e inspeção das rotas e 
 * configurações do Orchestrator. Ele realiza a listagem direta de registros na tabela
 * `orchestrator_configs`, cruzando informações relacionais com as tabelas de domínio
 * (`product_types`, `category_types` e `partners`). Inclui suporte a ordenação por ID,
 * filtragem dinâmica por status (Ativas/Inativas) e inspeção aprofundada via painel 
 * lateral (Sheet/Drawer) estruturado com blocos visuais de propostas, regras, FAQs e LGPD.
 * 
 * @architecture
 * - Data Fetching: Consultas relacionais diretas via PostgREST (Supabase Client).
 * - State Management: Hooks reativos do React (useState, useEffect, useMemo).
 * - Design System: Componentes padronizados do Tailwind CSS e Shadcn/UI.
 * ============================================================================
 */

import { createLazyFileRoute } from "@tanstack/react-router";
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
  SlidersHorizontal,
  Filter,
  ChevronDown
} from "lucide-react";

// Componentes da Interface (Design System Shadcn/UI)
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { TooltipProvider } from "@/components/ui/tooltip";

// Camada de Persistência (BaaS) e Dicionários Gráficos
import { supabase } from "@/integrations/supabase/client";
import { ICON_MAP } from "@/features/financial-hub/components/shared/icons-map";

// ============================================================================
// [REGISTRO DA ROTA TANSTACK ROUTER]
// ============================================================================
export const Route = createLazyFileRoute("/backoffice/routes")({
  component: OrchestratorConfigsBackofficePage,
});

/**
 * @type {OrchestratorRow}
 * @description Tipagem estrita mapeando a estrutura de colunas da tabela de rotas.
 */
type OrchestratorRow = {
  id: string | number;
  lookup_id: string;
  config_type: string;
  entity_type: string;
  page_url: string;
  integration_method: string;
  partner_id?: string | number;
  is_active?: boolean;
  page_configs?: any;
  integration_details?: any;
  rules?: any;
  consent_configs?: any[];
  page_faqs?: any[];
  created_at?: string;
};

/**
 * =========================================================================
 * [SUB-COMPONENTES DA ROTA]: Renderizadores de UI do Orchestrator
 * =========================================================================
 */

/**
 * @function FAQSection
 * @description Renderiza blocos expansíveis (Accordion) organizados em duas colunas 
 * baseados no array `page_faqs` da configuração da rota.
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

/**
 * @function FooterRender
 * @description Processa templates de string e substitui dinamicamente marcadores 
 * de hiperlink baseados nos metadados de rodapé da rota.
 */
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
        <p className="leading-relaxed text-justify sm:text-center text-slate-400">
          {renderText()}
        </p>
      </footer>
    </div>
  );
}

/**
 * @function OfferPanelRender
 * @description Constrói visualmente o painel de proposta de valor da rota, 
 * aplicando tipografias dinâmicas e ícones renderizados via ICON_MAP.
 */
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
    <div className="space-y-3" style={{ '--brand-primary': brandColor } as React.CSSProperties}>
      <div className="space-y-1.5">
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
        <ul className="grid grid-cols-1 gap-2 pt-1">
          {panel.benefits.map((b: any, i: number) => {
            const IconComponent = ICON_MAP[b.icon] || ICON_MAP[b.icon?.toLowerCase()] || CheckCircle2;
            return (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-[#B300FF]/10 text-[#B300FF]">
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

      {panel.partner?.name && (
        <div className="rounded-xl border border-border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
          {panel.partner.label}{" "}
          <strong className="text-foreground">{panel.partner.name}</strong>.
        </div>
      )}
    </div>
  );
}

/**
 * @function DynamicConsentsStatic
 * @description Renderiza de forma estática os termos de consentimento e LGPD 
 * exigidos por cada rota configurada.
 */
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
 * [COMPONENTE PRINCIPAL]: OrchestratorConfigsBackofficePage
 * =========================================================================
 */
function OrchestratorConfigsBackofficePage() {
  // --- ESTADOS CORE DA TELA ---
  const [rows, setRows] = useState<OrchestratorRow[]>([]);
  const [productsMap, setProductsMap] = useState<Record<string, string>>({});
  const [categoriesMap, setCategoriesMap] = useState<Record<string, string>>({});
  const [partnersMap, setPartnersMap] = useState<Record<string, { name: string; logo_url: string }>>({});
  
  // --- ESTADOS DE CONTROLE E FILTRAGEM ---
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "all">("active");

  // --- ESTADOS DO PAINEL LATERAL (SHEET / DRAWER) ---
  const [isRouteDrawerOpen, setIsRouteDrawerOpen] = useState(false);
  const [activeConfig, setActiveConfig] = useState<OrchestratorRow | null>(null);

  /**
   * @async
   * @function load
   * @description Pipeline assíncrono para busca simultânea de rotas, produtos, 
   * categorias oficiais e parceiros no Supabase.
   */
  async function load() {
    setLoading(true);
    try {
      // 1. Busca dados da tabela principal de configurações de rotas
      const { data: configData, error: configError } = await supabase
        .from("orchestrator_configs")
        .select("*");

      if (configError) throw configError;
      setRows((configData as OrchestratorRow[]) || []);

      // 2. Mapeia tipos de produtos por ID
      const { data: prodData } = await supabase.from("product_types").select("id, name");
      if (prodData) {
        const pMap: Record<string, string> = {};
        prodData.forEach(p => { pMap[String(p.id)] = p.name; });
        setProductsMap(pMap);
      }

      // 3. Mapeia categorias oficiais (tabela category_types) por ID
      const { data: catData } = await supabase.from("category_types").select("id, name");
      if (catData) {
        const cMap: Record<string, string> = {};
        catData.forEach(c => { cMap[String(c.id)] = c.name; });
        setCategoriesMap(cMap);
      }

      // 4. Mapeia parceiros ativos (nome e logotipos)
      const { data: partData } = await supabase.from("partners").select("id, name, logo_url");
      if (partData) {
        const ptMap: Record<string, { name: string; logo_url: string }> = {};
        partData.forEach(pt => { ptMap[String(pt.id)] = { name: pt.name, logo_url: pt.logo_url }; });
        setPartnersMap(ptMap);
      }

    } catch (err) {
      console.error("Erro crítico ao carregar dados do orchestrator:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  // Aciona o carregamento inicial ao montar o componente
  useEffect(() => {
    load();
  }, []);

  /**
   * @function getProductOrCategoryName
   * @description Resolve o nome descritivo do item cruzando o `lookup_id` com a 
   * tabela apropriada (`product_types` se PRODUCT ou `category_types` se CATEGORY).
   */
  const getProductOrCategoryName = (r: OrchestratorRow) => {
    if (r.config_type === "PRODUCT" && productsMap[r.lookup_id]) {
      return productsMap[r.lookup_id];
    }
    if (r.config_type === "CATEGORY" && categoriesMap[r.lookup_id]) {
      return categoriesMap[r.lookup_id];
    }
    return r.lookup_id ? `ID #${r.lookup_id}` : "—";
  };

  /**
   * @function getPartnerInfo
   * @description Localiza os dados institucionais e visuais do parceiro vinculado à rota.
   */
  const getPartnerInfo = (r: OrchestratorRow) => {
    const partnerId = r.partner_id || r.integration_details?.partner_id || r.page_configs?.offer_panel?.partner?.id;
    if (partnerId && partnersMap[String(partnerId)]) {
      return partnersMap[String(partnerId)];
    }
    return null;
  };

  /**
   * @constant filtered
   * @description Motor de busca textual e filtragem por status, aplicando 
   * ordenação numérica estrita ascendente com base no ID primário da tabela.
   */
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    
    return rows.filter((r) => {
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
    }).sort((a, b) => {
      // Ordenação estrita por ID numérico do banco de dados
      const idA = Number(a.id) || 0;
      const idB = Number(b.id) || 0;
      return idA - idB;
    });
  }, [rows, search, statusFilter, productsMap, categoriesMap]);

  /**
   * @function handleOpenDrawer
   * @description Abre o painel lateral de inspeção para a configuração selecionada.
   */
  const handleOpenDrawer = (config: OrchestratorRow) => {
    setActiveConfig(config);
    setIsRouteDrawerOpen(true);
  };

  return (
    <div className="space-y-6 font-sans">
      
      {/* HEADER DA TELA E CONTROLES */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Consulta de Rotas & Orchestrator</h1>
          <p className="text-sm text-muted-foreground">
            Gerenciamento e inspeção ordenada das configurações de rotas do sistema.
          </p>
        </div>
        <Button onClick={load} className="rounded-xl" disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      {/* BARRA DE FILTROS E BUSCA */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
          
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              placeholder="Buscar por ID, URL, Nome do Produto..." 
              className="h-10 rounded-xl pl-9" 
            />
          </div>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 rounded-xl gap-2 bg-white">
                <Filter className="h-3.5 w-3.5 opacity-70" />
                Status: {statusFilter === "active" ? "Ativas" : statusFilter === "inactive" ? "Inativas" : "Todas"}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-0" align="end">
              <Command>
                <CommandList>
                  <CommandGroup>
                    <CommandItem onSelect={() => setStatusFilter("active")} className="cursor-pointer">
                      Apenas Ativas
                    </CommandItem>
                    <CommandItem onSelect={() => setStatusFilter("inactive")} className="cursor-pointer">
                      Apenas Inativas
                    </CommandItem>
                    <CommandItem onSelect={() => setStatusFilter("all")} className="cursor-pointer">
                      Todas
                    </CommandItem>
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

        </div>

        {/* TABELA DE ROTAS COM LARGURAS FIXAS E TÍTULO DE COLUNA "REGRA" */}
        <div className="w-full overflow-x-auto">
          <table className="w-full text-sm table-fixed">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-3 w-[80px]">ID</th>
                <th className="px-3 py-3 w-[260px]">Regra</th>
                <th className="px-3 py-3 w-[150px]">Parceiro</th>
                <th className="px-3 py-3 w-[360px]">URL da Página</th>
                <th className="px-3 py-3 w-[110px] text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-10 text-center text-muted-foreground">
                    Carregando rotas...
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
                      onClick={() => handleOpenDrawer(r)}
                      className="border-b border-border/60 hover:bg-accent/40 cursor-pointer transition-colors"
                      title="Clique para ver detalhes completos"
                    >
                      {/* ID numérico primário ordenado */}
                      <td className="px-3 py-3 font-mono text-sm text-foreground">
                        {r.id || "—"}
                      </td>

                      {/* Regra (Tipo / Categoria / Produto) */}
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

                      {/* Parceiro com logotipos padronizados */}
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5 truncate">
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-transparent overflow-hidden shrink-0 border bg-white" title={partner?.name}>
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

                      {/* URL com espaço expandido */}
                      <td className="px-3 py-3 font-mono text-xs text-muted-foreground truncate" title={r.page_url}>
                        {r.page_url || "—"}
                      </td>

                      {/* Ações */}
                      <td className="px-3 py-3 text-right">
                        <Button variant="ghost" size="sm" className="rounded-lg text-[#B300FF] hover:text-[#9a00db] px-2">
                          consultar rota
                        </Button>
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
      {/* PAINEL LATERAL (SHEET / DRAWER) DE DETALHES DA ROTA                   */}
      {/* ===================================================================== */}
      {isRouteDrawerOpen && activeConfig && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-all">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
            
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-slate-50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#B300FF]" />
                <h3 className="text-sm font-black uppercase text-slate-800">Consulta de Rota: ID #{activeConfig.id} - {getProductOrCategoryName(activeConfig)}</h3>
              </div>
              <button onClick={() => setIsRouteDrawerOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="space-y-6">
                
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-1.5 font-mono">
                  <p><b>ID Config:</b> {activeConfig.id} | <b>Lookup ID:</b> {activeConfig.lookup_id}</p>
                  <p><b>Tipo:</b> {activeConfig.config_type} ({activeConfig.entity_type})</p>
                  <p><b>URL:</b> {activeConfig.page_url}</p>
                  <p><b>Método:</b> {activeConfig.integration_method || "—"}</p>
                </div>

                {activeConfig.page_configs?.offer_panel && (
                  <div className="bg-white p-4 rounded-xl border shadow-sm">
                    <h4 className="text-[11px] font-bold uppercase text-purple-600 mb-3 flex items-center gap-1.5">
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

                {activeConfig.consent_configs && activeConfig.consent_configs.length > 0 && (
                  <div className="bg-white p-4 rounded-xl border shadow-sm">
                    <h4 className="text-[11px] font-bold uppercase text-purple-600 mb-3 flex items-center gap-1.5">
                      <FileText size={14} /> Consentimentos da Rota (LGPD)
                    </h4>
                    <DynamicConsentsStatic configs={activeConfig.consent_configs} />
                  </div>
                )}

                {activeConfig.page_faqs && activeConfig.page_faqs.length > 0 && (
                  <div className="bg-white p-4 rounded-xl border shadow-sm">
                    <h4 className="text-[11px] font-bold uppercase text-purple-600 mb-1 flex items-center gap-1.5">
                      <HelpCircle size={14} /> FAQ & Perguntas Frequentes
                    </h4>
                    <FAQSection items={activeConfig.page_faqs} />
                  </div>
                )}

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