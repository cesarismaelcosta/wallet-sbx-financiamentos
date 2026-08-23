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
 *
 * [MUDANÇAS ARQUITETURAIS - 1:N EVENT MODEL]:
 * A consulta de Visitas (Topo de Funil) foi migrada para ler os IDs de Produto
 * e Parceiro da tabela `visit_updates` (Eventos), uma vez que o modelo 1:N
 * do banco removeu essas colunas da raiz (carrinho).
 * 
 * [ENTERPRISE ZERO-TRUST - OBFUSCATION V3]:
 * - As queries pesadas que puxavam 5k~10k registros brutos via PostgREST 
 *   foram blindadas. O Dashboard consome os dados apenas via RPCs (`get_dashboard_simulations_raw`, 
 *   `get_dashboard_visits_raw`, `get_dashboard_contact_count`). A lógica de KPI
 *   em memória (redução client-side) foi 100% mantida, mas a estrutura
 *   do banco está protegida contra engenharia reversa via F12.
 * - RBAC SERVER-SIDE: O frontend não injeta mais os escopos (p_allowed_*). O próprio
 *   banco valida o JWT e restringe o acesso tanto para Simulações, Visitas e KPIs (Contatos).
 * 
 * =========================================================================
 * ⚙️ DEPENDÊNCIA DE INFRAESTRUTURA (POSTGRESQL RPCs)
 * =========================================================================
 * Para que o Dashboard funcione blindado, estas 3 Procedures DEVEM existir:
 * 
 * -------------------------------------------------------------------------
 * PROCEDURE 1: Busca Segura de Simulações para Agregação
 * -------------------------------------------------------------------------
 * CREATE OR REPLACE FUNCTION get_dashboard_simulations_raw(
 *   p_start TIMESTAMPTZ, p_end TIMESTAMPTZ, p_partner_ids INT[] DEFAULT NULL, p_product_ids INT[] DEFAULT NULL
 * ) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
 * DECLARE 
 *   v_result JSONB;
 *   v_caller_email TEXT := auth.jwt() ->> 'email';
 *   v_role TEXT;
 *   v_allowed_partners JSONB;
 *   v_allowed_products JSONB;
 * BEGIN
 *   SELECT role, allowed_partners, allowed_products INTO v_role, v_allowed_partners, v_allowed_products FROM backoffice_users WHERE LOWER(email) = LOWER(v_caller_email) AND is_active = true;
 *   IF v_role IS NULL THEN RETURN '[]'::jsonb; END IF;
 *   IF v_role IN ('admin', 'manager') THEN v_allowed_partners := '["*"]'::jsonb; v_allowed_products := '["*"]'::jsonb; END IF;
 * 
 *   SELECT jsonb_agg(jsonb_build_object(
 *       'id', s.id, 'financed_amount', s.financed_amount, 'document', s.document, 'created_at', s.created_at,
 *       'partner_id', s.partner_id, 'product_id', s.product_id,
 *       'status_types', CASE WHEN stt.id IS NOT NULL THEN jsonb_build_object('name', stt.name) ELSE NULL END,
 *       'partners', CASE WHEN p.id IS NOT NULL THEN jsonb_build_object('name', p.name) ELSE NULL END,
 *       'product_types', CASE WHEN pt.id IS NOT NULL THEN jsonb_build_object('name', pt.name) ELSE NULL END
 *   )) INTO v_result FROM simulations s
 *   LEFT JOIN status_types stt ON s.status_id = stt.id LEFT JOIN partners p ON s.partner_id = p.id LEFT JOIN product_types pt ON s.product_id = pt.id
 *   WHERE s.created_at >= p_start AND s.created_at <= p_end
 *     AND (p_partner_ids IS NULL OR s.partner_id = ANY(p_partner_ids)) AND (p_product_ids IS NULL OR s.product_id = ANY(p_product_ids))
 *     AND (v_allowed_partners IS NULL OR v_allowed_partners ? '*' OR v_allowed_partners ? s.partner_id::TEXT)
 *     AND (v_allowed_products IS NULL OR v_allowed_products ? '*' OR v_allowed_products ? s.product_id::TEXT)
 *   LIMIT 5000;
 *   RETURN COALESCE(v_result, '[]'::jsonb);
 * END;
 * $$;
 * 
 * -------------------------------------------------------------------------
 * PROCEDURE 2: Busca Segura de Visitas para Agregação
 * -------------------------------------------------------------------------
 * CREATE OR REPLACE FUNCTION get_dashboard_visits_raw(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ) 
 * RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
 * DECLARE 
 *   v_result JSONB;
 *   v_caller_email TEXT := auth.jwt() ->> 'email';
 *   v_role TEXT;
 *   v_allowed_partners JSONB;
 *   v_allowed_products JSONB;
 * BEGIN
 *   SELECT role, allowed_partners, allowed_products INTO v_role, v_allowed_partners, v_allowed_products FROM backoffice_users WHERE LOWER(email) = LOWER(v_caller_email) AND is_active = true;
 *   IF v_role IS NULL THEN RETURN '[]'::jsonb; END IF;
 *   IF v_role IN ('admin', 'manager') THEN v_allowed_partners := '["*"]'::jsonb; v_allowed_products := '["*"]'::jsonb; END IF;
 * 
 *   SELECT jsonb_agg(jsonb_build_object(
 *       'id', v.id, 'action', v.action, 'utm_source', v.utm_source, 'created_at', v.created_at, 'ip_address', v.ip_address,
 *       'visit_entities', (SELECT jsonb_agg(jsonb_build_object('document', ve.document)) FROM visit_entities ve WHERE ve.visit_id = v.id),
 *       'visit_updates', (SELECT jsonb_agg(jsonb_build_object('id', vu.id, 'partner_id', vu.partner_id, 'product_id', vu.product_id, 'action', vu.action)) FROM visit_updates vu WHERE vu.visit_id = v.id)
 *   )) INTO v_result FROM visits v 
 *   WHERE v.created_at >= p_start AND v.created_at <= p_end
 *   AND (v_allowed_partners IS NULL OR v_allowed_partners ? '*' OR EXISTS (SELECT 1 FROM visit_updates vu2 WHERE vu2.visit_id = v.id AND v_allowed_partners ? vu2.partner_id::TEXT))
 *   AND (v_allowed_products IS NULL OR v_allowed_products ? '*' OR EXISTS (SELECT 1 FROM visit_updates vu3 WHERE vu3.visit_id = v.id AND v_allowed_products ? vu3.product_id::TEXT))
 *   LIMIT 10000;
 *   RETURN COALESCE(v_result, '[]'::jsonb);
 * END;
 * $$;
 * 
 * -------------------------------------------------------------------------
 * PROCEDURE 3: Contagem Otimizada de Contatos (BLINDADA)
 * -------------------------------------------------------------------------
 * CREATE OR REPLACE FUNCTION get_dashboard_contact_count(p_start TIMESTAMPTZ, p_end TIMESTAMPTZ) 
 * RETURNS INT LANGUAGE plpgsql SECURITY DEFINER AS $$
 * DECLARE 
 *   v_count INT;
 *   v_caller_email TEXT := auth.jwt() ->> 'email';
 *   v_role TEXT;
 *   v_allowed_partners JSONB;
 *   v_allowed_products JSONB;
 * BEGIN
 *   SELECT role, allowed_partners, allowed_products INTO v_role, v_allowed_partners, v_allowed_products FROM backoffice_users WHERE LOWER(email) = LOWER(v_caller_email) AND is_active = true;
 *   IF v_role IS NULL THEN RETURN 0; END IF;
 *   IF v_role IN ('admin', 'manager') THEN v_allowed_partners := '["*"]'::jsonb; v_allowed_products := '["*"]'::jsonb; END IF;
 * 
 *   SELECT COUNT(DISTINCT v.id) INTO v_count FROM visits v JOIN visit_updates vu ON v.id = vu.visit_id
 *   WHERE vu.action = 'CONTACT' AND v.created_at >= p_start AND v.created_at <= p_end
 *     AND (v_allowed_partners IS NULL OR v_allowed_partners ? '*' OR v_allowed_partners ? vu.partner_id::TEXT)
 *     AND (v_allowed_products IS NULL OR v_allowed_products ? '*' OR v_allowed_products ? vu.product_id::TEXT);
 *   RETURN COALESCE(v_count, 0);
 * END;
 * $$;
 * ============================================================================
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useState, lazy, Suspense } from "react";
import { DateRange } from "react-day-picker";
import { useIsMobile } from "@/hooks/use-mobile";

