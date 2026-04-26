import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/backoffice/seguranca")({
  component: SegurancaPage,
});

type LoginRow = {
  id: string;
  email: string;
  event: "login" | "logout" | "failed_attempt" | "blocked" | "refresh";
  success: boolean;
  failure_reason: string | null;
  ip_address: string | null;
  country: string | null;
  state: string | null;
  city: string | null;
  user_agent: string | null;
  device_type: string | null;
  operating_system: string | null;
<<<<<<< Updated upstream
=======
  origin_page: string | null;
  origin_function: string | null;
>>>>>>> Stashed changes
  metadata: {
    occurred_at?: string | null;
    source?: string | null;
  } | null;
  created_at: string;
};

const EVENT_LABEL: Record<LoginRow["event"], string> = {
  login: "Login",
  logout: "Logout",
  failed_attempt: "Falha na autenticação",
  blocked: "Acesso bloqueado",
  refresh: "Atualização de Sessão",
};

const REASON_LABEL: Record<string, string> = {
  email_not_authorized: "E-mail não autorizado",
  domain_not_allowed: "Domínio não permitido",
  route_access_denied: "Acesso negado a rota protegida",
  signout_error: "Falha ao encerrar sessão",
  account_locked: "Conta bloqueada (excesso de tentativas)",
};

const PERIOD_DAYS: Record<string, number | null> = {
  "1": 1,
  "7": 7,
  "30": 30,
  "90": 90,
  all: null,
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
    }),
    time: d.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

function getEventDateTime(row: LoginRow) {
  const raw = row.metadata?.occurred_at ?? row.created_at;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? row.created_at : parsed.toISOString();
}

