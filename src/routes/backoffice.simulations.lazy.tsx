/**
 * @fileoverview Monitor de Simulações (Backoffice Otimizado)
 * @path src/routes/backoffice/simulations.lazy.tsx
 *
 * ============================================================================
 * [ARQUITETURA, CLEAN ARCHITECTURE & PERFORMANCE]
 * ============================================================================
 * Monitoramento operacional de alta performance. Utiliza payload enxuto na listagem
 * principal, paginação/limite server-side e carregamento sob demanda de metadados
 * pesados no Sheet de detalhes.
 * ============================================================================
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { RefreshCw, Search, Filter, Download, ChevronDown, Camera, Printer, Loader2 } from "lucide-react";
import { DateRange } from "react-day-picker";
import { useAuth } from "@/integrations/auth/AuthContext";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";

// Fábrica de Painéis (Shared Renderers)
import { PanelProduct } from "@/features/financial-hub/components/shared/renderes/PanelProduct";
import { PanelOffer } from "@/features/financial-hub/components/shared/renderes/PanelOffer";
import { PanelSeller } from "@/features/financial-hub/components/shared/renderes/PanelSeller";
import { PanelEntity } from "@/features/financial-hub/components/shared/renderes/PanelEntity";
import { PanelAcceptedConsents } from "@/features/financial-hub/components/shared/renderes/PanelAcceptedConsents";
import { PanelConsents } from "@/features/financial-hub/components/shared/renderes/PanelConsents";
import { PanelFooter } from "@/features/financial-hub/components/shared/renderes/PanelFooter";
import { PanelSimulation } from "@/features/financial-hub/components/shared/renderes/PanelSimulation";
import { PanelVisit } from "@/features/financial-hub/components/shared/renderes/PanelVisit";
import { PanelFAQ } from "@/features/financial-hub/components/shared/renderes/PanelFAQ";

import { supabase } from "@/integrations/supabase/client";

export const Route = createLazyFileRoute("/backoffice/simulations")({
  component: SimulationsPage,
});

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

function SimulationsPage() {
  const { backofficeUser } = useAuth();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<"30" | "90" | "all" | "custom">("30");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();

  const [partnersList, setPartnersList] = useState<any[]>([]);
  const [productsList, setProductsList] = useState<any[]>([]);
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const [activeSimulation, setActiveSimulation] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const [stats, setStats] = useState({
    total: 0,
    em_simulacao: 0,
    em_analise: 0,
    aprovadas: 0,
    volume_aprovado: 0,
  });

  useEffect(() => {
    async function loadDropdowns() {
      if (!backofficeUser) return;

      // 1. Carrega Parceiros e aplica o escopo RBAC se for viewer
      const { data: pData } = await supabase.from("partners").select("id, name").eq("is_active", true).order("name");
      if (pData) {
        if (backofficeUser.role === "viewer") {
          const allowedPartners = backofficeUser.allowed_partners || [];
          if (allowedPartners.includes("*")) {
            setPartnersList(pData);
          } else {
            const filteredPartners = pData.filter((p) => allowedPartners.includes(String(p.id)));
            setPartnersList(filteredPartners);
          }
        } else {
          setPartnersList(pData);
        }
      }

      // 2. Carrega Produtos e aplica o escopo RBAC se for viewer
      const { data: prData } = await supabase.from("product_types").select("id, name").order("name");
      if (prData) {
        if (backofficeUser.role === "viewer") {
          const allowedProducts = backofficeUser.allowed_products || [];
          if (allowedProducts.includes("*")) {
            setProductsList(prData);
          } else {
            const filteredProducts = prData.filter((pr) => allowedProducts.includes(String(pr.id)));
            setProductsList(filteredProducts);
          }
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

  // 2. Quando o usuário digita na busca ou muda um filtro, voltamos para a página 0
  useEffect(() => {
    // Só dispara a busca se o usuário já estiver carregado no contexto!
    if (!backofficeUser) return;

    const timeoutId = setTimeout(() => {
      setPage(0);
      load(0);
      loadStats();
    }, 400);
    return () => clearTimeout(timeoutId);
  }, [search, selectedPartners, selectedProducts, dateRange, customRange]);

  // 3. Função que faz a Paginação Real
  async function load(targetPage: number) {
    setLoading(true);
    try {
      const from = targetPage * PAGE_SIZE;
      // Buscamos PAGE_SIZE + 1 para validar se há próxima página sem COUNT(*)
      const to = from + PAGE_SIZE;

      let query = supabase.from("simulations").select(`
          id, created_at, updated_at, name, document, phone, email,
          financed_amount, installment_value, installments, down_payment_percentage,
          partner_id, product_id, status_id, stage_id,
          partners(id, name, logo_url),
          product_types(id, name),
          stage_types(id, name),
          status_types(id, name),
          financial_institutions(id, name, logo_url),
          simulation_offers(offer_description, offer_value, event_id, event_description, event_end_date)
        `);

      // ============================================================================
      // RESTRIÇÕES DE ESCOPO POR USUÁRIO (RBAC - Viewer)
      // ============================================================================
      if (backofficeUser && backofficeUser.role === "viewer") {
        const allowedPartners = backofficeUser.allowed_partners || [];
        const allowedProducts = backofficeUser.allowed_products || [];

        // 1. Validação de Parceiros Permitidos
        if (!allowedPartners.includes("*")) {
          if (allowedPartners.length === 0) {
            setRows([]);
            setTotalPages(0);
            setLoading(false);
            return;
          }
          const partnerQueryIds = allowedPartners.map((id: string) => (isNaN(Number(id)) ? id : Number(id)));
          query = query.in("partner_id", partnerQueryIds);
        }

        // 2. Validação de Produtos Permitidos
        if (!allowedProducts.includes("*")) {
          if (allowedProducts.length === 0) {
            setRows([]);
            setTotalPages(0);
            setLoading(false);
            return;
          }
          const productQueryIds = allowedProducts.map((id: string) => (isNaN(Number(id)) ? id : Number(id)));
          query = query.in("product_id", productQueryIds);
        }
      }
      // ============================================================================

      // Filtros do Servidor
      if (search.trim()) {
        const docSearch = search.replace(/\D/g, "");
        if (docSearch) query = query.ilike("document", `%${docSearch}%`);
        else query = query.ilike("name", `%${search}%`);
      }
      if (selectedPartners.length > 0) query = query.in("partner_id", selectedPartners);
      if (selectedProducts.length > 0) query = query.in("product_id", selectedProducts);

      query = query.order("created_at", { ascending: false }).range(from, to);

      const [{ data: simData, error: simError }, { data: statusData }] = await Promise.all([
        query,
        supabase.from("status_types").select("name"),
      ]);

      if (simError) {
        throw simError;
      }

      if (!simData || simData.length === 0) {
        setRows([]);
        setTotalPages(targetPage + 1);
        return;
      }

      // Validação de existência de próxima página de forma puramente lógica
      const hasMore = simData.length > PAGE_SIZE;
      const slicedData = hasMore ? simData.slice(0, PAGE_SIZE) : simData;

      setRows(slicedData);
      setTotalPages(hasMore ? targetPage + 2 : targetPage + 1);

      if (statusData) setStatusOptions(statusData.map((s) => s.name));
    } catch (err: any) {
      toast.error(`Erro ao carregar simulações: ${err.message || "Erro desconhecido"}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    const { p_from, p_to } = getPeriodDates(dateRange, customRange);

    const { data, error } = await supabase.rpc("simulation_stats", {
      p_from,
      p_to,
      p_partner_ids: selectedPartners.length > 0 ? selectedPartners.map(Number) : null,
      p_product_ids: selectedProducts.length > 0 ? selectedProducts.map(Number) : null,
      p_search: search.trim() || null,
      p_status: selectedStatus.length > 0 ? selectedStatus : null,
    });

    if (error) {
      console.error("Erro ao carregar estatísticas de simulações:", error);
      return;
    }

    const s = data?.[0] ?? { total: 0, em_simulacao: 0, em_analise: 0, aprovadas: 0, volume_aprovado: 0 };
    setStats(s);
    setTotalPages(Math.ceil(Number(s.total) / PAGE_SIZE));
  }

  // 4. O filtro de Situação local continua o mesmo
  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const statusName = r.status_types?.name ?? "—";
      return selectedStatus.length === 0 || selectedStatus.includes(statusName);
    });
  }, [rows, selectedStatus]);

  /**
   * Carrega os dados pesados sob demanda ao selecionar uma simulação para o Sheet.
   */
  async function handleSelectSimulation(row: any) {
    setDetailLoading(true);
    // Abre imediatamente com os dados rasos da grid
    setActiveSimulation(row);

    try {
      const { data: fullData, error } = await supabase
        .from("simulations")
        .select(
          [
            "id",
            "created_at",
            "updated_at",
            "name",
            "document",
            "phone",
            "email",
            "financed_amount",
            "installment_value",
            "installments",
            "down_payment_percentage",
            "raw_payload",
            "entity_details",
            "birth_date",
            "gender",
            "entity_type",
            "requested_value",
            "cet_rate",
            "simulation_details",

            "partners(id, name, logo_url)",
            "product_types(id, name)",
            "stage_types(id, name)",
            "status_types(id, name)",
            "financial_institutions(id, name, logo_url)",
            "result_partner_types(id, description)",

            /* Payload estruturado para Organizador, Vendedor e Oferta (PanelOffer / PanelSeller) */
            "simulation_offers(id, simulation_id, manager_name, seller_id, legal_name, trade_name, event_id, event_description, event_end_date, event_start_date, offer_id, offer_description, offer_value, category_id, subcategory_id, subcategory, offer_details, event_details, manager_details, category_types(id, name))",

            /* Payload para Termos e Auditoria LGPD (PanelAcceptedConsents) */
            "simulation_consents(id, consent_id, accepted, accepted_at, created_at, ip_address, country, state, city, operating_system, device_type, origin_details, page_snapshot)",

            /* Payload para Histórico de Ações da Simulação */
            "simulation_updates(id, operation, created_at, ip_address, country, state, city, user_agent, device_type, operating_system, origin_details)",

            /* Payload para Múltiplas Opções de Parcelamento e Taxas (PanelSimulation) */
            "simulation_consults(id, installments, installment_value, cet_rate, created_at, financial_institution_id)",

            /* Payload para Rastreamento de Origem, UTMs e Localização (PanelVisit) */
            "visits(id, created_at, utm_source, utm_campaign, country, state, city, ip_address, operating_system, device_type, origin_url, target_url)",
          ].join(","),
        )
        .eq("id", row.id)
        .single();

      if (error) {
        console.error("ERRO FATAL DO SUPABASE:", error.message, error.details, error.hint);
        toast.error(`Erro do Banco: ${error.message}`);
        return;
      }

      if (fullData) {
        setActiveSimulation(fullData);
      }
    } catch (err) {
      console.error("Erro inesperado:", err);
    } finally {
      setDetailLoading(false);
    }
  }

  const totals = useMemo(() => {
    const t = { total: rows.length, simulacao: 0, analise: 0, aprovada: 0, volume: 0 };
    rows.forEach((r) => {
      const s = (r.status_types?.name ?? "").toLowerCase();
      if (s.includes("simul")) t.simulacao++;
      else if (s.includes("anal")) t.analise++;
      else if (s.includes("aprov")) {
        t.aprovada++;
        t.volume += r.financed_amount ?? 0;
      }
    });
    return t;
  }, [rows]);

  /**
   * Exportação Excel com importação dinâmica sob demanda.
   */
  const handleExportExcel = async () => {
    if (!filtered || filtered.length === 0) {
      toast.error("Não há dados na tela para exportar.");
      return;
    }

    const XLSX = await import("xlsx");

    const dataToExport = filtered.map((sim) => {
      const bank = sim.financial_institutions;
      const created = formatDate(sim.created_at);
      const rawOffer = sim.simulation_offers;
      const baseOffer = Array.isArray(rawOffer) ? rawOffer[0] || {} : rawOffer || {};
      const offerRow = {
        ...baseOffer,
        category_types: Array.isArray(baseOffer.category_types)
          ? baseOffer.category_types[0] || null
          : baseOffer.category_types,
      };
      const eventoFull = offerRow?.event_description
        ? `[${offerRow?.event_id || "—"}] ${offerRow?.event_description}`
        : "—";

      return {
        ID: sim.id,
        Data: `${created.d} ${created.h}`,
        Cliente: sim.name || "—",
        Documento: sim.document || "—",
        Telefone: sim.phone || "—",
        "E-mail": sim.email || "—",
        Estágio: sim.stage_types?.name || "—",
        Produto: sim.product_types?.name || "—",
        Status: sim.status_types?.name || "—",
        "Parceiro Origem": sim.partners?.name || "—",
        "Banco Destino": bank?.name || "—",
        "Valor Financiado": sim.financed_amount || 0,
        "Valor Parcela": sim.installment_value || 0,
        "Qtd Parcelas": sim.installments || 0,
        "Descrição da Oferta": offerRow?.offer_description || "—",
        "Oferta ID": offerRow?.offer_id || "—",
        "Valor da Oferta": offerRow?.offer_value || 0,
        Evento: eventoFull,
        Organizador: offerRow?.manager_name || "—",
        "Vendedor (Razão Social)": offerRow?.legal_name || "—",
        "Seller ID": offerRow?.seller_id || "—",
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const colWidths = Object.keys(dataToExport[0] || {}).map((key) => {
      const maxLength = Math.max(
        key.length,
        ...dataToExport.map((row) => String(row[key as keyof typeof row] ?? "").length),
      );
      return { wch: maxLength + 2 };
    });
    worksheet["!cols"] = colWidths;

    if (worksheet["!ref"] && dataToExport.length > 0) {
      const range = XLSX.utils.decode_range(worksheet["!ref"]);
      worksheet["!autofilter"] = { ref: XLSX.utils.encode_range(range) };
    }

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Simulações");
    const today = new Date().toISOString().split("T")[0];
    XLSX.writeFile(workbook, `Monitor_Simulacoes_${today}.xlsx`);
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
      {/* HEADER DA TELA */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monitor de Simulações</h1>
          <p className="text-sm text-muted-foreground">Acompanhe simulações, análises e aprovações em tempo real.</p>
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

      {/* BLOCO DE KPIS */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {[
          { label: "Propostas (filtro)", value: Number(stats.total).toLocaleString("pt-BR"), highlight: false },
          { label: "Em simulação", value: Number(stats.em_simulacao).toLocaleString("pt-BR"), highlight: false },
          { label: "Em análise", value: Number(stats.em_analise).toLocaleString("pt-BR"), highlight: false },
          { label: "Aprovadas", value: Number(stats.aprovadas).toLocaleString("pt-BR"), highlight: false },
          { label: "Volume aprovado", value: BRL(Number(stats.volume_aprovado)), highlight: true },
        ].map((t, index) => (
          <div
            key={t.label}
            className={`rounded-2xl border p-5 ${index === 4 ? "lg:col-span-2" : ""} ${t.highlight ? "bg-[#fdf2f8] border-[#fbcfe8] text-[#d946ef]" : "border-border bg-card text-card-foreground"}`}
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

      {/* MÓDULO DE FILTROS & GRID DE PROPOSTAS */}
      <div className="rounded-2xl border border-border bg-card flex flex-col">
        <div className="flex flex-col gap-3 border-b border-border p-4">
          {/* Botão de Filtros exclusivo para Mobile (Fica em cima) */}
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
            {/* Input de Busca (Fica embaixo do botão mobile) */}
            <div className="relative w-full lg:flex-1 lg:max-w-md">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar nome ou CPF/CNPJ..."
                className="h-11 w-full rounded-full bg-slate-100/70 border-transparent pl-5 pr-12 text-[13px] text-slate-700 placeholder:text-slate-500 focus-visible:ring-primary/20 focus-visible:bg-white focus-visible:border-primary/30 transition-all shadow-none"
              />
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-[#B300FF]" />
            </div>

            {/* Filtros originais para Desktop */}
            <div className="hidden lg:flex lg:items-center lg:gap-2 lg:ml-auto">
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
                      style={{ WebkitOverflowScrolling: "touch" }}
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
                      style={{ WebkitOverflowScrolling: "touch" }}
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
                        Situação: {selectedStatus.length === 0 ? "Todos" : `${selectedStatus.length} sel.`}
                      </span>
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-56 bg-[#fdf2f8] border-[#fbcfe8] z-50" align="start">
                  <Command className="bg-transparent">
                    <CommandList
                      className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y"
                      style={{ WebkitOverflowScrolling: "touch" }}
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => setSelectedStatus([])}
                          className="cursor-pointer text-[#d946ef] hover:bg-[#fce7f3] aria-selected:bg-[#fce7f3]"
                        >
                          <div
                            className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${selectedStatus.length === 0 ? "bg-[#d946ef] text-white" : "opacity-50"}`}
                          >
                            {selectedStatus.length === 0 && "✓"}
                          </div>
                          Todos
                        </CommandItem>
                        {statusOptions.map((s) => {
                          const isSelected = selectedStatus.includes(s);
                          return (
                            <CommandItem
                              key={s}
                              onSelect={() => {
                                if (isSelected) setSelectedStatus(selectedStatus.filter((item) => item !== s));
                                else setSelectedStatus([...selectedStatus, s]);
                              }}
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
                      style={{ WebkitOverflowScrolling: "touch" }}
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

        {/* TABELA DE DADOS */}
        <div className="overflow-x-auto w-full pb-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                <th className="px-3 py-2.5 w-[75px]">Data</th>
                <th className="px-3 py-2.5 w-[140px]">Cliente</th>
                <th className="px-3 py-2.5 w-[140px]">Estágio/Produto</th>
                <th className="px-3 py-2.5 w-[190px]">Oferta</th>
                <th className="px-3 py-2.5 w-[130px] text-right">Financiado</th>
                <th className="px-3 py-2.5 w-[150px]">Situação</th>
                <th className="px-3 py-2.5 w-[130px]">Parceiro / Banco</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const created = formatDate(r.created_at);
                const updated = formatDate(r.updated_at);
                const statusName = r.status_types?.name ?? "—";
                const stageName = r.stage_types?.name ?? "—";
                const productName = r.product_types?.name ?? "—";
                const parcela =
                  r.installments && r.installment_value ? `${r.installments}x ${BRL(r.installment_value)}` : "—";
                const offer = Array.isArray(r.simulation_offers)
                  ? r.simulation_offers[0] || {}
                  : r.simulation_offers || {};
                const endEvent = offer?.event_end_date
                  ? new Date(offer.event_end_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                  : "";

                const bank = r.financial_institutions;
                const rawDoc = r.document?.replace(/\D/g, "") || "";
                const doc =
                  rawDoc.length === 14
                    ? rawDoc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
                    : rawDoc.length === 11
                      ? rawDoc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
                      : r.document || "—";
                const phone = r.phone?.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3") ?? "";

                return (
                  <tr
                    key={r.id}
                    onClick={() => handleSelectSimulation(r)}
                    className="border-b border-border/60 hover:bg-accent/40 cursor-pointer transition-colors"
                  >
                    <td className="px-3 py-2.5 w-[75px]">
                      <div className="font-semibold text-foreground">{created.d}</div>
                      <div className="text-[11px] text-muted-foreground">{created.h}</div>
                    </td>
                    <td className="px-3 py-2.5 w-[140px]">
                      <div className="font-semibold text-[#d946ef] truncate" title={r.name}>
                        {r.name || "—"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{doc}</div>
                      <div className="text-[11px] text-muted-foreground">{phone || "—"}</div>
                    </td>
                    <td className="px-3 py-2.5 w-[140px]">
                      <div className="font-semibold text-foreground">{stageName}</div>
                      <div className="text-[11px] text-muted-foreground">{productName}</div>
                      <div className="text-[10px] font-bold text-muted-foreground mt-0.5 uppercase tracking-tighter">
                        {r.partners?.name || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 max-w-[190px] sm:max-w-[220px]">
                      <div className="font-semibold text-foreground truncate">{offer?.offer_description || "—"}</div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {offer?.event_id || "—"} - {offer?.event_description || "—"}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-medium mt-0.5">
                        {BRL(offer?.offer_value)} {endEvent ? `(Fim: ${endEvent})` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 w-[130px] text-right">
                      <div className="font-semibold text-foreground">{BRL(r.financed_amount)}</div>
                      <div className="text-[10px] text-muted-foreground">
                        {r.down_payment_percentage === 0
                          ? "Sem entrada"
                          : r.down_payment_percentage != null
                            ? `Entrada: ${r.down_payment_percentage.toFixed(0)}%`
                            : "—"}
                      </div>
                      <div className="text-[10px] font-medium text-muted-foreground">{parcela}</div>
                    </td>
                    <td className="px-3 py-2.5 w-[150px]">
                      <div className="flex flex-col items-start gap-1">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(statusName)}`}
                        >
                          {statusName}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          {updated.d} {updated.h}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 w-[130px]">
                      <div className="flex items-center gap-1.5">
                        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-transparent overflow-hidden">
                          {r.partners?.logo_url ? (
                            <img
                              src={r.partners.logo_url}
                              className="h-full w-full object-cover"
                              alt={r.partners.name}
                            />
                          ) : (
                            <span className="flex items-center justify-center h-full w-full text-[10px] font-bold uppercase">
                              {r.partners?.name?.slice(0, 3)}
                            </span>
                          )}
                        </div>
                        {bank && (
                          <>
                            <span className="text-muted-foreground/20 text-xs">/</span>
                            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-transparent overflow-hidden">
                              {bank?.logo_url ? (
                                <img src={bank.logo_url} className="h-full w-full object-cover" alt={bank?.name} />
                              ) : (
                                <Camera className="h-4 w-4 text-muted-foreground/50" />
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {/* === PAGINAÇÃO === */}
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
        {/* ============================ */}
      </div>

      {/* SHEET LATERAL DE DETALHES */}
      <Sheet open={!!activeSimulation} onOpenChange={(open) => !open && setActiveSimulation(null)}>
        <SheetContent className="w-full sm:max-w-xl flex flex-col h-full p-0 overflow-hidden bg-white">
          {activeSimulation &&
            (() => {
              const sim = activeSimulation;
              const rawOffer = sim.simulation_offers;
              const baseOffer = Array.isArray(rawOffer) ? rawOffer[0] || {} : rawOffer || {};
              const offerRow = {
                ...baseOffer,
                category_types: Array.isArray(baseOffer.category_types)
                  ? baseOffer.category_types[0] || null
                  : baseOffer.category_types,
              };
              const bank = sim.financial_institutions || {};
              const ed = sim.entity_details || {};
              const firstUpdate = sim.simulation_updates || {};

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
                            {sim.product_types?.name || "Financiamento"}
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${statusClass(sim.status_types?.name)}`}
                            >
                              {sim.status_types?.name || "Pendente"}
                            </span>
                          </div>
                        </div>
                        <SheetTitle className="text-lg sm:text-xl font-bold text-slate-900 break-words text-left w-full">
                          {sim.name || "—"}
                        </SheetTitle>
                      </div>
                    </SheetHeader>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <PanelVisit visitData={sim} updateData={firstUpdate} />
                    <PanelEntity entity={sim} entityDetails={ed} />
                    <PanelOffer offer={offerRow} />
                    <PanelSeller offer={offerRow} />
                    <PanelAcceptedConsents consents={sim.simulation_consents} />
                    <PanelSimulation simulation={sim} bank={bank} />
                    <PanelProduct config={pageConfigs} />
                    <PanelConsents configs={consentConfigs} />
                    <PanelFAQ faqs={pageFaqs} />
                    <PanelFooter footer={pageConfigs.footer} />
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
                      onClick={() => setActiveSimulation(null)}
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
            {/* PARCEIRO MOBILE */}
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
                      style={{ WebkitOverflowScrolling: "touch" }}
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

            {/* PRODUTO MOBILE */}
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
                      style={{ WebkitOverflowScrolling: "touch" }}
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

            {/* SITUAÇÃO MOBILE */}
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
                      Situação: {selectedStatus.length === 0 ? "Todos" : `${selectedStatus.length} sel.`}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-72 bg-[#fdf2f8] border-[#fbcfe8] z-50" align="start">
                  <Command className="bg-transparent">
                    <CommandList
                      className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y"
                      style={{ WebkitOverflowScrolling: "touch" }}
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        <CommandItem onSelect={() => setSelectedStatus([])} className="cursor-pointer text-[#d946ef]">
                          <div
                            className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${selectedStatus.length === 0 ? "bg-[#d946ef] text-white" : "opacity-50"}`}
                          >
                            {selectedStatus.length === 0 && "✓"}
                          </div>
                          Todos
                        </CommandItem>
                        {statusOptions.map((s) => {
                          const isSelected = selectedStatus.includes(s);
                          return (
                            <CommandItem
                              key={s}
                              onSelect={() => {
                                if (isSelected) setSelectedStatus(selectedStatus.filter((item) => item !== s));
                                else setSelectedStatus([...selectedStatus, s]);
                              }}
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

            {/* PERÍODO MOBILE */}
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
                      style={{ WebkitOverflowScrolling: "touch" }}
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

      {/* BLOCO DE IMPRESSÃO */}
      <div style={{ display: "none" }}>
        <div ref={printRef} className="w-full text-slate-900 bg-white p-8 space-y-6">
          {activeSimulation &&
            (() => {
              const sim = activeSimulation;
              const rawOffer = sim.simulation_offers;
              const baseOffer = Array.isArray(rawOffer) ? rawOffer[0] || {} : rawOffer || {};
              const offerRow = {
                ...baseOffer,
                category_types: Array.isArray(baseOffer.category_types)
                  ? baseOffer.category_types[0] || null
                  : baseOffer.category_types,
              };
              const ed = sim.entity_details || {};
              const bank = sim.financial_institutions;
              const firstUpdate = sim.simulation_updates || {};

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
                          {sim.product_types?.name || "Financiamento"}
                        </span>
                        <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border bg-slate-50 uppercase`}>
                          {sim.status_types?.name || "Pendente"}
                        </span>
                      </div>
                      <h1 className="text-2xl font-bold">{sim.name || "Cliente sem nome"}</h1>
                    </div>
                  </div>

                  <PanelVisit visitData={sim} updateData={firstUpdate} />
                  <PanelEntity entity={sim} entityDetails={ed} />
                  <PanelOffer offer={offerRow} />
                  <PanelSeller offer={offerRow} />
                  <PanelAcceptedConsents consents={sim.simulation_consents} />
                  <PanelSimulation simulation={sim} bank={bank} />
                  <PanelProduct config={pageConfigs} />
                  <PanelConsents configs={consentConfigs} />
                  <PanelFAQ faqs={pageFaqs} isPrint={true} />
                  <PanelFooter footer={pageConfigs.footer} />
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}