// Ícones UI
import {
  ArrowUpRight,
  CircleDollarSign,
  ClipboardList,
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
import { useAuth } from "@/integrations/auth/AuthContext";

// Conexão com Banco de Dados
import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// LAZY LOADING DOS GRÁFICOS (FORA DO BUNDLE INICIAL)
// ============================================================================
const ChartsSimulationModule = lazy(
  () => import("@/features/financial-hub/components/shared/renderes/ChartsSimulation"),
);
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

export type DropdownItem = {
  id: number | string;
  name: string;
};

export type DashboardSimulationRow = {
  id: string;
  financed_amount: number | null;
  document: string | null;
  created_at: string | null;
  partner_id: number | null;
  product_id: number | null;
  status_types?: { name: string } | null;
  partners?: { name: string } | null;
  product_types?: { name: string } | null;
};

export type DashboardVisitUpdate = {
  id: string;
  partner_id: number | null;
  product_id: number | null;
  action: string | null;
};

export type DashboardVisitEntity = {
  document: string | null;
};

export type DashboardVisitRow = {
  id: string;
  action: string | null;
  utm_source: string | null;
  created_at: string | null;
  ip_address: string | null;
  visit_entities: DashboardVisitEntity[] | DashboardVisitEntity | null;
  visit_updates: DashboardVisitUpdate[] | DashboardVisitUpdate | null;
};

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
  consultas: number;
  contacts: number;
  conversionRate: number;
  bySource: Array<{ name: string; count: number }>;
  byAction: Array<{ name: string; count: number }>;
  byProduct: Array<{ name: string; count: number }>;
  byDay: Array<{ day: string; count: number }>;
};

