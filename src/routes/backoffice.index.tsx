/**
 * ============================================================================
 *  Wallet sbX Financiamentos — Home do Backoffice
 *  Rota: /backoffice
 * ----------------------------------------------------------------------------
 *  Esta página exibe a visão geral das simulações de crédito:
 *    • 4 KPIs (Simulações, Volume, Ticket médio, Clientes únicos)
 *    • Gráfico de barras "Evolução diária" (Recharts)
 *    • Gráfico de barras horizontais "Status" (Recharts)
 *    • Filtros: período (7/15/30/custom/all), parceiro e produto
 *
 *  Fonte de dados: tabela `simulations` no Supabase, com join em `status_types`.
 *  Limite de janela no gráfico diário: 30 dias (regra de produto).
 * ============================================================================
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

// Ícones (lucide-react) usados em cards, filtros e CTA.
import {
  ArrowUpRight,
  CircleDollarSign,
  ClipboardList,
  Loader2,
  TrendingUp,
  Users,
  Calendar as CalendarIcon,
  ChevronDown,
} from "lucide-react";

// Recharts — biblioteca de gráficos baseada em SVG.
// Usamos BarChart para os dois gráficos (vertical e horizontal).
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Cell,
  LabelList,
} from "recharts";


// Componentes de UI (shadcn).
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";

// Wrapper oficial do shadcn em cima do Recharts.
// Ele injeta variáveis CSS (--color-<chave>) a partir do `chartConfig`,
// garantindo que os gráficos respeitem o design system (light/dark).
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

// Cliente Supabase (publishable key + RLS).
import { supabase } from "@/integrations/supabase/client";

// Tipo do react-day-picker para intervalo (from/to) do calendário.
import { DateRange } from "react-day-picker";

// ---------------------------------------------------------------------------
// Definição da rota (file-based routing do TanStack Router).
// O arquivo `src/routes/backoffice/index.tsx` resolve para a URL `/backoffice`.
// ---------------------------------------------------------------------------
export const Route = createFileRoute("/backoffice/")({
  component: DashboardPage,
});

// ---------------------------------------------------------------------------
// Helpers de formatação.
// ---------------------------------------------------------------------------

//** Cores para as barras do gráfico de status */
const statusColors = [
  // 1. Linha do Roxo da Logo (Wallet sbX)
  "#600082", // Roxo da Logo - Mais Escuro
  "#BE00FF", // Roxo da Logo - Oficial
  "#E299FF", // Roxo da Logo - Mais Claro

  // 2. Linha do Roxo da Barra Lateral - CORRIGIDO
  "#730070", // Roxo da Barra - Mais Escuro
  "#E300DD", // Roxo da Barra - Oficial
  "#FF9EFF", // Roxo da Barra - Mais Claro

  // 3. Os tons de Cinza
  "#475569", // Cinza escuro (slate-600)
  "#94a3b8", // Cinza médio (slate-400)
  "#cbd5e1", // Cinza claro (slate-300)
];

/** Formata um número como moeda brasileira (BRL), sem casas decimais. */
const BRL = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

/** Retorna uma nova Date "zerada" no início do dia (00:00:00.000). */
function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

// ---------------------------------------------------------------------------
// Tipo agregado dos KPIs calculados no client a partir das linhas retornadas.
// ---------------------------------------------------------------------------
type Kpis = {
  today: number;          // qtd. simulações criadas hoje
  week: number;           // qtd. simulações nos últimos 7 dias
  month: number;          // qtd. simulações no período selecionado
  monthVolume: number;    // soma do `financed_amount` no período
  ticket: number;         // ticket médio = monthVolume / month
  uniqueClients: number;  // qtd. de documentos distintos no período
  byStatus: Array<{ status: string; count: number; volume: number }>;
  byDay: Array<{ day: string; count: number }>; // day no formato YYYY-MM-DD
};

// ---------------------------------------------------------------------------
// Configuração de cores/labels dos gráficos.
//
// O `ChartContainer` lê este objeto e gera, em runtime, variáveis CSS no
// formato `--color-<chave>`. No JSX usamos `fill="var(--color-count)"`,
// o que mantém os gráficos 100% themable pelo design system.
// ---------------------------------------------------------------------------
const dailyChartConfig = {
  count: {
    label: "Simulações",
    color: "var(--primary)", // antes: hsl(var(--primary)) — não funciona com tokens oklch
  },
} satisfies ChartConfig;

