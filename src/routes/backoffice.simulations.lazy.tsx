/**
 * @fileoverview Monitor de Simulações (Backoffice)
 * @route /backoffice/simulations
 * 
 * ============================================================================
 * [ARQUITETURA, CLEAN ARCHITECTURE & DESIGN SYSTEM]
 * ============================================================================
 * Tela de monitoramento operacional (Backoffice). Exibe um dashboard analítico 
 * corporativo com KPIs consolidados, filtros cruzados avançados e uma tabela de 
 * listagem em tempo real rigorosamente alinhada ao design system original.
 * 
 * [AJUSTES DESTA VERSÃO]:
 * - Solução DEFINITIVA de impressão usando Iframe Isolado. Ignora bloqueios do Radix UI,
 *   preserva 100% das classes Tailwind e evita telas em branco no PDF.
 * ============================================================================
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  RefreshCw, Search, Filter, Download, ChevronDown, Camera, Building2, User,
  Calendar as CalendarIcon, CreditCard, MapPin, Smartphone, Briefcase, Layers,
  FileText, HelpCircle, CheckCircle2, Printer
} from "lucide-react";
import { DateRange } from "react-day-picker";

// Componentes da Interface (Design System baseados em Radix UI / Tailwind CSS)
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { TooltipProvider } from "@/components/ui/tooltip";

// Conexão centralizada com o Client do Supabase e Dicionários Gráficos
import { supabase } from "@/integrations/supabase/client";
import { ICON_MAP } from "@/features/financial-hub/components/shared/icons-map";

// ============================================================================
// [REGISTRO DA ROTA TANSTACK ROUTER]
// ============================================================================
export const Route = createLazyFileRoute("/backoffice/simulations")({
  component: SimulationsPage,
});

// ============================================================================
// [SUB-COMPONENTES DE RENDERIZAÇÃO DO PAYLOAD DA SIMULAÇÃO]
// ============================================================================

/**
 * @function FAQSection
 * @description Renderiza blocos expansíveis (Accordion) em uma única coluna.
 * Suporta o modo `isPrint` para forçar a abertura de todas as respostas na geração do PDF.
 */