// ✨ [ENTERPRISE ZERO-TRUST]: Chamada cega via RPC para contar contatos
async function getUniqueContactCount(start: Date, end: Date) {
  const { data, error } = await supabase.rpc('get_dashboard_contact_count', {
    p_start: start.toISOString(),
    p_end: end.toISOString()
  });

  if (error) return 0;
  return data || 0;
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
  const { backofficeUser } = useAuth();
  const isMobile = useIsMobile();

  const [simKpis, setSimKpis] = useState<SimKpis | null>(null);
  const [visitKpis, setVisitKpis] = useState<VisitKpis | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dateRange, setDateRange] = useState<"7" | "15" | "30" | "all" | "custom">("30");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const [partnersList, setPartnersList] = useState<DropdownItem[]>([]);
  const [productsList, setProductsList] = useState<DropdownItem[]>([]);

  useEffect(() => {
    async function loadDropdowns() {
      if (!backofficeUser) return;

      const { data: pData } = await supabase.from("partners").select("id, name").eq("is_active", true).order("name");
      if (pData) {
        if (backofficeUser.role === "viewer") {
          const allowedPartners = backofficeUser.allowed_partners || [];
          if (allowedPartners.includes("*")) {
            setPartnersList(pData as DropdownItem[]);
          } else {
            const filteredPartners = pData.filter((p) => allowedPartners.includes(String(p.id)));
            setPartnersList(filteredPartners as DropdownItem[]);
          }
        } else {
          setPartnersList(pData as DropdownItem[]);
        }
      }

      const { data: prData } = await supabase.from("product_types").select("id, name").order("name");
      if (prData) {
        if (backofficeUser.role === "viewer") {
          const allowedProducts = backofficeUser.allowed_products || [];
          if (allowedProducts.includes("*")) {
            setProductsList(prData as DropdownItem[]);
          } else {
            const filteredProducts = prData.filter((pr) => allowedProducts.includes(String(pr.id)));
            setProductsList(filteredProducts as DropdownItem[]);
          }
        } else {
          setProductsList(prData as DropdownItem[]);
        }
      }
    }
    loadDropdowns();
  }, [backofficeUser]);

  useEffect(() => {
    if (!backofficeUser) return; 

    const timeoutId = setTimeout(() => {
      load();
    }, 400);

    return () => clearTimeout(timeoutId);
  }, [dateRange, customRange, selectedPartners, selectedProducts, backofficeUser]);

  async function load() {
    setLoading(true);
    setError(null);

    if (!backofficeUser) {
      setLoading(false);
      return;
    }

    let currentProducts = productsList;
    if (currentProducts.length === 0) {
      const { data } = await supabase.from("product_types").select("id, name");
      if (data) currentProducts = data as DropdownItem[];
    }

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

    const cleanPartners = selectedPartners.map((id) => Number(id)).filter((n: number) => !isNaN(n));
    const cleanProducts = selectedProducts.map((id) => Number(id)).filter((n: number) => !isNaN(n));

    // ============================================================================
    // ✨ [ENTERPRISE ZERO-TRUST]: Disparo das RPCs Cegas
    // ============================================================================
    const querySim = supabase.rpc('get_dashboard_simulations_raw', {
      p_start: start.toISOString(),
      p_end: end.toISOString(),
      p_partner_ids: cleanPartners.length > 0 ? cleanPartners : null,
      p_product_ids: cleanProducts.length > 0 ? cleanProducts : null
    });

    const queryVis = supabase.rpc('get_dashboard_visits_raw', {
      p_start: start.toISOString(),
      p_end: end.toISOString()
    });

    const [resSim, resVis] = await Promise.all([querySim, queryVis]);

    if (resSim.error || resVis.error) {
      setError(resSim.error?.message || resVis.error?.message || "Erro de rede ao buscar métricas.");
      setLoading(false);
      return;
    }

    const simRows: DashboardSimulationRow[] = (resSim.data as DashboardSimulationRow[]) ?? [];
    let visRows: DashboardVisitRow[] = (resVis.data as DashboardVisitRow[]) ?? [];

    if (cleanPartners.length > 0) {
      const pIds = cleanPartners.map((id) => String(id));
      visRows = visRows.filter((v) => {
        const updates = Array.isArray(v.visit_updates) ? v.visit_updates : v.visit_updates ? [v.visit_updates] : [];
        return updates.some((u) => pIds.includes(String(u.partner_id)));
      });
    }

    if (cleanProducts.length > 0) {
      const prIds = cleanProducts.map((id) => String(id));
      visRows = visRows.filter((v) => {
        const updates = Array.isArray(v.visit_updates) ? v.visit_updates : v.visit_updates ? [v.visit_updates] : [];
        return updates.some((u) => prIds.includes(String(u.product_id)));
      });
    }

    // ============================================================================
    // PROCESSAMENTO DOS KPIS DE SIMULAÇÃO E VISITA
    // ============================================================================
    const now = new Date();
    const todayStart = startOfDay(now).toISOString();
    const weekStart = startOfDay(new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000)).toISOString();

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
      const statusName = r.status_types?.name ?? "Indefinido";
      const currentS = statusMap.get(statusName) ?? { count: 0, volume: 0 };
      statusMap.set(statusName, { count: currentS.count + 1, volume: currentS.volume + amount });

      const prodName = r.product_types?.name ?? "Não Informado";
      const currentProd = productMap.get(prodName) ?? { count: 0, volume: 0 };
      productMap.set(prodName, { count: currentProd.count + 1, volume: currentProd.volume + amount });

      const partName = r.partners?.name ?? "Venda Direta";
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

    const simDayMap = new Map<string, number>();
    const visDayMap = new Map<string, number>();

    let chartDaysCount = 30;
    if (dateRange !== "all" && dateRange !== "custom") {
      chartDaysCount = parseInt(dateRange);
    } else if (dateRange === "custom" && customRange?.from && customRange?.to) {
      const diffTime = Math.abs(customRange.to.getTime() - customRange.from.getTime());
      chartDaysCount = Math.min(Math.ceil(diffTime / (1000 * 60 * 60 * 24)), 60);
    }

    for (let i = chartDaysCount - 1; i >= 0; i--) {
      const d = new Date(end.getTime());
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      simDayMap.set(key, 0);
      visDayMap.set(key, 0);
    }

    simRows.forEach((r) => {
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

    const totalVisits = visRows.length;
    const uniqueDocs = new Set(
      visRows
        .map((v) => {
          const entity = Array.isArray(v.visit_entities) ? v.visit_entities[0] : v.visit_entities;
          return entity?.document ? String(entity.document).replace(/\D/g, "") : null;
        })
        .filter(Boolean),
    );

    const actionMap = new Map<string, number>();
    const sourceMap = new Map<string, number>();
    const visProductMap = new Map<string, number>();

    let totalConsultas = 0;
    let totalSimulates = 0;
    let totalRedirects = 0;
    let totalVisitsWithSimulate = 0;

    visRows.forEach((v) => {
      const source = v.utm_source || "Orgânico";
      sourceMap.set(source, (sourceMap.get(source) || 0) + 1);

      const updates = Array.isArray(v.visit_updates) ? v.visit_updates : v.visit_updates ? [v.visit_updates] : [];
      let hasSimulateInThisVisit = false;

      updates.forEach((u) => {
        const act = (u.action || v.action || "").toUpperCase();
        if (act && act !== "VISIT") actionMap.set(act, (actionMap.get(act) || 0) + 1);
        if (act === "CONSULT") totalConsultas++;
        if (act === "REDIRECT") totalRedirects++;
        if (act === "SIMULATE") {
          totalSimulates++;
          hasSimulateInThisVisit = true;
        }
        if (act === "CONSULT" || act === "SIMULATE") {
          const prodName = currentProducts.find((p) => String(p.id) === String(u.product_id))?.name ?? "Outros";
          visProductMap.set(prodName, (visProductMap.get(prodName) || 0) + 1);
        }
      });

      if (hasSimulateInThisVisit) totalVisitsWithSimulate++;

      if (v.created_at) {
        const key = v.created_at.slice(0, 10);
        if (visDayMap.has(key)) visDayMap.set(key, (visDayMap.get(key) || 0) + 1);
      }
    });

    const contactsCount = await getUniqueContactCount(start, end);
    if (contactsCount > 0) {
      actionMap.set("CONTACT", contactsCount);
    } else {
      actionMap.delete("CONTACT");
    }

    const visByDay = Array.from(visDayMap.entries()).map(([day, count]) => ({ day, count }));

    setVisitKpis({
      total: totalVisits,
      unique: uniqueDocs.size > 0 ? uniqueDocs.size : totalVisits,
      redirects: totalRedirects,
      simulates: totalSimulates,
      consultas: totalConsultas,
      contacts: contactsCount,
      conversionRate: totalVisits > 0 ? (totalVisitsWithSimulate / totalVisits) * 100 : 0,
      bySource: Array.from(sourceMap.entries()).map(([name, count]) => ({ name, count })),
      byAction: Array.from(actionMap.entries()).map(([name, count]) => ({ name, count })),
      byProduct: Array.from(visProductMap.entries()).map(([name, count]) => ({ name, count })),
      byDay: visByDay,
    });

    setLoading(false);
  }

  function resetKpis() {
    setSimKpis({ today: 0, week: 0, month: 0, monthVolume: 0, ticket: 0, uniqueClients: 0, byStatus: [], byProduct: [], byPartner: [], byDay: [] });
    setVisitKpis({ total: 0, unique: 0, redirects: 0, simulates: 0, consultas: 0, contacts: 0, conversionRate: 0, bySource: [], byAction: [], byProduct: [], byDay: [] });
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
        { label: "Simulações", subLabel: periodLabel, value: simKpis.month.toLocaleString("pt-BR"), hint: `${simKpis.today} hoje`, icon: ClipboardList },
        { label: "Volume simulado", subLabel: periodLabel, value: BRL(simKpis.monthVolume), hint: `${simKpis.month} simulações`, icon: CircleDollarSign },
        { label: "Ticket médio", subLabel: periodLabel, value: BRL(simKpis.ticket), hint: "valor médio", icon: TrendingUp },
        { label: "Clientes únicos", subLabel: periodLabel, value: simKpis.uniqueClients.toLocaleString("pt-BR"), hint: "CPFs distintos", icon: Users },
      ]
    : [];

  const visitCards = visitKpis
    ? [
        { label: "Consultas + Simulações", subLabel: periodLabel, value: `${(visitKpis.consultas + visitKpis.simulates).toLocaleString("pt-BR")} / ${visitKpis.total.toLocaleString("pt-BR")}`, hint: "consultas + simulações / visitas", icon: MousePointerClick },
        { label: "Taxa de Início", subLabel: periodLabel, value: PERCENT(visitKpis.conversionRate), hint: "visitas que viraram simulação", icon: Activity },
        { label: "Redirecionamentos", subLabel: periodLabel, value: visitKpis.redirects.toLocaleString("pt-BR"), hint: "saídas para parceiros", icon: ArrowUpRight },
        { label: "Simulações Iniciadas", subLabel: periodLabel, value: visitKpis.simulates.toLocaleString("pt-BR"), hint: "cliques no simulador", icon: Filter },
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
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Visão geral</h1>
            <p className="text-sm text-muted-foreground">Métricas integradas de acessos e concessão de crédito.</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 bg-muted/30 p-3 rounded-2xl border">
          <div className="lg:hidden">
            <Button
              variant="outline"
              onClick={() => setMobileFilterOpen(true)}
              className="w-full h-11 rounded-xl gap-2 justify-start bg-white border-slate-200 text-slate-700 shadow-sm"
            >
              <Filter className="h-4 w-4 text-[#B300FF]" /> Filtros
            </Button>
          </div>

          <div className="hidden lg:flex lg:flex-wrap lg:items-center lg:gap-2">
            <Popover modal={isMobile}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-10 rounded-xl justify-between sm:justify-start gap-2 bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8] hover:bg-[#fce7f3] transition-colors"
                >
                  <span className="flex items-center gap-2 truncate">
                    <CalendarIcon className="h-4 w-4 shrink-0" />
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
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[calc(100vw-2rem)] sm:w-auto p-0 bg-[#fdf2f8] border-[#fbcfe8] z-50"
                align="start"
              >
                <Command className="bg-transparent">
                  <CommandList
                    className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y"
                    style={{ WebkitOverflowScrolling: "touch" }}
                    onWheelCapture={(e) => e.stopPropagation()}
                  >
                    <CommandGroup>
                      <CommandItem onSelect={() => setDateRange("7")} className="text-[#d946ef] cursor-pointer">
                        Últimos 7 dias
                      </CommandItem>
                      <CommandItem onSelect={() => setDateRange("15")} className="text-[#d946ef] cursor-pointer">
                        Últimos 15 dias
                      </CommandItem>
                      <CommandItem onSelect={() => setDateRange("30")} className="text-[#d946ef] cursor-pointer">
                        Últimos 30 dias
                      </CommandItem>
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

            <Popover modal={isMobile}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-10 rounded-xl justify-between sm:justify-start gap-2 bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8] hover:bg-[#fce7f3] transition-colors"
                >
                  <span className="truncate">
                    {selectedPartners.length === 0 ? "Todos Parceiros" : `${selectedPartners.length} parceiro(s) sel.`}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[calc(100vw-2rem)] sm:w-56 p-0 bg-[#fdf2f8] border-[#fbcfe8] z-50"
                align="start"
              >
                <Command className="bg-transparent">
                  <CommandList
                    className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y"
                    style={{ WebkitOverflowScrolling: "touch" }}
                    onWheelCapture={(e) => e.stopPropagation()}
                  >
                    <CommandGroup>
                      <CommandItem onSelect={() => setSelectedPartners([])} className="text-[#d946ef] cursor-pointer">
                        <div
                          className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${selectedPartners.length === 0 ? "bg-[#d946ef] text-white" : "opacity-50"}`}
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
                            className="text-[#d946ef] cursor-pointer"
                          >
                            <div
                              className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${isSelected ? "bg-[#d946ef] text-white" : "opacity-50"}`}
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

            <Popover modal={isMobile}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className="h-10 rounded-xl justify-between sm:justify-start gap-2 bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8] hover:bg-[#fce7f3] transition-colors"
                >
                  <span className="truncate">
                    {selectedProducts.length === 0 ? "Todos Produtos" : `${selectedProducts.length} produto(s) sel.`}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[calc(100vw-2rem)] sm:w-56 p-0 bg-[#fdf2f8] border-[#fbcfe8] z-50"
                align="start"
              >
                <Command className="bg-transparent">
                  <CommandList
                    className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y"
                    style={{ WebkitOverflowScrolling: "touch" }}
                    onWheelCapture={(e) => e.stopPropagation()}
                  >
                    <CommandGroup>
                      <CommandItem onSelect={() => setSelectedProducts([])} className="text-[#d946ef] cursor-pointer">
                        <div
                          className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${selectedProducts.length === 0 ? "bg-[#d946ef] text-white" : "opacity-50"}`}
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
                            className="text-[#d946ef] cursor-pointer"
                          >
                            <div
                              className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${isSelected ? "bg-[#d946ef] text-white" : "opacity-50"}`}
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
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            Erro ao carregar dados: {error}
          </div>
        )}
      </div>

      {/* BLOCO 1: FUNDO DE FUNIL */}
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

        <Suspense fallback={<ChartsSkeleton />}>
          <ChartsSimulationModule
            loading={loading}
            simKpis={simKpis}
            simDailyData={simDailyData}
            periodLabel={periodLabel}
          />
        </Suspense>
      </div>

      {/* BLOCO 2: TOPO DE FUNIL */}
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

        <Suspense fallback={<ChartsSkeleton />}>
          <ChartsTrafficModule
            loading={loading}
            visitKpis={visitKpis}
            visDailyData={visDailyData}
            periodLabel={periodLabel}
          />
        </Suspense>
      </div>

      {/* SHEET DE FILTROS MOBILE */}
      <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl max-h-[85vh] overflow-y-auto p-6 bg-white z-50">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="text-lg font-bold">Filtros</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-4 w-full">
            <div className="w-full">
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Período</span>
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-11 w-full rounded-xl justify-between gap-2 bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8]"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <CalendarIcon className="h-4 w-4 shrink-0" />
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
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[calc(100vw-3rem)] sm:w-auto p-0 bg-[#fdf2f8] border-[#fbcfe8] z-50"
                  align="start"
                >
                  <Command className="bg-transparent">
                    <CommandList
                      className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y"
                      style={{ WebkitOverflowScrolling: "touch" }}
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        <CommandItem onSelect={() => setDateRange("7")} className="text-[#d946ef] cursor-pointer">
                          Últimos 7 dias
                        </CommandItem>
                        <CommandItem onSelect={() => setDateRange("15")} className="text-[#d946ef] cursor-pointer">
                          Últimos 15 dias
                        </CommandItem>
                        <CommandItem onSelect={() => setDateRange("30")} className="text-[#d946ef] cursor-pointer">
                          Últimos 30 dias
                        </CommandItem>
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

            <div className="w-full">
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Parceiro</span>
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-11 w-full rounded-xl justify-between gap-2 bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8]"
                  >
                    <span className="truncate">
                      {selectedPartners.length === 0
                        ? "Todos Parceiros"
                        : `${selectedPartners.length} parceiro(s) sel.`}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[calc(100vw-3rem)] sm:w-56 p-0 bg-[#fdf2f8] border-[#fbcfe8] z-50"
                  align="start"
                >
                  <Command className="bg-transparent">
                    <CommandList
                      className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y"
                      style={{ WebkitOverflowScrolling: "touch" }}
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        <CommandItem onSelect={() => setSelectedPartners([])} className="text-[#d946ef] cursor-pointer">
                          <div
                            className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${selectedPartners.length === 0 ? "bg-[#d946ef] text-white" : "opacity-50"}`}
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
                              className="text-[#d946ef] cursor-pointer"
                            >
                              <div
                                className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${isSelected ? "bg-[#d946ef] text-white" : "opacity-50"}`}
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

            <div className="w-full">
              <span className="text-xs font-medium text-muted-foreground mb-1 block">Produto</span>
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-11 w-full rounded-xl justify-between gap-2 bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8]"
                  >
                    <span className="truncate">
                      {selectedProducts.length === 0 ? "Todos Produtos" : `${selectedProducts.length} produto(s) sel.`}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[calc(100vw-3rem)] sm:w-56 p-0 bg-[#fdf2f8] border-[#fbcfe8] z-50"
                  align="start"
                >
                  <Command className="bg-transparent">
                    <CommandList
                      className="max-h-56 overflow-y-auto overscroll-contain touch-pan-y"
                      style={{ WebkitOverflowScrolling: "touch" }}
                      onWheelCapture={(e) => e.stopPropagation()}
                    >
                      <CommandGroup>
                        <CommandItem onSelect={() => setSelectedProducts([])} className="text-[#d946ef] cursor-pointer">
                          <div
                            className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${selectedProducts.length === 0 ? "bg-[#d946ef] text-white" : "opacity-50"}`}
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
                              className="text-[#d946ef] cursor-pointer"
                            >
                              <div
                                className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${isSelected ? "bg-[#d946ef] text-white" : "opacity-50"}`}
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

            <Button
              onClick={() => setMobileFilterOpen(false)}
              className="w-full h-11 rounded-xl bg-[#B300FF] hover:bg-[#9f00e6] text-white font-semibold mt-2"
            >
              Aplicar Filtros
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}