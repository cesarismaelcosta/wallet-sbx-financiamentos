/**
 * ============================================================================
 * @fileoverview Wallet sbX Financiamentos — Dashboard do Backoffice
 * @route /backoffice
 * * @description
 * Esta página atua como o centro nervoso operacional do Backoffice. Ela carrega,
 * processa e renderiza dados consolidados sobre as operações de crédito e
 * interações de topo de funil (visitas) geradas pelo Financial Hub.
 * * @architecture
 * - A busca de dados (fetch) ocorre diretamente via cliente Supabase (RLS protegido).
 * - Utilizamos processamento e agregação client-side (no navegador) baseados em `Map`
 * e `reduce` para calcular os KPIs. Isso é performático para janelas de até 10.000
 * linhas (ex: últimos 30 dias).
 * - A renderização gráfica é feita usando a biblioteca Recharts envelopada pelos
 * componentes padronizados do shadcn/ui.
 * * @dependencies
 * - @tanstack/react-router (Roteamento)
 * - recharts (Visualização de dados)
 * - lucide-react (Iconografia)
 * - @supabase/supabase-js (Banco de dados/BaaS)
 * ============================================================================
 */

import { createLazyFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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

// Motor Gráfico
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, LabelList } from "recharts";

// Componentes da Interface (Design System)
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

// Conexão com Banco de Dados
import { supabase } from "@/integrations/supabase/client";

export const Route = createLazyFileRoute("/backoffice/")({
  component: DashboardPage,
});

// ============================================================================
// HELPERS E UTILITÁRIOS
// ============================================================================

/**
 * Paleta de cores distribuída em array para as barras dos gráficos horizontais.
 * Os gráficos rodam este array usando módulo matemático (`i % barColors.length`)
 * para garantir que as cores ciclem infinitamente caso existam muitas categorias.
 */
const barColors = [
  "#600082",
  "#BE00FF",
  "#E299FF", // Tons primários da marca
  "#730070",
  "#E300DD",
  "#FF9EFF", // Tons secundários
  "#475569",
  "#94a3b8",
  "#cbd5e1", // Tons neutros/cinzas
];

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

