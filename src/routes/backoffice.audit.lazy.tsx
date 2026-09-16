/**
 * ============================================================================
 * @fileoverview Monitor de Auditoria e Segurança (Backoffice Otimizado)
 * @module Backoffice/Audit
 * @route /backoffice/audit
 *
 * @description
 * Torre de controle de logs de acesso e eventos de autenticação. Utiliza paginação
 * server-side com contagem exata, filtros por período e status no banco.
 * 
 * [ENTERPRISE ZERO-TRUST - OBFUSCATION V3]:
 * - A tabela `login_history` não é mais acessada via select direto no PostgREST. 
 *   Para impedir que invasores mapeiem a estrutura de logs de segurança pelo F12,
 *   a listagem agora consome exclusivamente a Stored Procedure `get_backoffice_audit`.
 * 
 * =========================================================================
 * ⚙️ DEPENDÊNCIA DE INFRAESTRUTURA (POSTGRESQL RPCs)
 * =========================================================================
 * Para que este componente funcione, a seguinte Stored Procedure DEVE existir:
 * 
 * -------------------------------------------------------------------------
 * PROCEDURE 1: Listagem Blindada de Auditoria
 * -------------------------------------------------------------------------
 * [FIX F6 - 2026-09-16]: sem teto em p_limit, uma chamada direta ao RPC
 * podia extrair qualquer volume de login_history (ip_address, geo,
 * user_agent) numa única página. Adicionado
 * p_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200) no início.
 * CREATE OR REPLACE FUNCTION get_backoffice_audit(p_limit INT DEFAULT 50, ...) ... AS $$
 * DECLARE v_result JSONB;
 * BEGIN
 *   p_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
 *
 *   WITH paginated_audit AS (
 *     SELECT lh.id, lh.email, lh.event, lh.success, lh.failure_reason, lh.ip_address, lh.country, lh.state, lh.city, lh.user_agent, lh.device_type, lh.operating_system, lh.origin_details, lh.created_at, lh.origin_page, lh.origin_function
 *     FROM login_history lh WHERE (p_date_from IS NULL OR lh.created_at >= p_date_from) AND (p_date_to IS NULL OR lh.created_at <= p_date_to) AND (p_status = 'all' OR (p_status = 'success' AND lh.success = true) OR (p_status = 'fail' AND lh.success = false)) AND (p_event = 'all' OR lh.event = p_event) AND (p_search IS NULL OR p_search = '' OR lh.email ILIKE '%' || p_search || '%' OR lh.ip_address ILIKE '%' || p_search || '%') ORDER BY lh.created_at DESC LIMIT p_limit OFFSET p_offset
 *   )
 *   SELECT jsonb_agg(jsonb_build_object('id', pa.id, 'email', pa.email, 'event', pa.event, 'success', pa.success, 'failure_reason', pa.failure_reason, 'ip_address', pa.ip_address, 'country', pa.country, 'state', pa.state, 'city', pa.city, 'user_agent', pa.user_agent, 'device_type', pa.device_type, 'operating_system', pa.operating_system, 'origin_details', pa.origin_details, 'created_at', pa.created_at, 'origin_page', pa.origin_page, 'origin_function', pa.origin_function)) INTO v_result FROM paginated_audit pa;
 *   RETURN COALESCE(v_result, '[]'::jsonb);
 * END;
 * $$;
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

function getPeriodDates(period: string, customRange?: DateRange) {
  if (period === "custom" && customRange?.from && customRange?.to) {
    return { p_from: customRange.from.toISOString(), p_to: customRange.to.toISOString() };
  }
  if (period !== "all") {
    const days = Number(period);
    const date = new Date();
    date.setDate(date.getDate() - days);
    return { p_from: date.toISOString(), p_to: new Date().toISOString() };
  }
  return { p_from: null, p_to: null };
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
  const [stats, setStats] = useState({ total: 0, sucessos: 0, falhas: 0, bloqueios: 0, emails_unicos: 0 });

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [eventFilter, setEventFilter] = useState<string>("all");
  const [period, setPeriod] = useState<string>("7");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const PAGE_SIZE = 50;

  const rangeFrom = customRange?.from?.toISOString();
  const rangeTo = customRange?.to?.toISOString();

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setPage(0);
      load(0);
      loadStats();
    }, 400);
    return () => clearTimeout(timeoutId);
  }, [search, period, rangeFrom, rangeTo, statusFilter, eventFilter]);

  async function load(targetPage: number) {
    setLoading(true);
    setError(null);

    try {
      const from = targetPage * PAGE_SIZE;
      const { p_from, p_to } = getPeriodDates(period, customRange);

      // =========================================================================
      // [ENTERPRISE ZERO-TRUST]: Listagem cega de auditoria. Nenhuma tabela vaza.
      // =========================================================================
      const { data: rpcData, error: err } = await supabase.rpc('get_backoffice_audit', {
        p_limit: PAGE_SIZE + 1,
        p_offset: from,
        p_date_from: p_from,
        p_date_to: p_to,
        p_status: statusFilter,
        p_event: eventFilter,
        p_search: search.trim() || null
      });

      if (err) throw err;

      const rawData = (rpcData ?? []) as LoginRow[];

      if (rawData.length === 0) {
        setRows([]);
        setTotalPages(targetPage + 1);
        return;
      }

      const hasMore = rawData.length > PAGE_SIZE;
      const slicedData = hasMore ? rawData.slice(0, PAGE_SIZE) : rawData;
      
      setRows(slicedData);
      setTotalPages(hasMore ? targetPage + 2 : targetPage + 1);
    } catch (err: any) {
      setError(err.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    const { p_from, p_to } = getPeriodDates(period, customRange);
    
    // O RPC 'audit_login_stats' original permanece para gerar os KPIs
    const { data, error } = await supabase.rpc("audit_login_stats", {
      p_from,
      p_to,
      p_status: statusFilter,
      p_event: eventFilter,
      p_search: search.trim() || null,
    });

    if (error) {
      console.error("Erro ao carregar stats:", error);
      return;
    }

    const s = data?.[0] ?? { total: 0, sucessos: 0, falhas: 0, bloqueios: 0, emails_unicos: 0 };
    setStats(s);
    setTotalPages(Math.ceil(s.total / PAGE_SIZE));
  }

  const filtered = useMemo(() => {
    return [...rows].sort((a, b) => new Date(getEventDateTime(b)).getTime() - new Date(getEventDateTime(a)).getTime());
  }, [rows]);

  return (
    <div className="font-sans space-y-6">
      
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-950">Auditoria</h1>
          <p className="text-sm text-neutral-600">
            Monitore o histórico de acessos, eventos de autenticação e segurança do sistema.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => load(page)} disabled={loading} className="rounded-none bg-neutral-900 hover:bg-neutral-800 text-white shadow-xs">
            <RefreshCw className={`mr-2 h-4 w-4 shrink-0 ${loading ? "animate-spin" : ""}`} /> 
            Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Total de eventos (filtro)" value={stats.total} />
        <StatCard label="Sucessos" value={stats.sucessos} tone="success" />
        <StatCard label="Falhas" value={stats.falhas} tone="danger" />
        <StatCard label="Bloqueios" value={stats.bloqueios} tone="warn" />
        <StatCard label="E-mails únicos" value={stats.emails_unicos} highlight />
      </div>

      {error && <div className="rounded-none border border-red-200 bg-red-50 p-4 text-sm text-red-600"><strong>Erro:</strong> {error}</div>}

      <div className="rounded-none border border-neutral-200 bg-white flex flex-col overflow-hidden shadow-xs">
        
        <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 bg-neutral-50/50">
          
          <div className="lg:hidden">
            <Button 
              variant="outline" 
              onClick={() => setMobileFilterOpen(true)}
              className="w-full h-11 rounded-none gap-2 justify-start bg-white border-neutral-200 text-neutral-900 shadow-xs"
            >
              <Filter className="h-4 w-4 text-neutral-900" /> Filtros
            </Button>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            
            <div className="relative w-full lg:flex-1 lg:max-w-md">
              <Input 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
                placeholder="Buscar por e-mail ou IP..." 
                className="h-11 w-full rounded-none bg-white border border-neutral-200 pl-5 pr-12 text-[13px] text-neutral-900 placeholder:text-neutral-500 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900 transition-all shadow-none" 
              />
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-neutral-400" />
            </div>

            <div className="hidden lg:flex lg:items-center lg:gap-2 lg:ml-auto">
              
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10 w-[170px] rounded-none gap-2 bg-white hover:bg-neutral-50 border-neutral-200 text-neutral-900 justify-between shadow-xs">
                    <span className="truncate">Evento: {eventFilter === "all" ? "Todos" : EVENT_LABEL[eventFilter as LoginRow["event"]]}</span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0 rounded-none border-neutral-200 shadow-xs" align="start">
                  <Command className="bg-white">
                    <CommandList 
                      className="max-h-[70vh] overflow-y-auto overscroll-contain touch-pan-y" 
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        {EVENT_OPTIONS.map(opt => {
                          const isSelected = eventFilter === opt.id;
                          return (
                            <CommandItem key={opt.id} onSelect={() => setEventFilter(opt.id as any)} className={`cursor-pointer rounded-none text-neutral-900 hover:bg-neutral-100 ${isSelected ? "bg-neutral-50 font-medium" : ""}`}>
                              <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${isSelected ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>
                                {isSelected && "✓"}
                              </div>
                              {opt.label}
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
                  <Button variant="outline" size="sm" className="h-10 w-[150px] rounded-none gap-2 bg-white text-neutral-900 border-neutral-200 hover:bg-neutral-50 justify-between shadow-xs">
                    <span className="truncate">Status: {statusFilter === "all" ? "Todos" : statusFilter === "success" ? "Sucessos" : "Falhas"}</span>
                    <ChevronDown className="h-3 w-3 shrink-0 opacity-40" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-48 bg-white border-neutral-200 rounded-none shadow-xs z-50" align="start">
                  <Command className="bg-transparent">
                    <CommandList 
                      className="max-h-[70vh] overflow-y-auto overscroll-contain touch-pan-y" 
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        {STATUS_OPTIONS.map(opt => {
                          const isSelected = statusFilter === opt.id;
                          return (
                            <CommandItem key={opt.id} onSelect={() => setStatusFilter(opt.id)} className={`cursor-pointer rounded-none text-neutral-900 hover:bg-neutral-100 ${isSelected ? "bg-neutral-50 font-medium" : ""}`}>
                              <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${isSelected ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>
                                {isSelected && "✓"}
                              </div>
                              {opt.label}
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
                  <Button variant="outline" size="sm" className="h-10 w-[160px] rounded-none gap-2 bg-white hover:bg-neutral-50 border-neutral-200 text-neutral-900 justify-between shadow-xs">
                    <span className="truncate">Período: {period === "custom" ? "Personalizado" : PERIOD_OPTIONS.find(p => p.id === period)?.label}</span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-auto rounded-none border-neutral-200 shadow-xs" align="start">
                  <Command className="bg-white">
                    <CommandList 
                      className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y" 
                      style={{ WebkitOverflowScrolling: 'touch' }}
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        {PERIOD_OPTIONS.map(opt => (
                          <CommandItem key={opt.id} onSelect={() => setPeriod(opt.id)} className="rounded-none text-neutral-900 cursor-pointer hover:bg-neutral-100">
                            {opt.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      <div className="p-2 border-t border-neutral-200">
                        <p className="text-xs font-bold px-2 mb-2 text-neutral-500">Personalizado:</p>
                        <Calendar mode="range" selected={customRange} onSelect={(range) => { setCustomRange(range); setPeriod("custom"); }} numberOfMonths={1} />
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
              <tr className="border-b border-neutral-200 bg-neutral-100 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap">
                <th className="px-3 py-2.5 w-[120px]">Quando</th>
                <th className="px-3 py-2.5 w-[200px]">E-mail</th>
                <th className="px-3 py-2.5 w-[140px]">Evento</th>
                <th className="px-3 py-2.5 w-[120px]">Resultado</th>
                <th className="px-3 py-2.5">Origem</th>
                <th className="px-3 py-2.5">Contexto</th>
                <th className="px-3 py-2.5">Dispositivo</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-neutral-500">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-neutral-900" /> Carregando informações...
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-neutral-500">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const dt = formatDateTime(getEventDateTime(r));
                  return (
                    <tr key={r.id} className="border-b border-neutral-100 hover:bg-neutral-50 transition-colors">
                      <td className="px-3 py-2.5 w-[120px] text-neutral-500">
                        <div className="font-bold text-neutral-900">{dt.date}</div>
                        <div>{dt.time}</div>
                      </td>
                      <td className="px-3 py-2.5 w-[200px] truncate font-medium text-neutral-900" title={r.email}>{r.email}</td>
                      <td className="px-3 py-2.5 w-[140px] text-neutral-600 font-medium">{EVENT_LABEL[r.event] || r.event}</td>
                      <td className="px-3 py-2.5 w-[120px]">
                        {r.success ? (
                          <span className="text-emerald-600 font-bold">Sucesso</span>
                        ) : (
                          <span className="text-rose-600 font-bold">Falha</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-neutral-500">
                        <div className="text-neutral-900 whitespace-nowrap">{r.ip_address || "—"}</div>
                        <div className="text-neutral-900 font-medium whitespace-nowrap">{r.city || "—"}</div>
                        <div className="text-[11px] text-neutral-500 whitespace-nowrap">
                          {[r.state, r.country].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-neutral-900 whitespace-nowrap">{r.origin_page || "—"}</div>
                        <div className="text-neutral-500 truncate max-w-[160px] md:max-w-[250px]">
                          {r.origin_function || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-neutral-500 font-medium">
                        {r.device_type || "—"} · {r.operating_system || "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 bg-neutral-50">
            <div className="text-xs text-neutral-500 font-medium">
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
                className="h-8 text-xs rounded-none border-neutral-200 text-neutral-900 hover:bg-neutral-100"
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
                className="h-8 text-xs rounded-none border-neutral-200 text-neutral-900 hover:bg-neutral-100"
              >
                Próxima
              </Button>
           </div>
          </div>
        )}

      </div>

      {/* =========================================================
          GAVETA DE FILTROS MOBILE (AUDITORIA)
          ========================================================= */}
      <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
        <SheetContent side="bottom" className="rounded-none max-h-[85vh] overflow-y-auto p-6 bg-white z-50 border-t border-neutral-200">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="text-lg font-bold text-neutral-900">Filtros</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-4 w-full">

            {/* Filtro de Evento */}
            <div className="w-full">
              <span className="text-xs font-medium text-neutral-500 mb-1 block">Evento</span>
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-11 w-full rounded-none justify-between gap-2 bg-white border-neutral-200 text-neutral-900 shadow-xs">
                    <span className="truncate">Evento: {eventFilter === "all" ? "Todos" : EVENT_LABEL[eventFilter as LoginRow["event"]]}</span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-3rem)] sm:w-56 p-0 rounded-none border-neutral-200 shadow-xs" align="start">
                  <Command className="bg-white">
                    <CommandList className="max-h-[70vh] overflow-y-auto overscroll-contain touch-pan-y" onWheelCapture={(e) => e.stopPropagation()}>
                      <CommandGroup>
                        {EVENT_OPTIONS.map(opt => {
                          const isSelected = eventFilter === opt.id;
                          return (
                            <CommandItem key={opt.id} onSelect={() => setEventFilter(opt.id as any)} className={`cursor-pointer rounded-none text-neutral-900 hover:bg-neutral-100 ${isSelected ? "bg-neutral-50 font-medium" : ""}`}>
                              <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${isSelected ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>
                                {isSelected && "✓"}
                              </div>
                              {opt.label}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Filtro de Status */}
            <div className="w-full">
              <span className="text-xs font-medium text-neutral-500 mb-1 block">Status</span>
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-11 w-full rounded-none justify-between gap-2 bg-white text-neutral-900 border-neutral-200 shadow-xs">
                    <span className="truncate">Status: {statusFilter === "all" ? "Todos" : statusFilter === "success" ? "Sucessos" : "Falhas"}</span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-3rem)] sm:w-56 p-0 bg-white border-neutral-200 rounded-none shadow-xs z-50" align="start">
                  <Command className="bg-transparent">
                    <CommandList className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y" onWheelCapture={(e) => e.stopPropagation()}>
                      <CommandGroup>
                        {STATUS_OPTIONS.map(opt => {
                          const isSelected = statusFilter === opt.id;
                          return (
                            <CommandItem key={opt.id} onSelect={() => setStatusFilter(opt.id)} className={`cursor-pointer rounded-none text-neutral-900 hover:bg-neutral-100 ${isSelected ? "bg-neutral-50 font-medium" : ""}`}>
                              <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${isSelected ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>
                                {isSelected && "✓"}
                              </div>
                              {opt.label}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Filtro de Período */}
            <div className="w-full">
              <span className="text-xs font-medium text-neutral-500 mb-1 block">Período</span>
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-11 w-full rounded-none justify-between gap-2 bg-white border-neutral-200 text-neutral-900 shadow-xs">
                    <span className="truncate">Período: {period === "custom" ? "Personalizado" : PERIOD_OPTIONS.find(p => p.id === period)?.label}</span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-3rem)] sm:w-auto p-0 rounded-none border-neutral-200 shadow-xs" align="start">
                  <Command className="bg-white">
                    <CommandList className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }} onWheelCapture={(e) => e.stopPropagation()}>
                      <CommandGroup>
                        {PERIOD_OPTIONS.map(opt => (
                          <CommandItem key={opt.id} onSelect={() => setPeriod(opt.id)} className="rounded-none text-neutral-900 cursor-pointer hover:bg-neutral-100">
                            {opt.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      <div className="p-2 border-t border-neutral-200">
                        <p className="text-xs font-bold px-2 mb-2 text-neutral-500">Personalizado:</p>
                        <Calendar mode="range" selected={customRange} onSelect={(range) => { setCustomRange(range); setPeriod("custom"); }} numberOfMonths={1} />
                      </div>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

            </div>

            <Button onClick={() => setMobileFilterOpen(false)} className="w-full h-11 rounded-none bg-neutral-900 hover:bg-neutral-800 text-white font-bold mt-2 shadow-xs cursor-pointer">
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
    default: "text-neutral-900", 
    success: "text-emerald-600", 
    danger: "text-rose-600", 
    warn: "text-amber-600" 
  }[tone];
  
  const formattedValue = typeof value === "number" ? value.toLocaleString("pt-BR") : value;
  
  return (
    <div className={`rounded-none border border-neutral-200 p-4 flex flex-col justify-between shadow-xs ${highlight ? "bg-neutral-100 border-neutral-300" : "bg-white"}`}>
      <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 whitespace-nowrap">
        {label}
      </div>
      <div className={`mt-2 text-xl font-semibold tracking-tight ${toneClass} whitespace-nowrap`}>
        {formattedValue}
      </div>
    </div>
  );
}