/**
 * ============================================================================
 * @fileoverview Monitor de Auditoria e Segurança (Backoffice Otimizado)
 * @module Backoffice/Audit
 * @route /backoffice/audit
 *
 * @description
 * Torre de controle de logs de acesso e eventos de autenticação. Utiliza paginação
 * server-side com contagem exata, filtros por período e status no banco.
 * ============================================================================
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, Search, ChevronDown, Filter } from "lucide-react";
import { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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

const PERIOD_OPTIONS = [
  { id: "1", label: "Último 1 dia" },
  { id: "7", label: "Últimos 7 dias" },
  { id: "30", label: "Últimos 30 dias" },
  { id: "90", label: "Últimos 90 dias" },
  { id: "all", label: "Todo o período" },
];

const STATUS_OPTIONS = [
  { id: "all", label: "Todos os Status" },
  { id: "success", label: "Sucessos" },
  { id: "fail", label: "Falhas" },
];

const EVENT_OPTIONS = [
  { id: "all", label: "Todos os Eventos" },
  { id: "login", label: "Login" },
  { id: "logout", label: "Logout" },
  { id: "failed_attempt", label: "Falha na autenticação" },
  { id: "blocked", label: "Acesso bloqueado" },
  { id: "refresh", label: "Atualização de Sessão" },
];

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

function AuditoriaPage() {
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<LoginRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // Estados de Filtro
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [period, setPeriod] = useState<string>("7");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  // Estados da Paginação Real
  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const PAGE_SIZE = 50;

  // Extrai as strings primitivas do intervalo para evitar loops de renderização
  const rangeFrom = customRange?.from?.toISOString();
  const rangeTo = customRange?.to?.toISOString();

  // Quando filtros ou busca mudam, volta para a página 0 e carrega
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setPage(0);
      load(0);
    }, 400);
    return () => clearTimeout(timeoutId);
  }, [search, period, rangeFrom, rangeTo, statusFilter, eventFilter]);

  async function load(targetPage: number) {
    setLoading(true);
    setError(null);

    try {
      const from = targetPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let q = supabase
        .from("login_history")
        .select(
          "id,email,event,success,failure_reason,ip_address,country,state,city,user_agent,device_type,operating_system,origin_details,created_at,origin_page,origin_function",
          { count: "estimated" }
        );

      // Filtros de Período / Data
      if (period !== "all" && period !== "custom") {
        const days = Number(period);
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        q = q.gte("created_at", since.toISOString());
      } else if (period === "custom" && customRange?.from && customRange?.to) {
        q = q.gte("created_at", customRange.from.toISOString()).lte("created_at", customRange.to.toISOString());
      }

      // Filtros de Status e Evento
      if (statusFilter === "success") q = q.eq("success", true);
      else if (statusFilter === "fail") q = q.eq("success", false);

      if (eventFilter !== "all") q = q.eq("event", eventFilter);

      // Busca por texto (e-mail ou IP) direto no servidor se houver
      if (search.trim()) {
        const s = search.trim();
        q = q.or(`email.ilike.%${s}%,ip_address.ilike.%${s}%`);
      }

      // Ordenação e Paginação Server-Side
      q = q.order("created_at", { ascending: false }).range(from, to);

      const { data, count, error: err } = await q;

      if (err) throw err;

      setRows((data ?? []) as LoginRow[]);
      
      if (count !== null) {
        setTotalPages(Math.ceil(count / PAGE_SIZE));
      }
    } catch (err: any) {
      setError(err.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  const filtered = useMemo(() => {
    return [...rows].sort((a, b) => new Date(getEventDateTime(b)).getTime() - new Date(getEventDateTime(a)).getTime());
  }, [rows]);

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
          <Button onClick={() => load(page)} disabled={loading} className="rounded-xl">
            <RefreshCw className={`mr-2 h-4 w-4 shrink-0 ${loading ? "animate-spin" : ""}`} /> 
            Atualizar
          </Button>
        </div>
      </div>

      {/* BLOCO DE KPIS */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Eventos na página" value={totals.total} />
        <StatCard label="Sucessos" value={totals.success} tone="success" />
        <StatCard label="Falhas" value={totals.fails} tone="danger" />
        <StatCard label="Bloqueios" value={totals.lockedAttempts} tone="warn" />
        <StatCard label="E-mails únicos" value={totals.uniqueEmails} highlight />
      </div>

      {error && <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><strong>Erro:</strong> {error}</div>}

      {/* MÓDULO DE FILTROS & GRID DE AUDITORIA */}
      <div className="rounded-2xl border border-border bg-card flex flex-col overflow-hidden">
        
        <div className="flex flex-col gap-3 border-b border-border p-4">
          
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

          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            
            {/* Input de Busca */}
            <div className="relative w-full lg:flex-1 lg:max-w-md">
              <Input 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
                placeholder="Buscar por e-mail ou IP..." 
                className="h-11 w-full rounded-full bg-slate-100/70 border-transparent pl-5 pr-12 text-[13px] text-slate-700 placeholder:text-slate-500 focus-visible:ring-primary/20 focus-visible:bg-white focus-visible:border-primary/30 transition-all shadow-none" 
              />
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-[#B300FF]" />
            </div>

            {/* Filtros em linha para Desktop */}
            <div className="hidden lg:flex lg:items-center lg:gap-2 lg:ml-auto">
              
              {/* Filtro de Evento */}
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10 w-[170px] rounded-xl gap-2 bg-white hover:bg-slate-50 border-slate-200 text-slate-600 justify-between">
                    <span className="truncate">Evento: {eventFilter === "all" ? "Todos" : EVENT_LABEL[eventFilter as LoginRow["event"]]}</span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0" align="start">
                  <Command>
                    <CommandList className="max-h-56 overflow-y-auto overscroll-contain" onWheelCapture={(e) => e.stopPropagation()}>
                      <CommandGroup>
                        {EVENT_OPTIONS.map(opt => (
                          <CommandItem key={opt.id} onSelect={() => setEventFilter(opt.id as any)} className="cursor-pointer">
                            {opt.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Filtro de Status */}
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10 w-[150px] rounded-xl gap-2 bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8] hover:bg-[#fce7f3] justify-between">
                    <span className="truncate">Status: {statusFilter === "all" ? "Todos" : statusFilter === "success" ? "Sucessos" : "Falhas"}</span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-48 bg-[#fdf2f8] border-[#fbcfe8] z-50" align="start">
                  <Command className="bg-transparent">
                    <CommandList className="max-h-56 overflow-y-auto overscroll-contain" onWheelCapture={(e) => e.stopPropagation()}>
                      <CommandGroup>
                        {STATUS_OPTIONS.map(opt => (
                          <CommandItem key={opt.id} onSelect={() => setStatusFilter(opt.id)} className="cursor-pointer text-[#d946ef]">
                            {opt.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              {/* Filtro de Período */}
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10 w-[160px] rounded-xl gap-2 bg-white hover:bg-slate-50 border-slate-200 text-slate-600 justify-between">
                    <span className="truncate">Período: {period === "custom" ? "Personalizado" : PERIOD_OPTIONS.find(p => p.id === period)?.label}</span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-auto" align="start">
                  <Command>
                    <CommandList className="max-h-56 overflow-y-auto overscroll-contain" onWheelCapture={(e) => e.stopPropagation()}>
                      <CommandGroup>
                        {PERIOD_OPTIONS.map(opt => (
                          <CommandItem key={opt.id} onSelect={() => setPeriod(opt.id)}>
                            {opt.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      <div className="p-2 border-t">
                        <p className="text-xs font-semibold px-2 mb-2 text-muted-foreground">Personalizado:</p>
                        <Calendar mode="range" selected={customRange} onSelect={(range) => { setCustomRange(range); setPeriod("custom"); }} numberOfMonths={1} />
                      </div>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

            </div>

          </div>
        </div>

        {/* TABELA DE AUDITORIA */}
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
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" /> Carregando informações...
                    </div>
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

      {/* SHEET DE FILTROS MOBILE */}
      <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto p-6 bg-white">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="text-lg font-bold">Filtros</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 w-full">
            
            {/* Evento Mobile */}
            <div className="w-full">
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Evento</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-11 w-full rounded-xl gap-2 bg-white border-slate-200 text-slate-600 justify-between">
                    <span className="truncate">Evento: {eventFilter === "all" ? "Todos" : EVENT_LABEL[eventFilter as LoginRow["event"]]}</span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-72 p-0" align="start">
                  <Command>
                    <CommandList>
                      <CommandGroup>
                        {EVENT_OPTIONS.map(opt => (
                          <CommandItem key={opt.id} onSelect={() => setEventFilter(opt.id as any)} className="cursor-pointer">
                            {opt.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Status Mobile */}
            <div className="w-full">
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Status</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-11 w-full rounded-xl gap-2 bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8] justify-between">
                    <span className="truncate">Status: {statusFilter === "all" ? "Todos" : statusFilter === "success" ? "Sucessos" : "Falhas"}</span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-72 bg-[#fdf2f8] border-[#fbcfe8] z-50" align="start">
                  <Command className="bg-transparent">
                    <CommandList>
                      <CommandGroup>
                        {STATUS_OPTIONS.map(opt => (
                          <CommandItem key={opt.id} onSelect={() => setStatusFilter(opt.id)} className="cursor-pointer text-[#d946ef]">
                            {opt.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Período Mobile */}
            <div className="w-full">
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Período</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-11 w-full rounded-xl gap-2 bg-white border-slate-200 text-slate-600 justify-between">
                    <span className="truncate">Período: {period === "custom" ? "Personalizado" : PERIOD_OPTIONS.find(p => p.id === period)?.label}</span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-auto" align="start">
                  <Command>
                    <CommandList>
                      <CommandGroup>
                        {PERIOD_OPTIONS.map(opt => (
                          <CommandItem key={opt.id} onSelect={() => setPeriod(opt.id)}>
                            {opt.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      <div className="p-2 border-t">
                        <p className="text-xs font-semibold px-2 mb-2 text-muted-foreground">Personalizado:</p>
                        <Calendar mode="range" selected={customRange} onSelect={(range) => { setCustomRange(range); setPeriod("custom"); }} numberOfMonths={1} />
                      </div>
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

function StatCard({ label, value, tone = "default", highlight = false }: { 
  label: string; 
  value: number | string; 
  tone?: "default" | "success" | "danger" | "warn"; 
  highlight?: boolean; 
}) {
  const toneClass = { 
    default: "text-foreground", 
    success: "text-emerald-600", 
    danger: "text-destructive", 
    warn: "text-amber-600" 
  }[tone];
  
  return (
    <div className={`rounded-3xl border p-5 shadow-sm ${highlight ? "bg-primary text-primary-foreground" : "bg-card"}`}>
      <div className="text-xs font-semibold uppercase">{label}</div>
      <div className={`mt-2 text-2xl font-bold ${highlight ? "text-primary-foreground" : toneClass}`}>{value}</div>
    </div>
  );
}