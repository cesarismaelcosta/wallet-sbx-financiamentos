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
 *     FROM login_history lh WHERE (p_date_from IS NULL OR lh.created_at >= p_date_from) AND (p_date_to IS NULL OR lh.created_at <= p_date_to) AND (p_status = 'all' OR (p_status = 'success' AND lh.success = true) OR (p_status = 'fail' AND lh.success = false)) AND (p_event = 'all' OR lh.event = p_event) AND (p_search IS NULL OR p_search = '' OR lh.email ILIKE '%' || p_search || '%' OR lh.ip_address ILIKE '%' || p_search || '%' OR (length(regexp_replace(p_search, '\D', '', 'g')) IN (11, 14) AND EXISTS (SELECT 1 FROM login_history_details lhd WHERE lhd.login_history_id = lh.id AND lhd.subject_document_hash = public.document_sha256(p_search)))) ORDER BY lh.created_at DESC LIMIT p_limit OFFSET p_offset
 *   )
 *   SELECT jsonb_agg(jsonb_build_object('id', pa.id, 'email', pa.email, 'event', pa.event, 'success', pa.success, 'failure_reason', pa.failure_reason, 'ip_address', pa.ip_address, 'country', pa.country, 'state', pa.state, 'city', pa.city, 'user_agent', pa.user_agent, 'device_type', pa.device_type, 'operating_system', pa.operating_system, 'origin_details', pa.origin_details, 'created_at', pa.created_at, 'origin_page', pa.origin_page, 'origin_function', pa.origin_function, 'details', (SELECT jsonb_agg(jsonb_build_object('id', lhd.id, 'record_type', lhd.record_type, 'record_id', lhd.record_id, 'created_at', lhd.created_at, 'ip_address', lhd.ip_address) ORDER BY lhd.created_at) FROM login_history_details lhd WHERE lhd.login_history_id = pa.id))) INTO v_result FROM paginated_audit pa;
 *   RETURN COALESCE(v_result, '[]'::jsonb);
 * END;
 *
 * [LGPD] RPC get_backoffice_access_summary(p_detail_id uuid) — migração 20260930190300.
 *   Só admin. Lê login_history_details (record_type/record_id) e devolve o resumo MASCARADO
 *   do registro acessado (mask_document/mask_phone/mask_email), usado pelo AccessDetailPanel.
 *   Tabela login_history_details: migração 20260930190000 (FK login_history_id, RLS admin).
 * $$;
 * ============================================================================
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2, RefreshCw, Search, ChevronDown, ChevronLeft, ChevronRight, Filter } from "lucide-react";
import { DateRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { GradientIcon } from "@/design-system/sbx-design-system-9f1c03/components/ui/gradient-icon";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { supabase } from "@/integrations/supabase/client";
import { PanelEntity } from "@/features/financial-hub/components/shared/renderes/PanelEntity";
import { PanelOffer } from "@/features/financial-hub/components/shared/renderes/PanelOffer";
import { PanelSeller } from "@/features/financial-hub/components/shared/renderes/PanelSeller";
import { PanelSimulation } from "@/features/financial-hub/components/shared/renderes/PanelSimulation";

export const Route = createLazyFileRoute("/backoffice/audit")({ component: AuditoriaPage });

type LoginRow = {
  id: string;
  email: string;
  event: "login" | "logout" | "failed_attempt" | "blocked" | "refresh" | "page_view" | "pii_view";
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
  /** [LGPD]: presente nos eventos `pii_view` (login_history_details). */
  /**
   * [LGPD]: simulações/consultas abertas a partir desta linha (login_history_details).
   * Preenchido na linha "Página visitada" de /backoffice/simulations e /backoffice/consults.
   */
  details?: { id: string; record_type: "simulation" | "consult"; record_id: string; created_at: string; ip_address: string | null }[] | null;
};

const EVENT_LABEL: Record<LoginRow["event"], string> = {
  login: "Login", logout: "Logout", failed_attempt: "Falha na autenticação",
  blocked: "Acesso bloqueado", refresh: "Atualização de Sessão",
  page_view: "Página visitada", pii_view: "Acesso a dados pessoais",
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
  { id: "page_view", label: "Página visitada" },
  { id: "pii_view", label: "Acesso a dados pessoais" },
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
  const [accessRow, setAccessRow] = useState<LoginRow | null>(null);

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
          <h1 className="page-header-title">Auditoria</h1>
          <p className="text-sm text-muted-foreground">
            Monitore o histórico de acessos, eventos de autenticação e segurança do sistema.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => load(page)} disabled={loading} className="cta-gradient border-0 rounded-none text-white">
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

      {error && <div className="rounded-none border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"><strong>Erro:</strong> {error}</div>}

      <div className="rounded-none border border-border bg-card flex flex-col overflow-hidden shadow-xs">
        
        <div className="flex flex-col gap-3 border-b border-border p-4 bg-muted/50">
          
          <div className="lg:hidden">
            <Button 
              variant="outline" 
              onClick={() => setMobileFilterOpen(true)}
              className="w-full h-11 rounded-none gap-2 justify-start bg-card border-border text-foreground shadow-xs hover:bg-primary hover:text-primary-foreground hover:border-primary"
            >
              <GradientIcon icon={Filter} size={16} /> Filtros
            </Button>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            
            <div className="relative w-full lg:flex-1 lg:max-w-md">
              <Input 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
                placeholder="Buscar por e-mail ou IP..." 
                className="h-11 w-full rounded-none bg-card border border-border pl-5 pr-12 text-[13px] text-foreground placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-foreground focus-visible:border-foreground transition-all shadow-none" 
              />
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-muted-foreground" />
            </div>

            <div className="hidden lg:flex lg:items-center lg:gap-2 lg:ml-auto">
              
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10 w-[170px] rounded-none gap-2 bg-card border-border text-foreground justify-between shadow-xs hover:bg-primary hover:text-primary-foreground hover:border-primary">
                    <span className="truncate">Evento: {eventFilter === "all" ? "Todos" : EVENT_LABEL[eventFilter as LoginRow["event"]]}</span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0 rounded-none border-border shadow-xs" align="start">
                  <Command className="bg-card">
                    <CommandList 
                      className="max-h-[70vh] overflow-y-auto overscroll-contain touch-pan-y" 
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        {EVENT_OPTIONS.map(opt => {
                          const isSelected = eventFilter === opt.id;
                          return (
                            <CommandItem key={opt.id} onSelect={() => setEventFilter(opt.id as any)} className={`cursor-pointer rounded-none text-foreground hover:bg-accent ${isSelected ? "bg-muted font-medium" : ""}`}>
                              <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-muted-foreground ${isSelected ? "bg-foreground text-background border-foreground" : "opacity-50"}`}>
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
                  <Button variant="outline" size="sm" className="h-10 w-[150px] rounded-none gap-2 bg-card text-foreground border-border justify-between shadow-xs hover:bg-primary hover:text-primary-foreground hover:border-primary">
                    <span className="truncate">Status: {statusFilter === "all" ? "Todos" : statusFilter === "success" ? "Sucessos" : "Falhas"}</span>
                    <ChevronDown className="h-3 w-3 shrink-0 opacity-40" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-48 bg-card border-border rounded-none shadow-xs z-50" align="start">
                  <Command className="bg-transparent">
                    <CommandList 
                      className="max-h-[70vh] overflow-y-auto overscroll-contain touch-pan-y" 
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        {STATUS_OPTIONS.map(opt => {
                          const isSelected = statusFilter === opt.id;
                          return (
                            <CommandItem key={opt.id} onSelect={() => setStatusFilter(opt.id)} className={`cursor-pointer rounded-none text-foreground hover:bg-accent ${isSelected ? "bg-muted font-medium" : ""}`}>
                              <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-muted-foreground ${isSelected ? "bg-foreground text-background border-foreground" : "opacity-50"}`}>
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
                  <Button variant="outline" size="sm" className="h-10 w-[160px] rounded-none gap-2 bg-card border-border text-foreground justify-between shadow-xs hover:bg-primary hover:text-primary-foreground hover:border-primary">
                    <span className="truncate">Período: {period === "custom" ? "Personalizado" : PERIOD_OPTIONS.find(p => p.id === period)?.label}</span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-auto rounded-none border-border shadow-xs" align="start">
                  <Command className="bg-card">
                    <CommandList 
                      className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y" 
                      style={{ WebkitOverflowScrolling: 'touch' }}
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        {PERIOD_OPTIONS.map(opt => (
                          <CommandItem key={opt.id} onSelect={() => setPeriod(opt.id)} className="rounded-none text-foreground cursor-pointer hover:bg-accent">
                            {opt.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      <div className="p-2 border-t border-border">
                        <p className="text-xs font-bold px-2 mb-2 text-muted-foreground">Personalizado:</p>
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
              <tr className="border-b border-border bg-accent text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
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
                  <td colSpan={7} className="p-10 text-center text-muted-foreground">
                    <div className="flex items-center justify-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-brand-accent" /> Carregando informações...
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
                  return (
                    <tr
                      key={r.id}
                      onClick={r.details?.length ? () => setAccessRow(r) : undefined}
                      title={r.details?.length ? "Ver dados pessoais acessados a partir desta entrada" : undefined}
                      className={`border-b border-border hover:bg-muted transition-colors ${r.details?.length ? "cursor-pointer" : ""}`}
                    >
                      <td className="px-3 py-2.5 w-[120px] text-muted-foreground">
                        <div className="font-bold text-foreground">{dt.date}</div>
                        <div>{dt.time}</div>
                      </td>
                      <td className="px-3 py-2.5 w-[200px] truncate font-medium text-foreground" title={r.email}>{r.email}</td>
                      <td className="px-3 py-2.5 w-[140px] text-muted-foreground font-medium">
                        {EVENT_LABEL[r.event] || r.event}
                        {/* [LGPD]: quantos registros foram abertos a partir desta entrada no menu */}
                        {!!r.details?.length && (
                          <div className="text-[11px] font-bold text-foreground">
                            {r.details.length} {r.details.length === 1 ? "registro aberto" : "registros abertos"}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 w-[120px]">
                        {r.success ? (
                          <span className="text-success font-bold">Sucesso</span>
                        ) : (
                          <span className="text-destructive font-bold">Falha</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">
                        <div className="text-foreground whitespace-nowrap">{r.ip_address || "—"}</div>
                        <div className="text-foreground font-medium whitespace-nowrap">{r.city || "—"}</div>
                        <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {[r.state, r.country].filter(Boolean).join(" · ") || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-foreground whitespace-nowrap">{r.origin_page || "—"}</div>
                        <div className="text-muted-foreground truncate max-w-[160px] md:max-w-[250px]">
                          {r.origin_function || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground font-medium">
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
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted">
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
                className="h-8 text-xs rounded-none border-border text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary"
              >
                <ChevronLeft className="mr-1 h-3.5 w-3.5" />
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
                className="h-8 text-xs rounded-none border-border text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary"
              >
                Próxima
                <ChevronRight className="ml-1 h-3.5 w-3.5" />
              </Button>
           </div>
          </div>
        )}

      </div>

      {/* =========================================================
          GAVETA DE FILTROS MOBILE (AUDITORIA)
          ========================================================= */}
      <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
        <SheetContent side="bottom" className="rounded-none max-h-[85vh] overflow-y-auto p-6 bg-card z-50 border-t border-border">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="text-lg font-bold text-foreground">Filtros</SheetTitle>
          </SheetHeader>

          <div className="flex flex-col gap-4 w-full">

            {/* Filtro de Evento */}
            <div className="w-full">
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Evento</span>
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-11 w-full rounded-none justify-between gap-2 bg-card border-border text-foreground shadow-xs hover:bg-primary hover:text-primary-foreground hover:border-primary">
                    <span className="truncate">Evento: {eventFilter === "all" ? "Todos" : EVENT_LABEL[eventFilter as LoginRow["event"]]}</span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-3rem)] sm:w-56 p-0 rounded-none border-border shadow-xs" align="start">
                  <Command className="bg-card">
                    <CommandList className="max-h-[70vh] overflow-y-auto overscroll-contain touch-pan-y" onWheelCapture={(e) => e.stopPropagation()}>
                      <CommandGroup>
                        {EVENT_OPTIONS.map(opt => {
                          const isSelected = eventFilter === opt.id;
                          return (
                            <CommandItem key={opt.id} onSelect={() => setEventFilter(opt.id as any)} className={`cursor-pointer rounded-none text-foreground hover:bg-accent ${isSelected ? "bg-muted font-medium" : ""}`}>
                              <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-muted-foreground ${isSelected ? "bg-foreground text-background border-foreground" : "opacity-50"}`}>
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
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Status</span>
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-11 w-full rounded-none justify-between gap-2 bg-card text-foreground border-border shadow-xs hover:bg-primary hover:text-primary-foreground hover:border-primary">
                    <span className="truncate">Status: {statusFilter === "all" ? "Todos" : statusFilter === "success" ? "Sucessos" : "Falhas"}</span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-3rem)] sm:w-56 p-0 bg-card border-border rounded-none shadow-xs z-50" align="start">
                  <Command className="bg-transparent">
                    <CommandList className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y" onWheelCapture={(e) => e.stopPropagation()}>
                      <CommandGroup>
                        {STATUS_OPTIONS.map(opt => {
                          const isSelected = statusFilter === opt.id;
                          return (
                            <CommandItem key={opt.id} onSelect={() => setStatusFilter(opt.id)} className={`cursor-pointer rounded-none text-foreground hover:bg-accent ${isSelected ? "bg-muted font-medium" : ""}`}>
                              <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-muted-foreground ${isSelected ? "bg-foreground text-background border-foreground" : "opacity-50"}`}>
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
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Período</span>
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-11 w-full rounded-none justify-between gap-2 bg-card border-border text-foreground shadow-xs hover:bg-primary hover:text-primary-foreground hover:border-primary">
                    <span className="truncate">Período: {period === "custom" ? "Personalizado" : PERIOD_OPTIONS.find(p => p.id === period)?.label}</span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-3rem)] sm:w-auto p-0 rounded-none border-border shadow-xs" align="start">
                  <Command className="bg-card">
                    <CommandList className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }} onWheelCapture={(e) => e.stopPropagation()}>
                      <CommandGroup>
                        {PERIOD_OPTIONS.map(opt => (
                          <CommandItem key={opt.id} onSelect={() => setPeriod(opt.id)} className="rounded-none text-foreground cursor-pointer hover:bg-accent">
                            {opt.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      <div className="p-2 border-t border-border">
                        <p className="text-xs font-bold px-2 mb-2 text-muted-foreground">Personalizado:</p>
                        <Calendar mode="range" selected={customRange} onSelect={(range) => { setCustomRange(range); setPeriod("custom"); }} numberOfMonths={1} />
                      </div>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

            </div>

            <Button onClick={() => setMobileFilterOpen(false)} className="cta-gradient border-0 w-full h-11 rounded-none text-white font-bold mt-2 cursor-pointer">
              Aplicar Filtros
            </Button>

          </div>
        </SheetContent>
      </Sheet>

      {/* [LGPD]: painel lateral do evento pii_view (resumo mascarado + navegação) */}
      <AccessDetailPanel
        row={accessRow}
        onClose={() => setAccessRow(null)}
      />
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
    warn: "text-warning" 
  }[tone];
  
  const formattedValue = typeof value === "number" ? value.toLocaleString("pt-BR") : value;
  
  return (
    <div className={`rounded-none border border-border p-4 flex flex-col justify-between shadow-xs ${highlight ? "bg-accent border-border" : "bg-card"}`}>
      <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground whitespace-nowrap">
        {label}
      </div>
      <div className={`mt-2 text-xl font-semibold tracking-tight ${toneClass} whitespace-nowrap`}>
        {formattedValue}
      </div>
    </div>
  );
}

// =========================================================================
// [LGPD] PAINEL LATERAL DE ACESSO A DADOS PESSOAIS (evento `pii_view`)
// =========================================================================
/**
 * @component AccessDetailPanel
 * @description Painel lateral aberto ao clicar numa linha "Acesso a dados pessoais".
 * Segue o mesmo padrão dos painéis de Simulações e Consultas (Sheet lateral com
 * cabeçalho fixo, corpo rolável com os renderers compartilhados e rodapé de ações).
 *
 * [FONTE DE DADOS]:
 * 1. RPC `get_backoffice_access_summary(p_detail_id)` — resumo MASCARADO do
 *    registro acessado (CPF/telefone/e-mail parciais). Só admin.
 * 2. "Ver dados completos" — chama a RPC de detalhe de origem
 *    (`get_backoffice_simulation_details` / `get_backoffice_consult_details`), que
 *    REGISTRA esse acesso do auditor em login_history_details, ligado à entrada DELE
 *    no menu Auditoria (último page_view /backoffice/audit) — nunca ao grupo de quem
 *    fez a consulta original (actor_email = quem clicou). Cada registro entra uma
 *    vez por entrada no menu: reabrir os dados completos do mesmo registro não duplica.
 *
 * [NAVEGAÇÃO]: Anterior/Próximo percorrem SÓ os registros abertos a partir da linha
 * clicada (row.details) — ex.: a entrada no menu Simulações e as simulações abertas
 * a partir dela (migração 20260930190300).
 */
function AccessDetailPanel({
  row, onClose,
}: {
  row: LoginRow | null;
  onClose: () => void;
}) {
  const [summary, setSummary] = useState<any>(null);
  const [fullEntity, setFullEntity] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [loadingFull, setLoadingFull] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);

  // Registros abertos a partir da linha clicada; volta ao primeiro ao trocar de linha.
  const items = row?.details || [];
  const item = items[index] || null;
  useEffect(() => { setIndex(0); }, [row?.id]);

  // Recarrega o resumo mascarado sempre que o evento selecionado muda.
  useEffect(() => {
    setSummary(null);
    setFullEntity(null);
    setPanelError(null);
    if (!row || !item) return;

    setLoading(true);
    supabase
      .rpc("get_backoffice_access_summary" as any, { p_detail_id: item?.id } as any)
      .then(({ data, error: rpcError }) => {
        if (rpcError) setPanelError(rpcError.message);
        else if ((data as any)?.error) setPanelError("Sem permissão para ver este registro.");
        else setSummary(data);
      })
      .then(() => setLoading(false), () => setLoading(false));
  }, [row?.id, item?.id]);

  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  const rec = summary?.record || {};
  const isConsult = summary?.record_type === "consult";
  // Data/IP do acesso = do registro aberto (não da entrada no menu).
  const dt = item ? formatDateTime(item.created_at) : null;

  // [LGPD]: dado completo só sob demanda — e o próprio acesso fica auditado no banco.
  async function handleLoadFull() {
    if (!summary) return;
    setLoadingFull(true);
    try {
      if (isConsult) {
        const { data, error: rpcError } = await supabase.rpc(
          "get_backoffice_consult_details" as any,
          { p_visit_update_id: summary.record_id } as any,
        );
        if (rpcError) throw rpcError;
        const visit: any = ((data as any)?.visits || [])[0] || {};
        setFullEntity((visit.visit_entities || [])[0] || null);
      } else {
        const { data, error: rpcError } = await supabase.rpc(
          "get_backoffice_simulation_details",
          { p_simulation_id: summary.record_id } as any,
        );
        if (rpcError) throw rpcError;
        setFullEntity(data);
      }
    } catch (err: any) {
      setPanelError(err?.message || "Falha ao carregar dados completos.");
    } finally {
      setLoadingFull(false);
    }
  }

  return (
    <Sheet open={!!row} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col rounded-none bg-card border-l border-border">
        {row && (
          <>
            {/* CABEÇALHO: produto + parceiro + nome do cliente (mesmo layout de Simulações/Consultas) */}
            <div className="p-6 border-b border-border bg-card shrink-0">
              <SheetHeader className="space-y-1 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-bold text-foreground uppercase tracking-wider">
                    {rec.product || (isConsult ? "Consulta" : "Simulação")}
                  </span>
                  <span className="inline-flex items-center rounded-none px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider bg-accent text-foreground">
                    {rec.partner || "Parceiro N/A"}
                  </span>
                  {loading && <Loader2 className="h-3 w-3 animate-spin text-brand-accent" />}
                </div>
                <SheetTitle className="text-lg sm:text-xl font-bold text-foreground break-words text-left w-full">
                  {rec.name || "—"}
                </SheetTitle>
              </SheetHeader>
            </div>

            {/* CORPO: bloco de auditoria + renderers compartilhados */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Bloco de auditoria: quem acessou, quando e de onde (padrão visual do PanelVisit) */}
              <div className="rounded-none border border-border bg-card p-4 space-y-3 shadow-xs">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-foreground border-b border-border pb-2">
                  Acesso a dados pessoais
                </h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <AuditField label="Acessado por" value={row.email} />
                  <AuditField label="Data do acesso" value={dt ? `${dt.date} às ${dt.time}` : "—"} />
                  <AuditField label="IP" value={item?.ip_address || row.ip_address} />
                  <AuditField
                    label="Localização"
                    value={[row.city, row.state, row.country].filter((v) => v && v !== "N/A").join(" / ") || "—"}
                  />
                  <AuditField label="Dispositivo" value={`${row.device_type || "—"} · ${row.operating_system || "—"}`} />
                  <AuditField
                    label="Registro"
                    value={summary ? `${isConsult ? "Consulta" : "Simulação"} ${String(summary.record_id).slice(0, 8)} (${index + 1} de ${items.length})` : "—"}
                  />
                </div>
              </div>

              {panelError && <div className="text-xs font-medium text-destructive">{panelError}</div>}

              {summary && (
                <>
                  {/* Cliente: mascarado por padrão; completo só após "Ver dados completos" */}
                  <PanelEntity entity={fullEntity || rec} />
                  {/* Oferta e vendedor: mesmo registro usado por Simulações/Consultas (não é dado pessoal) */}
                  {rec.offer && <PanelOffer offer={rec.offer} />}
                  {rec.offer && <PanelSeller offer={rec.offer} />}
                  {!isConsult && <PanelSimulation simulation={rec} />}
                </>
              )}
            </div>

            {/* RODAPÉ: navegação entre acessos + dados completos (auditado) */}
            <div className="p-4 bg-card border-t border-border flex items-center justify-between gap-3 shrink-0 shadow-xs">
              <Button variant="outline" className="rounded-none" disabled={!hasPrev} onClick={() => setIndex((i) => i - 1)}>
                <ChevronLeft className="h-4 w-4" /> Anterior
              </Button>
              {summary && !fullEntity && (
                <Button
                  variant="outline"
                  className="rounded-none"
                  onClick={handleLoadFull}
                  disabled={loadingFull}
                  title="Este acesso também fica registrado na auditoria"
                >
                  {loadingFull ? <Loader2 className="h-4 w-4 animate-spin" /> : "Ver dados completos"}
                </Button>
              )}
              <Button variant="outline" className="rounded-none" disabled={!hasNext} onClick={() => setIndex((i) => i + 1)}>
                Próximo <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Campo rótulo/valor em micro-tipografia (mesmo padrão dos renderers do backoffice). */
function AuditField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-foreground font-medium mt-0.5 break-words">{value || "—"}</span>
    </div>
  );
}
