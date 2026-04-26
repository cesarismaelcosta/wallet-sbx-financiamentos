import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  CircleDollarSign,
  ClipboardList,
  Loader2,
  TrendingUp,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/backoffice/")({
  component: DashboardPage,
});

const BRL = (n: number) =>
  n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });

type Kpis = {
  today: number;
  week: number;
  month: number;
  monthVolume: number;
  ticket: number;
  uniqueClients: number;
  byStatus: Array<{ status: string; count: number }>;
  byDay: Array<{ day: string; count: number }>;
};

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function DashboardPage() {
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);

      const now = new Date();
      const todayStart = startOfDay(now).toISOString();
      const weekStart = startOfDay(
        new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
      ).toISOString();
      const monthStart = startOfDay(
        new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000),
      ).toISOString();

      // Carrega tudo dos últimos 30 dias e calcula KPIs no client
      const { data, error: err } = await supabase
        .from("simulation")
        .select(
          "idsimulation, status, financedamount, identity, createdat",
        )
        .gte("createdat", monthStart)
        .order("createdat", { ascending: false })
        .limit(5000);

      if (cancelled) return;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }

      const rows = data ?? [];
      const today = rows.filter((r) => (r.createdat ?? "") >= todayStart).length;
      const week = rows.filter((r) => (r.createdat ?? "") >= weekStart).length;
      const month = rows.length;

      const monthVolume = rows.reduce(
        (acc, r) => acc + (Number(r.financedamount) || 0),
        0,
      );
      const ticket = month > 0 ? monthVolume / month : 0;
      const uniqueClients = new Set(
        rows.map((r) => r.identity).filter(Boolean) as string[],
      ).size;

      const statusMap = new Map<string, number>();
      for (const r of rows) {
        const s = (r.status ?? "indefinido").toString();
        statusMap.set(s, (statusMap.get(s) ?? 0) + 1);
      }
      const byStatus = Array.from(statusMap.entries())
        .map(([status, count]) => ({ status, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      // Últimos 7 dias
      const dayMap = new Map<string, number>();
      for (let i = 6; i >= 0; i--) {
        const d = startOfDay(new Date(now.getTime() - i * 24 * 60 * 60 * 1000));
        dayMap.set(d.toISOString().slice(0, 10), 0);
      }
      for (const r of rows) {
        if (!r.createdat) continue;
        const key = r.createdat.slice(0, 10);
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
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const kpiCards = kpis
    ? [
        {
          label: "Simulações hoje",
          value: kpis.today.toLocaleString("pt-BR"),
          hint: `${kpis.week} nos últimos 7 dias`,
          icon: ClipboardList,
        },
        {
          label: "Volume simulado (30d)",
          value: BRL(kpis.monthVolume),
          hint: `${kpis.month} simulações`,
          icon: CircleDollarSign,
        },
        {
          label: "Ticket médio",
          value: BRL(kpis.ticket),
          hint: "valor financiado médio",
          icon: TrendingUp,
        },
        {
          label: "Clientes únicos (30d)",
          value: kpis.uniqueClients.toLocaleString("pt-BR"),
          hint: "identidades distintas",
          icon: Users,
        },
      ]
    : [];

  const maxDay = kpis ? Math.max(1, ...kpis.byDay.map((d) => d.count)) : 1;
  const maxStatus = kpis ? Math.max(1, ...kpis.byStatus.map((s) => s.count)) : 1;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Visão geral</h1>
          <p className="text-sm text-muted-foreground">
            Resumo das simulações de crédito dos últimos 30 dias.
          </p>
        </div>
        <Button asChild className="rounded-xl">
          <Link to="/backoffice/propostas">
            Ver simulações <ArrowUpRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </div>

      {error && (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <strong>Erro ao carregar dados:</strong> {error}
        </div>
      )}

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading || !kpis
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-2xl border border-border bg-card"
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
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {k.label}
                    </span>
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="mt-4 text-3xl font-bold tracking-tight">
                    {k.value}
                  </div>
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

      {/* Gráfico de barras + status */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold">
              Simulações nos últimos 7 dias
            </h2>
            <span className="text-xs text-muted-foreground">
              {kpis ? `${kpis.week} no total` : "—"}
            </span>
          </div>
          <div className="mt-6 flex h-48 items-end gap-3">
            {loading || !kpis ? (
              <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : (
              kpis.byDay.map((d) => {
                const h = Math.round((d.count / maxDay) * 100);
                const dt = new Date(d.day + "T00:00:00");
                return (
                  <div
                    key={d.day}
                    className="group flex flex-1 flex-col items-center gap-2"
                    title={`${d.count} simulações em ${dt.toLocaleDateString("pt-BR")}`}
                  >
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {d.count}
                    </span>
                    <div
                      className="w-full rounded-t-lg bg-[image:var(--gradient-primary)] opacity-80 transition-opacity group-hover:opacity-100"
                      style={{ height: `${Math.max(h, 4)}%` }}
                    />
                    <span className="text-[11px] text-muted-foreground">
                      {dt.toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-base font-bold">Status (30d)</h2>
          <ul className="mt-4 space-y-3">
            {loading || !kpis ? (
              <li className="text-sm text-muted-foreground">
                <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                Carregando…
              </li>
            ) : kpis.byStatus.length === 0 ? (
              <li className="text-sm text-muted-foreground">
                Nenhuma simulação no período.
              </li>
            ) : (
              kpis.byStatus.map((s) => {
                const pct = Math.round((s.count / maxStatus) * 100);
                return (
                  <li key={s.status}>
                    <div className="mb-1 flex items-center justify-between text-xs">
                      <span className="font-semibold capitalize">{s.status}</span>
                      <span className="text-muted-foreground">
                        {s.count.toLocaleString("pt-BR")}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-[image:var(--gradient-primary)]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