function FAQSection({ items, isPrint = false }: { items?: any[]; isPrint?: boolean }) {
  if (!items || items.length === 0) return null;
  const sortedItems = [...items].sort((a, b) => (a.position || 0) - (b.position || 0));

  // ====================================================================
  // VERSÃO IMPRESSÃO: Sempre aberto, sem cliques e sem setas (chevrons)
  // ====================================================================
  if (isPrint) {
    return (
      <section className="py-2 bg-white">
        <div className="grid grid-cols-1 gap-y-3">
          {sortedItems.map((item, i) => (
            <div key={`print-faq-${i}`} className="border border-slate-200 rounded-xl px-4 py-3 bg-white shadow-sm break-inside-avoid">
              <div className="font-bold text-xs text-slate-800 pb-2">
                {item.question}
              </div>
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

  // ====================================================================
  // VERSÃO TELA: Accordion interativo padrão (1 Coluna)
  // ====================================================================
  return (
    <section className="py-1 overflow-hidden bg-white">
      <div className="max-w-full">
        <div className="grid grid-cols-1 gap-y-2">
          <Accordion type="single" collapsible className="w-full space-y-2">
            {sortedItems.map((item, i) => (
              <AccordionItem 
                key={i} 
                value={`faq-item-${i}`} 
                className="border border-border rounded-xl px-3 bg-white/60 shadow-sm transition-all"
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
      <h4 className="text-[11px] font-bold uppercase text-[#B300FF] flex items-center gap-1.5">
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

function OfferPanelRender({ config }: { config: any }) {
  const panel = config?.offer_panel || config;
  if (!panel?.headline?.parts || !panel?.description?.parts) return null;
  
  const brandColor = config?.theme?.primary_color || "#B300FF";

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
                {opt.template_text ? (
                  opt.template_text.split(/(\{.*?\})/g).map((part: string, i: number) => {
                    if (part.startsWith("{") && part.endsWith("}")) {
                      const cleanText = part.replace(/[{}]/g, "");
                      return <span key={i} className="underline font-bold inline mx-0.5 text-[#B300FF]">{cleanText}</span>;
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

// ============================================================================
// [HELPERS E FORMATADORES GLOBAIS]
// ============================================================================

const STATUS_STYLES: Record<string, string> = {
  simulacao: "bg-primary/10 text-primary",
  "em análise": "bg-amber-500/10 text-amber-600",
  analise: "bg-amber-500/10 text-amber-600",
  aprovada: "bg-emerald-500/15 text-emerald-600",
  recusada: "bg-rose-500/10 text-rose-600",
  falha: "bg-rose-500/10 text-rose-600",
  "pendente docs": "bg-muted text-muted-foreground",
  default: "bg-muted text-muted-foreground",
};

function statusClass(status: string | null) {
  if (!status) return STATUS_STYLES.default;
  const key = status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return STATUS_STYLES[key] ?? STATUS_STYLES.default;
}

const BRL = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

function formatDate(iso: string | null) {
  if (!iso) return { d: "—", h: "" };
  const dt = new Date(iso);
  return {
    d: dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }),
    h: dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
}

// ============================================================================
// [COMPONENTE PRINCIPAL: PAGE CONTROLLER]
// ============================================================================
function SimulationsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>("Todos");
  const [dateRange, setDateRange] = useState<"30" | "90" | "all" | "custom">("30");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();

  const [partnersList, setPartnersList] = useState<any[]>([]);
  const [productsList, setProductsList] = useState<any[]>([]);
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  const [activeSimulation, setActiveSimulation] = useState<any | null>(null);
  
  // Ref para capturar o HTML exato do relatório de impressão
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadDropdowns() {
      const { data: pData } = await supabase.from('partners').select('id, name').eq('is_active', true).order('name');
      if (pData) setPartnersList(pData);

      const { data: prData } = await supabase.from('product_types').select('id, name').order('name');
      if (prData) setProductsList(prData);
    }
    loadDropdowns();
  }, []);

  async function load() {
    const [{ data: simData }, { data: statusData }] = await Promise.all([
      supabase.from("simulations").select(`
        *,
        partners(id, name, logo_url),
        product_types(id, name),
        stage_types(id, name),
        status_types(id, name),
        financial_institutions(id, name, logo_url),
        simulation_offers(*),
        simulation_consents(*)
      `).order('created_at', { ascending: false }),
      supabase.from("status_types").select("name")
    ]);

    if (simData) setRows(simData);
    if (statusData) setStatusOptions(statusData.map(s => s.name));
  }

  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    const t = { total: rows.length, simulacao: 0, analise: 0, aprovada: 0, volume: 0 };
    rows.forEach(r => {
      const s = (r.status_types?.name ?? "").toLowerCase();
      if (s.includes("simul")) t.simulacao++;
      else if (s.includes("anal")) t.analise++;
      else if (s.includes("aprov")) { t.aprovada++; t.volume += r.financed_amount ?? 0; }
    });
    return t;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const statusName = r.status_types?.name ?? "—";
      const matchStatus = selectedStatus === "Todos" || statusName === selectedStatus;
      
      const rawSearch = search.toLowerCase().trim();
      const rawDocSearch = search.replace(/\D/g, "");
      const rowDoc = r.document?.replace(/\D/g, "") || "";
      
      const matchSearch = rawSearch === "" || (r.name ?? "").toLowerCase().includes(rawSearch) || (rawDocSearch !== "" && rowDoc.includes(rawDocSearch));
      const matchPartner = selectedPartners.length === 0 || selectedPartners.includes(String(r.partner_id));
      const matchProduct = selectedProducts.length === 0 || selectedProducts.includes(String(r.product_id));
      
      let matchDate = true;
      const rowDate = new Date(r.created_at);
      
      if (dateRange === "custom" && customRange?.from && customRange?.to) {
        matchDate = rowDate >= customRange.from && rowDate <= customRange.to;
      } else if (dateRange !== "all") {
        const days = parseInt(dateRange);
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() - days);
        matchDate = rowDate >= limitDate;
      }
      
      return matchSearch && matchStatus && matchDate && matchPartner && matchProduct;
    });
  }, [rows, search, selectedStatus, dateRange, customRange, selectedPartners, selectedProducts]);

  // ============================================================================
  // [HANDLE DE IMPRESSÃO: IFRAME ISOLADO]
  // ============================================================================
  /**
   * Esta função ignora completamente o CSS @media print e os bloqueios do Radix.
   * Ela cria um Iframe invisível, clona todo o Tailwind do projeto para ele,
   * copia o HTML da `printRef` e aciona a impressão isolada de erros.
   */
  const handlePrintSheet = () => {
    if (!printRef.current) return;

    // 1. Cria um iframe invisível no documento
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const iframeDoc = iframe.contentWindow?.document;
    if (!iframeDoc) return;

    // 2. Extrai o CSS (Tailwind) e o HTML do relatório
    const headHTML = document.head.innerHTML;
    const reportHTML = printRef.current.innerHTML;

    // 3. Monta o documento do Iframe e dispara a janela de impressão
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

    // 4. Dá meio segundo para o navegador compilar as classes do Tailwind e dispara
    setTimeout(() => {
      if (iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      }
      // Limpeza da memória após a janela fechar
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }, 500);
  };

  return (
    <div className="font-sans space-y-6">
      
      {/* HEADER DA TELA */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monitor de Simulações</h1>
          <p className="text-sm text-muted-foreground">Acompanhe simulações, análises e aprovações em tempo real.</p>
        </div>
        <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-xl"><Download className="mr-2 h-4 w-4" /> Exportar</Button>
            <Button onClick={load} className="rounded-xl"><RefreshCw className="mr-2 h-4 w-4" /> Atualizar</Button>
        </div>
      </div>

      {/* BLOCO DE KPIS */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
            { label: "Total de propostas", value: totals.total, highlight: false },
            { label: "Em simulação", value: totals.simulacao, highlight: false },
            { label: "Em análise", value: totals.analise, highlight: false },
            { label: "Aprovadas", value: totals.aprovada, highlight: false },
            { label: "Volume aprovado", value: BRL(totals.volume), highlight: true }
        ].map((t) => (
            <div key={t.label} className={`rounded-2xl border p-5 ${t.highlight ? "bg-[#fdf2f8] border-[#fbcfe8] text-[#d946ef]" : "border-border bg-card text-card-foreground"}`}>
                <div className={`text-xs font-semibold uppercase ${t.highlight ? "text-[#d946ef]" : "text-muted-foreground"}`}>{t.label}</div>
                <div className="mt-2 text-2xl font-bold">{t.value}</div>
            </div>
        ))}
      </div>

      {/* MÓDULO DE FILTROS & GRID DE PROPOSTAS */}
      <div className="rounded-2xl border border-border bg-card overflow-x-auto">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome ou CPF/CNPJ..." className="h-10 rounded-xl pl-9" />
          </div>

          <Popover>
            <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-10 rounded-xl gap-2 bg-white hover:bg-muted/50 border border-border transition-colors"><Filter className="h-3.5 w-3.5 opacity-70" />Parceiro: {selectedPartners.length === 0 ? "Todos" : `${selectedPartners.length} selecionado(s)`}<ChevronDown className="h-3 w-3 opacity-60" /></Button></PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="start"><Command><CommandList><CommandGroup><CommandItem onSelect={() => setSelectedPartners([])} className="cursor-pointer"><div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${selectedPartners.length === 0 ? "bg-primary text-primary-foreground" : "opacity-50"}`}>{selectedPartners.length === 0 && "✓"}</div>Todos Parceiros</CommandItem>{partnersList.map((p) => { const isSelected = selectedPartners.includes(String(p.id)); return (<CommandItem key={p.id} onSelect={() => { if (isSelected) setSelectedPartners(selectedPartners.filter(id => id !== String(p.id))); else setSelectedPartners([...selectedPartners, String(p.id)]); }} className="cursor-pointer"><div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? "bg-primary text-primary-foreground" : "opacity-50"}`}>{isSelected && "✓"}</div>{p.name}</CommandItem>); })}</CommandGroup></CommandList></Command></PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-10 rounded-xl gap-2 bg-white hover:bg-muted/50 border border-border transition-colors"><Filter className="h-3.5 w-3.5 opacity-70" />Produto: {selectedProducts.length === 0 ? "Todos" : `${selectedProducts.length} selecionado(s)`}<ChevronDown className="h-3 w-3 opacity-60" /></Button></PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="start"><Command><CommandList><CommandGroup><CommandItem onSelect={() => setSelectedProducts([])} className="cursor-pointer"><div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${selectedProducts.length === 0 ? "bg-primary text-primary-foreground" : "opacity-50"}`}>{selectedProducts.length === 0 && "✓"}</div>Todos Produtos</CommandItem>{productsList.map((p) => { const isSelected = selectedProducts.includes(String(p.id)); return (<CommandItem key={p.id} onSelect={() => { if (isSelected) setSelectedProducts(selectedProducts.filter(id => id !== String(p.id))); else setSelectedProducts([...selectedProducts, String(p.id)]); }} className="cursor-pointer"><div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? "bg-primary text-primary-foreground" : "opacity-50"}`}>{isSelected && "✓"}</div>{p.name}</CommandItem>); })}</CommandGroup></CommandList></Command></PopoverContent>
          </Popover>

          <Popover>
            <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-10 rounded-xl bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8] hover:bg-[#fce7f3] transition-colors"><Filter className="mr-2 h-3.5 w-3.5" /> Situação: {selectedStatus} <ChevronDown className="ml-2 h-3 w-3" /></Button></PopoverTrigger>
            <PopoverContent className="p-0 w-56 bg-[#fdf2f8] border-[#fbcfe8]" align="start"><Command><CommandInput placeholder="Filtrar..." className="text-[#d946ef]" /><CommandList><CommandEmpty>Nenhum status encontrado.</CommandEmpty><CommandGroup><CommandItem onSelect={() => setSelectedStatus("Todos")} className="text-[#d946ef] cursor-pointer">Todos</CommandItem>{statusOptions.map((s) => (<CommandItem key={s} onSelect={() => setSelectedStatus(s)} className="text-[#d946ef] cursor-pointer">{s}</CommandItem>))}</CommandGroup></CommandList></Command></PopoverContent>
          </Popover>
          
          <Popover>
            <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-10 rounded-xl hover:bg-[#fce7f3] transition-colors"><Filter className="mr-2 h-3.5 w-3.5" /> Período: {dateRange === "custom" ? "Personalizado" : dateRange === "30" ? "30 dias" : dateRange === "90" ? "90 dias" : "Tudo"} <ChevronDown className="ml-2 h-3 w-3" /></Button></PopoverTrigger>
            <PopoverContent className="p-0 w-auto" align="start"><Command><CommandList><CommandGroup><CommandItem onSelect={() => setDateRange("30")}>Últimos 30 dias</CommandItem><CommandItem onSelect={() => setDateRange("90")}>Últimos 90 dias</CommandItem><CommandItem onSelect={() => setDateRange("all")}>Todo o período</CommandItem></CommandGroup><div className="p-2 border-t"><p className="text-xs font-semibold px-2 mb-2 text-muted-foreground">Personalizado:</p><Calendar mode="range" selected={customRange} onSelect={(range) => { setCustomRange(range); setDateRange("custom"); }} numberOfMonths={1} /></div></CommandList></Command></PopoverContent>
          </Popover>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-3 w-[80px]">Data</th>
              <th className="px-3 py-3 w-[150px]">Cliente</th>
              <th className="px-3 py-3 w-[150px]">Estágio/Produto</th>
              <th className="px-3 py-3 w-[200px]">Oferta</th>
              <th className="px-3 py-3 w-[140px] text-right">Financiado</th>
              <th className="px-3 py-3 w-[160px]">Situação</th>
              <th className="px-3 py-3 w-[140px]">Parceiro / Banco</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const created = formatDate(r.created_at);
              const updated = formatDate(r.updated_at);
              const statusName = r.status_types?.name ?? "—";
              const stageName = r.stage_types?.name ?? "—";
              const productName = r.product_types?.name ?? "—";
              const parcela = r.installments && r.installment_value ? `${r.installments}x ${BRL(r.installment_value)}` : "—";
              const offer = Array.isArray(r.simulation_offers) ? r.simulation_offers[0] : (r.simulation_offers || {});
              const endEvent = offer?.event_end_date ? new Date(offer.event_end_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";
              
              const bank = Array.isArray(r.financial_institutions) ? r.financial_institutions[0] : r.financial_institutions;
              const rawDoc = r.document?.replace(/\D/g, "") || "";
              const doc = rawDoc.length === 14 ? rawDoc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : rawDoc.length === 11 ? rawDoc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : r.document || "—";
              const phone = r.phone?.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3") ?? "";
              
              return (
                <tr key={r.id} onClick={() => setActiveSimulation(r)} className="border-b border-border/60 hover:bg-accent/40 cursor-pointer transition-colors">
                  <td className="px-3 py-3 w-[80px]"><div className="font-semibold">{created.d}</div><div className="text-xs text-muted-foreground">{created.h}</div></td>
                  <td className="px-3 py-3 w-[220px]"><div className="font-semibold text-[#d946ef] truncate" title={r.name}>{r.name || "—"}</div><div className="text-sm text-muted-foreground">{doc}</div><div className="text-sm text-muted-foreground">{phone || "—"}</div></td>
                  <td className="px-3 py-3 w-[150px]"><div className="font-semibold">{stageName}</div><div className="text-xs text-muted-foreground">{productName}</div><div className="text-[10px] font-bold text-muted-foreground mt-0.5 uppercase tracking-tighter">{r.partners?.name || "—"}</div></td>
                  <td className="px-3 py-3 max-w-[200px] sm:max-w-[250px]"><div className="font-semibold truncate">{offer?.offer_description || "—"}</div><div className="text-xs text-muted-foreground truncate mt-0.5">{offer?.event_id || "—"} - {offer?.event_description || "—"}</div><div className="text-[11px] text-muted-foreground font-medium mt-0.5">{BRL(offer?.offer_value)} {endEvent ? `(Fim: ${endEvent})` : ""}</div></td>
                  <td className="px-3 py-3 w-[140px] text-right"><div className="font-semibold">{BRL(r.financed_amount)}</div><div className="text-[10px] text-muted-foreground">{r.down_payment_percentage === 0 ? "Sem entrada" : r.down_payment_percentage != null ? `Entrada: ${r.down_payment_percentage.toFixed(0)}%` : "—"}</div><div className="text-[10px] font-medium text-muted-foreground">{parcela}</div></td>
                  <td className="px-3 py-3 w-[160px]"><div className="flex flex-col items-start gap-1"><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(statusName)}`}>{statusName}</span><span className="text-[10px] text-muted-foreground">{updated.d} {updated.h}</span></div></td>
                  <td className="px-3 py-3 w-[140px]"><div className="flex items-center gap-1.5"><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-transparent overflow-hidden">{r.partners?.logo_url ? <img src={r.partners.logo_url} className="h-full w-full object-cover" alt={r.partners.name} /> : <span className="flex items-center justify-center h-full w-full text-[10px] font-bold uppercase">{r.partners?.name?.slice(0, 3)}</span>}</div>{bank && <><span className="text-muted-foreground/20 text-xs">/</span><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-transparent overflow-hidden">{bank?.logo_url ? <img src={bank.logo_url} className="h-full w-full object-cover" alt={bank?.name} /> : <Camera className="h-5 w-5 text-muted-foreground/50" />}</div></>}</div></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ===================================================================== */}
      {/* [PAINEL LATERAL DE DETALHES TELA - SHEET DO RADIX]                    */}
      {/* ===================================================================== */}
      <Sheet open={!!activeSimulation} onOpenChange={(open) => !open && setActiveSimulation(null)}>
        <SheetContent className="w-full sm:max-w-xl flex flex-col h-full p-0 overflow-hidden bg-white">
          {activeSimulation && (() => {
            const sim = activeSimulation;
            const created = formatDate(sim.created_at);
            const offerRow = Array.isArray(sim.simulation_offers) ? sim.simulation_offers[0] : (sim.simulation_offers || {});
            const bank = Array.isArray(sim.financial_institutions) ? sim.financial_institutions[0] : sim.financial_institutions;
            const ed = sim.entity_details || sim.details || {};
            const rawDoc = sim.document?.replace(/\D/g, "") || ed.document?.replace(/\D/g, "") || "";
            const isPJ = (ed.entity_type || (rawDoc.length === 14 ? "J" : "P")) === "J";
            const doc = rawDoc.length === 14 ? rawDoc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : rawDoc.length === 11 ? rawDoc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : sim.document || "—";
            const fullAddress = [ed.address?.street, ed.address?.number, ed.address?.complement, ed.address?.neighborhood, ed.address?.city, ed.address?.state, ed.address?.zip_code, ed.address?.country].filter(Boolean).join(", ");
            const od = offerRow.offer_details || offerRow || {};
            const updatesArray = Array.isArray(sim.simulation_updates) ? sim.simulation_updates : [];
            const firstUpdate = updatesArray.length > 0 ? updatesArray[0] : {};

            const rawPayloadObj = typeof sim.raw_payload === "string" ? (() => { try { return JSON.parse(sim.raw_payload); } catch { return {}; } })() : (sim.raw_payload || {});
            const pageConfigs = rawPayloadObj.page_configs || {};
            const consentConfigs = rawPayloadObj.consent_configs || [];
            const pageFaqs = rawPayloadObj.page_faqs || [];

            return (
              <div className="flex flex-col h-full overflow-hidden">
                <div className="p-6 pb-4 border-b bg-white shrink-0">
                  <SheetHeader className="space-y-3">
                    <div className="flex items-center justify-between pr-8">
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-md overflow-hidden border bg-white">
                          {sim.partners?.logo_url ? <img src={sim.partners.logo_url} className="h-full w-full object-cover" alt={sim.partners?.name} /> : <span className="text-[9px] font-bold">{sim.partners?.name?.slice(0, 3)}</span>}
                        </div>
                        <span className="text-xs font-bold text-slate-700 uppercase tracking-wide">{sim.partners?.name || "Parceiro N/A"}</span>
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">ID: {sim.id}</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
                      <div>
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">{sim.product_types?.name || "Financiamento"}</span>
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${statusClass(sim.status_types?.name)}`}>{sim.status_types?.name || "Pendente"}</span>
                        </div>
                        <SheetTitle className="text-xl font-bold text-slate-900 mt-1">{sim.name || ed.name || "Cliente sem nome"}</SheetTitle>
                      </div>
                    </div>
                  </SheetHeader>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <div className="rounded-xl border bg-slate-50 p-4 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2"><CalendarIcon className="h-3.5 w-3.5 text-primary" /> Origem & Visita</h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div><span className="text-muted-foreground block">Data de Início:</span><strong className="text-slate-800">{created.d} às {created.h}</strong></div>
                      <div><span className="text-muted-foreground block">Visit ID:</span><strong className="text-slate-800 font-mono truncate block" title={sim.visit_id}>{sim.visit_id || "Não rastreado"}</strong></div>
                    </div>
                    <div className="pt-2 border-t grid grid-cols-1 gap-2 text-xs">
                      <div className="flex items-center gap-1.5 text-slate-700"><MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span><strong>Localização:</strong> {firstUpdate.country || "BR"} / {firstUpdate.state || "—"} / {firstUpdate.city || "—"}</span></div>
                      <div className="flex items-center gap-1.5 text-slate-700"><Smartphone className="h-3.5 w-3.5 text-muted-foreground shrink-0" /><span><strong>IP / Device:</strong> {sim.ip_address || firstUpdate.ip_address || ed.metadata?.originIp || "179.218.11.57"} / {firstUpdate.operating_system || "Windows"} ({firstUpdate.device_type || "Desktop"})</span></div>
                    </div>
                  </div>

                  <div className="rounded-xl border bg-card p-4 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2"><User className="h-3.5 w-3.5 text-primary" /> Dados Cadastrais ({isPJ ? "Pessoa Jurídica" : "Pessoa Física"})</h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div><span className="text-muted-foreground block">{isPJ ? "CNPJ:" : "CPF:"}</span><strong className="text-slate-800 font-mono">{doc}</strong></div>
                      <div><span className="text-muted-foreground block">{isPJ ? "Data de Fundação:" : "Data de Nascimento:"}</span><strong className="text-slate-800">{ed.birth_date ? new Date(ed.birth_date).toLocaleDateString("pt-BR") : "—"}</strong></div>
                      <div><span className="text-muted-foreground block">Telefone:</span><strong className="text-slate-800">{sim.phone || ed.phone || "—"}</strong></div>
                      <div><span className="text-muted-foreground block">Login de Acesso:</span><strong className="text-slate-800">{ed.login || "—"}</strong></div>
                      <div className="col-span-2 pt-2 border-t"><span className="text-muted-foreground block">E-mail:</span><strong className="text-slate-800 truncate block" title={sim.email || ed.email}>{sim.email || ed.email || "—"}</strong></div>
                    </div>
                    {fullAddress && (<div className="mt-3 pt-3 border-t text-xs"><span className="text-muted-foreground block">Endereço Completo:</span><strong className="text-slate-800 font-normal">{fullAddress}</strong></div>)}
                  </div>

                  {od.offer_description && (
                    <div className="rounded-xl border bg-card p-4 space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2"><CreditCard className="h-3.5 w-3.5 text-primary" /> Oferta / Lote</h4>
                      <div className="space-y-3 text-xs">
                        <div><span className="text-muted-foreground block">Descrição da Oferta:</span><strong className="text-slate-900 text-sm font-semibold">{od.offer_description}</strong></div>
                        <div className="grid grid-cols-2 gap-3 pt-1 border-t items-center">
                          <div><span className="text-muted-foreground block">Categoria:</span><strong className="text-slate-800">{od.category || "—"}</strong></div>
                          <div className="text-right"><span className="text-muted-foreground block">Número:</span><strong className="text-slate-800 font-mono">Lote #{od.lot_number || "—"} / Oferta #{od.offer_id || "—"}</strong></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {(offerRow.manager_name || offerRow.legal_name || offerRow.seller_id) && (
                    <div className="rounded-xl border bg-slate-50 p-4 space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2"><Briefcase className="h-3.5 w-3.5 text-primary" /> Organizador & Vendedor</h4>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        {offerRow.manager_name && (<div><span className="text-muted-foreground block">Organizador:</span><strong className="text-slate-800">{offerRow.manager_name}</strong></div>)}
                        {offerRow.seller_id && (<div><span className="text-muted-foreground block">Seller ID:</span><strong className="text-slate-800 font-mono">{offerRow.seller_id}</strong></div>)}
                      </div>
                    </div>
                  )}

                  {sim.simulation_consents && sim.simulation_consents.length > 0 && (
                    <div className="rounded-xl border bg-slate-50 p-4 space-y-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-primary" /> Auditoria de Aceite (LGPD)</h4>
                      <div className="space-y-3">
                        {sim.simulation_consents.map((consent: any) => {
                          const acceptedAt = formatDate(consent.accepted_at);
                          return (
                            <div key={consent.id} className="bg-white p-3 rounded-xl border border-border shadow-sm space-y-2">
                              <div className="flex items-center justify-between border-b pb-2"><span className="text-[11px] font-bold text-slate-700 uppercase">{consent.consent_id || "Termo de Aceite"}</span><span className="text-[10px] text-muted-foreground">{acceptedAt.d} às {acceptedAt.h}</span></div>
                              <p className="text-[11px] text-muted-foreground">Aceito eletronicamente pelo usuário.</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="rounded-xl border bg-slate-50 p-4 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-primary" /> Simulação</h4>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-white p-3 rounded-xl border"><span className="text-muted-foreground block">Valor Financiado:</span><span className="text-sm font-bold text-slate-900">{BRL(sim.financed_amount)}</span></div>
                      <div className="bg-white p-3 rounded-xl border"><span className="text-muted-foreground block">Parcelas:</span><span className="text-sm font-bold text-primary">{sim.installments && sim.installment_value ? `${sim.installments}x ${BRL(sim.installment_value)}` : "—"}</span></div>
                    </div>
                  </div>

                  {pageConfigs?.offer_panel && (
                    <div className="bg-white p-4 rounded-xl border shadow-sm space-y-3">
                      <h4 className="text-[11px] font-bold uppercase text-[#B300FF] flex items-center gap-1.5"><Layers size={14} /> Offer Panel (Painel de Proposta)</h4>
                      <OfferPanelRender config={pageConfigs} />
                    </div>
                  )}

                  {consentConfigs && consentConfigs.length > 0 && (
                    <div className="bg-white p-4 rounded-xl border shadow-sm space-y-3">
                      <h4 className="text-[11px] font-bold uppercase text-[#B300FF] flex items-center gap-1.5"><FileText size={14} /> Consentimentos da Jornada (LGPD)</h4>
                      <DynamicConsentsStatic configs={consentConfigs} />
                    </div>
                  )}

                  {pageFaqs && pageFaqs.length > 0 && (
                    <div className="bg-white p-4 rounded-xl border shadow-sm space-y-3">
                      <h4 className="text-[11px] font-bold uppercase text-[#B300FF] flex items-center gap-1.5"><HelpCircle size={14} /> FAQ & Perguntas Frequentes</h4>
                      {/* Na tela: Accordion padrão */}
                      <FAQSection items={pageFaqs} />
                    </div>
                  )}

                  {pageConfigs?.footer && (
                    <div className="pt-2">
                      <FooterRender config={pageConfigs.footer} />
                    </div>
                  )}

                </div>

                <div className="p-4 bg-white border-t border-gray-200 flex items-center justify-between gap-3 shrink-0 shadow-lg">
                  <Button variant="outline" onClick={handlePrintSheet} className="flex-1 rounded-xl text-xs gap-2 border-[#B300FF]/35 text-[#B300FF] hover:bg-[#B300FF]/5 h-10 font-semibold"><Printer className="h-4 w-4" /> Imprimir / PDF</Button>
                  <Button onClick={() => setActiveSimulation(null)} className="flex-1 rounded-xl text-xs bg-[#B300FF] hover:bg-[#9f00e6] text-white h-10 font-semibold">Fechar</Button>
                </div>
              </div>
            );
          })()}
        </SheetContent>
      </Sheet>

      {/* ===================================================================== */}
      {/* [ESCONDIDO NA TELA] BLOCO DE REFERÊNCIA PARA O IFRAME DE IMPRESSÃO    */}
      {/* É daqui que o `printRef.current.innerHTML` puxa a versão formatada.   */}
      {/* Oculto com display:none nativo para não bugar nada na interface.      */}
      {/* ===================================================================== */}
      <div style={{ display: 'none' }}>
        <div ref={printRef} className="w-full text-slate-900 bg-white p-8">
          {activeSimulation && (() => {
            const sim = activeSimulation;
            const created = formatDate(sim.created_at);
            const offerRow = Array.isArray(sim.simulation_offers) ? sim.simulation_offers[0] : (sim.simulation_offers || {});
            const ed = sim.entity_details || sim.details || {};
            const od = offerRow.offer_details || offerRow || {};
            const bank = Array.isArray(sim.financial_institutions) ? sim.financial_institutions[0] : sim.financial_institutions;
            
            const rawDoc = sim.document?.replace(/\D/g, "") || ed.document?.replace(/\D/g, "") || "";
            const isPJ = (ed.entity_type || (rawDoc.length === 14 ? "J" : "P")) === "J";
            const doc = rawDoc.length === 14 
              ? rawDoc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
              : rawDoc.length === 11 
              ? rawDoc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
              : sim.document || "—";
              
            const updatesArray = Array.isArray(sim.simulation_updates) ? sim.simulation_updates : [];
            const firstUpdate = updatesArray.length > 0 ? updatesArray[0] : {};
            const fullAddress = [ed.address?.street, ed.address?.number, ed.address?.neighborhood, ed.address?.city, ed.address?.state].filter(Boolean).join(", ");
            
            const rawPayloadObj = typeof sim.raw_payload === "string" 
              ? (() => { try { return JSON.parse(sim.raw_payload); } catch { return {}; } })() 
              : (sim.raw_payload || {});

            const pageConfigs = rawPayloadObj.page_configs || {};
            const consentConfigs = rawPayloadObj.consent_configs || [];
            const pageFaqs = rawPayloadObj.page_faqs || [];

            return (
              <div className="space-y-6">
                
                <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold text-[#B300FF] uppercase">{sim.product_types?.name || "Financiamento"}</span>
                      <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border bg-slate-50 uppercase`}>{sim.status_types?.name || "Pendente"}</span>
                    </div>
                    <h1 className="text-2xl font-bold">{sim.name || ed.name || "Cliente sem nome"}</h1>
                  </div>
                  <div className="text-right text-xs text-slate-500 font-mono">
                    ID: {sim.id}<br/>Data: {created.d} às {created.h}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2"><CalendarIcon size={14} className="text-slate-400" /> Origem da Simulação</h4>
                    <div className="space-y-1 text-xs">
                      <div><span className="text-slate-500">Início:</span> <strong className="ml-1">{created.d} às {created.h}</strong></div>
                      <div><span className="text-slate-500">Localização:</span> <strong className="ml-1">{firstUpdate.country || "BR"} / {firstUpdate.state || "—"} / {firstUpdate.city || "—"}</strong></div>
                      <div><span className="text-slate-500">Visit ID:</span> <strong className="font-mono ml-1">{sim.visit_id || "Não rastreado"}</strong></div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2"><User size={14} className="text-slate-400" /> Dados Cadastrais</h4>
                    <div className="space-y-1 text-xs">
                      <div><span className="text-slate-500">{isPJ ? "CNPJ:" : "CPF:"}</span> <strong className="font-mono ml-1">{doc}</strong></div>
                      <div><span className="text-slate-500">Telefone:</span> <strong className="ml-1">{sim.phone || ed.phone || "—"}</strong></div>
                      <div><span className="text-slate-500">E-mail:</span> <strong className="ml-1">{sim.email || ed.email || "—"}</strong></div>
                      {fullAddress && <div><span className="text-slate-500">Endereço:</span> <strong className="font-normal ml-1">{fullAddress}</strong></div>}
                    </div>
                  </div>
                </div>

                {od.offer_description && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2"><CreditCard size={14} className="text-slate-400" /> Oferta / Lote</h4>
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div className="col-span-2"><span className="text-slate-500 block">Descrição da Oferta:</span><strong className="text-sm text-[#B300FF]">{od.offer_description}</strong></div>
                      <div><span className="text-slate-500 block">Categoria:</span> <strong>{od.category || "—"}</strong></div>
                      <div><span className="text-slate-500 block">Número:</span> <strong className="font-mono">Lote #{od.lot_number || "—"} / Oferta #{od.offer_id || "—"}</strong></div>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2"><Building2 size={14} className="text-slate-400" /> Condições da Simulação</h4>
                  <div className="grid grid-cols-3 gap-4 text-xs">
                    <div><span className="text-slate-500 block">Instituição Financeira:</span> <strong>{bank?.name || "—"}</strong></div>
                    <div><span className="text-slate-500 block">Valor Financiado:</span> <strong className="text-emerald-700 text-sm">{BRL(sim.financed_amount)}</strong></div>
                    <div><span className="text-slate-500 block">Parcelas:</span> <strong className="text-[#B300FF] font-bold text-sm">{sim.installments && sim.installment_value ? `${sim.installments}x ${BRL(sim.installment_value)}` : "—"}</strong></div>
                  </div>
                </div>

                {pageConfigs?.offer_panel && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 break-inside-avoid">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#B300FF] flex items-center gap-1.5"><Layers size={14} /> Painel de Proposta (Offer Panel)</h4>
                    <OfferPanelRender config={pageConfigs} />
                  </div>
                )}

                {sim.simulation_consents && sim.simulation_consents.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 break-inside-avoid">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2"><FileText size={14} className="text-slate-400" /> Auditoria de Aceite (LGPD)</h4>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      {sim.simulation_consents.map((c: any) => (
                        <div key={c.id} className="bg-white border rounded-md p-2"><strong className="block text-slate-700 uppercase">✓ {c.consent_id || "Termo"}</strong><span className="text-slate-500">Aceito em {formatDate(c.accepted_at).d} às {formatDate(c.accepted_at).h}</span></div>
                      ))}
                    </div>
                  </div>
                )}

                {/* FAQ VERSÃO IMPRESSÃO: Prop isPrint=true abre o texto direto. */}
                {pageFaqs && pageFaqs.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 break-inside-avoid">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#B300FF] flex items-center gap-1.5">
                      <HelpCircle size={14} /> Perguntas Frequentes
                    </h4>
                    <FAQSection items={pageFaqs} isPrint={true} />
                  </div>
                )}

                {pageConfigs?.footer && (
                  <div className="pt-2 break-inside-avoid">
                    <FooterRender config={pageConfigs.footer} />
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