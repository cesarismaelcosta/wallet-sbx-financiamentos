import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/backoffice/seguranca")({ component: SegurancaPage });

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
  origin_page: string | null;
  origin_function: string | null;
  metadata: { occurred_at?: string | null; source?: string | null; } | null;
  created_at: string;
};

const EVENT_LABEL: Record<LoginRow["event"], string> = {
  login: "Login", logout: "Logout", failed_attempt: "Falha na autenticação",
  blocked: "Acesso bloqueado", refresh: "Atualização de Sessão",
};

const REASON_LABEL: Record<string, string> = {
  email_not_authorized: "E-mail não autorizado",
  domain_not_allowed: "Domínio não permitido",
  route_access_denied: "Acesso negado a rota protegida",
  signout_error: "Falha ao encerrar sessão",
  account_locked: "Conta bloqueada (excesso de tentativas)",
};

const PERIOD_DAYS: Record<string, number | null> = { "1": 1, "7": 7, "30": 30, "90": 90, all: null };

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }),
    time: d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
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

    let q = supabase
      .from("login_history")
      .select("id,email,event,success,failure_reason,ip_address,country,state,city,user_agent,device_type,operating_system,metadata,created_at,origin_page,origin_function")
      .order("created_at", { ascending: false })
      .limit(500);

    const days = PERIOD_DAYS[period];
    if (days != null) {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      q = q.gte("created_at", since.toISOString());
    }
    if (statusFilter !== "all") q = q.eq("success", statusFilter === "success");
    if (eventFilter !== "all") q = q.eq("event", eventFilter);

    const { data, error: err } = await q;
    if (err) { setError(err.message); setRows([]); }
    else setRows((data ?? []) as LoginRow[]);
    setLoading(false);
  }

  useEffect(() => { load(); }, [period, statusFilter, eventFilter]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = query ? rows.filter(r => 
        r.email.toLowerCase().includes(query) || (r.ip_address ?? "").includes(query) || 
        (r.city ?? "").toLowerCase().includes(query) || (r.country ?? "").toLowerCase().includes(query)
    ) : rows;

    return [...base].sort((a, b) => new Date(getEventDateTime(b)).getTime() - new Date(getEventDateTime(a)).getTime());
  }, [rows, search]);

  const totals = useMemo(() => {
    const total = filtered.length;
    const success = filtered.filter(r => r.success).length;
    const fails = total - success;
    const lockedAttempts = filtered.filter(r => r.event === "blocked" || r.failure_reason === "account_locked").length;
    return { total, success, fails, lockedAttempts, uniqueEmails: new Set(filtered.map(r => r.email.toLowerCase())).size };
  }, [filtered]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Segurança e auditoria</h1>
        </div>
        <Button onClick={load} className="rounded-lg" disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Atualizar
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Eventos" value={totals.total} />
        <StatCard label="Sucessos" value={totals.success} tone="success" />
        <StatCard label="Falhas" value={totals.fails} tone="danger" />
        <StatCard label="Bloqueios" value={totals.lockedAttempts} tone="warn" />
        <StatCard label="E-mails únicos" value={totals.uniqueEmails} highlight />
      </div>

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><strong>Erro:</strong> {error}</div>}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="h-10 max-w-sm rounded-lg" />
        </div>
        <div className="w-full overflow-x-auto">
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[11px] font-semibold uppercase text-muted-foreground">
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
              {filtered.map((r) => {
                const dt = formatDateTime(getEventDateTime(r));
                const origem = [r.city, r.state, r.country].filter(Boolean).join(" · ");
                return (
                  <tr key={r.id} className="border-b border-border/60 hover:bg-accent/40">
                    <td className="px-3 py-3 text-muted-foreground"><div className="font-semibold text-foreground">{dt.date}</div>{dt.time}</td>
                    <td className="truncate px-3 py-3 font-medium">{r.email}</td>
                    <td className="px-3 py-3 text-muted-foreground">{EVENT_LABEL[r.event]}</td>
                    <td className="px-3 py-3">
                      {r.success ? <span className="text-success font-semibold">Sucesso</span> : <span className="text-destructive font-semibold">Falha</span>}
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground"><div className="text-foreground">{r.ip_address}</div>{origem}</td>
                    <td className="px-3 py-3 text-xs"><div className="font-bold">{r.origin_page}</div>{r.origin_function}</td>
                    <td className="px-3 py-3 text-xs">{r.device_type} · {r.operating_system}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone = "default", highlight = false }: any) {
  const toneClass = { default: "text-foreground", success: "text-success", danger: "text-destructive", warn: "text-amber-600" }[tone];
  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${highlight ? "bg-primary text-primary-foreground" : "bg-card"}`}>
      <div className="text-xs font-semibold uppercase">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${highlight ? "text-primary-foreground" : toneClass}`}>{value}</div>
    </div>
  );
}