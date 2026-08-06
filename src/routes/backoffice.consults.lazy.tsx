/**
 * ============================================================================
 * @fileoverview Monitor de Consultas e Visitas (Backoffice)
 * @module Backoffice/Consults
 * @route /backoffice/consults
 *
 * @description
 * Torre de controle da esteira de topo de funil. Consolida e exibe em tempo real 
 * as interações dos leads (visitas, consultas, contatos e conversões) com suporte 
 * a exportação em Excel e auditoria avançada.
 * ============================================================================
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import * as XLSX from "xlsx";
import {
  RefreshCw,
  Search,
  Filter,
  Download,
  ChevronDown,
  User,
  Calendar as CalendarIcon,
  CreditCard,
  MapPin,
  Smartphone,
  Briefcase,
  Layers,
  FileText,
  HelpCircle,
  CheckCircle2,
  Printer,
} from "lucide-react";
import { DateRange } from "react-day-picker";

// Componentes da Interface (Design System Shadcn/UI)
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Camada de Persistência (BaaS) e Dicionários Gráficos
import { supabase } from "@/integrations/supabase/client";
import { ICON_MAP } from "@/features/financial-hub/components/shared/icons-map";

// ============================================================================
// [REGISTRO DA ROTA TANSTACK ROUTER]
// ============================================================================
export const Route = createLazyFileRoute("/backoffice/consults")({
  component: ConsultsPage,
});

// ============================================================================
// [SUB-COMPONENTES DE RENDERIZAÇÃO DO PAYLOAD]
// ============================================================================

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

function OfferPanelRender({ config }: { config: any }) {
  const panel = config?.offer_panel || config;
  if (!panel?.headline?.parts || !panel?.description?.parts) return null;

  const brandColor = config?.theme?.primary_color || "#B300FF";

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
    <div className="space-y-3" style={{ "--brand-primary": brandColor } as React.CSSProperties}>
      <div className="space-y-1.5">
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

      {/* RODAPÉ COPIADO DO OFFERPANEL ORIGINAL: Com borda superior, espaçamento e truncamento seguro */}
      {panel.partner?.name && (
        <div className="mt-8 pt-4 border-t border-slate-200 rounded-xl bg-muted/40 p-3 sm:p-4 flex flex-col items-start gap-0.5 overflow-hidden w-full">
          <span className="text-xs text-muted-foreground">
            {panel.partner.label}
          </span>
          <strong className="text-[clamp(8px,3.5vw,10px)] sm:text-xs text-foreground truncate w-full block">
            {panel.partner.name}
          </strong>
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

                      // MODIFICADO AQUI: Substituído por Popover para aceitar toque (click) perfeitamente no mobile
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
                ) : null}
              </label>
            </div>
          ))}
      </div>
    </TooltipProvider>
  );
}

// ============================================================================
// HELPERS E UTILITÁRIOS DE APRESENTAÇÃO
// ============================================================================

const STATUS_STYLES: Record<string, string> = {
  visita: "bg-purple-500/10 text-purple-600",
  simulacao: "bg-primary/10 text-primary",
  consulta: "bg-blue-500/10 text-blue-600",
  parceiro: "bg-amber-500/10 text-amber-600",
  default: "bg-muted text-muted-foreground",
};