const statusChartConfig = {
  count: {
    label: "Quantidade",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

// ===========================================================================
//  Componente principal
// ===========================================================================
function DashboardPage() {
  // -------------------------------------------------------------------------
  // Estado da página
  // -------------------------------------------------------------------------
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros — controlam o período, parceiro e produto exibidos.
  // O "30" é o default; o limite máximo de janela é 30 dias (regra de produto).
  const [dateRange, setDateRange] =
    useState<"7" | "15" | "30" | "all" | "custom">("30");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [partner, setPartner] = useState<string>("todos");
  const [product, setProduct] = useState<string>("todos");

    // -------------------------------------------------------------------------
  // Carrega os dados dos filtros parceiro e produto.
  // -------------------------------------------------------------------------

  // Estados para as opções dos dropdowns
  const [partnersList, setPartnersList] = useState<Array<{id: string | number, name: string}>>([]);
  const [productsList, setProductsList] = useState<Array<{id: string | number, name: string}>>([]);

  // Busca as listas no Supabase uma única vez ao montar a tela
  useEffect(() => {
    async function loadDropdowns() {
      // Busca Parceiros (trazendo apenas os ativos, se a coluna existir na sua tabela)
      const { data: pData } = await supabase
        .from('partners') // Confirme se o nome da sua tabela é "partners"
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (pData) setPartnersList(pData);

      // Busca Produtos
      const { data: prData } = await supabase
        .from('product_types') // Confirme se o nome da sua tabela é "products"
        .select('id, name')
        .order('name');
      if (prData) setProductsList(prData);
    }
    loadDropdowns();
  }, []);

  // -------------------------------------------------------------------------
  // Efeito: recarrega os KPIs sempre que qualquer filtro mudar.
  // -------------------------------------------------------------------------
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateRange, customRange, partner, product]);

  // -------------------------------------------------------------------------
  // load() — consulta o Supabase e calcula os KPIs no client.
  //
  // Estratégia:
  //  1. Determina `start` e `end` em função do filtro de período.
  //  2. Busca até 5000 linhas em `simulations` com join em `status_types`.
  //  3. Agrega no client (today/week/month, volume, ticket, únicos, status, dia).
  //
  // Observação: a agregação acontece no client para simplificar; em volumes
  // maiores convém mover para uma RPC/edge function que devolva já agregado.
  // -------------------------------------------------------------------------
  async function load() {
    setLoading(true);
    setError(null);

    // ---- 1) janela de datas --------------------------------------------------
    let start = new Date();
    if (dateRange === "custom" && customRange?.from) {
      start = customRange.from;
    } else if (dateRange !== "all") {
      const days = parseInt(dateRange);
      start.setDate(new Date().getDate() - days);
    } else {
      // "all" — usamos uma data antiga como piso.
      start = new Date(2000, 0, 1);
    }

    let end = new Date();
    if (dateRange === "custom" && customRange?.to) {
      end = customRange.to;
      end.setHours(23, 59, 59, 999);
    }

    // ---- 2) query ------------------------------------------------------------
    let query = supabase
      .from("simulations")
      .select(
        "id, financed_amount, document, created_at, status_types(name), partner_id, product_id"
      )
      .gte("created_at", start.toISOString())
      .lte("created_at", end.toISOString())
      .order("created_at", { ascending: false })
      .limit(5000);

    if (partner !== "todos") query = query.eq("partner_id", partner);
    if (product !== "todos") query = query.eq("product_id", product);

    const { data, error: err } = await query;

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }

    const rows = data ?? [];

    // ---- 3) agregações -------------------------------------------------------
    const now = new Date();
    const todayStart = startOfDay(now).toISOString();
    const weekStart = startOfDay(
      new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)
    ).toISOString();

    const today = rows.filter((r) => (r.created_at ?? "") >= todayStart).length;
    const week = rows.filter((r) => (r.created_at ?? "") >= weekStart).length;
    const month = rows.length;

    const monthVolume = rows.reduce(
      (acc, r) => acc + (Number(r.financed_amount) || 0),
      0
    );
    const ticket = month > 0 ? monthVolume / month : 0;
    const uniqueClients = new Set(
      rows.map((r) => r.document).filter(Boolean) as string[]
    ).size;

    // Agrega por status (top 8).
    const statusMap = new Map<string, { count: number; volume: number }>();
    for (const r of rows) {
      const s = (r.status_types as any)?.name ?? "Indefinido";
      const current = statusMap.get(s) ?? { count: 0, volume: 0 };
      statusMap.set(s, {
        count: current.count + 1,
        volume: current.volume + (Number(r.financed_amount) || 0),
      });
    }
    const byStatus = Array.from(statusMap.entries())
      .map(([status, d]) => ({ status, count: d.count, volume: d.volume }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    // Agrega por dia (chave YYYY-MM-DD). Limite RÍGIDO de 30 dias.
    const dayMap = new Map<string, number>();
    const diffDays = Math.ceil(
      Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );
    const maxChartDays = dateRange === "all" ? 30 : Math.min(diffDays, 30);

    for (let i = maxChartDays - 1; i >= 0; i--) {
      const d = startOfDay(new Date(end.getTime() - i * 24 * 60 * 60 * 1000));
      dayMap.set(d.toISOString().slice(0, 10), 0);
    }
    for (const r of rows) {
      if (!r.created_at) continue;
      const key = r.created_at.slice(0, 10);
      if (dayMap.has(key)) dayMap.set(key, (dayMap.get(key) ?? 0) + 1);
    }
    const byDay = Array.from(dayMap.entries()).map(([day, count]) => ({
      day,
      count,
    }));

    setKpis({
      today,
      week,
      month,
      monthVolume,
      ticket,
      uniqueClients,
      byStatus,
      byDay,
    });
    setLoading(false);
  }

  // -------------------------------------------------------------------------
  // Label legível do período (usada nos cards e títulos dos gráficos).
  // -------------------------------------------------------------------------
  let periodLabel = "";
  if (dateRange === "all") {
    periodLabel = "Todo o período";
  } else if (dateRange === "custom" && customRange?.from) {
    const from = customRange.from.toLocaleDateString("pt-BR", {
      day: "2-digit", month: "2-digit", year: "2-digit",
    });
    const to = customRange.to
      ? customRange.to.toLocaleDateString("pt-BR", {
          day: "2-digit", month: "2-digit", year: "2-digit",
        })
      : "";
    periodLabel = to ? `${from} - ${to}` : `A partir de ${from}`;
  } else {
    periodLabel = `${dateRange} dias`;
  }

  // -------------------------------------------------------------------------
  // KPI cards (memoizáveis se virar gargalo — hoje 4 itens, sem custo).
  // -------------------------------------------------------------------------
  const kpiCards = kpis
    ? [
        {
          label: "Simulações",
          subLabel: periodLabel,
          value: kpis.month.toLocaleString("pt-BR"),
          hint: `${kpis.today} hoje`,
          icon: ClipboardList,
        },
        {
          label: "Volume simulado",
          subLabel: periodLabel,
          value: BRL(kpis.monthVolume),
          hint: `${kpis.month} simulações`,
          icon: CircleDollarSign,
        },
        {
          label: "Ticket médio",
          subLabel: periodLabel,
          value: BRL(kpis.ticket),
          hint: "valor financiado médio",
          icon: TrendingUp,
        },
        {
          label: "Clientes únicos",
          subLabel: periodLabel,
          value: kpis.uniqueClients.toLocaleString("pt-BR"),
          hint: "identidades distintas",
          icon: Users,
        },
      ]
    : [];

  // -------------------------------------------------------------------------
  // Dados já normalizados para o Recharts.
  // - dailyData: chave `day` vira label "dd/mm" no eixo X.
  // - statusData: passa `status`, `count` e `volume` (usado no tooltip).
  // -------------------------------------------------------------------------
  const dailyData =
    kpis?.byDay.map((d) => ({
      day: new Date(d.day + "T00:00:00").toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
      count: d.count,
    })) ?? [];

  const statusData =
    kpis?.byStatus.map((s) => ({
      status: s.status,
      count: s.count,
      volume: s.volume,
    })) ?? [];

  // =========================================================================
  //  Render
  // =========================================================================
  return (
    <div className="p-6 space-y-6">
      {/* -------------------------------------------------------------------
          Cabeçalho + CTA "Ver simulações"
         ------------------------------------------------------------------- */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
          <p className="text-sm text-muted-foreground">
            Resumo das simulações de crédito.
          </p>
        </div>
        <Button asChild variant="outline" className="rounded-xl">
          <Link to="/backoffice/simulations">
            Ver simulações <ArrowUpRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {/* -------------------------------------------------------------------
          Filtros (período via Popover/Calendar, parceiro e produto)
         ------------------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        {/* PERÍODO */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 rounded-xl gap-2">
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
                        } else {
                          setCustomRange(range);
                        }
                      } else {
                        setCustomRange(range);
                      }
                      setDateRange("custom");
                    }}
                    numberOfMonths={1}
                  />
                </div>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* PARCEIROS */}
        <select
          value={partner}
          onChange={(e) => setPartner(e.target.value)}
          className="h-9 px-3 border border-border rounded-xl text-sm bg-card hover:bg-muted/50 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors cursor-pointer"
        >
          <option value="todos">Todos Parceiros</option>
          {partnersList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        {/* PRODUTOS */}
        <select
          value={product}
          onChange={(e) => setProduct(e.target.value)}
          className="h-9 px-3 border border-border rounded-xl text-sm bg-card hover:bg-muted/50 focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-colors cursor-pointer"
        >
          <option value="todos">Todos Produtos</option>
          {productsList.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* -------------------------------------------------------------------
          Mensagem de erro (caso a query falhe)
         ------------------------------------------------------------------- */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          Erro ao carregar dados: {error}
        </div>
      )}

      {/* -------------------------------------------------------------------
          KPI cards (com skeletons enquanto loading)
         ------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {loading || !kpis
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-32 rounded-2xl border bg-card animate-pulse"
              />
            ))
          : kpiCards.map((k) => {
              const Icon = k.icon;
              return (
                <div
                  key={k.label}
                  className="group relative overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-card)]"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {k.label}
                      </span>
                      <span className="text-[10px] font-medium text-muted-foreground/70">{k.subLabel}</span>
                    </div>
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-4 text-3xl font-bold tracking-tight">{k.value}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{k.hint}</div>
                  <div
                    className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full opacity-30 blur-2xl transition-opacity group-hover:opacity-60"
                    style={{ background: "var(--primary-glow)" }}
                    aria-hidden
                  />
                </div>
              );
            })}
      </div>

      {/* -------------------------------------------------------------------
          Grid dos dois gráficos
            • Coluna 1-2: Evolução diária  (BarChart vertical)
            • Coluna 3:   Status            (BarChart horizontal)
         ------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ============= GRÁFICO 1 — Evolução diária ===================== */}
        <div className="lg:col-span-2 rounded-2xl border bg-card p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-medium">Evolução diária</h3>
              <p className="text-xs text-muted-foreground">{periodLabel}</p>
            </div>
            <span className="text-xs text-muted-foreground">
              {kpis
                ? `${kpis.byDay.reduce((a, d) => a + d.count, 0)} no total`
                : "—"}
            </span>
          </div>

          {loading || !kpis ? (
            // Placeholder enquanto carrega — mesma altura do gráfico para
            // evitar "pulo" de layout (CLS).
            <div className="h-[280px] flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Carregando gráfico...
            </div>
          ) : (
            /**
             * ChartContainer:
             *  - Aplica `width: 100%; height: 100%` ao SVG do Recharts.
             *  - Injeta variáveis `--color-<chave>` lidas do `config`.
             *  - Por isso o `fill` da `<Bar>` é `var(--color-count)`.
             */
            <ChartContainer config={dailyChartConfig} className="h-[280px] w-full">
              <BarChart data={dailyData} margin={{ top: 24, right: 8, left: -16, bottom: 0 }}>
                {/* margin.top aumentou pra 24 pra caber o label acima da barra mais alta */}
                <CartesianGrid
                  vertical={false}
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                />
                <XAxis
                  dataKey="day"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  interval="preserveStartEnd"
                />
                <YAxis hide />
                <ChartTooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                  content={<ChartTooltipContent />}
                />
                <Bar
                  dataKey="count"
                  fill="var(--color-count)"
                  radius={[6, 6, 0, 0]}
                >
                  {/* Label numérico acima de cada barra (oculto quando count = 0) */}
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

        {/* ============= GRÁFICO 2 — Status (horizontal) ================= */}
        <div className="rounded-2xl border bg-card p-5">
          <div className="mb-4">
            <h3 className="text-sm font-medium">Status</h3>
            <p className="text-xs text-muted-foreground">{periodLabel}</p>
          </div>

          {loading || !kpis ? (
            <div className="h-[280px] flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Carregando…
            </div>
          ) : statusData.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma simulação no período.
            </p>
          ) : (
            <ChartContainer config={statusChartConfig} className="h-[280px] w-full">
              <BarChart data={statusData} layout="vertical" margin={{ top: 8, right: 90, left: 8, bottom: 8 }}>
                <CartesianGrid
                  horizontal={false}
                  strokeDasharray="3 3"
                  stroke="var(--border)"
                />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="status"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  width={90}
                />
                <ChartTooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                  content={
                    <ChartTooltipContent
                      formatter={(value, _name, item) => (
                        <div className="flex flex-col">
                          <span>{value} simulações</span>
                          <span className="text-xs text-muted-foreground">
                            {BRL(item.payload.volume)}
                          </span>
                        </div>
                      )}
                    />
                  }
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={32}>
                  {statusData.map((_, i) => (
                    // Repete as cores da lista infinitamente
                    <Cell key={i} fill={statusColors[i % statusColors.length]} />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="right"
                    content={(props: any) => {
                      const { x, y, width, height, value, index } = props;
                      const item = statusData[index];
                      if (!item) return null;
                      const cx = Number(x) + Number(width) + 8;
                      const cy = Number(y) + Number(height) / 2;
                      return (
                        <g>
                          <text
                            x={cx}
                            y={cy - 6}
                            fill="var(--foreground)"
                            fontSize={12}
                            fontWeight={600}
                            dominantBaseline="middle"
                          >
                            {value}
                          </text>
                          <text
                            x={cx}
                            y={cy + 8}
                            fill="var(--muted-foreground)"
                            fontSize={11}
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
      </div>
    </div>
  );
}
