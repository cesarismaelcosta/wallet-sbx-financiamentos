/**
 * ============================================================================
 * @fileoverview Monitor de Consultas e Visitas (Backoffice Otimizado)
 * @module Backoffice/Consults
 * @route /backoffice/consults
 *
 * =========================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: OLAP TEMPORAL DETERMINISM
 * =========================================================================
 * Torre de controle de topo de funil de alta performance. Utiliza payload enxuto
 * na listagem principal, filtros de data no servidor, importação dinâmica do Excel
 * e carregamento sob demanda no Sheet de auditoria.
 * 
 * [MUDANÇAS ARQUITETURAIS - 1:N OFFERS]:
 * Com a introdução do Cart Preservation, uma visita passou a possuir N ofertas.
 * A extração `visit_offers[0]` foi substituída pelo "Extrator Temporal Determinístico",
 * que ordena as ofertas por `created_at DESC` em memória, assegurando que o Analista
 * visualizará sempre o último pageview / última intenção do lead.
 * 
 * [EVENT-LEVEL CONTEXT]:
 * partner_id, product_id, partners, product_types e raw_payload agora
 * são resolvidos milimetricamente através da relação visit_updates -> visit_offers
 * (cruzamento via visit_update_id), extinguindo qualquer vazamento de estado.
 * ============================================================================
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { RefreshCw, Search, Filter, Download, ChevronDown, Printer, Loader2 } from "lucide-react";
import { DateRange } from "react-day-picker";
import { useAuth } from "@/integrations/auth/AuthContext";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";

// Fábrica de Painéis Compartilhados
import { PanelProduct } from "@/features/financial-hub/components/shared/renderes/PanelProduct";
import { PanelOffer } from "@/features/financial-hub/components/shared/renderes/PanelOffer";
import { PanelSeller } from "@/features/financial-hub/components/shared/renderes/PanelSeller";
import { PanelEntity } from "@/features/financial-hub/components/shared/renderes/PanelEntity";
import { PanelAcceptedConsents } from "@/features/financial-hub/components/shared/renderes/PanelAcceptedConsents";
import { PanelConsents } from "@/features/financial-hub/components/shared/renderes/PanelConsents";
import { PanelFAQ } from "@/features/financial-hub/components/shared/renderes/PanelFAQ";
import { PanelFooter } from "@/features/financial-hub/components/shared/renderes/PanelFooter";
import { PanelVisit } from "@/features/financial-hub/components/shared/renderes/PanelVisit";

import { supabase } from "@/integrations/supabase/client";

export const Route = createLazyFileRoute("/backoffice/consults")({
  component: ConsultsPage,
});

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

export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isMobile;
}

function ConsultsPage() {
  const { backofficeUser } = useAuth();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");

  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<"30" | "90" | "all" | "custom">("30");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  const [partnersList, setPartnersList] = useState<any[]>([]);
  const [productsList, setProductsList] = useState<any[]>([]);

  const [activeConsult, setActiveConsult] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  const [stats, setStats] = useState({
  total: 0,
  consultas: 0,
  sites_parceiros: 0,
  simulacoes: 0
  });

  useEffect(() => {
    async function loadDropdowns() {
      if (!backofficeUser) return;

      const { data: pData } = await supabase.from('partners').select('id, name').eq('is_active', true).order('name');
      const { data: prData } = await supabase.from('product_types').select('id, name').order('name');

      if (pData) {
        if (backofficeUser.role === 'viewer' && !backofficeUser.allowed_partners?.includes("*")) {
          const allowed = backofficeUser.allowed_partners || [];
          setPartnersList(pData.filter(p => allowed.includes(String(p.id))));
        } else {
          setPartnersList(pData);
        }
      }

      if (prData) {
        if (backofficeUser.role === 'viewer' && !backofficeUser.allowed_products?.includes("*")) {
          const allowed = backofficeUser.allowed_products || [];
          setProductsList(prData.filter(pr => allowed.includes(String(pr.id))));
        } else {
          setProductsList(prData);
        }
      }
    }
    loadDropdowns();
  }, [backofficeUser]);

  // 1. Estados da Paginação Real
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const PAGE_SIZE = 50;
  const [loading, setLoading] = useState(false);

  // 2. Dispara a busca quando filtros mudam
  useEffect(() => {
    if (!backofficeUser) return;

    const timeoutId = setTimeout(() => {
      setPage(0);
      load(0);
      loadStats();
    }, 400);
    return () => clearTimeout(timeoutId);
  }, [search, selectedPartners, selectedProducts, dateRange, customRange]);

  function getPeriodDates(range: string, custom?: DateRange) {
    if (range === "custom" && custom?.from && custom?.to) {
      return { p_from: custom.from.toISOString(), p_to: custom.to.toISOString() };
    }
    if (range !== "all") {
      const days = Number(range);
      const date = new Date();
      date.setDate(date.getDate() - days);
      return { p_from: date.toISOString(), p_to: new Date().toISOString() };
    }
    return { p_from: null, p_to: null };
  }

  // 3. Função inteligente com paginação, count exato no banco e restrições de RBAC
  async function load(targetPage: number) {
    setLoading(true);
    try {
      const from = targetPage * PAGE_SIZE;
      const to = from + PAGE_SIZE;

      let dateLimit = new Date();
      if (dateRange === "30") dateLimit.setDate(dateLimit.getDate() - 30);
      else if (dateRange === "90") dateLimit.setDate(dateLimit.getDate() - 90);
      else if (dateRange === "all") dateLimit = new Date("2020-01-01");

      // ============================================================================
      // ✨ ARQUITETURA 1:N - QUERY BLINDADA COM EVENT-LEVEL CONTEXT
      // Parceiros, Produtos e Payloads agora vivem na relação visit_updates
      // ============================================================================
      let query = supabase.from("visits").select(
        `
          id, created_at, action, utm_source, state,
          visit_entities(name, document, phone, email),
          visit_offers!inner(offer_id, offer_description, offer_value, event_id, event_description, event_end_date, created_at, visit_update_id, category_types(name)),
          visit_updates!inner(id, action, created_at, partner_id, product_id, raw_payload, partners(name, logo_url), product_types(name))
        `
      )
      .in('visit_updates.action', ['SIMULATE', 'CONSULT', 'REDIRECT']);

      // ============================================================================
      // RESTRIÇÕES DE ESCOPO POR USUÁRIO (RBAC - Viewer) -> APONTANDO PARA VISIT_UPDATES
      // ============================================================================
      if (backofficeUser && backofficeUser.role === 'viewer') {
        const allowedPartners = backofficeUser.allowed_partners || [];
        const allowedProducts = backofficeUser.allowed_products || [];

        if (!allowedPartners.includes("*")) {
          if (allowedPartners.length === 0) {
            query = query.eq("id", "00000000-0000-0000-0000-000000000000"); // Bloqueia tudo
          } else {
            const partnerQueryIds = allowedPartners.map((id: string) => (isNaN(Number(id)) ? id : Number(id)));
            query = query.in("visit_updates.partner_id", partnerQueryIds);
          }
        }

        if (!allowedProducts.includes("*")) {
          if (allowedProducts.length === 0) {
            query = query.eq("id", "00000000-0000-0000-0000-000000000000"); // Bloqueia tudo
          } else {
            const productQueryIds = allowedProducts.map((id: string) => (isNaN(Number(id)) ? id : Number(id)));
            query = query.in("visit_updates.product_id", productQueryIds);
          }
        }
      }
      // ============================================================================

      if (dateRange !== "all" && dateRange !== "custom") {
        query = query.gte("created_at", dateLimit.toISOString());
      } else if (dateRange === "custom" && customRange?.from && customRange?.to) {
        query = query.gte("created_at", customRange.from.toISOString()).lte("created_at", customRange.to.toISOString());
      }

      // Filtros de Tela em Memória Passados para o Banco
      if (selectedPartners.length > 0) query = query.in("visit_updates.partner_id", selectedPartners);
      if (selectedProducts.length > 0) query = query.in("visit_updates.product_id", selectedProducts);

      query = query.order("created_at", { ascending: false }).range(from, to);

      const { data: visitsData, error: visitError } = await query;

      if (visitError) throw new Error(visitError.message);

      if (!visitsData || visitsData.length === 0) {
        setRows([]);
        setTotalPages(targetPage + 1);
        return;
      }

      const hasMore = visitsData.length > PAGE_SIZE;
      const slicedData = hasMore ? visitsData.slice(0, PAGE_SIZE) : visitsData;
      setTotalPages(hasMore ? targetPage + 2 : targetPage + 1);

      const visitIds = slicedData.map((v) => v.id);
      const { data: updatesData } = await supabase
        .from("visit_updates")
        .select("visit_id, action")
        .in("visit_id", visitIds);

      const contactSet = new Set(
        updatesData?.filter((u) => (u.action || "").toUpperCase().includes("CONTACT")).map((u) => u.visit_id) || [],
      );

      // ============================================================================
      // NORMALIZAÇÃO 1:N E DETERMINISMO TEMPORAL
      // ============================================================================
      const normalized = slicedData.flatMap((v) => {
        const sortedOffers = Array.isArray(v.visit_offers) 
          ? [...v.visit_offers].sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
          : [];

        const updates = Array.isArray(v.visit_updates) ? v.visit_updates : [];

        const baseVisit = {
          ...v,
          visit_entities: Array.isArray(v.visit_entities) ? v.visit_entities[0] ?? null : v.visit_entities,
          all_offers: sortedOffers, 
          has_contact: contactSet.has(v.id),
        };

        // EXPLOSÃO: Para cada oferta, acha o evento (visit_update) exato que a gerou!
        return sortedOffers.map((off, index) => {
          
          const exactUpdate = updates.find((u: any) => u.id === off.visit_update_id) || updates[0] || {};
          
          let eventPayload = {};
          if (typeof exactUpdate.raw_payload === 'string') {
            try { eventPayload = JSON.parse(exactUpdate.raw_payload); } catch (e) {}
          } else {
            eventPayload = exactUpdate.raw_payload || {};
          }

          return {
            ...baseVisit,
            row_id: `${v.id}-${index}`, 
            visit_offers: off,
            
            // 🔥 BLINDAGEM: O contexto injetado na grid herda APENAS do evento!
            update_id: exactUpdate.id,
            action: exactUpdate.action, // Ação Real do Evento
            partner_id: exactUpdate.partner_id,
            product_id: exactUpdate.product_id,
            partners: exactUpdate.partners,
            product_types: exactUpdate.product_types,
            raw_payload: eventPayload
          };
        });
      });

      if (search.trim() !== "") {
        const rawSearch = search.toLowerCase().trim();
        const rawDocSearch = search.replace(/\D/g, "");
        const localFiltered = normalized.filter((r) => {
          const clientName = r.visit_entities?.name ?? "";
          const rowDoc = r.visit_entities?.document?.replace(/\D/g, "") || "";
          return clientName.toLowerCase().includes(rawSearch) || (rawDocSearch !== "" && rowDoc.includes(rawDocSearch));
        });
        setRows(localFiltered);
      } else {
        setRows(normalized);
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao carregar listagem.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    const { p_from, p_to } = getPeriodDates(dateRange, customRange);

    const { data, error } = await supabase.rpc("visit_stats", {
      p_from,
      p_to,
      p_partner_ids: selectedPartners.length > 0 ? selectedPartners.map(Number) : null,
      p_product_ids: selectedProducts.length > 0 ? selectedProducts.map(Number) : null,
      p_search: search.trim() || null,
      p_status: selectedStatus.length > 0 ? selectedStatus : null
    });

    if (error) {
      console.error("Erro ao carregar estatísticas de visitas:", error);
      return;
    }

    const s = data?.[0] ?? { total: 0, consultas: 0, sites_parceiros: 0, simulacoes: 0 };
    setStats(s);
    setTotalPages(Math.ceil(Number(s.total) / PAGE_SIZE));
  }

  async function handleSelectConsult(row: any) {
    setDetailLoading(true);
    // Abre imediatamente com os dados rasos da grid (Já blindados!)
    setActiveConsult(row);

    try {
      // Como partner e product não vivem mais na raiz, buscamos apenas as entidades e consentimentos
      const { data: fullData, error } = await supabase
        .from("visits")
        .select(`
          id, created_at, action, utm_source, utm_campaign, country, state, city, ip_address, operating_system, device_type, origin_url, target_url,
          visit_entities(id, name, document, phone, email, birth_date, gender, entity_type, entity_details),
          visit_offers(id, visit_id, visit_update_id, manager_name, seller_id, legal_name, trade_name, event_id, event_description, event_end_date, offer_id, offer_description, offer_value, category_id, created_at, category_types(name), subcategory ),
          visit_consents(id, consent_id, accepted, accepted_at, created_at, ip_address, country, state, city, operating_system, device_type, origin_details, page_snapshot)
        `)
        .eq("id", row.id)
        .single();

      if (error) {
        console.error("ERRO FATAL DO SUPABASE:", error.message, error.details);
        toast.error(`Erro ao carregar detalhes: ${error.message}`);
        return;
      }

      if (fullData) {
        const sortedOffers = Array.isArray(fullData.visit_offers) 
          ? [...fullData.visit_offers].sort((a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
          : [];

        const clickedOfferTime = row.visit_offers?.created_at;
        const mainOffer = sortedOffers.find((o: any) => o.created_at === clickedOfferTime) || sortedOffers[0] || null;

        setActiveConsult({
          ...fullData,
          has_contact: row.has_contact,
          visit_entities: Array.isArray(fullData.visit_entities) ? fullData.visit_entities[0] ?? null : fullData.visit_entities,
          
          // 🔥 MANTÉM OS DADOS DO EVENTO INTACTOS (Blindagem contra vazamento)
          partner_id: row.partner_id,
          product_id: row.product_id,
          partners: row.partners,
          product_types: row.product_types,
          raw_payload: row.raw_payload,
          action: row.action, 

          visit_offers: mainOffer, 
          other_offers: sortedOffers.filter((o: any) => o.created_at !== mainOffer?.created_at), 
          visit_consents: fullData.visit_consents || [],
        });
      }
    } catch (e) {
      console.error("Erro inesperado no handleSelectConsult:", e);
    } finally {
      setDetailLoading(false);
    }
  }

  function getVisitStatus(r: any): string {
    const act = (r.action ?? "").toUpperCase();
    if (act.includes("SIMULATE")) return "SIMULAÇÃO";
    if (act.includes("CONSULT")) return "CONSULTA";
    if (act.includes("REDIRECT")) return "PARCEIRO";
    
    return "CONSULTA"; 
  }

  const statusOptions = ["SIMULAÇÃO", "CONSULTA", "PARCEIRO"];

  const handleSelectStatus = (status: string) => {
    if (status === "Todas") {
      setSelectedStatus([]);
      return;
    }
    setSelectedStatus((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      return current.includes(status) ? current.filter((s) => s !== status) : [...current, status];
    });
  };

  const { filtered, totals } = useMemo(() => {
    const safeRows = Array.isArray(rows) ? rows : [];
    const safeStatus = Array.isArray(selectedStatus) ? selectedStatus : [];

    const t = { total: safeRows.length, simulacao: 0, consulta: 0, siteParceiro: 0 };

    const resultFiltered = safeRows.filter((r) => {
      const statusName = getVisitStatus(r);

      if (statusName === "SIMULAÇÃO") t.simulacao++;
      else if (statusName === "CONSULTA") t.consulta++;
      else if (statusName === "PARCEIRO") t.siteParceiro++;

      if (safeStatus.length === 0) return true;
      return safeStatus.includes(statusName);
    });

    return { filtered: resultFiltered, totals: t };
  }, [rows, selectedStatus]);

  const handleExportExcel = async () => {
    if (!filtered || filtered.length === 0) {
      toast.error("Não há dados na tela para exportar.");
      return;
    }

    const XLSX = await import("xlsx");

    const dataToExport = filtered.map((r) => {
      const created = formatDate(r.created_at);
      const entity = r.visit_entities || {};
      const offer = r.visit_offers || {};
      const statusName = getVisitStatus(r);

      return {
        ID: r.id,
        Data: `${created.d} ${created.h}`,
        Cliente: entity.name || "—",
        Documento: entity.document || "—",
        Telefone: entity.phone || "—",
        "E-mail": entity.email || "—",
        Produto: r.product_types?.name || "—",
        Situação: statusName,
        Parceiro: r.partners?.name || "—",
        "UTM Source": r.utm_source || "—",
        UF: r.state || "—",
        "Descrição da Oferta": offer.offer_description || "—",
        "Oferta ID": offer.offer_id || "—",
        "Valor da Oferta": offer.offer_value || 0,
        Organizador: offer.manager_name || "—",
        "Vendedor (Razão Social)": offer.legal_name || "—",
        "Seller ID": offer.seller_id || "—",
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
          <Button onClick={() => load(0)} disabled={loading} className="rounded-xl">
            <RefreshCw className={`mr-2 h-4 w-4 shrink-0 ${loading ? "animate-spin" : ""}`} />
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total de visitas (filtro)", value: Number(stats.total).toLocaleString("pt-BR") },
          { label: "Consultas", value: Number(stats.consultas).toLocaleString("pt-BR") },
          { label: "Sites parceiros", value: Number(stats.sites_parceiros).toLocaleString("pt-BR") },
          { label: "Simulações geradas", value: Number(stats.simulacoes).toLocaleString("pt-BR") },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-border bg-card p-5 text-card-foreground">
            <div className="text-xs font-semibold uppercase text-muted-foreground">{t.label}</div>
            <div className="mt-2 text-2xl font-bold">{t.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card flex flex-col overflow-hidden">
        {/* Bloco de Busca e Filtros com botão "Filtros" em cima e busca embaixo no mobile */}
        <div className="flex flex-col gap-3 border-b border-border p-4">
          {/* Botão de Filtros exclusivo para Mobile (acima da busca) */}
          <div className="lg:hidden">
            <Button
              variant="outline"
              onClick={() => setMobileFilterOpen(true)}
              className="w-full h-11 rounded-xl gap-2 justify-start bg-white border-slate-200 text-slate-700 shadow-sm"
            >
              <Filter className="h-4 w-4 text-[#B300FF]" /> Filtros
            </Button>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            {/* Input de Busca (abaixo do botão de filtros no mobile) */}
            <div className="relative w-full lg:flex-1 lg:max-w-md">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente ou CPF/CNPJ..."
                className="h-11 w-full rounded-full bg-slate-100/70 border-transparent pl-5 pr-12 text-[13px] text-slate-700 placeholder:text-slate-500 focus-visible:ring-primary/20 focus-visible:bg-white focus-visible:border-primary/30 transition-all shadow-none"
              />
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-[#B300FF]" />
            </div>

            {/* Filtros em linha para Desktop (escondidos no mobile) */}
            <div className="hidden lg:flex lg:items-center lg:gap-2 lg:ml-auto">
              {/* Filtro de Parceiro */}
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-[175px] rounded-xl gap-2 bg-white hover:bg-slate-50 border-slate-200 transition-colors text-slate-600 justify-between"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Filter className="h-3.5 w-3.5 opacity-50 shrink-0" />
                      <span className="truncate">
                        Parceiro: {selectedPartners.length === 0 ? "Todos" : `${selectedPartners.length} sel.`}
                      </span>
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0" align="start">
                  <Command>
                    <CommandList 
                      className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y" 
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        <CommandItem onSelect={() => setSelectedPartners([])} className="cursor-pointer">
                          <div
                            className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${selectedPartners.length === 0 ? "bg-primary text-primary-foreground" : "opacity-50"}`}
                          >
                            {selectedPartners.length === 0 && "✓"}
                          </div>
                          Todos Parceiros
                        </CommandItem>
                        {partnersList.map((p) => {
                          const isSelected = selectedPartners.includes(String(p.id));
                          return (
                            <CommandItem
                              key={p.id}
                              onSelect={() => {
                                if (isSelected)
                                  setSelectedPartners(selectedPartners.filter((id) => id !== String(p.id)));
                                else setSelectedPartners([...selectedPartners, String(p.id)]);
                              }}
                              className={`cursor-pointer ${isSelected ? "bg-primary/10 text-primary font-medium" : ""}`}
                            >
                              <div
                                className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? "bg-primary text-primary-foreground" : "opacity-50"}`}
                              >
                                {isSelected && "✓"}
                              </div>
                              {p.name}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Filtro de Produto */}
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-[175px] rounded-xl gap-2 bg-white hover:bg-slate-50 border-slate-200 transition-colors text-slate-600 justify-between"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Filter className="h-3.5 w-3.5 opacity-50 shrink-0" />
                      <span className="truncate">
                        Produto: {selectedProducts.length === 0 ? "Todos" : `${selectedProducts.length} sel.`}
                      </span>
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0" align="start">
                  <Command>
                    <CommandList 
                      className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y" 
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        <CommandItem onSelect={() => setSelectedProducts([])} className="cursor-pointer">
                          <div
                            className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${selectedProducts.length === 0 ? "bg-primary text-primary-foreground" : "opacity-50"}`}
                          >
                            {selectedProducts.length === 0 && "✓"}
                          </div>
                          Todos Produtos
                        </CommandItem>
                        {productsList.map((p) => {
                          const isSelected = selectedProducts.includes(String(p.id));
                          return (
                            <CommandItem
                              key={p.id}
                              onSelect={() => {
                                if (isSelected)
                                  setSelectedProducts(selectedProducts.filter((id) => id !== String(p.id)));
                                else setSelectedProducts([...selectedProducts, String(p.id)]);
                              }}
                              className={`cursor-pointer ${isSelected ? "bg-primary/10 text-primary font-medium" : ""}`}
                            >
                              <div
                                className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? "bg-primary text-primary-foreground" : "opacity-50"}`}
                              >
                                {isSelected && "✓"}
                              </div>
                              {p.name}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Filtro de Situação */}
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-[175px] rounded-xl gap-2 bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8] hover:bg-[#fce7f3] transition-colors justify-between"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Filter className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        Situação:{" "}
                        {selectedStatus.length === 0
                          ? "Todos"
                          : selectedStatus.includes("Qualificadas") && selectedStatus.length === 1
                            ? "Qualificadas"
                            : `${selectedStatus.length} sel.`}
                      </span>
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-56 bg-[#fdf2f8] border-[#fbcfe8] z-50" align="start">
                  <Command className="bg-transparent">
                    <CommandList 
                      className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y" 
                      style={{ WebkitOverflowScrolling: 'touch' }}
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        {/* Opção Todas */}
                        <CommandItem
                          onSelect={() => handleSelectStatus("Todas")}
                          className="cursor-pointer text-[#d946ef] hover:bg-[#fce7f3]"
                        >
                          <div
                            className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${selectedStatus.length === 0 ? "bg-[#d946ef] text-white" : "opacity-50"}`}
                          >
                            {selectedStatus.length === 0 && "✓"}
                          </div>
                          Todas
                        </CommandItem>

                        {/* Demais Status (Múltipla Seleção) */}
                        {statusOptions
                          .filter((s) => s !== "Qualificadas")
                          .map((s) => {
                            const isSelected = selectedStatus.includes(s);
                            return (
                              <CommandItem
                                key={s}
                                onSelect={() => handleSelectStatus(s)}
                                className={`cursor-pointer text-[#d946ef] hover:bg-[#fce7f3] ${isSelected ? "bg-[#d946ef]/10 font-medium" : ""}`}
                              >
                                <div
                                  className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${isSelected ? "bg-[#d946ef] text-white" : "opacity-50"}`}
                                >
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

              {/* Filtro de Período */}
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-[175px] rounded-xl gap-2 bg-white hover:bg-[#fce7f3] border-slate-200 transition-colors text-slate-600 justify-between"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Filter className="h-3.5 w-3.5 opacity-50 shrink-0" />
                      <span className="truncate">
                        Período:{" "}
                        {dateRange === "custom"
                          ? "Personalizado"
                          : dateRange === "30"
                            ? "30 dias"
                            : dateRange === "90"
                              ? "90 dias"
                              : "Tudo"}
                      </span>
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-auto" align="start">
                  <Command>
                    <CommandList 
                      className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y" 
                      style={{ WebkitOverflowScrolling: 'touch' }}
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        <CommandItem onSelect={() => setDateRange("30")}>Últimos 30 dias</CommandItem>
                        <CommandItem onSelect={() => setDateRange("90")}>Últimos 90 dias</CommandItem>
                        <CommandItem onSelect={() => setDateRange("all")}>Todo o período</CommandItem>
                      </CommandGroup>
                      <div className="p-2 border-t">
                        <p className="text-xs font-semibold px-2 mb-2 text-muted-foreground">Personalizado:</p>
                        <Calendar
                          mode="range"
                          selected={customRange}
                          onSelect={(range) => {
                            setCustomRange(range);
                            setDateRange("custom");
                          }}
                          numberOfMonths={1}
                        />
                      </div>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
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
                const doc =
                  rawDoc.length === 14
                    ? rawDoc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
                    : rawDoc.length === 11
                      ? rawDoc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
                      : entity?.document || "—";
                const phone = entity?.phone?.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3") ?? "";
                const endEvent = offer?.event_end_date
                  ? new Date(offer.event_end_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                  : "";

                return (
                  <tr
                    key={r.row_id}
                    onClick={() => handleSelectConsult(r)}
                    className="border-b border-border/60 hover:bg-accent/40 cursor-pointer transition-colors"
                    title="Clique para ver os detalhes completos da visita"
                  >
                    <td className="px-3 py-2.5 w-[75px]">
                      <div className="font-semibold text-foreground">{created.d}</div>
                      <div className="text-[11px] text-muted-foreground">{created.h}</div>
                    </td>
                    <td className="px-3 py-2.5 w-[140px]">
                      <div className="font-semibold text-[#d946ef] truncate" title={entity?.name}>
                        {entity?.name || "—"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{doc}</div>
                      <div className="text-[11px] text-muted-foreground">{phone || "—"}</div>
                    </td>
                    <td className="px-3 py-2.5 w-[140px]">
                      <div className="font-semibold text-foreground">{productName}</div>
                      <div className="text-[10px] text-muted-foreground font-medium uppercase mt-0.5">
                        ORIGEM: {r.utm_source ? r.utm_source : "—"}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-medium uppercase mt-0.5">
                        {r.state ? r.state : "—"}
                      </div>
                      {r.has_contact && (
                        <div className="text-[10px] text-emerald-600 font-semibold uppercase mt-0.5">
                          CONTATO C/ PARCEIRO
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5 max-w-[190px] sm:max-w-[220px]">
                      <div className="font-semibold text-foreground truncate" title={offer?.offer_description}>
                        {offer?.offer_description || "—"}
                      </div>
                      <div
                        className="text-[11px] text-muted-foreground truncate mt-0.5"
                        title={offer?.event_description}
                      >
                        {offer?.event_id ? `${offer.event_id} - ` : ""} {offer?.event_description || "—"}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-medium mt-0.5">
                        {BRL(offer?.offer_value)} {endEvent ? `(Fim: ${endEvent})` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 w-[150px]">
                      <div className="flex flex-col items-start gap-1">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(statusName)}`}
                        >
                          {statusName}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {created.d} {created.h}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 w-[130px]">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-md bg-transparent overflow-hidden shrink-0"
                          title={r.partners?.name}
                        >
                          {r.partners?.logo_url ? (
                            <img
                              src={r.partners.logo_url}
                              className="h-full w-full object-cover"
                              alt={r.partners.name}
                            />
                          ) : (
                            <span className="flex items-center justify-center h-full w-full text-[10px] font-bold uppercase">
                              {r.partners?.name?.slice(0, 3) || "—"}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-medium text-foreground truncate" title={r.partners?.name}>
                          {r.partners?.name || "—"}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* CONTROLES DE PAGINAÇÃO REAL */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border/60 bg-muted/20">
            <div className="text-xs text-muted-foreground font-medium">
              {rows.length === 0 ? "Nenhum resultado" : `${page * PAGE_SIZE + 1} a ${page * PAGE_SIZE + rows.length}`}
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const prev = Math.max(0, page - 1);
                  setPage(prev);
                  load(prev);
                }}
                disabled={page === 0 || loading}
                className="h-8 text-xs rounded-lg"
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const next = Math.min(totalPages - 1, page + 1);
                  setPage(next);
                  load(next);
                }}
                disabled={page >= totalPages - 1 || loading}
                className="h-8 text-xs rounded-lg"
              >
                Próxima
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* PAINEL LATERAL DE DETALHES (SHEET) */}
      <Sheet open={!!activeConsult} onOpenChange={(open) => !open && setActiveConsult(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0 flex flex-col h-full bg-white">
          {activeConsult &&
            (() => {
              const sim = activeConsult;
              const entity = sim.visit_entities || {};
              const offer = sim.visit_offers || {};
              const statusName = getVisitStatus(sim);

              const ed = entity?.entity_details || {};

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
                    <SheetHeader className="space-y-3 text-left">
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
                        {detailLoading && (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
                            <Loader2 className="h-3 w-3 animate-spin text-primary" /> Carregando detalhes...
                          </div>
                        )}
                      </div>

                      <div className="space-y-1 pr-8 text-left w-full">
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

                        <SheetTitle className="text-lg sm:text-xl font-bold text-slate-900 break-words text-left w-full">
                          {entity?.name || "Lead sem nome"}
                        </SheetTitle>
                      </div>
                    </SheetHeader>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <PanelVisit visitData={sim} />
                    <PanelEntity entity={entity} entityDetails={ed} />
                    
                    {/* DESTAQUE: A oferta que o vendedor clicou na tabela */}
                    <PanelOffer offer={offer} />
                    <PanelSeller offer={offer} />

                    {/* ✨ NOVO: HISTÓRICO DE INTERESSES (Outras consultas no mesmo carrinho) */}
                    {sim.other_offers && sim.other_offers.length > 0 && (
                      <div className="mt-8 space-y-4 pt-4 border-t border-slate-200">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">
                          Outras consultas nesta sessão ({sim.other_offers.length})
                        </h3>
                        {sim.other_offers.map((off: any, idx: number) => (
                          <div key={idx} className="relative pl-4 border-l-2 border-[#B300FF]/20 space-y-4 opacity-70 hover:opacity-100 transition-opacity pb-4">
                            <div className="absolute -left-[5px] top-0 h-2 w-2 rounded-full bg-[#B300FF]/40" />
                            <div className="text-[10px] font-bold text-[#B300FF] uppercase">
                              {formatDate(off.created_at).d} às {formatDate(off.created_at).h}
                            </div>
                            <PanelOffer offer={off} />
                            <PanelSeller offer={off} />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* RESTANTE DO CÓDIGO (Consents, Configs, FAQs, Footer) MANTIDO INTACTO */}
                    {sim.visit_consents && sim.visit_consents.length > 0 && (
                      <PanelAcceptedConsents consents={sim.visit_consents} />
                    )}

                    {pageConfigs && Object.keys(pageConfigs).length > 0 && <PanelProduct config={pageConfigs} />}

                    {consentConfigs && consentConfigs.length > 0 && <PanelConsents configs={consentConfigs} />}

                    {pageFaqs && pageFaqs.length > 0 && <PanelFAQ faqs={pageFaqs} isPrint={false} />}

                    {pageConfigs?.footer && (
                      <div className="pt-2">
                        <PanelFooter footer={pageConfigs.footer} />
                      </div>
                    )}
                  </div>

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

      {/* SHEET DE FILTROS MOBILE */}
      <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto p-6 bg-white">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="text-lg font-bold">Filtros</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 w-full">
            {/* Parceiro Mobile */}
            <div className="w-full">
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Parceiro</span>
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 w-full rounded-xl gap-2 bg-white border-slate-200 text-slate-600 justify-between"
                  >
                    <span className="truncate">
                      Parceiro: {selectedPartners.length === 0 ? "Todos" : `${selectedPartners.length} sel.`}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="start">
                  <Command>
                    <CommandList 
                      className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y" 
                      style={{ WebkitOverflowScrolling: 'touch' }}
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        <CommandItem onSelect={() => setSelectedPartners([])} className="cursor-pointer">
                          <div
                            className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${selectedPartners.length === 0 ? "bg-primary text-primary-foreground" : "opacity-50"}`}
                          >
                            {selectedPartners.length === 0 && "✓"}
                          </div>
                          Todos Parceiros
                        </CommandItem>
                        {partnersList.map((p) => {
                          const isSelected = selectedPartners.includes(String(p.id));
                          return (
                            <CommandItem
                              key={p.id}
                              onSelect={() => {
                                if (isSelected)
                                  setSelectedPartners(selectedPartners.filter((id) => id !== String(p.id)));
                                else setSelectedPartners([...selectedPartners, String(p.id)]);
                              }}
                              className={`cursor-pointer ${isSelected ? "bg-primary/10 text-primary font-medium" : ""}`}
                            >
                              <div
                                className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? "bg-primary text-primary-foreground" : "opacity-50"}`}
                              >
                                {isSelected && "✓"}
                              </div>
                              {p.name}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Produto Mobile */}
            <div className="w-full">
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Produto</span>
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 w-full rounded-xl gap-2 bg-white border-slate-200 text-slate-600 justify-between"
                  >
                    <span className="truncate">
                      Produto: {selectedProducts.length === 0 ? "Todos" : `${selectedProducts.length} sel.`}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="start">
                  <Command>
                    <CommandList 
                      className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y" 
                      style={{ WebkitOverflowScrolling: 'touch' }}
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        <CommandItem onSelect={() => setSelectedProducts([])} className="cursor-pointer">
                          <div
                            className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${selectedProducts.length === 0 ? "bg-primary text-primary-foreground" : "opacity-50"}`}
                          >
                            {selectedProducts.length === 0 && "✓"}
                          </div>
                          Todos Produtos
                        </CommandItem>
                        {productsList.map((p) => {
                          const isSelected = selectedProducts.includes(String(p.id));
                          return (
                            <CommandItem
                              key={p.id}
                              onSelect={() => {
                                if (isSelected)
                                  setSelectedProducts(selectedProducts.filter((id) => id !== String(p.id)));
                                else setSelectedProducts([...selectedProducts, String(p.id)]);
                              }}
                              className={`cursor-pointer ${isSelected ? "bg-primary/10 text-primary font-medium" : ""}`}
                            >
                              <div
                                className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? "bg-primary text-primary-foreground" : "opacity-50"}`}
                              >
                                {isSelected && "✓"}
                              </div>
                              {p.name}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Situação Mobile */}
            <div className="w-full">
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Situação</span>
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 w-full rounded-xl gap-2 bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8] justify-between"
                  >
                    <span className="truncate">
                      Situação:{" "}
                      {selectedStatus.length === 0
                        ? "Todos"
                        : selectedStatus.includes("Qualificadas") && selectedStatus.length === 1
                          ? "Qualificadas"
                          : `${selectedStatus.length} sel.`}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-72 bg-[#fdf2f8] border-[#fbcfe8] z-50" align="start">
                  <Command className="bg-transparent">
                    <CommandList 
                      className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y" 
                      style={{ WebkitOverflowScrolling: 'touch' }}
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => handleSelectStatus("Todas")}
                          className="cursor-pointer text-[#d946ef]"
                        >
                          <div
                            className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${selectedStatus.length === 0 ? "bg-[#d946ef] text-white" : "opacity-50"}`}
                          >
                            {selectedStatus.length === 0 && "✓"}
                          </div>
                          Todas
                        </CommandItem>

                        {statusOptions
                          .filter((s) => s !== "Qualificadas")
                          .map((s) => {
                            const isSelected = selectedStatus.includes(s);
                            return (
                              <CommandItem
                                key={s}
                                onSelect={() => handleSelectStatus(s)}
                                className={`cursor-pointer text-[#d946ef] ${isSelected ? "bg-[#d946ef]/10 font-medium" : ""}`}
                              >
                                <div
                                  className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${isSelected ? "bg-[#d946ef] text-white" : "opacity-50"}`}
                                >
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
            </div>

            {/* Período Mobile */}
            <div className="w-full">
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Período</span>
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-11 w-full rounded-xl gap-2 bg-white border-slate-200 text-slate-600 justify-between"
                  >
                    <span className="truncate">
                      Período:{" "}
                      {dateRange === "custom"
                        ? "Personalizado"
                        : dateRange === "30"
                          ? "30 dias"
                          : dateRange === "90"
                            ? "90 dias"
                            : "Tudo"}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-auto" align="start">
                  <Command>
                    <CommandList 
                      className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y" 
                      style={{ WebkitOverflowScrolling: 'touch' }}
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        <CommandItem onSelect={() => dateRange !== "30" && setDateRange("30")}>
                          Últimos 30 dias
                        </CommandItem>
                        <CommandItem onSelect={() => dateRange !== "90" && setDateRange("90")}>
                          Últimos 90 dias
                        </CommandItem>
                        <CommandItem onSelect={() => dateRange !== "all" && setDateRange("all")}>
                          Todo o período
                        </CommandItem>
                      </CommandGroup>
                      <div className="p-2 border-t">
                        <p className="text-xs font-semibold px-2 mb-2 text-muted-foreground">Personalizado:</p>
                        <Calendar
                          mode="range"
                          selected={customRange}
                          onSelect={(range) => {
                            setCustomRange(range);
                            setDateRange("custom");
                          }}
                          numberOfMonths={1}
                        />
                      </div>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <Button
              onClick={() => setMobileFilterOpen(false)}
              className="w-full h-11 rounded-xl bg-[#B300FF] hover:bg-[#9f00e6] text-white font-semibold mt-2"
            >
              Aplicar Filtros
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* BLOCO DE REFERÊNCIA PARA IMPRESSÃO */}
      <div style={{ display: "none" }}>
        <div ref={printRef} className="w-full text-slate-900 bg-white p-8">
          {activeConsult &&
            (() => {
              const sim = activeConsult;
              const created = formatDate(sim.created_at);
              const entity = sim.visit_entities || {};
              const offer = sim.visit_offers || {};
              const statusName = getVisitStatus(sim);

              const ed = entity?.entity_details || {};

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
                      Data: {created.d} às {created.h}
                    </div>
                  </div>

                  <PanelVisit visitData={sim} />
                  <PanelEntity entity={entity} entityDetails={ed} />
                  <PanelOffer offer={offer} />
                  <PanelSeller offer={offer} />

                  {sim.visit_consents && sim.visit_consents.length > 0 && (
                    <PanelAcceptedConsents consents={sim.visit_consents} />
                  )}

                  {pageConfigs && Object.keys(pageConfigs).length > 0 && <PanelProduct config={pageConfigs} />}

                  {consentConfigs && consentConfigs.length > 0 && <PanelConsents configs={consentConfigs} />}

                  {pageFaqs && pageFaqs.length > 0 && <PanelFAQ faqs={pageFaqs} isPrint={true} />}

                  {pageConfigs?.footer && (
                    <div className="pt-2 break-inside-avoid">
                      <PanelFooter footer={pageConfigs.footer} />
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