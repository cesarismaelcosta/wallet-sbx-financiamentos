/**
 * @fileoverview Monitor de Simulações (Backoffice Otimizado)
 * @path src/routes/backoffice/simulations.lazy.tsx
 *
 * ============================================================================
 * [ARQUITETURA, CLEAN ARCHITECTURE & PERFORMANCE]
 * ============================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: RESILIENT RENDERING & FALLBACKS
 * ============================================================================
 * Monitoramento operacional de alta performance. Utiliza payload enxuto na listagem
 * principal, paginação/limite server-side e carregamento sob demanda de metadados
 * pesados no Sheet de detalhes.
 *
 * [REVERSÃO E SANEAMENTO ARQUITETURAL]:
 * 1. {Strict Rendering Restoration}: O painel de layout agora reage diretamente
 *    à presença nativa das configurações no Payload da Simulação. Se for Seguro
 *    (sem UI embarcada), os painéis de layout recolhem sem destruir a tela.
 * 2. {Temporal Integrity}: Os painéis de LGPD visual (Consents) não leem mais 
 *    do snapshot transacional da auditoria. Eles voltam a ler apenas a intenção
 *    original do produto, parando o vazamento cruzado de loops de renderização.
 * 
 * [ENTERPRISE ZERO-TRUST - OBFUSCATION V3]:
 * - As antigas queries diretas PostgREST (que expunham todo o esquema de relacionamentos)
 *   foram removidas. O React agora chama as RPCs `get_backoffice_simulations` e 
 *   `get_backoffice_simulation_details`. O banco de dados financeiro é totalmente
 *   opaco para inspeção via rede.
 * - RBAC SERVER-SIDE: O frontend não injeta mais os escopos (p_allowed_*). O próprio
 *   banco valida o JWT e restringe o acesso.
 *
 * =========================================================================
 * ⚙️ DEPENDÊNCIA DE INFRAESTRUTURA (POSTGRESQL RPCs)
 * =========================================================================
 * Para que este componente funcione, as seguintes Stored Procedures DEVEM existir:
 * 
 * -------------------------------------------------------------------------
 * PROCEDURE 1: Listagem Geral de Simulações (BLINDADA SERVER-SIDE)
 * -------------------------------------------------------------------------
 * CREATE OR REPLACE FUNCTION get_backoffice_simulations(
 *   p_limit INT DEFAULT 50, 
 *   p_offset INT DEFAULT 0, 
 *   p_search TEXT DEFAULT NULL, 
 *   p_partner_ids INT[] DEFAULT NULL, 
 *   p_product_ids INT[] DEFAULT NULL
 * ) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
 * DECLARE
 *   v_result JSONB;
 *   v_caller_email TEXT := auth.jwt() ->> 'email';
 *   v_role TEXT;
 *   v_allowed_partners JSONB;
 *   v_allowed_products JSONB;
 * BEGIN
 *   p_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
 *
 *   SELECT role, allowed_partners, allowed_products
 *   INTO v_role, v_allowed_partners, v_allowed_products 
 *   FROM backoffice_users 
 *   WHERE LOWER(email) = LOWER(v_caller_email) AND is_active = true; 
 *   
 *   IF v_role IS NULL THEN RETURN '[]'::jsonb; END IF; 
 *   
 *   IF v_role IN ('admin', 'manager') THEN 
 *     v_allowed_partners := '["*"]'::jsonb; 
 *     v_allowed_products := '["*"]'::jsonb; 
 *   END IF; 
 *   
 *   WITH paginated_simulations AS ( 
 *     SELECT s.id, s.created_at, s.updated_at, s.name, s.document, s.phone, s.email, s.financed_amount, s.installment_value, s.installments, s.down_payment_percentage, s.partner_id, s.product_id, s.status_id, s.stage_id, s.financial_institution_id, p.id AS p_id, p.name AS p_name, p.logo_url AS p_logo_url, pt.id AS pt_id, pt.name AS pt_name, st.id AS st_id, st.name AS st_name, stt.id AS stt_id, stt.name AS stt_name, fi.id AS fi_id, fi.name AS fi_name, fi.logo_url AS fi_logo_url 
 *     FROM simulations s 
 *     LEFT JOIN partners p ON s.partner_id = p.id 
 *     LEFT JOIN product_types pt ON s.product_id = pt.id 
 *     LEFT JOIN stage_types st ON s.stage_id = st.id 
 *     LEFT JOIN status_types stt ON s.status_id = stt.id 
 *     LEFT JOIN financial_institutions fi ON s.financial_institution_id = fi.id 
 *     WHERE (p_search IS NULL OR p_search = '' OR s.name ILIKE '%' || p_search || '%' OR regexp_replace(s.document, '\D', '', 'g') LIKE '%' || regexp_replace(p_search, '\D', '', 'g') || '%') 
 *       AND (p_partner_ids IS NULL OR s.partner_id = ANY(p_partner_ids)) 
 *       AND (p_product_ids IS NULL OR s.product_id = ANY(p_product_ids)) 
 *       AND (v_allowed_partners IS NULL OR v_allowed_partners ? '*' OR v_allowed_partners ? s.partner_id::TEXT) 
 *       AND (v_allowed_products IS NULL OR v_allowed_products ? '*' OR v_allowed_products ? s.product_id::TEXT) 
 *     ORDER BY s.created_at DESC 
 *     LIMIT p_limit OFFSET p_offset 
 *   ) 
 *   SELECT jsonb_agg(jsonb_build_object(
 *     'id', ps.id, 'created_at', ps.created_at, 'updated_at', ps.updated_at, 'name', ps.name, 'document', ps.document, 'phone', ps.phone, 'email', ps.email, 'financed_amount', ps.financed_amount, 'installment_value', ps.installment_value, 'installments', ps.installments, 'down_payment_percentage', ps.down_payment_percentage, 'partner_id', ps.partner_id, 'product_id', ps.product_id, 'status_id', ps.status_id, 'stage_id', ps.stage_id, 
 *     'partners', CASE WHEN ps.p_id IS NOT NULL THEN jsonb_build_object('id', ps.p_id, 'name', ps.p_name, 'logo_url', ps.p_logo_url) ELSE NULL END, 
 *     'product_types', CASE WHEN ps.pt_id IS NOT NULL THEN jsonb_build_object('id', ps.pt_id, 'name', ps.pt_name) ELSE NULL END, 
 *     'stage_types', CASE WHEN ps.st_id IS NOT NULL THEN jsonb_build_object('id', ps.st_id, 'name', ps.st_name) ELSE NULL END, 
 *     'status_types', CASE WHEN ps.stt_id IS NOT NULL THEN jsonb_build_object('id', ps.stt_id, 'name', ps.stt_name) ELSE NULL END, 
 *     'financial_institutions', CASE WHEN ps.fi_id IS NOT NULL THEN jsonb_build_object('id', ps.fi_id, 'name', ps.fi_name, 'logo_url', ps.fi_logo_url) ELSE NULL END, 
 *     'simulation_offers', (SELECT jsonb_agg(jsonb_build_object('offer_description', so.offer_description, 'offer_value', so.offer_value, 'event_id', so.event_id, 'event_description', so.event_description, 'event_end_date', so.event_end_date)) FROM simulation_offers so WHERE so.simulation_id = ps.id)
 *   )) INTO v_result FROM paginated_simulations ps; 
 *   
 *   RETURN COALESCE(v_result, '[]'::jsonb); 
 * END; 
 * $$;
 * 
 * -------------------------------------------------------------------------
 * PROCEDURE 2: Detalhes Profundos da Simulação (Modal)
 * -------------------------------------------------------------------------
 * [SECURITY FIX - 2026-09-15]: Esta função só checava "é algum usuário
 * backoffice ativo?" (via current_backoffice_actor()), sem restringir o
 * registro ao partner_id/product_id do usuário — ao contrário da PROCEDURE 1
 * acima, que já filtrava por allowed_partners/allowed_products. Um "viewer"
 * restrito a um parceiro conseguia puxar PII completa (nome, CPF, telefone,
 * e-mail) de simulações de OUTROS parceiros, bastando saber o UUID. Corrigido
 * replicando o mesmo filtro de escopo usado na listagem. Migration:
 * 20260915180000_fix_backoffice_detail_rpc_scope.sql — aplicar em dev e homologação.
 * CREATE OR REPLACE FUNCTION public.get_backoffice_simulation_details(p_simulation_id uuid)
 * RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
 * DECLARE
 *   v_result JSONB;
 *   v_actor RECORD;
 *   v_allowed_partners JSONB;
 *   v_allowed_products JSONB;
 * BEGIN
 *   SELECT * INTO v_actor FROM public.current_backoffice_actor();
 *   IF v_actor.role IS NULL THEN
 *       RETURN jsonb_build_object('error', 'forbidden');
 *   END IF;
 *
 *   v_allowed_partners := v_actor.allowed_partners;
 *   v_allowed_products := v_actor.allowed_products;
 *   IF v_actor.role IN ('admin', 'manager') THEN
 *     v_allowed_partners := '["*"]'::jsonb;
 *     v_allowed_products := '["*"]'::jsonb;
 *   END IF;
 *
 *   SELECT jsonb_build_object(
 *     'id', s.id, 'created_at', s.created_at, 'updated_at', s.updated_at, 'name', s.name, 'document', s.document, 'phone', s.phone, 'email', s.email, 'financed_amount', s.financed_amount, 'installment_value', s.installment_value, 'installments', s.installments, 'down_payment_percentage', s.down_payment_percentage, 'raw_payload', s.raw_payload, 'entity_details', s.entity_details, 'birth_date', s.birth_date, 'gender', s.gender, 'entity_type', s.entity_type, 'requested_value', s.requested_value, 'cet_rate', s.cet_rate, 'simulation_details', s.simulation_details,
 *     'partners', CASE WHEN p.id IS NOT NULL THEN jsonb_build_object('id', p.id, 'name', p.name, 'logo_url', p.logo_url) ELSE NULL END,
 *     'product_types', CASE WHEN pt.id IS NOT NULL THEN jsonb_build_object('id', pt.id, 'name', pt.name) ELSE NULL END,
 *     'stage_types', CASE WHEN st.id IS NOT NULL THEN jsonb_build_object('id', st.id, 'name', st.name) ELSE NULL END,
 *     'status_types', CASE WHEN stt.id IS NOT NULL THEN jsonb_build_object('id', stt.id, 'name', stt.name) ELSE NULL END,
 *     'financial_institutions', CASE WHEN fi.id IS NOT NULL THEN jsonb_build_object('id', fi.id, 'name', fi.name, 'logo_url', fi.logo_url) ELSE NULL END,
 *     'result_partner_types', CASE WHEN rpt.id IS NOT NULL THEN jsonb_build_object('id', rpt.id, 'description', rpt.description) ELSE NULL END,
 *     'visits', CASE WHEN v.id IS NOT NULL THEN jsonb_build_object('id', v.id, 'created_at', v.created_at, 'utm_source', v.utm_source, 'utm_campaign', v.utm_campaign, 'country', v.country, 'state', v.state, 'city', v.city, 'ip_address', v.ip_address, 'operating_system', v.operating_system, 'device_type', v.device_type, 'origin_url', v.origin_url, 'target_url', v.target_url) ELSE NULL END,
 *     'simulation_offers', (SELECT jsonb_agg(jsonb_build_object('id', so.id, 'simulation_id', so.simulation_id, 'manager_name', so.manager_name, 'seller_id', so.seller_id, 'legal_name', so.legal_name, 'trade_name', so.trade_name, 'event_id', so.event_id, 'event_description', so.event_description, 'event_end_date', so.event_end_date, 'event_start_date', so.event_start_date, 'offer_id', so.offer_id, 'offer_description', so.offer_description, 'offer_value', so.offer_value, 'category_id', so.category_id, 'subcategory_id', so.subcategory_id, 'subcategory', so.subcategory, 'offer_details', so.offer_details, 'event_details', so.event_details, 'manager_details', so.manager_details, 'category_types', CASE WHEN ct.id IS NOT NULL THEN jsonb_build_object('id', ct.id, 'name', ct.name) ELSE NULL END)) FROM simulation_offers so LEFT JOIN category_types ct ON so.category_id = ct.id WHERE so.simulation_id = s.id),
 *     'simulation_consents', (SELECT jsonb_agg(jsonb_build_object('id', sc.id, 'consent_id', sc.consent_id, 'accepted', sc.accepted, 'accepted_at', sc.accepted_at, 'created_at', sc.created_at, 'ip_address', sc.ip_address, 'country', sc.country, 'state', sc.state, 'city', sc.city, 'operating_system', sc.operating_system, 'device_type', sc.device_type, 'origin_details', sc.origin_details, 'page_snapshot', sc.page_snapshot)) FROM simulation_consents sc WHERE sc.simulation_id = s.id),
 *     'simulation_updates', (SELECT jsonb_agg(jsonb_build_object('id', su.id, 'operation', su.operation, 'created_at', su.created_at, 'ip_address', su.ip_address, 'country', su.country, 'state', su.state, 'city', su.city, 'user_agent', su.user_agent, 'device_type', su.device_type, 'operating_system', su.operating_system, 'origin_details', su.origin_details)) FROM simulation_updates su WHERE su.simulation_id = s.id),
 *     'simulation_consults', (SELECT jsonb_agg(jsonb_build_object('id', sc.id, 'installments', sc.installments, 'installment_value', sc.installment_value, 'cet_rate', sc.cet_rate, 'created_at', sc.created_at, 'financial_institution_id', sc.financial_institution_id)) FROM simulation_consults sc WHERE sc.simulation_id = s.id)
 *   ) INTO v_result
 *   FROM simulations s
 *   LEFT JOIN partners p ON s.partner_id = p.id
 *   LEFT JOIN product_types pt ON s.product_id = pt.id
 *   LEFT JOIN stage_types st ON s.stage_id = st.id
 *   LEFT JOIN status_types stt ON s.status_id = stt.id
 *   LEFT JOIN financial_institutions fi ON s.financial_institution_id = fi.id
 *   LEFT JOIN result_partner_types rpt ON s.result_partner_id = rpt.id
 *   LEFT JOIN visits v ON s.visit_id = v.id
 *   WHERE s.id = p_simulation_id
 *     -- [FIX]: registro tem que estar dentro do escopo do usuário logado.
 *     AND (v_allowed_partners IS NULL OR v_allowed_partners ? '*' OR v_allowed_partners ? s.partner_id::TEXT)
 *     AND (v_allowed_products IS NULL OR v_allowed_products ? '*' OR v_allowed_products ? s.product_id::TEXT);
 *
 *   RETURN v_result;
 * END;
 * $$;
 * ============================================================================
 *
 * @author César Ismael Pereira da Costa
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { RefreshCw, Search, Filter, Download, ChevronDown, ChevronLeft, ChevronRight, Camera, Printer, Loader2 } from "lucide-react";
import { DateRange } from "react-day-picker";
import { useAuth } from "@/integrations/auth/AuthContext";

import { Button } from "@/components/ui/button";
import { GradientIcon } from "@/design-system/sbx-design-system-9f1c03/components/ui/gradient-icon";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";

// Fábrica de Painéis (Shared Renderers)
import { PanelProduct } from "@/features/financial-hub/components/shared/renderes/PanelProduct";
import { PanelOffer } from "@/features/financial-hub/components/shared/renderes/PanelOffer";
import { PanelSeller } from "@/features/financial-hub/components/shared/renderes/PanelSeller";
import { PanelEntity } from "@/features/financial-hub/components/shared/renderes/PanelEntity";
import { PanelAcceptedConsents } from "@/features/financial-hub/components/shared/renderes/PanelAcceptedConsents";
import { PanelConsents } from "@/features/financial-hub/components/shared/renderes/PanelConsents";
import { PanelFooter } from "@/features/financial-hub/components/shared/renderes/PanelFooter";
import { PanelSimulation } from "@/features/financial-hub/components/shared/renderes/PanelSimulation";
import { PanelVisit } from "@/features/financial-hub/components/shared/renderes/PanelVisit";
import { PanelFAQ } from "@/features/financial-hub/components/shared/renderes/PanelFAQ";

import { supabase } from "@/integrations/supabase/client";

// ============================================================================
// [TIPAGENS FORTES - PREVENÇÃO DE ANY]
// ============================================================================

export type DropdownItem = {
  id: number | string;
  name: string;
};

export type OfferView = {
  offer_id?: string | number | null;
  offer_description?: string | null;
  offer_value?: number | null;
  event_id?: string | number | null;
  event_description?: string | null;
  manager_name?: string | null;
  legal_name?: string | null;
  seller_id?: string | number | null;
  category_types?: { id?: number; name?: string } | null;
  [key: string]: unknown;
};

export type SimulationRow = {
  id: string;
  created_at: string | null;
  updated_at: string | null;
  name: string | null;
  document: string | null;
  phone: string | null;
  email: string | null;
  financed_amount: number | null;
  installment_value: number | null;
  installments: number | null;
  down_payment_percentage: number | null;
  partner_id: number | null;
  product_id: number | null;
  status_id: number | null;
  stage_id: number | null;
  financial_institution_id?: number | null;
  raw_payload?: string | Record<string, unknown> | null;
  entity_details?: Record<string, unknown> | null;
  simulation_details?: Record<string, unknown> | null;
  partners?: { id: number; name: string; logo_url: string } | null;
  product_types?: { id: number; name: string } | null;
  stage_types?: { id: number; name: string } | null;
  status_types?: { id: number; name: string } | null;
  financial_institutions?: { id: number; name: string; logo_url: string } | null;
  simulation_offers?: Array<Record<string, unknown>> | null;
  simulation_consents?: Array<Record<string, unknown>> | null;
  simulation_updates?: Array<Record<string, unknown>> | null;
  simulation_consults?: Array<Record<string, unknown>> | null;
};

export const Route = createLazyFileRoute("/backoffice/simulations")({
  component: SimulationsPage,
});

// Tipagem segura com Generics para transformar qualquer coisa em Array (sem any)
const safeArray = <T,>(data: T | T[] | null | undefined): T[] => {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
};

// ============================================================================
// ✨ [DESIGN SYSTEM: NEUTRAL PURITY] - Paleta monocromática restrita
// ============================================================================
const STATUS_STYLES: Record<string, string> = {
  simulacao: "bg-primary/10 text-primary",
  "em análise": "bg-status-pending/10 text-status-pending",
  analise: "bg-status-pending/10 text-status-pending",
  aprovada: "bg-status-approved/15 text-status-approved",
  recusada: "bg-status-rejected/10 text-status-rejected",
  falha: "bg-status-rejected/10 text-status-rejected",
  "pendente docs": "bg-muted text-muted-foreground",
  default: "bg-muted text-muted-foreground",
};

function statusClass(status: string | null | undefined) {
  if (!status) return STATUS_STYLES.default;
  const key = status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return STATUS_STYLES[key] ?? STATUS_STYLES.default;
}

const BRL = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

function formatDate(iso: string | null | undefined) {
  if (!iso) return { d: "—", h: "" };
  const dt = new Date(iso);
  return {
    d: dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }),
    h: dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
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

function getPeriodDates(range: string, custom?: DateRange) {
  if (range === "custom" && custom?.from && custom?.to) {
    return { p_from: custom.from.toISOString(), p_to: custom.to.toISOString() };
  }
  if (range !== "all") {
    const days = Number(range);
    const date = new Date();
    date.setDate(date.getDate() - days);
    return { p_from: date.toISOString(), p_to: new Date().toISOString() };
  }
  return { p_from: null, p_to: null };
}

function SimulationsPage() {
  const { backofficeUser } = useAuth();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<SimulationRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<"30" | "90" | "all" | "custom">("30");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();

  const [partnersList, setPartnersList] = useState<DropdownItem[]>([]);
  const [productsList, setProductsList] = useState<DropdownItem[]>([]);
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const [activeSimulation, setActiveSimulation] = useState<SimulationRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const [stats, setStats] = useState({ total: 0, em_simulacao: 0, em_analise: 0, aprovadas: 0, volume_aprovado: 0 });

  useEffect(() => {
    async function loadDropdowns() {
      if (!backofficeUser) return;

      // ✨ [PERFORMANCE]: Dispara as duas consultas ao mesmo tempo
      const [partnersResult, productsResult] = await Promise.all([
        supabase.from("partners").select("id, name").eq("is_active", true).order("name"),
        supabase.from("product_types").select("id, name").order("name"),
      ]);

      const pData = partnersResult.data;
      const prData = productsResult.data;

      if (pData) {
        if (backofficeUser.role === "viewer") {
          const allowedPartners = backofficeUser.allowed_partners || [];
          if (allowedPartners.includes("*")) setPartnersList(pData as DropdownItem[]);
          else setPartnersList((pData as DropdownItem[]).filter((p) => allowedPartners.includes(String(p.id))));
        } else {
          setPartnersList(pData as DropdownItem[]);
        }
      }

      if (prData) {
        if (backofficeUser.role === "viewer") {
          const allowedProducts = backofficeUser.allowed_products || [];
          if (allowedProducts.includes("*")) setProductsList(prData as DropdownItem[]);
          else setProductsList((prData as DropdownItem[]).filter((pr) => allowedProducts.includes(String(pr.id))));
        } else {
          setProductsList(prData as DropdownItem[]);
        }
      }
    }
    loadDropdowns();
  }, [backofficeUser]);

  const [page, setPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const PAGE_SIZE = 50;
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!backofficeUser) return;
    const timeoutId = setTimeout(() => { setPage(0); load(0); loadStats(); }, 400);
    return () => clearTimeout(timeoutId);
  }, [search, selectedPartners, selectedProducts, dateRange, customRange]);

  async function load(targetPage: number) {
    setLoading(true);
    try {
      const offset = targetPage * PAGE_SIZE;

      if (backofficeUser && backofficeUser.role === "viewer") {
        const allowedPartners = backofficeUser.allowed_partners || [];
        const allowedProducts = backofficeUser.allowed_products || [];
        if (!allowedPartners.includes("*") && allowedPartners.length === 0) { setRows([]); setTotalPages(0); setLoading(false); return; }
        if (!allowedProducts.includes("*") && allowedProducts.length === 0) { setRows([]); setTotalPages(0); setLoading(false); return; }
      }

      const [{ data: simData, error: simError }, { data: statusData }] = await Promise.all([
        supabase.rpc('get_backoffice_simulations', {
          p_limit: PAGE_SIZE + 1,
          p_offset: offset,
          p_search: search.trim() || null,
          p_partner_ids: selectedPartners.length > 0 ? selectedPartners.map(Number) : null,
          p_product_ids: selectedProducts.length > 0 ? selectedProducts.map(Number) : null
        }),
        supabase.from("status_types").select("name")
      ]);

      if (simError) throw simError;

      if (!simData || !Array.isArray(simData) || simData.length === 0) { 
        setRows([]); setTotalPages(targetPage + 1); return; 
      }

      const hasMore = simData.length > PAGE_SIZE;
      const slicedData = hasMore ? simData.slice(0, PAGE_SIZE) : simData;

      setRows(slicedData as SimulationRow[]);
      setTotalPages(hasMore ? targetPage + 2 : targetPage + 1);

      if (statusData) setStatusOptions(statusData.map((s) => s.name));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Erro ao carregar simulações: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    const { p_from, p_to } = getPeriodDates(dateRange, customRange);
    const { data, error } = await supabase.rpc("simulation_stats", {
      p_from, p_to,
      p_partner_ids: selectedPartners.length > 0 ? selectedPartners.map(Number) : null,
      p_product_ids: selectedProducts.length > 0 ? selectedProducts.map(Number) : null,
      p_search: search.trim() || null,
      p_status: selectedStatus.length > 0 ? selectedStatus : null,
    });

    if (error) { console.error("Erro ao carregar estatísticas:", error); return; }
    
    type StatsRecord = { total?: number; em_simulacao?: number; em_analise?: number; aprovadas?: number; volume_aprovado?: number };
    const firstRow = Array.isArray(data) ? data[0] : data;
    const s = (firstRow ?? { total: 0, em_simulacao: 0, em_analise: 0, aprovadas: 0, volume_aprovado: 0 }) as StatsRecord;
    
    setStats({
      total: Number(s.total ?? 0),
      em_simulacao: Number(s.em_simulacao ?? 0),
      em_analise: Number(s.em_analise ?? 0),
      aprovadas: Number(s.aprovadas ?? 0),
      volume_aprovado: Number(s.volume_aprovado ?? 0),
    });
    setTotalPages(Math.ceil(Number(s.total ?? 0) / PAGE_SIZE));
  }

  const handleSelectStatus = (status: string) => {
    if (status === "Todas") return setSelectedStatus([]);
    setSelectedStatus((prev) => (prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]));
  };

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const statusName = r.status_types?.name ?? "—";
      return selectedStatus.length === 0 || selectedStatus.includes(statusName);
    });
  }, [rows, selectedStatus]);

  async function handleSelectSimulation(row: SimulationRow) {
    setDetailLoading(true);
    setActiveSimulation(row);

    try {
      const { data: fullData, error } = await supabase
        .rpc('get_backoffice_simulation_details', { p_simulation_id: row.id });

      if (error) {
        toast.error(`Erro do Banco: ${error.message}`);
        return;
      }

      if (fullData) {
        setActiveSimulation(fullData as SimulationRow);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Erro inesperado:", msg);
      toast.error(`Erro na requisição: ${msg}`);
    } finally {
      setDetailLoading(false);
    }
  }

  const handleExportExcel = async () => {
    if (!filtered || filtered.length === 0) { toast.error("Não há dados na tela para exportar."); return; }
    const XLSX = await import("xlsx");
    const dataToExport = filtered.map((sim) => {
      const bank = sim.financial_institutions;
      const created = formatDate(sim.created_at);
      const rawOffer = safeArray<Record<string, unknown>>(sim.simulation_offers);
      const offerRow: OfferView = { ...rawOffer[0], category_types: safeArray(rawOffer[0]?.category_types)[0] as any || null };
      const eventoFull = offerRow?.event_description ? `[${offerRow?.event_id || "—"}] ${offerRow?.event_description}` : "—";
      return {
        ID: sim.id, Data: `${created.d} ${created.h}`, Cliente: sim.name || "—", Documento: sim.document || "—",
        Telefone: sim.phone || "—", "E-mail": sim.email || "—", Estágio: sim.stage_types?.name || "—", Produto: sim.product_types?.name || "—",
        Status: sim.status_types?.name || "—", "Parceiro Origem": sim.partners?.name || "—", "Banco Destino": bank?.name || "—",
        "Valor Financiado": sim.financed_amount || 0, "Valor Parcela": sim.installment_value || 0, "Qtd Parcelas": sim.installments || 0,
        "Descrição da Oferta": offerRow?.offer_description || "—", "Oferta ID": offerRow?.offer_id || "—", "Valor da Oferta": offerRow?.offer_value || 0,
        Evento: eventoFull, Organizador: offerRow?.manager_name || "—", "Vendedor": offerRow?.legal_name || "—", "Seller ID": offerRow?.seller_id || "—",
      };
    });
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Simulações");
    XLSX.writeFile(workbook, `Monitor_Simulacoes_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const handlePrintSheet = () => {
    if (!printRef.current) return;
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    iframe.contentWindow?.document.write(`<html><head>${document.head.innerHTML}<style>@page{margin:15mm;}body{background:white!important;}</style></head><body>${printRef.current.innerHTML}</body></html>`);
    iframe.contentWindow?.document.close();
    setTimeout(() => { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); setTimeout(() => document.body.removeChild(iframe), 1000); }, 500);
  };

  return (
    <div className="font-sans space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-header-title">Monitor de Simulações</h1>
          <p className="text-sm text-neutral-600">Acompanhe simulações, análises e aprovações em tempo real.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportExcel} className="rounded-none border-neutral-200 text-neutral-900 transition-colors shadow-xs hover:bg-primary hover:text-primary-foreground hover:border-primary"><Download className="mr-2 h-4 w-4" /> Exportar Excel</Button>
          <Button onClick={() => load(0)} disabled={loading} className="cta-gradient border-0 rounded-none text-white"><RefreshCw className={`mr-2 h-4 w-4 shrink-0 ${loading ? "animate-spin" : ""}`} /> Atualizar</Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1fr_1.4fr]">
        {[
          { label: "Propostas (filtro)", value: Number(stats.total).toLocaleString("pt-BR"), special: false },
          { label: "Em simulação", value: Number(stats.em_simulacao).toLocaleString("pt-BR"), special: false },
          { label: "Em análise", value: Number(stats.em_analise).toLocaleString("pt-BR"), special: false },
          { label: "Aprovadas", value: Number(stats.aprovadas).toLocaleString("pt-BR"), special: false },
          { label: "Volume aprovado", value: BRL(Number(stats.volume_aprovado)), special: true },
        ].map((t) => (
          <div 
            key={t.label} 
            className={`rounded-none border p-4 flex flex-col justify-between shadow-xs ${
              t.special 
                ? "bg-surface-alt border-neutral-300 text-neutral-900" 
                : "border-neutral-200 bg-white text-neutral-900"
            }`}
          >
            <div className="text-[11px] font-medium uppercase tracking-wider text-neutral-500 whitespace-nowrap">
              {t.label}
            </div>
            <div className="mt-2 text-xl font-semibold tracking-tight whitespace-nowrap">
              {t.value}
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-none border border-neutral-200 bg-white flex flex-col shadow-xs">
        <div className="flex flex-col gap-3 border-b border-neutral-200 p-4 bg-neutral-50/50">
          <div className="lg:hidden">
            <Button variant="outline" onClick={() => setMobileFilterOpen(true)} className="w-full h-11 rounded-none gap-2 justify-start bg-white border-neutral-200 text-neutral-900 shadow-xs hover:bg-primary hover:text-primary-foreground hover:border-primary"><GradientIcon icon={Filter} size={16} /> Filtros</Button>
          </div>
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="relative w-full lg:flex-1 lg:max-w-md">
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome ou CPF/CNPJ..." className="h-11 w-full rounded-none bg-white border border-neutral-200 pl-5 pr-12 text-[13px] text-neutral-900 placeholder:text-neutral-500 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900 transition-all shadow-none" />
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-neutral-400" />
            </div>

            <div className="hidden lg:flex lg:items-center lg:gap-2 lg:ml-auto">
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10 w-[175px] rounded-none gap-2 bg-white border-neutral-200 transition-colors text-neutral-900 justify-between shadow-xs hover:bg-primary hover:text-primary-foreground hover:border-primary">
                    <span className="flex items-center gap-2 truncate"><Filter className="h-3.5 w-3.5 opacity-50 shrink-0" /><span className="truncate">Parceiro: {selectedPartners.length === 0 ? "Todos" : `${selectedPartners.length} sel.`}</span></span><ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0 rounded-none border-neutral-200 shadow-xs" align="start">
                  <Command className="bg-white"><CommandList><CommandGroup>
                    <CommandItem onSelect={() => setSelectedPartners([])} className="cursor-pointer text-neutral-900 rounded-none hover:bg-neutral-100"><div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${selectedPartners.length === 0 ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>{selectedPartners.length === 0 && "✓"}</div>Todos Parceiros</CommandItem>
                    {partnersList.map((p) => {
                      const isSelected = selectedPartners.includes(String(p.id));
                      return (<CommandItem key={p.id} onSelect={() => { if (isSelected) setSelectedPartners(selectedPartners.filter((id) => id !== String(p.id))); else setSelectedPartners([...selectedPartners, String(p.id)]); }} className={`cursor-pointer rounded-none text-neutral-900 hover:bg-neutral-100 ${isSelected ? "bg-neutral-50 font-medium" : ""}`}><div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${isSelected ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>{isSelected && "✓"}</div>{p.name}</CommandItem>);
                    })}
                  </CommandGroup></CommandList></Command>
                </PopoverContent>
              </Popover>

              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10 w-[175px] rounded-none gap-2 bg-white border-neutral-200 transition-colors text-neutral-900 justify-between shadow-xs hover:bg-primary hover:text-primary-foreground hover:border-primary">
                    <span className="flex items-center gap-2 truncate"><Filter className="h-3.5 w-3.5 opacity-50 shrink-0" /><span className="truncate">Produto: {selectedProducts.length === 0 ? "Todos" : `${selectedProducts.length} sel.`}</span></span><ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0 rounded-none border-neutral-200 shadow-xs" align="start">
                  <Command className="bg-white"><CommandList><CommandGroup>
                    <CommandItem onSelect={() => setSelectedProducts([])} className="cursor-pointer text-neutral-900 rounded-none hover:bg-neutral-100"><div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${selectedProducts.length === 0 ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>{selectedProducts.length === 0 && "✓"}</div>Todos Produtos</CommandItem>
                    {productsList.map((p) => {
                      const isSelected = selectedProducts.includes(String(p.id));
                      return (<CommandItem key={p.id} onSelect={() => { if (isSelected) setSelectedProducts(selectedProducts.filter((id) => id !== String(p.id))); else setSelectedProducts([...selectedProducts, String(p.id)]); }} className={`cursor-pointer rounded-none text-neutral-900 hover:bg-neutral-100 ${isSelected ? "bg-neutral-50 font-medium" : ""}`}><div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${isSelected ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>{isSelected && "✓"}</div>{p.name}</CommandItem>);
                    })}
                  </CommandGroup></CommandList></Command>
                </PopoverContent>
              </Popover>

              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10 w-[175px] rounded-none gap-2 bg-white text-neutral-900 border-neutral-200 transition-colors justify-between shadow-xs hover:bg-primary hover:text-primary-foreground hover:border-primary">
                    <span className="flex items-center gap-2 truncate"><Filter className="h-3.5 w-3.5 shrink-0" /><span className="truncate">Situação: {selectedStatus.length === 0 ? "Todos" : selectedStatus.includes("Qualificadas") && selectedStatus.length === 1 ? "Qualificadas" : `${selectedStatus.length} sel.`}</span></span><ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-56 bg-white border-neutral-200 rounded-none shadow-xs z-50" align="start">
                  <Command className="bg-transparent"><CommandList><CommandGroup>
                    <CommandItem onSelect={() => handleSelectStatus("Todas")} className="cursor-pointer text-neutral-900 rounded-none hover:bg-neutral-100"><div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${selectedStatus.length === 0 ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>{selectedStatus.length === 0 && "✓"}</div>Todas</CommandItem>
                    {statusOptions.filter((s) => s !== "Qualificadas").map((s) => {
                      const isSelected = selectedStatus.includes(s);
                      return (<CommandItem key={s} onSelect={() => handleSelectStatus(s)} className={`cursor-pointer rounded-none text-neutral-900 hover:bg-neutral-100 ${isSelected ? "bg-neutral-50 font-medium" : ""}`}><div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${isSelected ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>{isSelected && "✓"}</div>{s}</CommandItem>);
                    })}
                  </CommandGroup></CommandList></Command>
                </PopoverContent>
              </Popover>

              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-10 w-[175px] rounded-none gap-2 bg-white border-neutral-200 transition-colors text-neutral-900 justify-between shadow-xs hover:bg-primary hover:text-primary-foreground hover:border-primary">
                    <span className="flex items-center gap-2 truncate"><Filter className="h-3.5 w-3.5 opacity-50 shrink-0" /><span className="truncate">Período: {dateRange === "custom" ? "Personalizado" : dateRange === "30" ? "30 dias" : dateRange === "90" ? "90 dias" : "Tudo"}</span></span><ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-auto rounded-none border-neutral-200 shadow-xs" align="start">
                  <Command className="bg-white"><CommandList><CommandGroup>
                    <CommandItem onSelect={() => setDateRange("30")} className="rounded-none text-neutral-900 cursor-pointer hover:bg-neutral-100">Últimos 30 dias</CommandItem>
                    <CommandItem onSelect={() => setDateRange("90")} className="rounded-none text-neutral-900 cursor-pointer hover:bg-neutral-100">Últimos 90 dias</CommandItem>
                    <CommandItem onSelect={() => setDateRange("all")} className="rounded-none text-neutral-900 cursor-pointer hover:bg-neutral-100">Todo o período</CommandItem>
                  </CommandGroup><div className="p-2 border-t border-neutral-200"><Calendar mode="range" selected={customRange} onSelect={(range) => { setCustomRange(range); setDateRange("custom"); }} numberOfMonths={1} /></div></CommandList></Command>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto w-full pb-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-100 text-left text-[10px] font-semibold uppercase tracking-wider text-neutral-600 whitespace-nowrap">
                <th className="px-3 py-2.5 w-[75px]">Data</th>
                <th className="px-3 py-2.5 w-[140px]">Cliente</th>
                <th className="px-3 py-2.5 w-[140px]">Estágio/Produto</th>
                <th className="px-3 py-2.5 w-[190px]">Oferta</th>
                <th className="px-3 py-2.5 w-[130px] text-right">Financiado</th>
                <th className="px-3 py-2.5 w-[150px]">Situação</th>
                <th className="px-3 py-2.5 w-[130px]">Parceiro / Banco</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const created = formatDate(r.created_at);
                const updated = formatDate(r.updated_at);
                const statusName = r.status_types?.name ?? "—";
                const stageName = r.stage_types?.name ?? "—";
                const productName = r.product_types?.name ?? "—";
                const parcela = r.installments && r.installment_value ? `${r.installments}x ${BRL(r.installment_value)}` : "—";
                const rawOffers = safeArray<Record<string, any>>(r.simulation_offers);
                const offer = rawOffers[0] || {};
                const endEvent = offer?.event_end_date ? new Date(String(offer.event_end_date)).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";
                const bank = r.financial_institutions;
                const rawDoc = r.document?.replace(/\D/g, "") || "";
                const doc = rawDoc.length === 14 ? rawDoc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : rawDoc.length === 11 ? rawDoc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : r.document || "—";
                const phone = r.phone?.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3") ?? "";

                return (
                  <tr key={r.id} onClick={() => handleSelectSimulation(r)} className="border-b border-neutral-100 hover:bg-neutral-50 cursor-pointer transition-colors">
                  <td className="px-3 py-2.5 w-[75px]"><div className="font-medium text-neutral-900">{created.d}</div><div className="text-[11px] text-neutral-400">{created.h}</div></td>
                  <td className="px-3 py-2.5 w-[140px]"><div className="font-medium text-neutral-900 truncate" title={r.name || ""}>{r.name || "—"}</div><div className="text-[11px] text-neutral-400">{doc}</div><div className="text-[11px] text-neutral-400">{phone || "—"}</div></td>
                  <td className="px-3 py-2.5 w-[140px]"><div className="font-medium text-neutral-900">{stageName}</div><div className="text-[11px] text-neutral-400">{productName}</div><div className="text-[10px] text-neutral-400 mt-0.5 uppercase tracking-tight">{r.partners?.name || "—"}</div></td>
                  <td className="px-3 py-2.5 max-w-[190px] sm:max-w-[220px]"><div className="font-medium text-neutral-900 truncate">{String(offer?.offer_description || "—")}</div><div className="text-[11px] text-neutral-400 truncate mt-0.5">{String(offer?.event_id || "—")} - {String(offer?.event_description || "—")}</div><div className="text-[10px] text-neutral-500 mt-0.5">{BRL(Number(offer?.offer_value || 0))} {endEvent ? `(Fim: ${endEvent})` : ""}</div></td>
                  <td className="px-3 py-2.5 w-[130px] text-right"><div className="font-semibold text-neutral-900">{BRL(r.financed_amount)}</div><div className="text-[10px] text-neutral-400">{r.down_payment_percentage === 0 ? "Sem entrada" : r.down_payment_percentage != null ? `Entrada: ${r.down_payment_percentage.toFixed(0)}%` : "—"}</div><div className="text-[10px] text-neutral-500">{parcela}</div></td>
                  <td className="px-3 py-2.5 w-[150px]"><div className="flex flex-col items-start gap-1"><span className={`inline-flex items-center rounded-none px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${statusClass(statusName)}`}>{statusName}</span><span className="text-[10px] text-neutral-400">{updated.d} {updated.h}</span></div></td>
                  <td className="px-3 py-2.5 w-[130px]">
                      <div className="flex items-center gap-1.5">
                        <div className="flex h-9 w-9 items-center justify-center bg-transparent shrink-0 rounded-[6px] overflow-hidden">
                          {r.partners?.logo_url ? (
                            <img src={r.partners.logo_url} className="h-full w-full object-cover" alt={r.partners.name} />
                          ) : (
                            <span className="flex items-center justify-center h-full w-full text-[10px] font-bold uppercase text-neutral-900 bg-neutral-100">
                              {r.partners?.name?.slice(0, 3)}
                            </span>
                          )}
                        </div>
                        {bank && (
                          <>
                            <span className="text-neutral-300 text-xs">/</span>
                            <div className="flex h-9 w-9 items-center justify-center bg-transparent shrink-0 rounded-[6px] overflow-hidden">
                              {bank?.logo_url ? (
                                <img src={bank.logo_url} className="h-full w-full object-cover" alt={bank?.name} />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center bg-neutral-50 border border-neutral-200">
                                  <Camera className="h-4 w-4 text-neutral-400" />
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200 bg-neutral-50">
            <div className="text-xs text-neutral-500 font-medium">{rows.length === 0 ? "Nenhum resultado" : `${page * PAGE_SIZE + 1} a ${page * PAGE_SIZE + rows.length}`}</div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => { const prev = Math.max(0, page - 1); setPage(prev); load(prev); }} disabled={page === 0 || loading} className="h-8 text-xs rounded-none border-neutral-200 text-neutral-900 hover:bg-primary hover:text-primary-foreground hover:border-primary"><ChevronLeft className="mr-1 h-3.5 w-3.5" />Anterior</Button>
              <Button variant="outline" size="sm" onClick={() => { const next = Math.min(totalPages - 1, page + 1); setPage(next); load(next); }} disabled={page >= totalPages - 1 || loading} className="h-8 text-xs rounded-none border-neutral-200 text-neutral-900 hover:bg-primary hover:text-primary-foreground hover:border-primary">Próxima<ChevronRight className="ml-1 h-3.5 w-3.5" /></Button>
            </div>
          </div>
        )}
      </div>

      <Sheet open={!!activeSimulation} onOpenChange={(open) => !open && setActiveSimulation(null)}>
        <SheetContent className="w-full sm:max-w-xl flex flex-col h-full p-0 overflow-hidden bg-white rounded-none">
          {activeSimulation &&
            (() => {
          const sim = activeSimulation;
          const rawOffers = safeArray<Record<string, unknown>>(sim.simulation_offers);
          const baseOffer = rawOffers[0] || {};
          const offerRow: OfferView = { ...baseOffer, category_types: safeArray(baseOffer.category_types)[0] as any || null };
              
              const bank = sim.financial_institutions || {};
              const ed = sim.entity_details || {};
              const firstUpdate = safeArray(sim.simulation_updates)[0] || {};

              const rawPayloadObj = (
                typeof sim.raw_payload === "string" 
                  ? (() => { try { return JSON.parse(sim.raw_payload); } catch { return {}; } })() 
                  : sim.raw_payload
              ) as Record<string, unknown> | null;

              const pageConfigs = (rawPayloadObj?.page_configs as Record<string, unknown>) || null;
              const pageFaqs = safeArray((rawPayloadObj as any)?.page_faqs);
              const consentConfigsRaw = (rawPayloadObj?.consent_configs as Array<Record<string, unknown>>) || [];
              const extractedConsentConfigs = safeArray(consentConfigsRaw).filter(
                (c): c is Record<string, unknown> => c !== null && typeof c === 'object' && Object.keys(c).length > 0
              );
              const validConsents = safeArray(sim.simulation_consents).filter(
                (c): c is Record<string, unknown> => c !== null && typeof c === 'object' && c.consent_id != null
              );

              return (
                <div className="flex flex-col h-full overflow-hidden">
                  <div className="p-4 sm:p-6 pb-4 border-b border-neutral-200 bg-white shrink-0">
                    <SheetHeader className="space-y-3 text-left">
                      <div className="flex items-center justify-between gap-2 pr-8">
                        <div className="flex items-center gap-2 min-w-0">
                          {/* ✅ CORREÇÃO AQUI: rounded-[6px] forçado, sem border, bg-transparent, object-cover */}
                          <div className="flex h-7 w-7 items-center justify-center bg-transparent shrink-0 rounded-[6px] overflow-hidden">
                            {sim.partners?.logo_url ? (
                              <img src={sim.partners.logo_url} className="h-full w-full object-cover" alt={sim.partners?.name} />
                            ) : (
                              <span className="flex items-center justify-center h-full w-full text-[9px] font-bold uppercase text-neutral-900 bg-neutral-100">
                                {sim.partners?.name?.slice(0, 3)}
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-bold text-slate-700 uppercase tracking-wide truncate">{sim.partners?.name || "Parceiro N/A"}</span>
                        </div>
                        {detailLoading && <div className="flex items-center gap-1.5 text-xs text-neutral-500 bg-neutral-100 px-2.5 py-1 rounded-none"><Loader2 className="h-3 w-3 animate-spin text-brand-accent" /> Carregando detalhes...</div>}
                      </div>

                      <div className="space-y-1 pr-8 text-left w-full">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-bold text-neutral-900 uppercase tracking-wider">{sim.product_types?.name || "Financiamento"}</span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`inline-flex items-center rounded-none px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${statusClass(sim.status_types?.name)}`}>
                              {sim.status_types?.name || "Pendente"}
                            </span>
                          </div>
                        </div>
                        <SheetTitle className="text-lg sm:text-xl font-bold text-neutral-950 break-words text-left w-full">{sim.name || "—"}</SheetTitle>
                      </div>
                    </SheetHeader>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <PanelVisit visitData={sim as any} updateData={firstUpdate} />
                    <PanelEntity entity={sim as any} entityDetails={ed} />
                    
                    {Object.keys(offerRow).length > 0 && <PanelOffer offer={offerRow} />}
                    {Object.keys(offerRow).length > 0 && <PanelSeller offer={offerRow} />}
                    
                    {validConsents.length > 0 && <PanelAcceptedConsents consents={validConsents} />}
                    <PanelSimulation simulation={sim as any} bank={bank} />
                    
                    {pageConfigs && <PanelProduct config={pageConfigs} />}
                    {extractedConsentConfigs.length > 0 && <PanelConsents configs={extractedConsentConfigs} />}
                    {pageFaqs.length > 0 && <PanelFAQ faqs={pageFaqs} isPrint={false} />}
                    {!!pageConfigs?.footer && <PanelFooter footer={pageConfigs.footer as any} />}
                  </div>

                  <div className="p-4 bg-white border-t border-neutral-200 flex items-center justify-between gap-3 shrink-0 shadow-xs">
                    <Button variant="outline" onClick={handlePrintSheet} className="flex-1 rounded-none text-xs gap-2 border-neutral-200 text-neutral-900 h-10 font-bold hover:bg-primary hover:text-primary-foreground hover:border-primary"><Printer className="h-4 w-4" /> Imprimir / PDF</Button>
                    <Button onClick={() => setActiveSimulation(null)} className="cta-gradient border-0 flex-1 rounded-none text-xs text-white h-10 font-bold">Fechar</Button>
                  </div>
                </div>
              );
            })()}
        </SheetContent>
      </Sheet>

      <div style={{ display: "none" }}>
        <div ref={printRef} className="w-full text-slate-900 bg-white p-8">
          {activeSimulation &&
            (() => {
              const sim = activeSimulation;
              const rawOffers = safeArray<Record<string, unknown>>(sim.simulation_offers);
              const baseOffer = rawOffers[0] || {};
              const offerRow: OfferView = { ...baseOffer, category_types: safeArray(baseOffer.category_types)[0] as any || null };

              const bank = sim.financial_institutions || {};
              const ed = sim.entity_details || {};
              const firstUpdate = safeArray(sim.simulation_updates)[0] || {};
              const rawPayloadObj = typeof sim.raw_payload === "string" ? (() => { try { return JSON.parse(sim.raw_payload); } catch { return {}; } })() : sim.raw_payload || {};
              const pageConfigs = (rawPayloadObj as any).page_configs || null;
              const pageFaqs = safeArray((rawPayloadObj as any)?.page_faqs);
              const consentConfigsRaw = (rawPayloadObj?.consent_configs as Array<Record<string, unknown>>) || [];
              const extractedConsentConfigs = safeArray(consentConfigsRaw).filter(
                (c): c is Record<string, unknown> => c !== null && typeof c === 'object' && Object.keys(c).length > 0
              );
              const validConsents = safeArray(sim.simulation_consents).filter(
                (c): c is Record<string, unknown> => c !== null && typeof c === 'object' && c.consent_id != null
              );

              return (
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-neutral-200 pb-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-neutral-900 uppercase">{sim.product_types?.name || "Financiamento"}</span>
                        <span className={`px-2.5 py-0.5 text-xs font-bold rounded-none border border-neutral-300 bg-neutral-50 text-neutral-900 uppercase`}>{sim.status_types?.name || "Pendente"}</span>
                      </div>
                      <h1 className="text-2xl font-bold text-neutral-950">{sim.name || "Cliente sem nome"}</h1>
                    </div>
                  </div>

                  <PanelVisit visitData={sim as any} updateData={firstUpdate} />
                  <PanelEntity entity={sim as any} entityDetails={ed} />

                  {Object.keys(offerRow).length > 0 && <PanelOffer offer={offerRow} />}
                  {Object.keys(offerRow).length > 0 && <PanelSeller offer={offerRow} />}
                  {validConsents.length > 0 && <PanelAcceptedConsents consents={validConsents} />}
                  <PanelSimulation simulation={sim as any} bank={bank} />

                  {pageConfigs && <PanelProduct config={pageConfigs} />}
                  {extractedConsentConfigs.length > 0 && <PanelConsents configs={extractedConsentConfigs} />}
                  {pageFaqs.length > 0 && <PanelFAQ faqs={pageFaqs} isPrint={true} />}
                  {!!pageConfigs?.footer && <div className="pt-2 break-inside-avoid"><PanelFooter footer={pageConfigs.footer as any} /></div>}
                </div>
              );
            })()}
        </div>
      </div>

      {/* =========================================================
          GAVETA DE FILTROS MOBILE
          ========================================================= */}
      <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
        <SheetContent side="bottom" className="rounded-none max-h-[85vh] overflow-y-auto p-6 bg-white z-50 border-t border-neutral-200">
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="text-lg font-bold text-neutral-900">Filtros</SheetTitle>
          </SheetHeader>
          
          <div className="flex flex-col gap-4 w-full">
            
            <div className="w-full">
              <span className="text-xs font-medium text-neutral-500 mb-1 block">Período</span>
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-11 w-full rounded-none justify-between gap-2 bg-white text-neutral-900 border-neutral-200 hover:bg-primary hover:text-primary-foreground hover:border-primary">
                    <span className="flex items-center gap-2 truncate">
                      <Filter className="h-4 w-4 shrink-0 text-brand-accent" />
                      Período: {dateRange === "custom" ? "Personalizado" : dateRange === "30" ? "30 dias" : dateRange === "90" ? "90 dias" : "Tudo"}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0 text-brand-accent" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-3rem)] sm:w-auto p-0 bg-white border-neutral-200 rounded-none z-50 shadow-xs" align="start">
                  <Command className="bg-white">
                    <CommandList className="max-h-56 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }} onWheelCapture={(e) => e.stopPropagation()}>
                      <CommandGroup>
                        <CommandItem onSelect={() => setDateRange("30")} className="text-neutral-900 cursor-pointer rounded-none hover:bg-neutral-100">Últimos 30 dias</CommandItem>
                        <CommandItem onSelect={() => setDateRange("90")} className="text-neutral-900 cursor-pointer rounded-none hover:bg-neutral-100">Últimos 90 dias</CommandItem>
                        <CommandItem onSelect={() => setDateRange("all")} className="text-neutral-900 cursor-pointer rounded-none hover:bg-neutral-100">Todo o período</CommandItem>
                      </CommandGroup>
                      <div className="border-t border-neutral-200 p-3">
                        <p className="text-xs text-neutral-500 mb-2 font-medium">Personalizado:</p>
                        <Calendar mode="range" selected={customRange} onSelect={(range) => { setCustomRange(range); setDateRange("custom"); }} numberOfMonths={1} />
                      </div>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="w-full">
              <span className="text-xs font-medium text-neutral-500 mb-1 block">Parceiro</span>
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-11 w-full rounded-none justify-between gap-2 bg-white text-neutral-900 border-neutral-200 hover:bg-primary hover:text-primary-foreground hover:border-primary">
                    <span className="truncate">
                      {selectedPartners.length === 0 ? "Todos Parceiros" : `${selectedPartners.length} parceiro(s) sel.`}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0 text-brand-accent" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-3rem)] sm:w-56 p-0 bg-white border-neutral-200 rounded-none z-50 shadow-xs" align="start">
                  <Command className="bg-white">
                    <CommandList className="max-h-56 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }} onWheelCapture={(e) => e.stopPropagation()}>
                      <CommandGroup>
                        <CommandItem onSelect={() => setSelectedPartners([])} className="text-neutral-900 cursor-pointer rounded-none hover:bg-neutral-100">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${selectedPartners.length === 0 ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>
                            {selectedPartners.length === 0 && "✓"}
                          </div>
                          Todos Parceiros
                        </CommandItem>
                        {partnersList.map((p) => {
                          const isSelected = selectedPartners.includes(String(p.id));
                          return (
                            <CommandItem key={p.id} onSelect={() => { if (isSelected) setSelectedPartners(selectedPartners.filter((id) => id !== String(p.id))); else setSelectedPartners([...selectedPartners, String(p.id)]); }} className={`text-neutral-900 cursor-pointer rounded-none hover:bg-neutral-100 ${isSelected ? "bg-neutral-50 font-medium" : ""}`}>
                              <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${isSelected ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>
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
              <span className="text-xs font-medium text-neutral-500 mb-1 block">Produto</span>
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-11 w-full rounded-none justify-between gap-2 bg-white text-neutral-900 border-neutral-200 hover:bg-primary hover:text-primary-foreground hover:border-primary">
                    <span className="truncate">
                      {selectedProducts.length === 0 ? "Todos Produtos" : `${selectedProducts.length} produto(s) sel.`}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0 text-brand-accent" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-3rem)] sm:w-56 p-0 bg-white border-neutral-200 rounded-none z-50 shadow-xs" align="start">
                  <Command className="bg-white">
                    <CommandList className="max-h-56 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }} onWheelCapture={(e) => e.stopPropagation()}>
                      <CommandGroup>
                        <CommandItem onSelect={() => setSelectedProducts([])} className="text-neutral-900 cursor-pointer rounded-none hover:bg-neutral-100">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${selectedProducts.length === 0 ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>
                            {selectedProducts.length === 0 && "✓"}
                          </div>
                          Todos Produtos
                        </CommandItem>
                        {productsList.map((p) => {
                          const isSelected = selectedProducts.includes(String(p.id));
                          return (
                            <CommandItem key={p.id} onSelect={() => { if (isSelected) setSelectedProducts(selectedProducts.filter((id) => id !== String(p.id))); else setSelectedProducts([...selectedProducts, String(p.id)]); }} className={`text-neutral-900 cursor-pointer rounded-none hover:bg-neutral-100 ${isSelected ? "bg-neutral-50 font-medium" : ""}`}>
                              <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${isSelected ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>
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
              <span className="text-xs font-medium text-neutral-500 mb-1 block">Situação</span>
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="h-11 w-full rounded-none justify-between gap-2 bg-white text-neutral-900 border-neutral-200 hover:bg-primary hover:text-primary-foreground hover:border-primary">
                    <span className="truncate">
                      {selectedStatus.length === 0 ? "Todas" : `${selectedStatus.length} selecionada(s)`}
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0 text-brand-accent" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[calc(100vw-3rem)] sm:w-56 p-0 bg-white border-neutral-200 rounded-none z-50 shadow-xs" align="start">
                  <Command className="bg-transparent">
                    <CommandList className="max-h-56 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" }} onWheelCapture={(e) => e.stopPropagation()}>
                      <CommandGroup>
                        <CommandItem onSelect={() => handleSelectStatus("Todas")} className="text-neutral-900 cursor-pointer rounded-none hover:bg-neutral-100">
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${selectedStatus.length === 0 ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>
                            {selectedStatus.length === 0 && "✓"}
                          </div>
                          Todas
                        </CommandItem>
                        {statusOptions.filter((s) => s !== "Qualificadas").map((s) => {
                          const isSelected = selectedStatus.includes(s);
                          return (
                            <CommandItem key={s} onSelect={() => handleSelectStatus(s)} className={`text-neutral-900 cursor-pointer rounded-none hover:bg-neutral-100 ${isSelected ? "bg-neutral-50 font-medium" : ""}`}>
                              <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-none border border-neutral-400 ${isSelected ? "bg-neutral-900 text-white border-neutral-900" : "opacity-50"}`}>
                                {isSelected && "✓"}
                              </div>
                              {s}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
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
    </div>
  );
}