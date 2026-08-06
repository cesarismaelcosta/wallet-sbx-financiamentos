import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

export const Route = createLazyFileRoute("/backoffice/audit")({ component: AuditoriaPage });

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
  origin_details: { occurred_at?: string | null; source?: string | null; } | null;
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
  const raw = row.origin_details?.occurred_at ?? row.created_at;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? row.created_at : parsed.toISOString();
}

function AuditoriaPage() {
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
      .select("id,email,event,success,failure_reason,ip_address,country,state,city,user_agent,device_type,operating_system,origin_details,created_at,origin_page,origin_function")
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
    <div className="font-sans space-y-6">
      
      {/* HEADER DA TELA */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Auditoria</h1>
          <p className="text-sm text-muted-foreground">
            Monitore o histórico de acessos, eventos de autenticação e segurança do sistema.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={load} disabled={loading} className="rounded-xl">
            <RefreshCw className={`mr-2 h-4 w-4 shrink-0 ${loading ? "animate-spin" : ""}`} /> 
            Atualizar
          </Button>
        </div>
      </div>

      {/* BLOCO DE KPIS */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Eventos" value={totals.total} />
        <StatCard label="Sucessos" value={totals.success} tone="success" />
        <StatCard label="Falhas" value={totals.fails} tone="danger" />
        <StatCard label="Bloqueios" value={totals.lockedAttempts} tone="warn" />
        <StatCard label="E-mails únicos" value={totals.uniqueEmails} highlight />
      </div>

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><strong>Erro:</strong> {error}</div>}

      {/* MÓDULO DE FILTROS & GRID DE AUDITORIA */}
      <div className="rounded-2xl border border-border bg-card flex flex-col overflow-hidden">
        
        {/* HEADER RESPONSIVO: Estilo Pílula idêntico a Consults */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-4 border-b border-border p-4">
          
          {/* BARRA DE BUSCA: Estilo Pílula moderno com lupa à direita */}
          <div className="relative w-full lg:flex-1 lg:max-w-md">
            <Input 
              value={search} 
              onChange={(e) => setSearch(e.target.value)} 
              placeholder="Buscar por e-mail, IP, cidade..." 
              className="h-11 w-full rounded-full bg-slate-100/70 border-transparent pl-5 pr-12 text-[13px] text-slate-700 placeholder:text-slate-500 focus-visible:ring-primary/20 focus-visible:bg-white focus-visible:border-primary/30 transition-all shadow-none" 
            />
            <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-[#B300FF]" />
          </div>

        </div>

        {/* TABELA DE AUDITORIA COM O MESMO COMPORTAMENTO DE CONSULTAS */}
        <div className="overflow-x-auto w-full pb-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                <th className="px-3 py-2.5 w-[120px]">Quando</th>
                <th className="px-3 py-2.5 w-[200px]">E-mail</th>
                <th className="px-3 py-2.5 w-[140px]">Evento</th>
                <th className="px-3 py-2.5 w-[120px]">Resultado</th>
                <th className="px-3 py-2.5 w-[180px]">Origem</th>
                <th className="px-3 py-2.5 w-[180px]">Contexto</th>
                <th className="px-3 py-2.5">Dispositivo</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-muted-foreground">
                    Carregando registros de auditoria...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-muted-foreground">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const dt = formatDateTime(getEventDateTime(r));
                  const origem = [r.city, r.state, r.country].filter(Boolean).join(" · ");
                  return (
                    <tr key={r.id} className="border-b border-border/60 hover:bg-accent/40 transition-colors">
                      <td className="px-3 py-2.5 w-[120px] text-muted-foreground">
                        <div className="font-semibold text-foreground">{dt.date}</div>
                        <div>{dt.time}</div>
                      </td>
                      <td className="px-3 py-2.5 w-[200px] truncate font-medium text-foreground" title={r.email}>{r.email}</td>
                      <td className="px-3 py-2.5 w-[140px] text-muted-foreground">{EVENT_LABEL[r.event] || r.event}</td>
                      <td className="px-3 py-2.5 w-[120px]">
                        {r.success ? (
                          <span className="text-emerald-600 font-semibold">Sucesso</span>
                        ) : (
                          <span className="text-destructive font-semibold">Falha</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 w-[180px] text-muted-foreground">
                        <div className="text-foreground">{r.ip_address || "—"}</div>
                        <div>{origem || "—"}</div>
                      </td>
                      <td className="px-3 py-2.5 w-[180px]">
                        <div className="font-bold text-foreground">{r.origin_page || "—"}</div>
                        <div className="text-muted-foreground">{r.origin_function || "—"}</div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        {r.device_type || "—"} · {r.operating_system || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, tone = "default", highlight = false }: { 
  label: string; 
  value: number | string; 
  tone?: "default" | "success" | "danger" | "warn"; 
  highlight?: boolean; 
}) {
  const toneClass = { 
    default: "text-foreground", 
    success: "text-success", 
    danger: "text-destructive", 
    warn: "text-amber-600" 
  }[tone as "default" | "success" | "danger" | "warn"]; // Adicionamos a conversão
  
  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${highlight ? "bg-primary text-primary-foreground" : "bg-card"}`}>
      <div className="text-xs font-semibold uppercase">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${highlight ? "text-primary-foreground" : toneClass}`}>{value}</div>
    </div>
  );
}