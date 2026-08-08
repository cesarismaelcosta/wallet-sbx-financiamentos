/**
 * ============================================================================
 * @fileoverview Wallet sbX Financiamentos — Dashboard do Backoffice
 * @route /backoffice
 *
 * @description
 * Esta página atua como o centro nervoso operacional do Backoffice. Ela carrega,
 * processa e renderiza dados consolidados sobre as operações de crédito e
 * interações de topo de funil (visitas) geradas pelo Financial Hub.
 * 
 * Arquitetura otimizada:
 * - Filtros avançados com seleção múltipla (parceiros e produtos).
 * - Scroll robusto em popovers (evita conflito com o scroll da página).
 * - Responsividade mobile total via Sheet com seletor de período e calendário.
 * - Lazy Loading dos gráficos via Recharts (retirado do bundle inicial).
 * ============================================================================
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState, lazy, Suspense } from "react";
import { DateRange } from "react-day-picker";

// Ícones UI
import {
  ArrowUpRight,
  CircleDollarSign,
  ClipboardList,
  Loader2,
  TrendingUp,
  Users,
  Calendar as CalendarIcon,
  ChevronDown,
  MousePointerClick,
  Activity,
  Filter,
  Funnel,
  Briefcase,
} from "lucide-react";

// Componentes da Interface (Design System)
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

// Conexão com Banco de Dados
import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// LAZY LOADING DOS GRÁFICOS (FORA DO BUNDLE INICIAL)
// ============================================================================
const ChartsSimulationModule = lazy(() => import("@/features/financial-hub/components/shared/renderes/ChartsSimulation"));
const ChartsTrafficModule = lazy(() => import("@/features/financial-hub/components/shared/renderes/ChartsTraffic"));

export const Route = createLazyFileRoute("/backoffice/")({
  component: DashboardPage,
});

// ============================================================================
// HELPERS E UTILITÁRIOS
// ============================================================================

/**
 * Formata valores numéricos brutos para o padrão monetário brasileiro (Real).
 */
const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/**
 * Formata frações decimais em percentuais.
 */
const PERCENT = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(
    n / 100,
  );

/**
 * Normaliza um objeto Date para o primeiro milissegundo do dia (00:00:00.000).
 */
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// ============================================================================
// DEFINIÇÃO DE TIPAGENS (TYPES)
// ============================================================================

type SimKpis = {
  today: number;
  week: number;
  month: number;
  monthVolume: number;
  ticket: number;
  uniqueClients: number;
  byStatus: Array<{ name: string; count: number; volume: number }>;
  byProduct: Array<{ name: string; count: number; volume: number }>;
  byPartner: Array<{ name: string; count: number; volume: number }>;
  byDay: Array<{ day: string; count: number }>;
};

type VisitKpis = {
  total: number;
  unique: number; // Métrica de visitantes únicos
  redirects: number;
  simulates: number;
  contacts: number;
  conversionRate: number;
  bySource: Array<{ name: string; count: number }>;
  byAction: Array<{ name: string; count: number }>;
  byProduct: Array<{ name: string; count: number }>;
  byDay: Array<{ day: string; count: number }>;
};

// Função para buscar apenas o count de contatos
async function getUniqueContactCount(start: Date, end: Date) {
  const { count, error } = await supabase
    .from("visits")
    .select("id, visit_updates!inner(id)", { count: "exact", head: true })
    .eq("visit_updates.action", "CONTACT")
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());

  if (error) {
    console.error("Erro ao contar contatos:", error);
    return 0;
  }
  return count || 0;
}

// Skeleton para exibição enquanto os gráficos carregam via Lazy Load
function ChartsSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="rounded-2xl border bg-card p-5 h-[240px] bg-slate-100/50" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border bg-card p-5 h-[240px] bg-slate-100/50" />
        <div className="rounded-2xl border bg-card p-5 h-[240px] bg-slate-100/50" />
        <div className="rounded-2xl border bg-card p-5 h-[240px] bg-slate-100/50" />
      </div>
    </div>
  );
}