function SegurancaPage() {
  const [rows, setRows] = useState<LoginRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "fail">("all");
  const [eventFilter, setEventFilter] = useState<"all" | LoginRow["event"]>("all");
  const [period, setPeriod] = useState<string>("7");

  async function load() {
    setLoading(true);
    setError(null);

<<<<<<< Updated upstream
    let q = (supabase as any)
      .from("login_history")
      .select(
        "id,email,event,success,failure_reason,ip_address,country,state,city,user_agent,device_type,operating_system,metadata,created_at",
      )
=======
    let q = supabase
      .from("login_history")
      .select("id,email,event,success,failure_reason,ip_address,country,state,city,user_agent,device_type,operating_system,metadata,created_at,origin_page,origin_function")
>>>>>>> Stashed changes
      .order("created_at", { ascending: false })
      .limit(500);

    const days = PERIOD_DAYS[period];
    if (days != null) {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      q = q.gte("created_at", since.toISOString());
    }
    if (statusFilter !== "all") {
      q = q.eq("success", statusFilter === "success");
    }
    if (eventFilter !== "all") {
      q = q.eq("event", eventFilter);
    }

    const { data, error } = await q;
    if (error) {
      setError(error.message);
      setRows([]);
    } else {
      setRows((data ?? []) as LoginRow[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [period, statusFilter, eventFilter]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = query
      ? rows.filter(
          (r) =>
            r.email.toLowerCase().includes(query) ||
            (r.ip_address ?? "").includes(query) ||
            (r.city ?? "").toLowerCase().includes(query) ||
            (r.country ?? "").toLowerCase().includes(query),
        )
      : rows;

    return [...base].sort(
      (a, b) =>
        new Date(getEventDateTime(b)).getTime() -
        new Date(getEventDateTime(a)).getTime(),
    );
  }, [rows, search]);

  const totals = useMemo(() => {
    const total = filtered.length;
    const success = filtered.filter((r) => r.success).length;
    const fails = total - success;
    const lockedAttempts = filtered.filter(
      (r) => r.event === "blocked" || r.failure_reason === "account_locked",
    ).length;
    const uniqueEmails = new Set(filtered.map((r) => r.email.toLowerCase())).size;
    return { total, success, fails, lockedAttempts, uniqueEmails };
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Segurança e auditoria</h1>
          <p className="text-sm text-muted-foreground">
            Histórico de tentativas de login no backoffice — sucessos, falhas, origem e dispositivo.
          </p>
        </div>
        <Button onClick={load} className="rounded-lg" disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Atualizar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Eventos" value={totals.total} hint="no período filtrado" />
        <StatCard label="Sucessos" value={totals.success} hint={totals.total ? `${Math.round((totals.success / totals.total) * 100)}% do total` : "—"} tone="success" />
        <StatCard label="Falhas" value={totals.fails} hint={totals.total ? `${Math.round((totals.fails / totals.total) * 100)}% do total` : "—"} tone="danger" />
        <StatCard label="Bloqueios" value={totals.lockedAttempts} hint="tentativas barradas por lockout ou domínio" tone="warn" />
        <StatCard label="E-mails únicos" value={totals.uniqueEmails} hint="distintos no período" highlight />
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          <strong>Erro ao carregar histórico:</strong> {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por e-mail, IP, cidade, país…" className="h-10 rounded-lg pl-9" />
          </div>

          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-10 w-[150px] rounded-lg"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Últimas 24h</SelectItem>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
              <SelectItem value="all">Todo o período</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as "all" | "success" | "fail")}>
            <SelectTrigger className="h-10 w-[140px] rounded-lg"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="success">Só sucessos</SelectItem>
              <SelectItem value="fail">Só falhas</SelectItem>
            </SelectContent>
          </Select>

          <Select value={eventFilter} onValueChange={(v) => setEventFilter(v as "all" | LoginRow["event"])}>
            <SelectTrigger className="h-10 w-[160px] rounded-lg"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os eventos</SelectItem>
              <SelectItem value="login">Login</SelectItem>
              <SelectItem value="refresh">Atualização de Sessão</SelectItem>
              <SelectItem value="logout">Logout</SelectItem>
              <SelectItem value="failed_attempt">Falha na autenticação</SelectItem>
              <SelectItem value="blocked">Acesso bloqueado</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="w-[120px] px-3 py-3">Quando</th>
                <th className="w-[200px] px-3 py-3">E-mail</th>
                <th className="w-[140px] px-3 py-3">Evento</th>
                <th className="w-[120px] px-3 py-3">Resultado</th>
                <th className="w-[180px] px-3 py-3">Origem</th>
                <th className="w-[180px] px-3 py-3">Contexto</th>
                <th className="px-3 py-3">Dispositivo</th>
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-12 text-center text-sm text-muted-foreground"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Carregando histórico…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-12 text-center text-sm text-muted-foreground">Nenhum registro encontrado para os filtros atuais.</td></tr>
              ) : (
                filtered.map((r) => {
                  const dt = formatDateTime(getEventDateTime(r));
                  const origem = [r.city, r.state, r.country].filter(Boolean).join(" · ");
                  return (
                    <tr key={r.id} className="border-b border-border/60 transition-colors last:border-0 hover:bg-accent/40">
                      <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">
                        <div className="font-semibold text-foreground">{dt.date}</div>
                        <div className="text-xs">{dt.time}</div>
                      </td>
                      <td className="truncate px-3 py-3 font-medium">{r.email}</td>
                      <td className="px-3 py-3 text-muted-foreground">{EVENT_LABEL[r.event]}</td>
                      <td className="px-3 py-3">
                        {r.success ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-[11px] font-semibold text-success"><CheckCircle2 className="h-3 w-3" />Sucesso</span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${r.failure_reason === "account_locked" ? "bg-amber-500/15 text-amber-600" : "bg-destructive/10 text-destructive"}`}>
                              {r.failure_reason === "account_locked" ? <ShieldAlert className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                              Falha
                            </span>
                            {r.failure_reason && <span className="text-[10px] text-muted-foreground">{REASON_LABEL[r.failure_reason] ?? r.failure_reason}</span>}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
<<<<<<< Updated upstream
                        <div className="font-mono text-foreground">
                          {r.ip_address ?? "—"}
                        </div>
                        <div>{origem || "Localização desconhecida"}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">
                        <div className="font-medium text-foreground">
                          {r.device_type
                            ? r.device_type.charAt(0).toUpperCase() + r.device_type.slice(1)
                            : "—"}
                          {r.operating_system ? ` · ${r.operating_system}` : ""}
                        </div>
                        <div
                          className="max-w-[260px] truncate"
                          title={r.user_agent ?? ""}
                        >
                          {r.user_agent ?? "—"}
=======
                        <div className="font-mono text-foreground">{r.ip_address ?? "—"}</div>
                        <div className="truncate">{origem || "Localização desconhecida"}</div>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div className="font-bold text-foreground truncate">{r.origin_page || "—"}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{r.origin_function || "—"}</div>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground truncate">
                        <div className="font-medium text-foreground truncate">
                          {r.device_type ? r.device_type.charAt(0).toUpperCase() + r.device_type.slice(1) : "—"}
                          {r.operating_system ? ` · ${r.operating_system}` : ""}
>>>>>>> Stashed changes
                        </div>
                        <div className="truncate" title={r.user_agent ?? ""}>{r.user_agent ?? "—"}</div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Mostrando {filtered.length} de {rows.length} registros</span>
          <span>Atualize para buscar novos eventos do backend.</span>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, hint, tone = "default", highlight = false }: any) {
  const toneClass = { default: "text-foreground", success: "text-success", danger: "text-destructive", warn: "text-amber-600" }[tone];
  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${highlight ? "border-primary/20 bg-[image:var(--gradient-primary)] text-primary-foreground" : "border-border bg-card"}`}>
      <div className={`text-xs font-semibold uppercase tracking-[0.14em] ${highlight ? "text-primary-foreground/80" : "text-muted-foreground"}`}>{label}</div>
      <div className={`mt-2 text-2xl font-bold ${highlight ? "text-primary-foreground" : toneClass}`}>{value}</div>
      {hint && <div className={`mt-2 text-sm ${highlight ? "text-primary-foreground/85" : "text-muted-foreground"}`}>{hint}</div>}
    </div>
  );
}