function statusClass(status: string) {
  const key = status
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
// COMPONENTE PRINCIPAL
// ============================================================================
function ConsultsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const [selectedStatus, setSelectedStatus] = useState<string[]>(["Qualificadas"]);
  const [dateRange, setDateRange] = useState<"30" | "90" | "all" | "custom">("30");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  const [partnersList, setPartnersList] = useState<any[]>([]);
  const [productsList, setProductsList] = useState<any[]>([]);

  const [activeConsult, setActiveConsult] = useState<any | null>(null);

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadDropdowns() {
      const { data: pData } = await supabase.from("partners").select("id, name").eq("is_active", true).order("name");
      if (pData) setPartnersList(pData);

      const { data: prData } = await supabase.from("product_types").select("id, name").order("name");
      if (prData) setProductsList(prData);
    }
    loadDropdowns();
  }, []);

  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const { data: visitsData, error: visitError } = await supabase
        .from("visits")
        .select(
          `
          *,
          product_types(name),
          partners(name, logo_url),
          visit_entities(*),
          visit_offers(*),
          visit_consents(*)
        `,
        )
        .order("created_at", { ascending: false });

      if (visitError) {
        console.error("Erro ao carregar visits:", visitError.message);
        setRows([]);
        return;
      }

      if (!visitsData || visitsData.length === 0) {
        setRows([]);
        return;
      }

      const visitIds = visitsData.map((v) => v.id);

      const { data: updatesData, error: updateError } = await supabase
        .from("visit_updates")
        .select("visit_id, action, created_at")
        .in("visit_id", visitIds);

      if (updateError) console.error("Erro ao carregar visit_updates:", updateError.message);

      const contactSet = new Set(
        updatesData
          ?.filter((u) => (u.action || "").toUpperCase().includes("CONTACT"))
          ?.map((u) => u.visit_id)
          ?.filter(Boolean) || [],
      );

      const normalized = visitsData.map((v) => ({
        ...v,
        has_contact: contactSet.has(v.id),
        visit_entities: Array.isArray(v.visit_entities) ? v.visit_entities[0] || null : v.visit_entities,
        visit_offers: Array.isArray(v.visit_offers) ? v.visit_offers[0] || null : v.visit_offers,
        visit_consents: v.visit_consents || [], // CORRIGIDO: Mapeia explicitamente os aceites da visita
      }));

      setRows(normalized);
    } catch (err) {
      console.error("Erro crítico ao carregar dados:", err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function getVisitStatus(r: any): string {
    const act = (r.action ?? "").toUpperCase();
    if (act.includes("SIMULATE") || act.includes("SIMULATION")) return "SIMULAÇÃO";
    if (act.includes("CONSULT")) return "CONSULTA";
    if (act.includes("REDIRECT")) return "PARCEIRO";
    if (act.includes("VISIT")) return "VISITA";
    return r.action || "VISITA";
  }

  const statusOptions = ["Qualificadas", "VISITA", "SIMULAÇÃO", "CONSULTA", "PARCEIRO"];

  const totals = useMemo(() => {
    const t = { total: rows.length, simulacao: 0, consulta: 0, siteParceiro: 0 };
    rows.forEach((r) => {
      const s = getVisitStatus(r);
      if (s === "SIMULAÇÃO") t.simulacao++;
      else if (s === "CONSULTA") t.consulta++;
      else if (s === "PARCEIRO") t.siteParceiro++;
    });
    return t;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const statusName = getVisitStatus(r);
      let matchStatus = true;
      if (selectedStatus.length > 0) {
        matchStatus = selectedStatus.includes(statusName) || (selectedStatus.includes("Qualificadas") && statusName !== "VISITA");
      }

      const entity = Array.isArray(r.visit_entities) ? r.visit_entities[0] : r.visit_entities || {};
      const clientName = entity?.name ?? "";
      const rowDoc = entity?.document?.replace(/\D/g, "") || "";
      const rawSearch = search.toLowerCase().trim();
      const rawDocSearch = search.replace(/\D/g, "");

      const matchSearch =
        rawSearch === "" ||
        clientName.toLowerCase().includes(rawSearch) ||
        (rawDocSearch !== "" && rowDoc.includes(rawDocSearch));

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

  const handleExportExcel = () => {
    const dataToExport = filtered.map((r) => {
      const created = formatDate(r.created_at);
      const entity = r.visit_entities || {};
      const offer = r.visit_offers || {};
      const statusName = getVisitStatus(r);

      return {
        "ID": r.id,
        "Data": `${created.d} ${created.h}`,
        "Cliente": entity.name || "—",
        "Documento": entity.document || "—",
        "Telefone": entity.phone || "—",
        "E-mail": entity.email || "—",
        "Produto": r.product_types?.name || "—",
        "Situação": statusName,
        "Parceiro": r.partners?.name || "—",
        "UTM Source": r.utm_source || "—",
        "UF": r.state || "—",
        "Descrição da Oferta": offer.offer_description || "—",
        "Oferta ID": offer.offer_id || "—",
        "Valor da Oferta": offer.offer_value || 0,
        "Organizador": offer.manager_name || "—",
        "Vendedor (Razão Social)": offer.legal_name || "—",
        "Seller ID": offer.seller_id || "—"
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);

    const colWidths = Object.keys(dataToExport[0] || {}).map((key) => {
      const maxLength = Math.max(
        key.length,
        ...dataToExport.map((row) => String(row[key as keyof typeof row] || "").length),
      );
      return { wch: maxLength + 2 };
    });
    worksheet["!cols"] = colWidths;

    if (worksheet["!ref"]) {
      const range = XLSX.utils.decode_range(worksheet["!ref"]);
      worksheet["!autofilter"] = { ref: XLSX.utils.encode_range(range) };
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Consultas e Visitas");

    const today = new Date().toISOString().split("T")[0];
    XLSX.writeFile(workbook, `Monitor_Consultas_${today}.xlsx`);
  };

  const handlePrintSheet = () => {
    if (!printRef.current) return;

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

    const headHTML = document.head.innerHTML;
    const reportHTML = printRef.current.innerHTML;

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
    <div className="font-sans space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Consultas e Visitas</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe acessos, consultas, redirecionamentos e conversões em tempo real.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportExcel}
            className="rounded-xl hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200 transition-colors"
          >
            <Download className="mr-2 h-4 w-4" /> Exportar Excel
          </Button>
          <Button onClick={() => load()} disabled={loading} className="rounded-xl">
            <RefreshCw className={`mr-2 h-4 w-4 shrink-0 ${loading ? "animate-spin" : ""}`} /> 
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total de visitas", value: totals.total, highlight: false },
          { label: "Consultas", value: totals.consulta, highlight: false },
          { label: "Sites parceiros", value: totals.siteParceiro, highlight: false },
          { label: "Simulações geradas", value: totals.simulacao, highlight: true },
        ].map((t) => (
          <div
            key={t.label}
            className={`rounded-2xl border p-5 ${t.highlight ? "bg-[#fdf2f8] border-[#fbcfe8] text-[#d946ef]" : "border-border bg-card text-card-foreground"}`}
          >
            <div
              className={`text-xs font-semibold uppercase ${t.highlight ? "text-[#d946ef]" : "text-muted-foreground"}`}
            >
              {t.label}
            </div>
            <div className="mt-2 text-2xl font-bold">{t.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card flex flex-col overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 border-b border-border p-4">
          <div className="flex items-center lg:hidden">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-9 rounded-full border-slate-300 text-slate-700 px-4 font-medium hover:bg-slate-50">
                  <Filter className="h-4 w-4 mr-2 text-slate-500" /> Filtros
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[calc(100vw-2rem)] p-4 ml-4 rounded-2xl border-slate-200 shadow-xl" align="start">
                <div className="flex flex-col gap-3">
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">Filtrar Resultados</h4>
                  
                  <Popover>
                    <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-10 w-full rounded-xl justify-between bg-white hover:bg-slate-50 border-slate-200 transition-colors"><span className="flex items-center gap-2 truncate text-slate-600"><Filter className="h-3.5 w-3.5 opacity-50 shrink-0" /> Parceiro: {selectedPartners.length === 0 ? "Todos" : `${selectedPartners.length} sel.`}</span><ChevronDown className="h-3 w-3 opacity-40 shrink-0" /></Button></PopoverTrigger>
                    <PopoverContent className="w-[calc(100vw-4rem)] p-0" align="start"><Command><CommandList><CommandGroup><CommandItem onSelect={() => setSelectedPartners([])} className="cursor-pointer"><div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${selectedPartners.length === 0 ? "bg-primary text-primary-foreground" : "opacity-50"}`}>{selectedPartners.length === 0 && "✓"}</div>Todos Parceiros</CommandItem>{partnersList.map((p) => { const isSelected = selectedPartners.includes(String(p.id)); return (<CommandItem key={p.id} onSelect={() => { if (isSelected) setSelectedPartners(selectedPartners.filter(id => id !== String(p.id))); else setSelectedPartners([...selectedPartners, String(p.id)]); }} className="cursor-pointer"><div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? "bg-primary text-primary-foreground" : "opacity-50"}`}>{isSelected && "✓"}</div>{p.name}</CommandItem>); })}</CommandGroup></CommandList></Command></PopoverContent>
                  </Popover>

                  <Popover>
                    <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-10 w-full rounded-xl justify-between bg-white hover:bg-slate-50 border-slate-200 transition-colors"><span className="flex items-center gap-2 truncate text-slate-600"><Filter className="h-3.5 w-3.5 opacity-50 shrink-0" /> Produto: {selectedProducts.length === 0 ? "Todos" : `${selectedProducts.length} sel.`}</span><ChevronDown className="h-3 w-3 opacity-40 shrink-0" /></Button></PopoverTrigger>
                    <PopoverContent className="w-[calc(100vw-4rem)] p-0" align="start"><Command><CommandList><CommandGroup><CommandItem onSelect={() => setSelectedProducts([])} className="cursor-pointer"><div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${selectedProducts.length === 0 ? "bg-primary text-primary-foreground" : "opacity-50"}`}>{selectedProducts.length === 0 && "✓"}</div>Todos Produtos</CommandItem>{productsList.map((p) => { const isSelected = selectedProducts.includes(String(p.id)); return (<CommandItem key={p.id} onSelect={() => { if (isSelected) setSelectedProducts(selectedProducts.filter(id => id !== String(p.id))); else setSelectedProducts([...selectedProducts, String(p.id)]); }} className="cursor-pointer"><div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? "bg-primary text-primary-foreground" : "opacity-50"}`}>{isSelected && "✓"}</div>{p.name}</CommandItem>); })}</CommandGroup></CommandList></Command></PopoverContent>
                  </Popover>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-10 w-full rounded-xl justify-between bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8] hover:bg-[#fce7f3] transition-colors">
                        <span className="flex items-center gap-2 truncate"><Filter className="h-3.5 w-3.5 shrink-0" /> Situação: {selectedStatus.length === 0 ? "Todos" : selectedStatus.length === 1 && selectedStatus[0] === "Qualificadas" ? "Qualificadas" : `${selectedStatus.length} sel.`}</span>
                        <ChevronDown className="h-3 w-3 shrink-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[calc(100vw-4rem)] bg-[#fdf2f8] border-[#fbcfe8] z-50" align="start">
                      <Command className="bg-transparent">
                        <CommandList>
                          <CommandGroup>
                            <CommandItem onSelect={() => setSelectedStatus([])} className="cursor-pointer text-[#d946ef] hover:bg-[#fce7f3] aria-selected:bg-[#fce7f3]">
                              <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${selectedStatus.length === 0 ? "bg-[#d946ef] text-white" : "opacity-50"}`}>
                                {selectedStatus.length === 0 && "✓"}
                              </div>
                              Todos
                            </CommandItem>
                            <CommandItem onSelect={() => { const isSel = selectedStatus.includes("Qualificadas"); setSelectedStatus(isSel ? selectedStatus.filter((s: string) => s !== "Qualificadas") : [...selectedStatus, "Qualificadas"]); }} className="cursor-pointer text-[#d946ef] hover:bg-[#fce7f3] aria-selected:bg-[#fce7f3]">
                              <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${selectedStatus.includes("Qualificadas") ? "bg-[#d946ef] text-white" : "opacity-50"}`}>
                                {selectedStatus.includes("Qualificadas") && "✓"}
                              </div>
                              Qualificadas (Sem Visitas)
                            </CommandItem>
                            {statusOptions.filter(s => s !== "Qualificadas").map((s) => {
                              const isSelected = selectedStatus.includes(s);
                              return (
                                <CommandItem key={s} onSelect={() => { if (isSelected) setSelectedStatus(selectedStatus.filter((item: string) => item !== s)); else setSelectedStatus([...selectedStatus, s]); }} className="cursor-pointer text-[#d946ef] hover:bg-[#fce7f3] aria-selected:bg-[#fce7f3]">
                                  <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${isSelected ? "bg-[#d946ef] text-white" : "opacity-50"}`}>
                                    {isSelected && "✓"}
                                  </div>
                                  {s}
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  
                  <Popover>
                    <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-10 w-full rounded-xl justify-between bg-white hover:bg-[#fce7f3] border-slate-200 transition-colors text-slate-600"><span className="flex items-center gap-2 truncate"><Filter className="h-3.5 w-3.5 opacity-50 shrink-0" /> Período: {dateRange === "custom" ? "Personalizado" : dateRange === "30" ? "30 dias" : dateRange === "90" ? "90 dias" : "Tudo"}</span><ChevronDown className="h-3 w-3 opacity-40 shrink-0" /></Button></PopoverTrigger>
                    <PopoverContent className="p-0 w-auto" align="start"><Command><CommandList><CommandGroup><CommandItem onSelect={() => setDateRange("30")}>Últimos 30 dias</CommandItem><CommandItem onSelect={() => setDateRange("90")}>Últimos 90 dias</CommandItem><CommandItem onSelect={() => setDateRange("all")}>Todo o período</CommandItem></CommandGroup><div className="p-2 border-t"><p className="text-xs font-semibold px-2 mb-2 text-muted-foreground">Personalizado:</p><Calendar mode="range" selected={customRange} onSelect={(range) => { setCustomRange(range); setDateRange("custom"); }} numberOfMonths={1} /></div></CommandList></Command></PopoverContent>
                  </Popover>

                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="relative w-full lg:flex-1 lg:max-w-md order-last lg:order-none mt-1 lg:mt-0">
            <Input 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              placeholder="Buscar cliente ou CPF/CNPJ..." 
              className="h-11 w-full rounded-full bg-slate-100/70 border-transparent pl-5 pr-12 text-[13px] text-slate-700 placeholder:text-slate-500 focus-visible:ring-primary/20 focus-visible:bg-white focus-visible:border-primary/30 transition-all shadow-none" 
            />
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-[#B300FF]" />
          </div>

          <div className="hidden lg:flex lg:items-center lg:gap-2 lg:ml-auto">
            <Popover>
              <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-10 rounded-xl gap-2 bg-white hover:bg-slate-50 border-slate-200 transition-colors text-slate-600"><Filter className="h-3.5 w-3.5 opacity-50 shrink-0" /><span className="truncate">Parceiro: {selectedPartners.length === 0 ? "Todos" : `${selectedPartners.length} sel.`}</span><ChevronDown className="h-3 w-3 opacity-40 shrink-0" /></Button></PopoverTrigger>
              <PopoverContent className="w-56 p-0" align="start"><Command><CommandList><CommandGroup><CommandItem onSelect={() => setSelectedPartners([])} className="cursor-pointer"><div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${selectedPartners.length === 0 ? "bg-primary text-primary-foreground" : "opacity-50"}`}>{selectedPartners.length === 0 && "✓"}</div>Todos Parceiros</CommandItem>{partnersList.map((p) => { const isSelected = selectedPartners.includes(String(p.id)); return (<CommandItem key={p.id} onSelect={() => { if (isSelected) setSelectedPartners(selectedPartners.filter(id => id !== String(p.id))); else setSelectedPartners([...selectedPartners, String(p.id)]); }} className="cursor-pointer"><div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? "bg-primary text-primary-foreground" : "opacity-50"}`}>{isSelected && "✓"}</div>{p.name}</CommandItem>); })}</CommandGroup></CommandList></Command></PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-10 rounded-xl gap-2 bg-white hover:bg-slate-50 border-slate-200 transition-colors text-slate-600"><Filter className="h-3.5 w-3.5 opacity-50 shrink-0" /><span className="truncate">Produto: {selectedProducts.length === 0 ? "Todos" : `${selectedProducts.length} sel.`}</span><ChevronDown className="h-3 w-3 opacity-40 shrink-0" /></Button></PopoverTrigger>
              <PopoverContent className="w-56 p-0" align="start"><Command><CommandList><CommandGroup><CommandItem onSelect={() => setSelectedProducts([])} className="cursor-pointer"><div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${selectedProducts.length === 0 ? "bg-primary text-primary-foreground" : "opacity-50"}`}>{selectedProducts.length === 0 && "✓"}</div>Todos Produtos</CommandItem>{productsList.map((p) => { const isSelected = selectedProducts.includes(String(p.id)); return (<CommandItem key={p.id} onSelect={() => { if (isSelected) setSelectedProducts(selectedProducts.filter(id => id !== String(p.id))); else setSelectedProducts([...selectedProducts, String(p.id)]); }} className="cursor-pointer"><div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? "bg-primary text-primary-foreground" : "opacity-50"}`}>{isSelected && "✓"}</div>{p.name}</CommandItem>); })}</CommandGroup></CommandList></Command></PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-10 rounded-xl gap-2 bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8] hover:bg-[#fce7f3] transition-colors">
                  <Filter className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">Situação: {selectedStatus.length === 0 ? "Todos" : selectedStatus.length === 1 && selectedStatus[0] === "Qualificadas" ? "Qualificadas" : `${selectedStatus.length} sel.`}</span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-56 bg-[#fdf2f8] border-[#fbcfe8] z-50" align="start">
                <Command className="bg-transparent">
                  <CommandList>
                    <CommandGroup>
                      <CommandItem onSelect={() => setSelectedStatus([])} className="cursor-pointer text-[#d946ef] hover:bg-[#fce7f3] aria-selected:bg-[#fce7f3]">
                        <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${selectedStatus.length === 0 ? "bg-[#d946ef] text-white" : "opacity-50"}`}>
                          {selectedStatus.length === 0 && "✓"}
                        </div>
                        Todos
                      </CommandItem>
                      <CommandItem onSelect={() => { const isSel = selectedStatus.includes("Qualificadas"); setSelectedStatus(isSel ? selectedStatus.filter((s: string) => s !== "Qualificadas") : [...selectedStatus, "Qualificadas"]); }} className="cursor-pointer text-[#d946ef] hover:bg-[#fce7f3] aria-selected:bg-[#fce7f3]">
                        <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${selectedStatus.includes("Qualificadas") ? "bg-[#d946ef] text-white" : "opacity-50"}`}>
                          {selectedStatus.includes("Qualificadas") && "✓"}
                        </div>
                        Qualificadas (Sem Visitas)
                      </CommandItem>
                      {statusOptions.filter(s => s !== "Qualificadas").map((s) => {
                        const isSelected = selectedStatus.includes(s);
                        return (
                          <CommandItem key={s} onSelect={() => { if (isSelected) setSelectedStatus(selectedStatus.filter((item: string) => item !== s)); else setSelectedStatus([...selectedStatus, s]); }} className="cursor-pointer text-[#d946ef] hover:bg-[#fce7f3] aria-selected:bg-[#fce7f3]">
                            <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${isSelected ? "bg-[#d946ef] text-white" : "opacity-50"}`}>
                              {isSelected && "✓"}
                            </div>
                            {s}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            
            <Popover>
              <PopoverTrigger asChild><Button variant="outline" size="sm" className="h-10 rounded-xl gap-2 bg-white hover:bg-[#fce7f3] border-slate-200 transition-colors text-slate-600"><Filter className="h-3.5 w-3.5 opacity-50 shrink-0" /><span className="truncate">Período: {dateRange === "custom" ? "Personalizado" : dateRange === "30" ? "30 dias" : dateRange === "90" ? "90 dias" : "Tudo"}</span><ChevronDown className="h-3 w-3 opacity-40 shrink-0" /></Button></PopoverTrigger>
              <PopoverContent className="p-0 w-auto" align="start"><Command><CommandList><CommandGroup><CommandItem onSelect={() => setDateRange("30")}>Últimos 30 dias</CommandItem><CommandItem onSelect={() => setDateRange("90")}>Últimos 90 dias</CommandItem><CommandItem onSelect={() => setDateRange("all")}>Todo o período</CommandItem></CommandGroup><div className="p-2 border-t"><p className="text-xs font-semibold px-2 mb-2 text-muted-foreground">Personalizado:</p><Calendar mode="range" selected={customRange} onSelect={(range) => { setCustomRange(range); setDateRange("custom"); }} numberOfMonths={1} /></div></CommandList></Command></PopoverContent>
            </Popover>
          </div>
        </div>

        <div className="overflow-x-auto w-full pb-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                <th className="px-3 py-2.5 w-[75px]">Data</th>
                <th className="px-3 py-2.5 w-[140px]">Cliente</th>
                <th className="px-3 py-2.5 w-[140px]">Produto</th>
                <th className="px-3 py-2.5 w-[190px]">Oferta</th>
                <th className="px-3 py-2.5 w-[150px]">Situação</th>
                <th className="px-3 py-2.5 w-[130px]">Parceiro</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const created = formatDate(r.created_at);
                const entity = r.visit_entities || {};
                const offer = r.visit_offers || {};
                const productName = r.product_types?.name ?? "—";
                const statusName = getVisitStatus(r);

                const rawDoc = entity?.document?.replace(/\D/g, "") || "";
                const doc = rawDoc.length === 14 ? rawDoc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : rawDoc.length === 11 ? rawDoc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : entity?.document || "—";
                const phone = entity?.phone?.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3") ?? "";
                const endEvent = offer?.event_end_date ? new Date(offer.event_end_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";

                return (
                  <tr key={r.id} onClick={() => setActiveConsult(r)} className="border-b border-border/60 hover:bg-accent/40 cursor-pointer transition-colors" title="Clique para ver os detalhes completos da visita">
                    <td className="px-3 py-2.5 w-[75px]">
                      <div className="font-semibold text-foreground">{created.d}</div>
                      <div className="text-[11px] text-muted-foreground">{created.h}</div>
                    </td>
                    <td className="px-3 py-2.5 w-[140px]">
                      <div className="font-semibold text-[#d946ef] truncate" title={entity?.name}>{entity?.name || "—"}</div>
                      <div className="text-[11px] text-muted-foreground">{doc}</div>
                      <div className="text-[11px] text-muted-foreground">{phone || "—"}</div>
                    </td>
                    <td className="px-3 py-2.5 w-[140px]">
                      <div className="font-semibold text-foreground">{productName}</div>
                      <div className="text-[10px] text-muted-foreground font-medium uppercase mt-0.5">ORIGEM: {r.utm_source ? r.utm_source : "—"}</div>
                      <div className="text-[10px] text-muted-foreground font-medium uppercase mt-0.5">{r.state ? r.state : "—"}</div>
                      {r.has_contact && (<div className="text-[10px] text-emerald-600 font-semibold uppercase mt-0.5">CONTATO C/ PARCEIRO</div>)}
                    </td>
                    <td className="px-3 py-2.5 max-w-[190px] sm:max-w-[220px]">
                      <div className="font-semibold text-foreground truncate" title={offer?.offer_description}>{offer?.offer_description || "—"}</div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5" title={offer?.event_description}>{offer?.event_id ? `${offer.event_id} - ` : ""} {offer?.event_description || "—"}</div>
                      <div className="text-[10px] text-muted-foreground font-medium mt-0.5">{BRL(offer?.offer_value)} {endEvent ? `(Fim: ${endEvent})` : ""}</div>
                    </td>
                    <td className="px-3 py-2.5 w-[150px]">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(statusName)}`}>{statusName}</span>
                        <span className="text-[10px] text-muted-foreground">{created.d} {created.h}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 w-[130px]">
                      <div className="flex items-center gap-1.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-transparent overflow-hidden shrink-0" title={r.partners?.name}>
                          {r.partners?.logo_url ? (
                            <img src={r.partners.logo_url} className="h-full w-full object-cover" alt={r.partners.name} />
                          ) : (
                            <span className="flex items-center justify-center h-full w-full text-[10px] font-bold uppercase">{r.partners?.name?.slice(0, 3) || "—"}</span>
                          )}
                        </div>
                        <span className="text-xs font-medium text-foreground truncate" title={r.partners?.name}>{r.partners?.name || "—"}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div> 
      </div>

      {/* ===================================================================== */}
      {/* PAINEL LATERAL DE DETALHES (SHEET / DRAWER) COM DADOS COMPLETOS         */}
      {/* ===================================================================== */}
      <Sheet open={!!activeConsult} onOpenChange={(open) => !open && setActiveConsult(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0 flex flex-col h-full bg-white">
          {activeConsult &&
            (() => {
              const sim = activeConsult;
              const created = formatDate(sim.created_at);
              const entity = sim.visit_entities || {};
              const entityDetails = entity.entity_details || {};
              const offer = sim.visit_offers || {};
              const offerDetails = offer.offer_details || {};
              const managerDetails = offer.manager_details || {};
              const sellerDetails = offer.seller_details || {};
              const eventDetails = offer.event_details || {};
              const statusName = getVisitStatus(sim);

              const rawDoc = entity?.document?.replace(/\D/g, "") || entityDetails.document?.replace(/\D/g, "") || "";
              const doc =
                rawDoc.length === 14
                  ? rawDoc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
                  : rawDoc.length === 11
                    ? rawDoc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
                    : entity?.document || "—";

              const isPJ = entity?.entity_type === "J" || entityDetails.entity_type === "J" || rawDoc.length === 14;
              const addr = entityDetails.address || {};
              const fullAddress = [
                addr.street,
                addr.number,
                addr.complement,
                addr.neighborhood,
                addr.city,
                addr.state,
                addr.zip_code,
                addr.country,
              ]
                .filter(Boolean)
                .join(", ");

              const rawPayloadObj =
                typeof sim.raw_payload === "string"
                  ? (() => {
                      try {
                        return JSON.parse(sim.raw_payload);
                      } catch {
                        return {};
                      }
                    })()
                  : sim.raw_payload || {};

              const pageConfigs = rawPayloadObj.page_configs || {};
              const consentConfigs = rawPayloadObj.consent_configs || [];
              const pageFaqs = rawPayloadObj.page_faqs || [];

              return (
                <div className="flex flex-col h-full overflow-hidden">
                  <div className="p-4 sm:p-6 pb-4 border-b bg-white shrink-0">
                    <SheetHeader className="space-y-3">
                      {/* Linha Superior: Logo, Nome do Parceiro e ID */}
                      <div className="flex items-center justify-between gap-2 pr-8">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex h-7 w-7 items-center justify-center rounded-md overflow-hidden border bg-white shrink-0">
                            {sim.partners?.logo_url ? (
                              <img
                                src={sim.partners.logo_url}
                                className="h-full w-full object-cover"
                                alt={sim.partners?.name}
                              />
                            ) : (
                              <span className="text-[9px] font-bold">{sim.partners?.name?.slice(0, 3)}</span>
                            )}
                          </div>
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wide truncate">
                            {sim.partners?.name || "Parceiro N/A"}
                          </span>
                        </div>
                        <span className="text-[10px] sm:text-xs font-mono text-muted-foreground truncate max-w-[140px] sm:max-w-[200px]" title={sim.id}>
                          ID: {sim.id}
                        </span>
                      </div>

                      {/* Linha Inferior: Produto, Situação / Visita e Nome do Cliente */}
                      <div className="space-y-1 pr-8">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">
                            {sim.product_types?.name || "Consulta / Visita"}
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${statusClass(statusName)}`}
                            >
                              {statusName}
                            </span>
                            {sim.has_contact && (
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold bg-slate-200 text-slate-700">
                                CONTATO
                              </span>
                            )}
                          </div>
                        </div>

                        <SheetTitle className="text-lg sm:text-xl font-bold text-slate-900 break-words">
                          {entity?.name || "Lead sem nome"}
                        </SheetTitle>
                      </div>
                    </SheetHeader>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <div className="rounded-xl border bg-slate-50 p-4 space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                        <CalendarIcon className="h-3.5 w-3.5 text-primary" /> Origem & Visita
                      </h4>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground block">Data de Acesso:</span>
                          <strong className="text-slate-800">
                            {created.d} às {created.h}
                          </strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">UTM Source / Campaign:</span>
                          <strong className="text-slate-800 font-mono truncate block">
                            {sim.utm_source || "—"} / {sim.utm_campaign || "—"}
                          </strong>
                        </div>
                      </div>

                      <div className="pt-2 border-t grid grid-cols-1 gap-2 text-xs">
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span>
                            <strong>Localização:</strong> {sim.country || "BR"} / {sim.state || "—"} /{" "}
                            {sim.city || "—"}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-slate-700">
                          <Smartphone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <span>
                            <strong>IP / Device:</strong> {sim.ip_address || "—"} / {sim.operating_system || "—"} (
                            {sim.device_type || "Desktop"})
                          </span>
                        </div>
                      </div>

                      <div className="pt-2 border-t space-y-2 text-xs">
                        <div className="overflow-hidden">
                          <span className="text-muted-foreground block">Origem (URL):</span>
                          <span className="text-slate-800 font-mono truncate block" title={sim.origin_url || "—"}>
                            {sim.origin_url || "—"}
                          </span>
                        </div>
                        <div className="overflow-hidden">
                          <span className="text-muted-foreground block">Destino (URL):</span>
                          <span className="text-slate-800 font-mono truncate block" title={sim.target_url || "—"}>
                            {sim.target_url || "—"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border bg-card p-4 space-y-3">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                        <User className="h-3.5 w-3.5 text-primary" /> Dados do Lead ({isPJ ? "Pessoa Jurídica" : "Pessoa Física"})
                      </h4>

                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-muted-foreground block">{isPJ ? "CNPJ:" : "CPF:"}</span>
                          <strong className="text-slate-800 font-mono">{doc}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">
                            {isPJ ? "Data de Fundação:" : "Data de Nascimento:"}
                          </span>
                          <strong className="text-slate-800">
                            {entity?.birth_date || entityDetails.birth_date
                              ? new Date(entity.birth_date || entityDetails.birth_date).toLocaleDateString("pt-BR")
                              : "—"}
                          </strong>
                        </div>

                        <div>
                          <span className="text-muted-foreground block">Telefone:</span>
                          <strong className="text-slate-800">{entity?.phone || entityDetails.phone || "—"}</strong>
                        </div>
                        <div>
                          <span className="text-muted-foreground block">Login / Gênero:</span>
                          <strong className="text-slate-800">
                            {entityDetails.login || "—"} / {entity?.gender || entityDetails.gender || "—"}
                          </strong>
                        </div>

                        <div className="col-span-2 pt-2 border-t">
                          <span className="text-muted-foreground block">E-mail:</span>
                          <strong className="text-slate-800 truncate block">
                            {entity?.email || entityDetails.email || "—"}
                          </strong>
                        </div>
                      </div>

                      {fullAddress && (
                        <div className="mt-3 pt-3 border-t text-xs">
                          <span className="text-muted-foreground block">Endereço Completo:</span>
                          <strong className="text-slate-800 font-normal">{fullAddress}</strong>
                        </div>
                      )}
                    </div>

                    {offer?.offer_description && (
                      <div className="rounded-xl border bg-card p-4 space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                          <CreditCard className="h-3.5 w-3.5 text-primary" /> Oferta / Lote Vinculado
                        </h4>

                        <div className="space-y-3 text-xs">
                          <div>
                            <span className="text-muted-foreground block">Descrição da Oferta:</span>
                            <strong className="text-slate-900 text-sm font-semibold">{offer.offer_description}</strong>
                          </div>

                          <div className="grid grid-cols-2 gap-3 pt-1 border-t items-center">
                            <div>
                              <span className="text-muted-foreground block">Categoria:</span>
                              <strong className="text-slate-800">
                                {offerDetails.category || "—"}{" "}
                                {offerDetails.sub_category ? `(${offerDetails.sub_category})` : ""}
                              </strong>
                            </div>
                            <div className="text-right">
                              <span className="text-muted-foreground block">Número:</span>
                              <strong className="text-slate-800 font-mono">
                                Lote #{offerDetails.lot_number || "—"} / Oferta #{offer.offer_id || "—"}
                              </strong>
                            </div>
                          </div>

                          {(offer.event_description || eventDetails.event_description) && (
                            <div className="pt-1 border-t">
                              <span className="text-muted-foreground block">Evento / Leilão:</span>
                              <strong className="text-slate-800">
                                [{offer.event_id}] {offer.event_description || eventDetails.event_description}
                              </strong>
                              <div className="text-[11px] text-muted-foreground mt-0.5">
                                Início:{" "}
                                {offer.event_start_date
                                  ? new Date(offer.event_start_date).toLocaleDateString("pt-BR")
                                  : "—"}{" "}
                                | Término:{" "}
                                {offer.event_end_date
                                  ? new Date(offer.event_end_date).toLocaleDateString("pt-BR")
                                  : "—"}
                              </div>
                            </div>
                          )}

                          <div className="pt-1 border-t flex items-center justify-between">
                            <div>
                              <span className="text-muted-foreground block text-[10px]">Valor da Oferta:</span>
                              <strong className="text-slate-900 font-bold">{BRL(offer.offer_value)}</strong>
                            </div>
                            {sim.has_contact && (
                              <div>
                                <span className="text-emerald-600 font-semibold text-[10px] uppercase">
                                  Contato Realizado
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {(offer.manager_name ||
                      offer.legal_name ||
                      offer.seller_id ||
                      Object.keys(managerDetails).length > 0 ||
                      Object.keys(sellerDetails).length > 0) && (
                      <div className="rounded-xl border bg-slate-50 p-4 space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                          <Briefcase className="h-3.5 w-3.5 text-primary" /> Organizador & Vendedor
                        </h4>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          {offer.manager_name && (
                            <div>
                              <span className="text-muted-foreground block">Organizador:</span>
                              <strong className="text-slate-800">
                                {offer.manager_name}{" "}
                                {managerDetails.manager_id ? ` (${managerDetails.manager_id})` : ""}
                              </strong>
                            </div>
                          )}
                          {offer.seller_id && (
                            <div>
                              <span className="text-muted-foreground block">Seller ID:</span>
                              <strong className="text-slate-800 font-mono">{offer.seller_id}</strong>
                            </div>
                          )}
                          {offer.legal_name && (
                            <div className="col-span-2">
                              <span className="text-muted-foreground block">Razão Social (Vendedor):</span>
                              <strong className="text-slate-800">
                                {offer.legal_name} ({offer.trade_name || "—"})
                              </strong>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* AQUI ESTÁ A CORREÇÃO REAL: Usando visit_consents e DynamicConsentsStatic corretamente na tabela de Consultas */}
                    {sim.visit_consents && sim.visit_consents.length > 0 && (
                      <div className="rounded-xl border bg-slate-50 p-4 space-y-4">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-primary" /> Auditoria de Aceite (LGPD)
                        </h4>

                        <div className="space-y-3">
                          {sim.visit_consents
                            .sort(
                              (a: any, b: any) => new Date(a.accepted_at).getTime() - new Date(b.accepted_at).getTime(),
                            )
                            .map((consent: any) => {
                              const acceptedAt = formatDate(consent.accepted_at);
                              const legalTextSnapshot = consent.page_snapshot?.legal_text || {};
                              const origin = consent.origin_details || {};

                              return (
                                <div
                                  key={consent.id}
                                  className="bg-white p-3 rounded-xl border border-border shadow-sm space-y-3"
                                >
                                  <div className="flex items-center justify-between border-b border-border pb-2">
                                    <div className="flex items-center gap-1.5">
                                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                      <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                                        {consent.consent_id || "Termo de Aceite"}
                                      </span>
                                    </div>
                                    <span className="text-[10px] text-muted-foreground font-medium">
                                      {acceptedAt.d} às {acceptedAt.h}
                                    </span>
                                  </div>

                                  <div className="text-[11px] text-muted-foreground leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-border/50">
                                    {legalTextSnapshot.template_text ? (
                                      <DynamicConsentsStatic
                                        configs={[
                                          {
                                            id: consent.id,
                                            position: 1,
                                            template_text: legalTextSnapshot.template_text,
                                            links: legalTextSnapshot.links || [],
                                          },
                                        ]}
                                      />
                                    ) : (
                                      "Registro de aceite verificado eletronicamente."
                                    )}
                                  </div>

                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                    <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
                                      <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                                      <span
                                        className="truncate"
                                        title={`${origin.city || consent.city || "N/A"} / ${origin.state || consent.state || "N/A"} / ${origin.country || consent.country || "N/A"}`}
                                      >
                                        {origin.city || consent.city || "N/A"} / {origin.state || consent.state || "N/A"} / {origin.country || consent.country || "N/A"}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-[10px] text-slate-600">
                                      <Smartphone className="h-3 w-3 text-muted-foreground shrink-0" />
                                      <span
                                        className="truncate"
                                        title={`${origin.ip_address || consent.ip_address || "N/A"} - ${origin.operating_system || consent.operating_system || "N/A"} (${origin.device_type || consent.device_type || "N/A"})`}
                                      >
                                        {origin.ip_address || consent.ip_address || "N/A"} - {origin.operating_system || consent.operating_system || "N/A"} (
                                        {origin.device_type || consent.device_type || "N/A"})
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    )}

                    {pageConfigs?.offer_panel && (
                      <div className="bg-white p-4 rounded-xl border shadow-sm space-y-3">
                        <h4 className="text-[11px] font-bold uppercase text-purple-600 flex items-center gap-1.5">
                          <Layers size={14} /> Offer Panel (Painel de Proposta)
                        </h4>
                        <OfferPanelRender config={pageConfigs} />
                      </div>
                    )}

                    {consentConfigs && consentConfigs.length > 0 && (
                      <div className="bg-white p-4 rounded-xl border shadow-sm space-y-3">
                        <h4 className="text-[11px] font-bold uppercase text-purple-600 flex items-center gap-1.5">
                          <FileText size={14} /> Consentimentos da Jornada (LGPD)
                        </h4>
                        <DynamicConsentsStatic configs={consentConfigs} />
                      </div>
                    )}

                    {pageFaqs && pageFaqs.length > 0 && (
                      <div className="bg-white p-4 rounded-xl border shadow-sm space-y-3">
                        <h4 className="text-[11px] font-bold uppercase text-purple-600 flex items-center gap-1.5">
                          <HelpCircle size={14} /> FAQ & Perguntas Frequentes
                        </h4>
                        <FAQSection items={pageFaqs} />
                      </div>
                    )}

                    {pageConfigs?.footer && (
                      <div className="pt-2">
                        <FooterRender config={pageConfigs.footer} />
                      </div>
                    )}
                  </div>

                  {/* 3. RODAPÉ FIXO NA BASE COM BOTÕES */}
                  <div className="p-4 bg-white border-t border-gray-200 flex items-center justify-between gap-3 shrink-0 shadow-lg">
                    <Button
                      variant="outline"
                      onClick={handlePrintSheet}
                      className="flex-1 rounded-xl text-xs gap-2 border-[#B300FF]/35 text-[#B300FF] hover:bg-[#B300FF]/5 h-10 font-semibold"
                    >
                      <Printer className="h-4 w-4" /> Imprimir / PDF
                    </Button>
                    <Button
                      onClick={() => setActiveConsult(null)}
                      className="flex-1 rounded-xl text-xs bg-[#B300FF] hover:bg-[#9f00e6] text-white h-10 font-semibold"
                    >
                      Fechar
                    </Button>
                  </div>
                </div>
              );
            })()}
        </SheetContent>
      </Sheet>

      {/* ===================================================================== */}
      {/* [ESCONDIDO NA TELA] BLOCO DE REFERÊNCIA PARA O IFRAME DE IMPRESSÃO    */}
      {/* ===================================================================== */}
      <div style={{ display: "none" }}>
        <div ref={printRef} className="w-full text-slate-900 bg-white p-8">
          {activeConsult &&
            (() => {
              const sim = activeConsult;
              const created = formatDate(sim.created_at);
              const entity = sim.visit_entities || {};
              const entityDetails = entity.entity_details || {};
              const offer = sim.visit_offers || {};
              const offerDetails = offer.offer_details || {};
              const statusName = getVisitStatus(sim);

              const rawDoc = entity?.document?.replace(/\D/g, "") || entityDetails.document?.replace(/\D/g, "") || "";
              const doc =
                rawDoc.length === 14
                  ? rawDoc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
                  : rawDoc.length === 11
                    ? rawDoc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
                    : entity?.document || "—";

              const isPJ = entity?.entity_type === "J" || entityDetails.entity_type === "J" || rawDoc.length === 14;
              const addr = entityDetails.address || {};
              const fullAddress = [
                addr.street,
                addr.number,
                addr.complement,
                addr.neighborhood,
                addr.city,
                addr.state,
                addr.zip_code,
                addr.country,
              ]
                .filter(Boolean)
                .join(", ");

              const rawPayloadObj =
                typeof sim.raw_payload === "string"
                  ? (() => {
                      try {
                        return JSON.parse(sim.raw_payload);
                      } catch {
                        return {};
                      }
                    })()
                  : sim.raw_payload || {};

              const pageConfigs = rawPayloadObj.page_configs || {};
              const pageFaqs = rawPayloadObj.page_faqs || [];

              return (
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-[#B300FF] uppercase">
                          {sim.product_types?.name || "Consulta / Visita"}
                        </span>
                        <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border bg-slate-50 uppercase`}>
                          {statusName}
                        </span>
                      </div>
                      <h1 className="text-2xl font-bold">{entity?.name || "Lead sem nome"}</h1>
                    </div>
                    <div className="text-right text-xs text-slate-500 font-mono">
                      ID: {sim.id}
                      <br />
                      Data: {created.d} às {created.h}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                        <CalendarIcon size={14} className="text-slate-400" /> Origem & Visita
                      </h4>
                      <div className="space-y-1 text-xs">
                        <div>
                          <span className="text-slate-500">Data de Acesso:</span>{" "}
                          <strong className="ml-1">
                            {created.d} às {created.h}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500">UTM:</span>{" "}
                          <strong className="font-mono ml-1">
                            {sim.utm_source || "—"} / {sim.utm_campaign || "—"}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Localização:</span>{" "}
                          <strong className="ml-1">
                            {sim.country || "BR"} / {sim.state || "—"} / {sim.city || "—"}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Visit ID:</span>{" "}
                          <strong className="font-mono ml-1">{sim.visit_id || "Não rastreado"}</strong>
                        </div>
                        <div className="truncate">
                          <span className="text-slate-500">IP/Device:</span>{" "}
                          <strong className="ml-1">
                            {sim.ip_address || "—"} / {sim.operating_system || "—"} ({sim.device_type || "Desktop"})
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                        <User size={14} className="text-slate-400" /> Dados do Lead
                      </h4>
                      <div className="space-y-1 text-xs">
                        <div>
                          <span className="text-slate-500">{isPJ ? "CNPJ:" : "CPF:"}</span>{" "}
                          <strong className="font-mono ml-1">{doc}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500">{isPJ ? "Data de Fundação:" : "Data de Nascimento:"}</span>{" "}
                          <strong className="ml-1">
                            {entity?.birth_date || entityDetails.birth_date
                              ? new Date(entity.birth_date || entityDetails.birth_date).toLocaleDateString("pt-BR")
                              : "—"}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500">Telefone:</span>{" "}
                          <strong className="ml-1">{entity?.phone || entityDetails.phone || "—"}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500">E-mail:</span>{" "}
                          <strong className="ml-1">{entity?.email || entityDetails.email || "—"}</strong>
                        </div>
                        {fullAddress && (
                          <div className="truncate">
                            <span className="text-slate-500">Endereço:</span>{" "}
                            <strong className="font-normal ml-1">{fullAddress}</strong>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {offer?.offer_description && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                        <CreditCard size={14} className="text-slate-400" /> Oferta / Lote
                      </h4>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        <div className="col-span-2">
                          <span className="text-slate-500 block">Descrição da Oferta:</span>
                          <strong className="text-sm text-[#B300FF]">{offer.offer_description}</strong>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Categoria:</span>{" "}
                          <strong>
                            {offerDetails.category || "—"}{" "}
                            {offerDetails.sub_category ? `(${offerDetails.sub_category})` : ""}
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-500 block">Número:</span>{" "}
                          <strong className="font-mono">
                            Lote #{offerDetails.lot_number || "—"} / Oferta #{offer.offer_id || "—"}
                          </strong>
                        </div>
                        <div className="col-span-2">
                          <span className="text-slate-500 block">Valor:</span>{" "}
                          <strong className="font-bold text-slate-900">{BRL(offer.offer_value)}</strong>
                        </div>
                      </div>
                    </div>
                  )}

                  {(offer.manager_name || offer.legal_name || offer.seller_id) && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                        <Briefcase size={14} className="text-slate-400" /> Organizador & Vendedor
                      </h4>
                      <div className="grid grid-cols-2 gap-4 text-xs">
                        {offer.manager_name && (
                          <div>
                            <span className="text-slate-500 block">Organizador:</span>{" "}
                            <strong>{offer.manager_name}</strong>
                          </div>
                        )}
                        {offer.seller_id && (
                          <div>
                            <span className="text-slate-500 block">Seller ID:</span>{" "}
                            <strong className="font-mono">{offer.seller_id}</strong>
                          </div>
                        )}
                        {offer.legal_name && (
                          <div className="col-span-2">
                            <span className="text-slate-500 block">Razão Social:</span>{" "}
                            <strong>
                              {offer.legal_name} ({offer.trade_name || "—"})
                            </strong>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* IMPRESSÃO DA AUDITORIA DE ACEITE (LGPD) - CONSULTAS CORRIGIDO */}
                  {sim.visit_consents && sim.visit_consents.length > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4 break-inside-avoid">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
                        <FileText className="h-3.5 w-3.5 text-primary" /> Auditoria de Aceite (LGPD)
                      </h4>

                      <div className="space-y-3">
                        {sim.visit_consents
                          .sort((a: any, b: any) => new Date(a.accepted_at).getTime() - new Date(b.accepted_at).getTime())
                          .map((consent: any) => {
                            const acceptedAt = formatDate(consent.accepted_at);
                            const legalTextSnapshot = consent.page_snapshot?.legal_text || {};

                            return (
                              <div
                                key={consent.id}
                                className="bg-white p-3 rounded-xl border border-border shadow-sm space-y-3 break-inside-avoid"
                              >
                                <div className="flex items-center justify-between border-b border-border pb-2">
                                  <div className="flex items-center gap-1.5">
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                    <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider">
                                      {consent.consent_id || "Termo de Aceite"}
                                    </span>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground font-medium">
                                    {acceptedAt.d} às {acceptedAt.h}
                                  </span>
                                </div>

                                <div className="text-[11px] text-muted-foreground leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-border/50">
                                  {legalTextSnapshot.template_text ? (
                                    <DynamicConsentsStatic
                                      configs={[
                                        {
                                          id: consent.id,
                                          position: 1,
                                          template_text: legalTextSnapshot.template_text,
                                          links: legalTextSnapshot.links || [],
                                        },
                                      ]}
                                    />
                                  ) : (
                                    "Registro de aceite verificado eletronicamente."
                                  )}
                                </div>

                                <div className="grid grid-cols-2 gap-2 pt-1 text-[10px] text-slate-600">
                                  <div><MapPin className="h-3 w-3 inline mr-1 text-muted-foreground" />{consent.city || "N/A"} / {consent.state || "N/A"} / {consent.country || "N/A"}</div>
                                  <div><Smartphone className="h-3 w-3 inline mr-1 text-muted-foreground" />{consent.ip_address || "N/A"} - {consent.operating_system || "N/A"}</div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {pageConfigs?.offer_panel && (
                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 break-inside-avoid">
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#B300FF] flex items-center gap-1.5"><Layers size={14} /> Painel de Proposta (Offer Panel)</h4>
                      <OfferPanelRender config={pageConfigs} />
                    </div>
                  )}

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