// ===========================================================================
// COMPONENTE PRINCIPAL
// ===========================================================================
function DashboardPage() {
  const [simKpis, setSimKpis] = useState<SimKpis | null>(null);
  const [visitKpis, setVisitKpis] = useState<VisitKpis | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateRange, setDateRange] = useState<"7" | "15" | "30" | "all" | "custom">("30");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const [partnersList, setPartnersList] = useState<Array<{ id: string | number; name: string }>>([]);
  const [productsList, setProductsList] = useState<Array<{ id: string | number; name: string }>>([]);

  useEffect(() => {
    async function loadDropdowns() {
      const { data: pData } = await supabase.from("partners").select("id, name").eq("is_active", true).order("name");
      if (pData) setPartnersList(pData);

      const { data: prData } = await supabase.from("product_types").select("id, name").order("name");
      if (prData) setProductsList(prData);
    }
    loadDropdowns();
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      load();
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [dateRange, customRange, selectedPartners, selectedProducts]);

  async function load() {
    setLoading(true);
    setError(null);

    let currentProducts = productsList;
    if (currentProducts.length === 0) {
      const { data } = await supabase.from("product_types").select("id, name");
      if (data) currentProducts = data;
    }

    // 1) Janela Temporal
    let start = new Date();
    if (dateRange === "custom" && customRange?.from) {
      start = customRange.from;
    } else if (dateRange !== "all") {
      const days = parseInt(dateRange);
      start.setDate(new Date().getDate() - days);
    } else {
      start = new Date(2000, 0, 1);
    }

    let end = new Date();
    if (dateRange === "custom" && customRange?.to) {
      end = customRange.to;
      end.setHours(23, 59, 59, 999);
    }

    // 2) Disparo das Queries
    let querySim = supabase
      .from("simulations")
      .select(
        `id, financed_amount, document, created_at, partner_id, product_id, status_types(name), partners(name), product_types(name)`,
      )
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .limit(5000);

    let queryVis = supabase
      .from("visits")
      .select(
        `
        id, 
        action, 
        utm_source, 
        created_at, 
        partner_id, 
        product_id, 
        ip_address,
        visit_entities ( document )
      `,
      )
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .limit(10000);

    if (selectedPartners.length > 0) {
      querySim = querySim.in("partner_id", selectedPartners);
      queryVis = queryVis.in("partner_id", selectedPartners);
    }

    if (selectedProducts.length > 0) {
      querySim = querySim.in("product_id", selectedProducts);
      queryVis = queryVis.in("product_id", selectedProducts);
    }

    const [resSim, resVis] = await Promise.all([querySim, queryVis]);

    if (resSim.error || resVis.error) {
      setError(resSim.error?.message || resVis.error?.message || "Erro de rede ao buscar métricas.");
      setLoading(false);
      return;
    }

    const simRows = resSim.data ?? [];
    const visRows = resVis.data ?? [];

    const now = new Date();
    const todayStart = startOfDay(now).toISOString();
    const weekStart = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)).toISOString();

    // ========================================================================
    // PROCESSAMENTO DE SIMULAÇÕES
    // ========================================================================
    const simToday = simRows.filter((r) => (r.created_at ?? "") >= todayStart).length;
    const simWeek = simRows.filter((r) => (r.created_at ?? "") >= weekStart).length;
    const simMonth = simRows.length;

    const simMonthVolume = simRows.reduce((acc, r) => acc + (Number(r.financed_amount) || 0), 0);
    const simTicket = simMonth > 0 ? simMonthVolume / simMonth : 0;
    const simUniqueClients = new Set(simRows.map((r) => r.document).filter(Boolean) as string[]).size;

    const statusMap = new Map<string, { count: number; volume: number }>();
    const productMap = new Map<string, { count: number; volume: number }>();
    const partnerMap = new Map<string, { count: number; volume: number }>();

    for (const r of simRows) {
      const amount = Number(r.financed_amount) || 0;

      const statusName = (r.status_types as any)?.name ?? "Indefinido";
      const currentS = statusMap.get(statusName) ?? { count: 0, volume: 0 };
      statusMap.set(statusName, { count: currentS.count + 1, volume: currentS.volume + amount });

      const prodName = (r.product_types as any)?.name ?? "Não Informado";
      const currentProd = productMap.get(prodName) ?? { count: 0, volume: 0 };
      productMap.set(prodName, { count: currentProd.count + 1, volume: currentProd.volume + amount });

      const partName = (r.partners as any)?.name ?? "Venda Direta";
      const currentPart = partnerMap.get(partName) ?? { count: 0, volume: 0 };
      partnerMap.set(partName, { count: currentPart.count + 1, volume: currentPart.volume + amount });
    }

    const byStatus = Array.from(statusMap.entries())
      .map(([name, d]) => ({ name, count: d.count, volume: d.volume }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const byProduct = Array.from(productMap.entries())
      .map(([name, d]) => ({ name, count: d.count, volume: d.volume }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const byPartner = Array.from(partnerMap.entries())
      .map(([name, d]) => ({ name, count: d.count, volume: d.volume }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // ========================================================================
    // PROCESSAMENTO DA LINHA DO TEMPO (SIMULAÇÕES E VISITAS JUNTAS)
    // ========================================================================
    const simDayMap = new Map<string, number>();
    const visDayMap = new Map<string, number>();

    const diffDays = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const maxChartDays = dateRange === "all" ? 30 : Math.min(diffDays, 30);

    for (let i = maxChartDays - 1; i >= 0; i--) {
      const d = startOfDay(new Date(end.getTime() - i * 24 * 60 * 60 * 1000))
        .toISOString()
        .slice(0, 10);
      simDayMap.set(d, 0);
      visDayMap.set(d, 0);
    }

    simRows.forEach((r: any) => {
      if (r.created_at) {
        const key = r.created_at.slice(0, 10);
        if (simDayMap.has(key)) simDayMap.set(key, (simDayMap.get(key) || 0) + 1);
      }
    });

    const simByDay = Array.from(simDayMap.entries()).map(([day, count]) => ({ day, count }));
    setSimKpis({
      today: simToday,
      week: simWeek,
      month: simMonth,
      monthVolume: simMonthVolume,
      ticket: simTicket,
      uniqueClients: simUniqueClients,
      byStatus,
      byProduct,
      byPartner,
      byDay: simByDay,
    });

    // ========================================================================
    // PROCESSAMENTO DE VISITAS E CONTATOS
    // ========================================================================
    const totalVisits = visRows.length;
    const uniqueDocs = new Set(
      visRows
        .map((v: any) => {
          const entity = Array.isArray(v.visit_entities) ? v.visit_entities[0] : v.visit_entities;
          return entity?.document ? String(entity.document).replace(/\D/g, "") : null;
        })
        .filter(Boolean),
    );

    const actionMap = new Map<string, number>();
    const sourceMap = new Map<string, number>();
    const visProductMap = new Map<string, number>();

    visRows.forEach((v: any) => {
      const action = v.action || "Desconhecido";
      actionMap.set(action, (actionMap.get(action) || 0) + 1);

      const source = v.utm_source || "Orgânico";
      sourceMap.set(source, (sourceMap.get(source) || 0) + 1);

      const prodName = currentProducts.find((p) => String(p.id) === String(v.product_id))?.name ?? "Outros";
      visProductMap.set(prodName, (visProductMap.get(prodName) || 0) + 1);

      if (v.created_at) {
        const key = v.created_at.slice(0, 10);
        if (visDayMap.has(key)) visDayMap.set(key, (visDayMap.get(key) || 0) + 1);
      }
    });

    const contactsCount = await getUniqueContactCount(start, end);
    actionMap.set("CONTACT", contactsCount);

    const bySource = Array.from(sourceMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    const byAction = Array.from(actionMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    const visByProduct = Array.from(visProductMap.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
    const visByDay = Array.from(visDayMap.entries()).map(([day, count]) => ({ day, count }));

    setVisitKpis({
      total: totalVisits,
      unique: uniqueDocs.size > 0 ? uniqueDocs.size : totalVisits,
      redirects: actionMap.get("REDIRECT") || 0,
      simulates: actionMap.get("SIMULATE") || 0,
      contacts: contactsCount,
      conversionRate: totalVisits > 0 ? ((actionMap.get("SIMULATE") || 0) / totalVisits) * 100 : 0,
      bySource,
      byAction,
      byProduct: visByProduct,
      byDay: visByDay,
    });

    setLoading(false);
  }

  // -------------------------------------------------------------------------
  // FORMATAÇÃO VISUAL
  // -------------------------------------------------------------------------
  let periodLabel = "";
  if (dateRange === "all") {
    periodLabel = "Todo o período";
  } else if (dateRange === "custom" && customRange?.from) {
    const from = customRange.from.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
    const to = customRange.to
      ? customRange.to.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })
      : "";
    periodLabel = to ? `${from} - ${to}` : `A partir de ${from}`;
  } else {
    periodLabel = `${dateRange} dias`;
  }

  const simCards = simKpis
    ? [
        {
          label: "Simulações",
          subLabel: periodLabel,
          value: simKpis.month.toLocaleString("pt-BR"),
          hint: `${simKpis.today} hoje`,
          icon: ClipboardList,
        },
        {
          label: "Volume simulado",
          subLabel: periodLabel,
          value: BRL(simKpis.monthVolume),
          hint: `${simKpis.month} simulações`,
          icon: CircleDollarSign,
        },
        {
          label: "Ticket médio",
          subLabel: periodLabel,
          value: BRL(simKpis.ticket),
          hint: "valor médio",
          icon: TrendingUp,
        },
        {
          label: "Clientes únicos",
          subLabel: periodLabel,
          value: simKpis.uniqueClients.toLocaleString("pt-BR"),
          hint: "CPFs distintos",
          icon: Users,
        },
      ]
    : [];

  const visitCards = visitKpis
    ? [
        {
          label: "Total de Acessos",
          subLabel: periodLabel,
          value: `${visitKpis.total.toLocaleString("pt-BR")} / ${visitKpis.unique.toLocaleString("pt-BR")}`,
          hint: "visitas registradas / visitantes",
          icon: MousePointerClick,
        },
        {
          label: "Taxa de Início",
          subLabel: periodLabel,
          value: PERCENT(visitKpis.conversionRate),
          hint: "visitas que viraram simulação",
          icon: Activity,
        },
        {
          label: "Redirecionamentos",
          subLabel: periodLabel,
          value: visitKpis.redirects.toLocaleString("pt-BR"),
          hint: "saídas para parceiros",
          icon: ArrowUpRight,
        },
        {
          label: "Simulações Iniciadas",
          subLabel: periodLabel,
          value: visitKpis.simulates.toLocaleString("pt-BR"),
          hint: "cliques no simulador",
          icon: Filter,
        },
      ]
    : [];

  const simDailyData =
    simKpis?.byDay.map((d) => ({
      day: new Date(d.day + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      count: d.count,
    })) ?? [];
  const visDailyData =
    visitKpis?.byDay.map((d) => ({
      day: new Date(d.day + "T00:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      count: d.count,
    })) ?? [];

  // =========================================================================
  // RENDER (JSX)
  // =========================================================================
  return (
    <div className="p-6 space-y-10">
      {/* ===================================================================
          CABEÇALHO E MÓDULO DE FILTROS GLOBAIS
      =================================================================== */}
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
            <p className="text-sm text-muted-foreground">Métricas integradas de acessos e concessão de crédito.</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 bg-muted/30 p-3 rounded-2xl border">
          {/* Botão de Filtros exclusivo para Mobile */}
          <div className="lg:hidden">
            <Button 
              variant="outline" 
              onClick={() => setMobileFilterOpen(true)}
              className="w-full h-11 rounded-xl gap-2 justify-start bg-white border-slate-200 text-slate-700 shadow-sm"
            >
              <Filter className="h-4 w-4 text-[#B300FF]" /> Filtros
            </Button>
          </div>

          {/* Filtros em linha para Desktop */}
          <div className="hidden lg:flex lg:flex-wrap lg:items-center lg:gap-2">
            
            {/* Filtro de Período */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-10 rounded-xl justify-between sm:justify-start gap-2 bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8] hover:bg-[#fce7f3] transition-colors">
                  <span className="flex items-center gap-2 truncate">
                    <CalendarIcon className="h-4 w-4 shrink-0" />
                    Período: {dateRange === "custom" ? "Personalizado" : dateRange === "30" ? "30 dias" : dateRange === "7" ? "7 dias" : dateRange === "15" ? "15 dias" : "Tudo"}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[calc(100vw-2rem)] sm:w-auto p-0 bg-[#fdf2f8] border-[#fbcfe8] z-50" align="start">
                <Command className="bg-transparent">
                  <CommandList className="max-h-56 overflow-y-auto overscroll-contain" onWheelCapture={(e) => e.stopPropagation()}>
                    <CommandGroup>
                      <CommandItem onSelect={() => setDateRange("7")} className="text-[#d946ef] cursor-pointer">Últimos 7 dias</CommandItem>
                      <CommandItem onSelect={() => setDateRange("15")} className="text-[#d946ef] cursor-pointer">Últimos 15 dias</CommandItem>
                      <CommandItem onSelect={() => setDateRange("30")} className="text-[#d946ef] cursor-pointer">Últimos 30 dias</CommandItem>
                    </CommandGroup>
                    <div className="border-t p-3">
                      <p className="text-xs text-muted-foreground mb-2">Personalizado:</p>
                      <Calendar
                        mode="range"
                        selected={customRange}
                        onSelect={(range) => {
                          if (range?.from && range?.to) {
                            const diffDays = Math.ceil(
                              Math.abs(range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24),
                            );
                            if (diffDays > 30) {
                              const newTo = new Date(range.from);
                              newTo.setDate(newTo.getDate() + 30);
                              setCustomRange({ from: range.from, to: newTo });
                            } else setCustomRange(range);
                          } else setCustomRange(range);
                          setDateRange("custom");
                        }}
                        numberOfMonths={1}
                      />
                    </div>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Filtro de Parceiro (Múltipla Escolha) */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-10 rounded-xl justify-between sm:justify-start gap-2 bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8] hover:bg-[#fce7f3] transition-colors">
                  <span className="truncate">{selectedPartners.length === 0 ? "Todos Parceiros" : `${selectedPartners.length} parceiro(s) sel.`}</span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[calc(100vw-2rem)] sm:w-56 p-0 bg-[#fdf2f8] border-[#fbcfe8] z-50" align="start">
                <Command className="bg-transparent">
                  <CommandList className="max-h-56 overflow-y-auto overscroll-contain" onWheelCapture={(e) => e.stopPropagation()}>
                    <CommandGroup>
                      <CommandItem onSelect={() => setSelectedPartners([])} className="text-[#d946ef] cursor-pointer">
                        <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${selectedPartners.length === 0 ? "bg-[#d946ef] text-white" : "opacity-50"}`}>
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
                              if (isSelected) {
                                setSelectedPartners(selectedPartners.filter((id) => id !== String(p.id)));
                              } else {
                                setSelectedPartners([...selectedPartners, String(p.id)]);
                              }
                            }}
                            className="text-[#d946ef] cursor-pointer"
                          >
                            <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${isSelected ? "bg-[#d946ef] text-white" : "opacity-50"}`}>
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

            {/* Filtro de Produto (Múltipla Escolha) */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-10 rounded-xl justify-between sm:justify-start gap-2 bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8] hover:bg-[#fce7f3] transition-colors">
                  <span className="truncate">{selectedProducts.length === 0 ? "Todos Produtos" : `${selectedProducts.length} produto(s) sel.`}</span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[calc(100vw-2rem)] sm:w-56 p-0 bg-[#fdf2f8] border-[#fbcfe8] z-50" align="start">
                <Command className="bg-transparent">
                  <CommandList className="max-h-56 overflow-y-auto overscroll-contain" onWheelCapture={(e) => e.stopPropagation()}>
                    <CommandGroup>
                      <CommandItem onSelect={() => setSelectedProducts([])} className="text-[#d946ef] cursor-pointer">
                        <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${selectedProducts.length === 0 ? "bg-[#d946ef] text-white" : "opacity-50"}`}>
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
                              if (isSelected) {
                                setSelectedProducts(selectedProducts.filter((id) => id !== String(p.id)));
                              } else {
                                setSelectedProducts([...selectedProducts, String(p.id)]);
                              }
                            }}
                            className="text-[#d946ef] cursor-pointer"
                          >
                            <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${isSelected ? "bg-[#d946ef] text-white" : "opacity-50"}`}>
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
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            Erro ao carregar dados: {error}
          </div>
        )}
      </div>

      {/* ===================================================================
          BLOCO 1: FUNDO DE FUNIL (SIMULAÇÕES E NEGÓCIOS)
      =================================================================== */}
      <div className="space-y-6">
        <div className="border-b pb-2">
          <div className="flex items-center gap-2">
            <Briefcase className="h-5 w-5 text-[var(--brand-primary)]" />
            <h2 className="text-xl font-bold tracking-tight text-slate-800">1. Simulações e Negócios</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Volume financeiro, aprovações e segmentação do que foi originado.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading || !simKpis
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-32 rounded-2xl border bg-card animate-pulse" />
              ))
            : simCards.map((k) => (
                <div
                  key={k.label}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {k.label}
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground/70">{k.subLabel}</span>
                    </div>
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <k.icon className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-4 text-3xl font-bold tracking-tight">{k.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{k.hint}</div>
                </div>
              ))}
        </div>

        {/* GRÁFICOS DO BLOCO 1 (LAZY LOADED) */}
        <Suspense fallback={<ChartsSkeleton />}>
          <ChartsSimulationModule
            loading={loading}
            simKpis={simKpis}
            simDailyData={simDailyData}
            periodLabel={periodLabel}
          />
        </Suspense>
      </div>

      {/* ===================================================================
          BLOCO 2: TOPO DE FUNIL (VISITAS E ACESSOS)
      =================================================================== */}
      <div className="space-y-6 pt-6">
        <div className="border-b pb-2">
          <div className="flex items-center gap-2">
            <Funnel className="h-5 w-5 text-[var(--brand-primary)]" />
            <h2 className="text-xl font-bold tracking-tight text-slate-800">2. Tráfego e Topo de Funil</h2>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Volume de acessos ao Gateway de Financiamentos e Seguros, fontes de origem e produtos visitados.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading || !visitKpis
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-32 rounded-2xl border bg-card animate-pulse" />
              ))
            : visitCards.map((k) => (
                <div
                  key={k.label}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {k.label}
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground/70">{k.subLabel}</span>
                    </div>
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                      <k.icon className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-4 text-3xl font-bold tracking-tight">{k.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{k.hint}</div>
                </div>
              ))}
        </div>

        {/* GRÁFICOS DO BLOCO 2 (LAZY LOADED) */}
        <Suspense fallback={<ChartsSkeleton />}>
          <ChartsTrafficModule
            loading={loading}
            visitKpis={visitKpis}
            visDailyData={visDailyData}
            periodLabel={periodLabel}
          />
        </Suspense>
      </div>

      {/* SHEET DE FILTROS MOBILE (CORRIGIDO COM CALENDÁRIO E OPÇÕES) */}
      <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto p-6 bg-white z-50">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="text-lg font-bold">Filtros</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 w-full">
            
            {/* Período Mobile */}
            <div className="w-full">
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Período</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-11 w-full rounded-xl justify-between gap-2 bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8]">
                    <span className="flex items-center gap-2 truncate">
                      <CalendarIcon className="h-4 w-4 shrink-0" />
                      Período: {dateRange === "custom" ? "Personalizado" : dateRange === "30" ? "30 dias" : dateRange === "7" ? "7 dias" : dateRange === "15" ? "15 dias" : "Tudo"}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-3rem)] sm:w-auto p-0 bg-[#fdf2f8] border-[#fbcfe8] z-50" align="start">
                  <Command className="bg-transparent">
                    <CommandList className="max-h-56 overflow-y-auto overscroll-contain" onWheelCapture={(e) => e.stopPropagation()}>
                      <CommandGroup>
                        <CommandItem onSelect={() => setDateRange("7")} className="text-[#d946ef] cursor-pointer">Últimos 7 dias</CommandItem>
                        <CommandItem onSelect={() => setDateRange("15")} className="text-[#d946ef] cursor-pointer">Últimos 15 dias</CommandItem>
                        <CommandItem onSelect={() => setDateRange("30")} className="text-[#d946ef] cursor-pointer">Últimos 30 dias</CommandItem>
                      </CommandGroup>
                      <div className="border-t p-3">
                        <p className="text-xs text-muted-foreground mb-2">Personalizado:</p>
                        <Calendar
                          mode="range"
                          selected={customRange}
                          onSelect={(range) => {
                            if (range?.from && range?.to) {
                              const diffDays = Math.ceil(
                                Math.abs(range.to.getTime() - range.from.getTime()) / (1000 * 60 * 60 * 24),
                              );
                              if (diffDays > 30) {
                                const newTo = new Date(range.from);
                                newTo.setDate(newTo.getDate() + 30);
                                setCustomRange({ from: range.from, to: newTo });
                              } else setCustomRange(range);
                            } else setCustomRange(range);
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

            {/* Parceiro Mobile */}
            <div className="w-full">
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Parceiro</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-11 w-full rounded-xl justify-between gap-2 bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8]">
                    <span className="truncate">{selectedPartners.length === 0 ? "Todos Parceiros" : `${selectedPartners.length} parceiro(s) sel.`}</span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-3rem)] sm:w-56 p-0 bg-[#fdf2f8] border-[#fbcfe8] z-50" align="start">
                  <Command className="bg-transparent">
                    <CommandList className="max-h-56 overflow-y-auto overscroll-contain" onWheelCapture={(e) => e.stopPropagation()}>
                      <CommandGroup>
                        <CommandItem onSelect={() => setSelectedPartners([])} className="text-[#d946ef] cursor-pointer">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${selectedPartners.length === 0 ? "bg-[#d946ef] text-white" : "opacity-50"}`}>
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
                                if (isSelected) {
                                  setSelectedPartners(selectedPartners.filter((id) => id !== String(p.id)));
                                } else {
                                  setSelectedPartners([...selectedPartners, String(p.id)]);
                                }
                              }}
                              className="text-[#d946ef] cursor-pointer"
                            >
                              <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${isSelected ? "bg-[#d946ef] text-white" : "opacity-50"}`}>
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
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-11 w-full rounded-xl justify-between gap-2 bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8]">
                    <span className="truncate">{selectedProducts.length === 0 ? "Todos Produtos" : `${selectedProducts.length} produto(s) sel.`}</span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-3rem)] sm:w-56 p-0 bg-[#fdf2f8] border-[#fbcfe8] z-50" align="start">
                  <Command className="bg-transparent">
                    <CommandList className="max-h-56 overflow-y-auto overscroll-contain" onWheelCapture={(e) => e.stopPropagation()}>
                      <CommandGroup>
                        <CommandItem onSelect={() => setSelectedProducts([])} className="text-[#d946ef] cursor-pointer">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${selectedProducts.length === 0 ? "bg-[#d946ef] text-white" : "opacity-50"}`}>
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
                                if (isSelected) {
                                  setSelectedProducts(selectedProducts.filter((id) => id !== String(p.id)));
                                } else {
                                  setSelectedProducts([...selectedProducts, String(p.id)]);
                                }
                              }}
                              className="text-[#d946ef] cursor-pointer"
                            >
                              <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${isSelected ? "bg-[#d946ef] text-white" : "opacity-50"}`}>
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

            <Button onClick={() => setMobileFilterOpen(false)} className="w-full h-11 rounded-xl bg-[#B300FF] hover:bg-[#9f00e6] text-white font-semibold mt-2">
              Aplicar Filtros
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}