const defaultChartConfig = {
  count: { label: "Quantidade", color: "var(--primary)" },
} satisfies ChartConfig;

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
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, customRange, selectedPartners, selectedProducts]);

  async function load() {
    setLoading(true);
    setError(null);

    // Garante que temos a lista de produtos carregada para fazer o mapeamento manual do gráfico
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
        // Alterado o formato de exibição do primeiro Card (Total / Únicos)
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
          <Button asChild variant="outline" className="rounded-xl">
            <Link to="/backoffice/simulations">
              Ver base de dados <ArrowUpRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-muted/30 p-3 rounded-2xl border">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-9 rounded-xl gap-2 bg-white">
                <CalendarIcon className="h-4 w-4" />
                Período:{" "}
                {dateRange === "custom"
                  ? "Personalizado"
                  : dateRange === "30"
                    ? "30 dias"
                    : dateRange === "7"
                      ? "7 dias"
                      : dateRange === "15"
                        ? "15 dias"
                        : "Tudo"}
                <ChevronDown className="h-4 w-4 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Command>
                <CommandList>
                  <CommandGroup>
                    <CommandItem onSelect={() => setDateRange("7")}>Últimos 7 dias</CommandItem>
                    <CommandItem onSelect={() => setDateRange("15")}>Últimos 15 dias</CommandItem>
                    <CommandItem onSelect={() => setDateRange("30")}>Últimos 30 dias</CommandItem>
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

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-9 px-3 border border-border rounded-xl text-sm bg-white hover:bg-muted/50 focus:border-primary outline-none transition-colors cursor-pointer flex gap-2"
              >
                {selectedPartners.length === 0 ? "Todos Parceiros" : `${selectedPartners.length} parceiro(s)`}
                <ChevronDown className="h-4 w-4 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="start">
              <Command>
                <CommandList>
                  <CommandGroup>
                    <CommandItem onSelect={() => setSelectedPartners([])}>
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
                            if (isSelected) {
                              setSelectedPartners(selectedPartners.filter((id) => id !== String(p.id)));
                            } else {
                              setSelectedPartners([...selectedPartners, String(p.id)]);
                            }
                          }}
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

          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className="h-9 px-3 border border-border rounded-xl text-sm bg-white hover:bg-muted/50 focus:border-primary outline-none transition-colors cursor-pointer flex gap-2"
              >
                {selectedProducts.length === 0 ? "Todos Produtos" : `${selectedProducts.length} produto(s)`}
                <ChevronDown className="h-4 w-4 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="start">
              <Command>
                <CommandList>
                  <CommandGroup>
                    <CommandItem onSelect={() => setSelectedProducts([])}>
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
                            if (isSelected) {
                              setSelectedProducts(selectedProducts.filter((id) => id !== String(p.id)));
                            } else {
                              setSelectedProducts([...selectedProducts, String(p.id)]);
                            }
                          }}
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

        <div className="grid grid-cols-1 gap-4">
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-medium">Evolução de Simulações Diárias</h3>
                <p className="text-xs text-muted-foreground">{periodLabel}</p>
              </div>
            </div>
            {loading || !simKpis ? (
              <div className="h-[240px] flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Carregando...
              </div>
            ) : (
              <ChartContainer config={defaultChartConfig} className="h-[240px] w-full">
                <BarChart data={simDailyData} margin={{ top: 24, right: 0, left: -24, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis hide />
                  <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]}>
                    <LabelList
                      dataKey="count"
                      position="top"
                      offset={6}
                      className="fill-foreground"
                      fontSize={11}
                      fontWeight={600}
                      formatter={(v: number) => (v > 0 ? v : "")}
                    />
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[
            { title: "Status da Proposta", data: simKpis?.byStatus },
            { title: "Por Produto", data: simKpis?.byProduct },
            { title: "Por Parceiro", data: simKpis?.byPartner },
          ].map((chart, idx) => (
            <div key={chart.title} className="rounded-2xl border bg-card p-5">
              <div className="mb-4">
                <h3 className="text-sm font-medium">{chart.title}</h3>
                <p className="text-xs text-muted-foreground">{periodLabel}</p>
              </div>
              {loading || !chart.data ? (
                <div className="h-[240px] flex items-center justify-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Carregando...
                </div>
              ) : chart.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum dado no período.</p>
              ) : (
                <ChartContainer config={defaultChartConfig} className="h-[240px] w-full">
                  <BarChart data={chart.data} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      width={110}
                    />
                    <ChartTooltip
                      cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                      content={
                        <ChartTooltipContent
                          formatter={(value, _name, item) => (
                            <div className="flex flex-col">
                              <span>{value} simulações</span>
                              <span className="text-xs text-muted-foreground">{BRL(item.payload.volume)}</span>
                            </div>
                          )}
                        />
                      }
                    />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                      {chart.data.map((_, i) => (
                        <Cell key={i} fill={barColors[(i + idx * 3) % barColors.length]} />
                      ))}
                      <LabelList
                        dataKey="count"
                        position="right"
                        content={(props: any) => {
                          const item = chart.data![props.index];
                          if (!item) return null;
                          const cx = Number(props.x) + Number(props.width) + 8;
                          const cy = Number(props.y) + Number(props.height) / 2;
                          return (
                            <g>
                              <text
                                x={cx}
                                y={cy - 6}
                                fill="var(--foreground)"
                                fontSize={11}
                                fontWeight={600}
                                dominantBaseline="middle"
                              >
                                {props.value}
                              </text>
                              <text
                                x={cx}
                                y={cy + 8}
                                fill="var(--muted-foreground)"
                                fontSize={10}
                                dominantBaseline="middle"
                              >
                                {BRL(item.volume)}
                              </text>
                            </g>
                          );
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              )}
            </div>
          ))}
        </div>
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

        {/* KPIs Visitas vs Visitantes */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading || !visitKpis
            ? Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-32 rounded-2xl border bg-card animate-pulse" />
              ))
            : [
                {
                  label: "Total de Acessos",
                  subLabel: periodLabel,
                  // Aqui garantimos que o valor use visitKpis.total (visitas) e visitKpis.unique (visitantes únicos via documento)
                  value: `${visitKpis.total.toLocaleString("pt-BR")} / ${visitKpis.unique.toLocaleString("pt-BR")}`,
                  hint: "visitas registradas / visitantes únicos",
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
              ].map((k) => (
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

        <div className="grid grid-cols-1 gap-4">
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-sm font-medium">Evolução de Acessos Diários</h3>
                <p className="text-xs text-muted-foreground">{periodLabel}</p>
              </div>
            </div>
            {loading || !visitKpis ? (
              <div className="h-[240px] flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Carregando...
              </div>
            ) : (
              <ChartContainer config={defaultChartConfig} className="h-[240px] w-full">
                <BarChart data={visDailyData} margin={{ top: 24, right: 0, left: -24, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis
                    dataKey="day"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis hide />
                  <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="#94a3b8" radius={[4, 4, 0, 0]}>
                    <LabelList
                      dataKey="count"
                      position="top"
                      offset={6}
                      className="fill-foreground"
                      fontSize={11}
                      fontWeight={600}
                      formatter={(v: number) => (v > 0 ? v : "")}
                    />
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[
            { title: "Origem do Acesso (UTM Source)", data: visitKpis?.bySource, colorOffset: 6 },
            { title: "Intenção do Usuário (Ação)", data: visitKpis?.byAction, colorOffset: 7 },
            { title: "Produto Visitado", data: visitKpis?.byProduct, colorOffset: 8 },
          ].map((chart) => (
            <div key={chart.title} className="rounded-2xl border bg-card p-5">
              <div className="mb-4">
                <h3 className="text-sm font-medium">{chart.title}</h3>
                <p className="text-xs text-muted-foreground">{periodLabel}</p>
              </div>
              {loading || !chart.data ? (
                <div className="h-[240px] flex items-center justify-center text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Carregando...
                </div>
              ) : chart.data.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum dado no período.</p>
              ) : (
                <ChartContainer config={defaultChartConfig} className="h-[240px] w-full">
                  <BarChart data={chart.data} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                      width={120}
                    />
                    <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<ChartTooltipContent />} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                      {chart.data.map((_, i) => (
                        <Cell key={i} fill={barColors[(i + chart.colorOffset) % barColors.length]} />
                      ))}
                      <LabelList
                        dataKey="count"
                        position="right"
                        fill="var(--foreground)"
                        fontSize={11}
                        fontWeight={600}
                      />
                    </Bar>
                  </BarChart>
                </ChartContainer>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
