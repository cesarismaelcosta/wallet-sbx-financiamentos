/**
 * ============================================================================
 * @fileoverview Monitor de Consultas e Visitas (Backoffice Otimizado)
 * @module Backoffice/Consults
 * @path src/routes/backoffice/consults.lazy.tsx
 *
 * =========================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: OLAP TEMPORAL DETERMINISM
 * =========================================================================
 * Torre de controle de topo de funil de alta performance. Utiliza payload enxuto
 * na listagem principal, filtros de data no servidor, importação dinâmica do Excel
 * e carregamento sob demanda no Sheet de auditoria.
 *
 * [MUDANÇAS ARQUITETURAIS - 1:N OFFERS]:
 * Com a introdução do Cart Preservation, uma visita passou a possuir N ofertas.
 * A extração `visit_offers[0]` foi substituída pelo "Extrator Temporal Determinístico",
 * que ordena as ofertas por `created_at DESC` em memória, assegurando que o Analista
 * visualizará sempre o último pageview / última intenção do lead.
 *
 * [EVENT-LEVEL CONTEXT & RENDERIZAÇÃO INCONDICIONAL]:
 * 1. {Backward Compatibility}: Se não houver amarração do update (legacy), fallback para raiz.
 * 2. {Safe Merge}: Mescla do layout da raiz com os dados do update, evitando
 *    que payloads magros do Fast Path apaguem a renderização do frontend.
 * 3. {UI Resilience}: A renderização incondicional foi restaurada. Painéis como FAQ
 *    e Product assumem a responsabilidade de não renderizar se não houver dados,
 *    em vez do Sheet derrubar a tela antecipadamente com validações estritas.
 *
 * [ENTERPRISE ZERO-TRUST - OBFUSCATION V3]:
 * - As antigas queries diretas PostgREST foram blindadas e substituídas de forma
 *   cirúrgica pelos RPCs `get_backoffice_consults` e `get_backoffice_consult_details`.
 *   O esquema de tabelas financeiras agora encontra-se 100% oculto da aba Network (F12).
 *
 * =========================================================================
 * ⚙️ DEPENDÊNCIA DE INFRAESTRUTURA (POSTGRESQL RPCs)
 * =========================================================================
 * Para que este componente funcione, as seguintes Stored Procedures DEVEM
 * existir no Supabase:
 *
 * -------------------------------------------------------------------------
 * PROCEDURE 1: Listagem Geral de Consultas (Otimizada com CTE)
 * -------------------------------------------------------------------------
 * CREATE OR REPLACE FUNCTION get_backoffice_consults(
 *   p_limit INT DEFAULT 50, p_offset INT DEFAULT 0, p_date_from TIMESTAMPTZ DEFAULT NULL,
 *   p_date_to TIMESTAMPTZ DEFAULT NULL, p_partner_ids INT[] DEFAULT NULL,
 *   p_product_ids INT[] DEFAULT NULL, p_allowed_partners TEXT[] DEFAULT NULL, p_allowed_products TEXT[] DEFAULT NULL
 * ) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
 * DECLARE v_result JSONB;
 * BEGIN
 *   WITH paginated_results AS (
 *     SELECT v.id AS v_id, vu.id AS vu_id, vu.action, vu.created_at, vu.partner_id, vu.product_id,
 *            vu.raw_payload, v.utm_source, v.state, p.id AS p_id, p.name AS p_name, p.logo_url AS p_logo_url, pt.id AS pt_id, pt.name AS pt_name
 *     FROM visit_updates vu JOIN visits v ON vu.visit_id = v.id
 *     LEFT JOIN partners p ON vu.partner_id = p.id LEFT JOIN product_types pt ON vu.product_id = pt.id
 *     WHERE vu.action IN ('SIMULATE', 'CONSULT', 'REDIRECT')
 *       AND (p_date_from IS NULL OR vu.created_at >= p_date_from) AND (p_date_to IS NULL OR vu.created_at <= p_date_to)
 *       AND (p_partner_ids IS NULL OR vu.partner_id = ANY(p_partner_ids)) AND (p_product_ids IS NULL OR vu.product_id = ANY(p_product_ids))
 *       AND (p_allowed_partners IS NULL OR '{"*"}'::TEXT[] <@ p_allowed_partners OR vu.partner_id::TEXT = ANY(p_allowed_partners))
 *       AND (p_allowed_products IS NULL OR '{"*"}'::TEXT[] <@ p_allowed_products OR vu.product_id::TEXT = ANY(p_allowed_products))
 *     ORDER BY vu.created_at DESC LIMIT p_limit OFFSET p_offset
 *   )
 *   SELECT jsonb_agg(jsonb_build_object(
 *       'id', pr.v_id, 'row_id', pr.vu_id, 'action', pr.action, 'created_at', pr.created_at,
 *       'partner_id', pr.partner_id, 'product_id', pr.product_id, 'raw_payload', pr.raw_payload,
 *       'utm_source', pr.utm_source, 'state', pr.state,
 *       'partners', CASE WHEN pr.p_id IS NOT NULL THEN jsonb_build_object('name', pr.p_name, 'logo_url', pr.p_logo_url) ELSE NULL END,
 *       'product_types', CASE WHEN pr.pt_id IS NOT NULL THEN jsonb_build_object('name', pr.pt_name) ELSE NULL END,
 *       'visit_entities', (SELECT jsonb_agg(jsonb_build_object('name', ve.name, 'document', ve.document, 'phone', ve.phone, 'email', ve.email)) FROM visit_entities ve WHERE ve.visit_id = pr.v_id),
 *       'visit_offers', (
 *          SELECT jsonb_agg(jsonb_build_object(
 *            'visit_update_id', vo.visit_update_id, 'offer_id', vo.offer_id, 'offer_description', vo.offer_description,
 *            'offer_value', vo.offer_value, 'event_id', vo.event_id, 'event_description', vo.event_description,
 *            'event_start_date', vo.event_start_date, 'event_end_date', vo.event_end_date, 'created_at', vo.created_at,
 *            'category_types', jsonb_build_object('name', ct.name)
 *          )) FROM visit_offers vo LEFT JOIN category_types ct ON vo.category_id = ct.id WHERE vo.visit_id = pr.v_id
 *       )
 *   )) INTO v_result FROM paginated_results pr;
 *   RETURN COALESCE(v_result, '[]'::jsonb);
 * END;
 * $$;
 *
 * -------------------------------------------------------------------------
 * PROCEDURE 2: Detalhes Profundos da Consulta (Modal)
 * -------------------------------------------------------------------------
 * CREATE OR REPLACE FUNCTION get_backoffice_consult_details(p_visit_update_id UUID)
 * RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
 * DECLARE v_result JSONB;
 * BEGIN
 *   SELECT jsonb_build_object(
 *     'id', vu.id, 'action', vu.action, 'created_at', vu.created_at, 'partner_id', vu.partner_id,
 *     'product_id', vu.product_id, 'raw_payload', vu.raw_payload,
 *     'partners', CASE WHEN p.id IS NOT NULL THEN jsonb_build_object('name', p.name, 'logo_url', p.logo_url) ELSE NULL END,
 *     'product_types', CASE WHEN pt.id IS NOT NULL THEN jsonb_build_object('name', pt.name) ELSE NULL END,
 *     'visits', jsonb_build_array(jsonb_build_object(
 *         'id', v.id, 'utm_source', v.utm_source, 'utm_campaign', v.utm_campaign, 'country', v.country,
 *         'state', v.state, 'city', v.city, 'ip_address', v.ip_address, 'operating_system', v.operating_system,
 *         'device_type', v.device_type, 'origin_url', v.origin_url, 'target_url', v.target_url, 'raw_payload', v.raw_payload,
 *         'visit_entities', (
 *            SELECT jsonb_agg(jsonb_build_object('id', ve.id, 'name', ve.name, 'document', ve.document, 'phone', ve.phone, 'email', ve.email, 'birth_date', ve.birth_date, 'gender', ve.gender, 'entity_type', ve.entity_type, 'entity_details', ve.entity_details)) FROM visit_entities ve WHERE ve.visit_id = v.id
 *         ),
 *         'visit_offers', (
 *            SELECT jsonb_agg(jsonb_build_object('id', vo.id, 'visit_id', vo.visit_id, 'visit_update_id', vo.visit_update_id, 'manager_name', vo.manager_name, 'seller_id', vo.seller_id, 'legal_name', vo.legal_name, 'trade_name', vo.trade_name, 'event_id', vo.event_id, 'event_description', vo.event_description, 'event_start_date', vo.event_start_date, 'event_end_date', vo.event_end_date, 'offer_id', vo.offer_id, 'offer_description', vo.offer_description, 'offer_value', vo.offer_value, 'category_id', vo.category_id, 'created_at', vo.created_at, 'subcategory', vo.subcategory, 'category_types', CASE WHEN ct.id IS NOT NULL THEN jsonb_build_object('name', ct.name) ELSE NULL END)) FROM visit_offers vo LEFT JOIN category_types ct ON vo.category_id = ct.id WHERE vo.visit_id = v.id
 *         ),
 *         'visit_consents', (
 *            SELECT jsonb_agg(jsonb_build_object('id', vc.id, 'consent_id', vc.consent_id, 'accepted', vc.accepted, 'accepted_at', vc.accepted_at, 'created_at', vc.created_at, 'ip_address', vc.ip_address, 'country', vc.country, 'state', vc.state, 'city', vc.city, 'operating_system', vc.operating_system, 'device_type', vc.device_type, 'origin_details', vc.origin_details, 'page_snapshot', vc.page_snapshot, 'visit_update_id', vc.visit_update_id)) FROM visit_consents vc WHERE vc.visit_id = v.id
 *         )
 *     ))
 *   ) INTO v_result FROM visit_updates vu JOIN visits v ON vu.visit_id = v.id LEFT JOIN partners p ON vu.partner_id = p.id LEFT JOIN product_types pt ON vu.product_id = pt.id WHERE vu.id = p_visit_update_id;
 *   RETURN v_result;
 * END;
 * $$;
 * ============================================================================
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import { RefreshCw, Search, Filter, Download, ChevronDown, Printer, Loader2 } from "lucide-react";
import { DateRange } from "react-day-picker";
import { useAuth } from "@/integrations/auth/AuthContext";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";

// Fábrica de Painéis Compartilhados
import { PanelProduct } from "@/features/financial-hub/components/shared/renderes/PanelProduct";
import { PanelOffer } from "@/features/financial-hub/components/shared/renderes/PanelOffer";
import { PanelSeller } from "@/features/financial-hub/components/shared/renderes/PanelSeller";
import { PanelEntity } from "@/features/financial-hub/components/shared/renderes/PanelEntity";
import { PanelAcceptedConsents } from "@/features/financial-hub/components/shared/renderes/PanelAcceptedConsents";
import { PanelConsents } from "@/features/financial-hub/components/shared/renderes/PanelConsents";
import { PanelFAQ } from "@/features/financial-hub/components/shared/renderes/PanelFAQ";
import { PanelFooter } from "@/features/financial-hub/components/shared/renderes/PanelFooter";
import { PanelVisit } from "@/features/financial-hub/components/shared/renderes/PanelVisit";

import { supabase } from "@/integrations/supabase/client";

export type ConsultEntity = {
  name?: string | null;
  document?: string | null;
  phone?: string | null;
  email?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  entity_type?: string | null;
  entity_details?: Record<string, unknown> | null;
};

export type ConsultOffer = {
  offer_description?: string | null;
  offer_value?: number | null;
  manager_name?: string | null;
  legal_name?: string | null;
  event_end_date?: string | null;
  name?: string | null;
  logo_url?: string | null;
  [key: string]: unknown;
};

export type ConsultRow = {
  id: string;
  row_id?: string;
  created_at: string | null;
  product_types?: { name?: string } | null;
  partners?: { name?: string; logo_url?: string } | null;
  utm_source?: string | null;
  state?: string | null;
  visit_entities?: ConsultEntity | null;
  visit_offers?: ConsultOffer | null;
  visit_consents?: Array<Record<string, unknown>> | null;
  all_offers?: ConsultOffer[];
  has_contact?: boolean;
  action?: string | null;
  raw_payload?: unknown;
  [key: string]: unknown;
};

export const Route = createLazyFileRoute("/backoffice/consults")({
  component: ConsultsPage,
});

const safeArray = <T,>(data: T | T[] | null | undefined): T[] => {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
};

const STATUS_STYLES: Record<string, string> = {
  visita: "bg-purple-500/10 text-purple-600",
  simulacao: "bg-primary/10 text-primary",
  consulta: "bg-blue-500/10 text-blue-600",
  parceiro: "bg-amber-500/10 text-amber-600",
  default: "bg-muted text-muted-foreground",
};

function statusClass(status: string) {
  const key = status
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  return STATUS_STYLES[key] ?? STATUS_STYLES.default;
}

const BRL = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

function formatDate(iso: string | null) {
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

function ConsultsPage() {
  const { backofficeUser } = useAuth();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<ConsultRow[]>([]);
  const [search, setSearch] = useState("");

  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<"30" | "90" | "all" | "custom">("30");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  const [partnersList, setPartnersList] = useState<any[]>([]);
  const [productsList, setProductsList] = useState<any[]>([]);

  const [activeConsult, setActiveConsult] = useState<ConsultRow | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);

  const printRef = useRef<HTMLDivElement>(null);

  const [stats, setStats] = useState({ total: 0, consultas: 0, sites_parceiros: 0, simulacoes: 0 });

  useEffect(() => {
    async function loadDropdowns() {
      if (!backofficeUser) return;

      const { data: pData } = await supabase.from("partners").select("id, name").eq("is_active", true).order("name");
      const { data: prData } = await supabase.from("product_types").select("id, name").order("name");

      if (pData) {
        if (backofficeUser.role === "viewer" && !backofficeUser.allowed_partners?.includes("*")) {
          const allowed = backofficeUser.allowed_partners || [];
          setPartnersList(pData.filter((p) => allowed.includes(String(p.id))));
        } else {
          setPartnersList(pData);
        }
      }

      if (prData) {
        if (backofficeUser.role === "viewer" && !backofficeUser.allowed_products?.includes("*")) {
          const allowed = backofficeUser.allowed_products || [];
          setProductsList(prData.filter((pr) => allowed.includes(String(pr.id))));
        } else {
          setProductsList(prData);
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
    const timeoutId = setTimeout(() => {
      setPage(0);
      load(0);
      loadStats();
    }, 400);
    return () => clearTimeout(timeoutId);
  }, [search, selectedPartners, selectedProducts, dateRange, customRange]);

  async function load(targetPage: number) {
    if (!backofficeUser) return;
    setLoading(true);
    try {
      const offset = targetPage * PAGE_SIZE;

      let p_date_from = null;
      let p_date_to = null;

      if (dateRange === "30") {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        p_date_from = d.toISOString();
      } else if (dateRange === "90") {
        const d = new Date();
        d.setDate(d.getDate() - 90);
        p_date_from = d.toISOString();
      } else if (dateRange === "custom" && customRange?.from && customRange?.to) {
        p_date_from = customRange.from.toISOString();
        p_date_to = customRange.to.toISOString();
      }

      // =========================================================================
      // [ENTERPRISE ZERO-TRUST]: Consulta de Listagem via RPC do PostgreSQL
      // =========================================================================
      const { data: rpcData, error: rpcError } = await supabase.rpc("get_backoffice_consults", {
        p_limit: PAGE_SIZE + 1,
        p_offset: offset,
        p_date_from,
        p_date_to,
        p_partner_ids: selectedPartners.length > 0 ? selectedPartners.map(Number) : null,
        p_product_ids: selectedProducts.length > 0 ? selectedProducts.map(Number) : null,
      });

      if (rpcError) throw new Error(rpcError.message);

      const visitsData = rpcData || [];
      if (!visitsData || visitsData.length === 0) {
        setRows([]);
        setTotalPages(targetPage + 1);
        return;
      }

      const hasMore = visitsData.length > PAGE_SIZE;
      const slicedData = hasMore ? visitsData.slice(0, PAGE_SIZE) : visitsData;
      setTotalPages(hasMore ? targetPage + 2 : targetPage + 1);

      const visitIds = slicedData.map((v: Record<string, unknown>) => String(v.id));
      const { data: updatesData } = await supabase
        .from("visit_updates")
        .select("visit_id, action")
        .in("visit_id", visitIds);
      const contactSet = new Set(
        updatesData?.filter((u) => (u.action || "").toUpperCase().includes("CONTACT")).map((u) => u.visit_id) || [],
      );

      const normalized = slicedData.map((u: Record<string, unknown>) => {
        const entity = safeArray(u.visit_entities)[0] || null;

        let updateOffers = safeArray(u.visit_offers).filter((o: any) => o.visit_update_id === u.row_id);

        // Se a busca pelo update não retornou nada, varre a raiz por legado (ofertas sem update_id gravado)
        if (updateOffers.length === 0) {
          updateOffers = safeArray(u.visit_offers).filter((o: any) => !o.visit_update_id);
        }

        const sortedOffers = updateOffers.sort(
          (a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
        );

        let eventPayload = {};
        if (typeof u.raw_payload === "string") {
          try {
            eventPayload = JSON.parse(u.raw_payload);
          } catch (e) {}
        } else {
          eventPayload = u.raw_payload || {};
        }

        return {
          id: u.id,
          row_id: u.row_id,
          created_at: u.created_at,
          action: u.action,
          utm_source: u.utm_source,
          state: u.state,
          visit_entities: entity,
          visit_offers: sortedOffers[0] || {},
          all_offers: sortedOffers,
          partner_id: u.partner_id,
          product_id: u.product_id,
          partners: u.partners,
          product_types: u.product_types,
          raw_payload: eventPayload,
          has_contact: contactSet.has(u.id),
        };
      });

      if (search.trim() !== "") {
        const rawSearch = search.toLowerCase().trim();
        const rawDocSearch = search.replace(/\D/g, "");
        const localFiltered = normalized.filter((r: any) => {
          const clientName = r.visit_entities?.name ?? "";
          const rowDoc = r.visit_entities?.document?.replace(/\D/g, "") || "";
          return clientName.toLowerCase().includes(rawSearch) || (rawDocSearch !== "" && rowDoc.includes(rawDocSearch));
        });
        setRows(localFiltered);
      } else {
        setRows(normalized);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg || "Falha ao carregar listagem.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function loadStats() {
    try {
      let dateLimit = new Date();
      if (dateRange === "30") dateLimit.setDate(dateLimit.getDate() - 30);
      else if (dateRange === "90") dateLimit.setDate(dateLimit.getDate() - 90);
      else if (dateRange === "all") dateLimit = new Date("2020-01-01");

      let query = supabase
        .from("visit_updates")
        .select(
          `
          id, action, created_at, partner_id, product_id, raw_payload,
          partners(name, logo_url), product_types(name),
          visits!visit_updates_visit_id_fkey!inner(
            id, created_at, utm_source, state,
            visit_entities(name, document, phone, email),
            visit_offers(visit_update_id, offer_id, offer_description, offer_value, event_id, event_description, event_start_date, event_end_date, created_at, category_types(name))
          )
        `,
        )
        .in("action", ["SIMULATE", "CONSULT", "REDIRECT"]);

      if (dateRange !== "all" && dateRange !== "custom")
        query = query.gte("visits.created_at", dateLimit.toISOString());
      else if (dateRange === "custom" && customRange?.from && customRange?.to)
        query = query
          .gte("visits.created_at", customRange.from.toISOString())
          .lte("visits.created_at", customRange.to.toISOString());

      if (selectedPartners.length > 0) query = query.in("partner_id", selectedPartners);
      if (selectedProducts.length > 0) query = query.in("product_id", selectedProducts);

      const { data: updates, error } = await query;
      if (error) throw error;

      const items = updates || [];
      const uniqueVisits = new Set(items.map((i) => (i as { visit_id?: string }).visit_id)).size;

      setStats({
        total: uniqueVisits,
        consultas: items.filter((u) => (u.action || "").toUpperCase().includes("CONSULT")).length,
        sites_parceiros: items.filter((u) => (u.action || "").toUpperCase().includes("REDIRECT")).length,
        simulacoes: items.filter((u) => (u.action || "").toUpperCase().includes("SIMULATE")).length,
      });
    } catch (e) {
      console.error("Erro ao calcular estatísticas com filtros:", e);
    }
  }

  // =========================================================================
  // [ENTERPRISE ZERO-TRUST]: Consulta de Detalhes via RPC do PostgreSQL
  // =========================================================================
  async function handleSelectConsult(row: ConsultRow) {
    setDetailLoading(true);
    setActiveConsult(row);

    try {
      const { data: updateData, error } = await supabase.rpc("get_backoffice_consult_details", {
        p_visit_update_id: row.row_id,
      });

      if (error) {
        toast.error(`Erro ao carregar detalhes: ${error.message}`);
        return;
      }

      if (updateData) {
        const visit: any = safeArray(updateData.visits)[0] || {};

        const rawOffers = safeArray(visit.visit_offers);
        let updateOffers = rawOffers.filter((o: any) => o.visit_update_id === updateData.id);
        if (updateOffers.length === 0) updateOffers = rawOffers.filter((o: any) => !o.visit_update_id); // legacy
        const mainOffer =
          updateOffers.sort(
            (a: any, b: any) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
          )[0] || null;

        // ✨ [CORREÇÃO]: A auditoria respeita rigorosamente o evento da timeline.
        // Se a visita tem um aceite atrelado a este Update, exibe.
        // Se o Update foi de uma visita antiga (legacy) que não tem `visit_update_id` atrelado no consent, exibe os antigos.
        // Isso evita que um termo assinado numa Simulação futura vaze para a tela da Visita.
        const rawConsents = safeArray(visit.visit_consents);
        let updateConsents = rawConsents.filter((c: any) => c.visit_update_id === updateData.id);

        // Só exibe termos antigos caso eles não tenham nenhuma amarração e o array normal retorne vazio.
        if (updateConsents.length === 0) updateConsents = rawConsents.filter((c: any) => !c.visit_update_id);

        // Removemos o raw_payload de dentro do visit para evitar colisão na raiz
        const { raw_payload: _, ...cleanVisit } = visit;

        setActiveConsult({
          ...cleanVisit,
          created_at: updateData.created_at,
          action: updateData.action,
          raw_payload: updateData.raw_payload, // Garante estritamente o payload rico do visit_updates
          partner_id: updateData.partner_id,
          product_id: updateData.product_id,
          partners: updateData.partners,
          product_types: updateData.product_types,
          has_contact: row.has_contact,

          visit_entities: safeArray(visit.visit_entities)[0] || null,
          visit_offers: mainOffer,
          visit_consents: updateConsents,
        });
      }
    } catch (e) {
      console.error("Erro inesperado no handleSelectConsult:", e);
    } finally {
      setDetailLoading(false);
    }
  }

function getVisitStatus(r: Record<string, unknown>): string {
    const act = (String(r.action ?? "")).toUpperCase();
    if (act.includes("SIMULATE")) return "SIMULAÇÃO";
    if (act.includes("CONSULT")) return "CONSULTA";
    if (act.includes("REDIRECT")) return "PARCEIRO";
    return "CONSULTA";
  }

  const statusOptions = ["SIMULAÇÃO", "CONSULTA", "PARCEIRO"];
  const handleSelectStatus = (status: string) => {
    if (status === "Todas") {
      setSelectedStatus([]);
      return;
    }
    setSelectedStatus((prev) =>
      Array.isArray(prev) && prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...(Array.isArray(prev) ? prev : []), status],
    );
  };

  const { filtered, totals } = useMemo(() => {
    const safeRows = Array.isArray(rows) ? rows : [];
    const safeStatus = Array.isArray(selectedStatus) ? selectedStatus : [];
    const t = { total: safeRows.length, simulacao: 0, consulta: 0, siteParceiro: 0 };

    const resultFiltered = safeRows.filter((r) => {
      const statusName = getVisitStatus(r);
      if (statusName === "SIMULAÇÃO") t.simulacao++;
      else if (statusName === "CONSULTA") t.consulta++;
      else if (statusName === "PARCEIRO") t.siteParceiro++;

      if (safeStatus.length === 0) return true;
      return safeStatus.includes(statusName);
    });

    return { filtered: resultFiltered, totals: t };
  }, [rows, selectedStatus]);

  const handleExportExcel = async () => {
    if (!filtered || filtered.length === 0) {
      toast.error("Não há dados.");
      return;
    }
    const XLSX = await import("xlsx");
    const dataToExport = filtered.map((r) => {
      const created = formatDate(r.created_at);
      const entity = r.visit_entities || {};
      const offer = r.visit_offers || {};
      return {
        ID: r.id,
        Data: `${created.d} ${created.h}`,
        Cliente: entity.name || "—",
        Documento: entity.document || "—",
        Telefone: entity.phone || "—",
        "E-mail": entity.email || "—",
        Produto: r.product_types?.name || "—",
        Situação: getVisitStatus(r),
        Parceiro: r.partners?.name || "—",
        "UTM Source": r.utm_source || "—",
        UF: r.state || "—",
        "Descrição da Oferta": offer.offer_description || "—",
        "Valor da Oferta": offer.offer_value || 0,
        Organizador: offer.manager_name || "—",
        Vendedor: offer.legal_name || "—",
      };
    });
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Consultas");
    XLSX.writeFile(workbook, `Monitor_Consultas_${new Date().toISOString().split("T")[0]}.xlsx`);
  };

  const handlePrintSheet = () => {
    if (!printRef.current) return;
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    iframe.contentWindow?.document.write(
      `<html><head>${document.head.innerHTML}<style>@page{margin:15mm;}body{background:white!important;}</style></head><body>${printRef.current.innerHTML}</body></html>`,
    );
    iframe.contentWindow?.document.close();
    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    }, 500);
  };

  return (
    <div className="font-sans space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Consultas e Visitas</h1>
          <p className="text-sm text-muted-foreground">
            Acompanhe acessos, consultas, redirecionamentos e conversões em tempo real.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExportExcel}
            className="rounded-xl hover:bg-purple-50 hover:text-purple-600 hover:border-purple-200 transition-colors"
          >
            <Download className="mr-2 h-4 w-4" /> Exportar Excel
          </Button>
          <Button onClick={() => load(0)} disabled={loading} className="rounded-xl">
            <RefreshCw className={`mr-2 h-4 w-4 shrink-0 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total de visitas (filtro)", value: Number(stats.total).toLocaleString("pt-BR") },
          { label: "Consultas", value: Number(stats.consultas).toLocaleString("pt-BR") },
          { label: "Sites parceiros", value: Number(stats.sites_parceiros).toLocaleString("pt-BR") },
          { label: "Simulações geradas", value: Number(stats.simulacoes).toLocaleString("pt-BR") },
        ].map((t) => (
          <div key={t.label} className="rounded-2xl border border-border bg-card p-5 text-card-foreground">
            <div className="text-xs font-semibold uppercase text-muted-foreground">{t.label}</div>
            <div className="mt-2 text-2xl font-bold">{t.value}</div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-border bg-card flex flex-col overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border p-4">
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
            <div className="relative w-full lg:flex-1 lg:max-w-md">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cliente ou CPF/CNPJ..."
                className="h-11 w-full rounded-full bg-slate-100/70 border-transparent pl-5 pr-12 text-[13px] text-slate-700 placeholder:text-slate-500 focus-visible:ring-primary/20 focus-visible:bg-white focus-visible:border-primary/30 transition-all shadow-none"
              />
              <Search className="absolute right-4 top-1/2 -translate-y-1/2 h-[18px] w-[18px] text-[#B300FF]" />
            </div>

            <div className="hidden lg:flex lg:items-center lg:gap-2 lg:ml-auto">
              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-[175px] rounded-xl gap-2 bg-white hover:bg-slate-50 border-slate-200 transition-colors text-slate-600 justify-between"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Filter className="h-3.5 w-3.5 opacity-50 shrink-0" />
                      <span className="truncate">
                        Parceiro: {selectedPartners.length === 0 ? "Todos" : `${selectedPartners.length} sel.`}
                      </span>
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0" align="start">
                  <Command>
                    <CommandList>
                      <CommandGroup>
                        <CommandItem onSelect={() => setSelectedPartners([])} className="cursor-pointer">
                          <div
                            className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${selectedPartners.length === 0 ? "bg-primary text-primary-foreground" : "opacity-50"}`}
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
                                if (isSelected)
                                  setSelectedPartners(selectedPartners.filter((id) => id !== String(p.id)));
                                else setSelectedPartners([...selectedPartners, String(p.id)]);
                              }}
                              className={`cursor-pointer ${isSelected ? "bg-primary/10 text-primary font-medium" : ""}`}
                            >
                              <div
                                className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? "bg-primary text-primary-foreground" : "opacity-50"}`}
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
                    size="sm"
                    className="h-10 w-[175px] rounded-xl gap-2 bg-white hover:bg-slate-50 border-slate-200 transition-colors text-slate-600 justify-between"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Filter className="h-3.5 w-3.5 opacity-50 shrink-0" />
                      <span className="truncate">
                        Produto: {selectedProducts.length === 0 ? "Todos" : `${selectedProducts.length} sel.`}
                      </span>
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-56 p-0" align="start">
                  <Command>
                    <CommandList>
                      <CommandGroup>
                        <CommandItem onSelect={() => setSelectedProducts([])} className="cursor-pointer">
                          <div
                            className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${selectedProducts.length === 0 ? "bg-primary text-primary-foreground" : "opacity-50"}`}
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
                                if (isSelected)
                                  setSelectedProducts(selectedProducts.filter((id) => id !== String(p.id)));
                                else setSelectedProducts([...selectedProducts, String(p.id)]);
                              }}
                              className={`cursor-pointer ${isSelected ? "bg-primary/10 text-primary font-medium" : ""}`}
                            >
                              <div
                                className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? "bg-primary text-primary-foreground" : "opacity-50"}`}
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
                    size="sm"
                    className="h-10 w-[175px] rounded-xl gap-2 bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8] hover:bg-[#fce7f3] transition-colors justify-between"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Filter className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">
                        Situação:{" "}
                        {selectedStatus.length === 0
                          ? "Todos"
                          : selectedStatus.includes("Qualificadas") && selectedStatus.length === 1
                            ? "Qualificadas"
                            : `${selectedStatus.length} sel.`}
                      </span>
                    </span>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-56 bg-[#fdf2f8] border-[#fbcfe8] z-50" align="start">
                  <Command className="bg-transparent">
                    <CommandList>
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => handleSelectStatus("Todas")}
                          className="cursor-pointer text-[#d946ef] hover:bg-[#fce7f3]"
                        >
                          <div
                            className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${selectedStatus.length === 0 ? "bg-[#d946ef] text-white" : "opacity-50"}`}
                          >
                            {selectedStatus.length === 0 && "✓"}
                          </div>
                          Todas
                        </CommandItem>
                        {statusOptions
                          .filter((s) => s !== "Qualificadas")
                          .map((s) => {
                            const isSelected = selectedStatus.includes(s);
                            return (
                              <CommandItem
                                key={s}
                                onSelect={() => handleSelectStatus(s)}
                                className={`cursor-pointer text-[#d946ef] hover:bg-[#fce7f3] ${isSelected ? "bg-[#d946ef]/10 font-medium" : ""}`}
                              >
                                <div
                                  className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-[#d946ef] ${isSelected ? "bg-[#d946ef] text-white" : "opacity-50"}`}
                                >
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

              <Popover modal={isMobile}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-10 w-[175px] rounded-xl gap-2 bg-white hover:bg-[#fce7f3] border-slate-200 transition-colors text-slate-600 justify-between"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Filter className="h-3.5 w-3.5 opacity-50 shrink-0" />
                      <span className="truncate">
                        Período:{" "}
                        {dateRange === "custom"
                          ? "Personalizado"
                          : dateRange === "30"
                            ? "30 dias"
                            : dateRange === "90"
                              ? "90 dias"
                              : "Tudo"}
                      </span>
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-40 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-auto" align="start">
                  <Command>
                    <CommandList>
                      <CommandGroup>
                        <CommandItem onSelect={() => setDateRange("30")}>Últimos 30 dias</CommandItem>
                        <CommandItem onSelect={() => setDateRange("90")}>Últimos 90 dias</CommandItem>
                        <CommandItem onSelect={() => setDateRange("all")}>Todo o período</CommandItem>
                      </CommandGroup>
                      <div className="p-2 border-t">
                        <Calendar
                          mode="range"
                          selected={customRange}
                          onSelect={(range) => {
                            setCustomRange(range);
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
          </div>
        </div>

        <div className="overflow-x-auto w-full pb-2">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                <th className="px-3 py-2.5 w-[75px]">Data</th>
                <th className="px-3 py-2.5 w-[140px]">Cliente</th>
                <th className="px-3 py-2.5 w-[140px]">Produto</th>
                <th className="px-3 py-2.5 w-[190px]">Oferta</th>
                <th className="px-3 py-2.5 w-[150px]">Situação</th>
                <th className="px-3 py-2.5 w-[130px]">Parceiro</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const created = formatDate(r.created_at);
                const entity = r.visit_entities || {};
                const offer = r.visit_offers || {};
                const productName = r.product_types?.name ?? "—";
                const statusName = getVisitStatus(r);
                const rawDoc = entity?.document?.replace(/\D/g, "") || "";
                const doc =
                  rawDoc.length === 14
                    ? rawDoc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
                    : rawDoc.length === 11
                      ? rawDoc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
                      : entity?.document || "—";
                const phone = entity?.phone?.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3") ?? "";
                const endEvent = offer?.event_end_date
                  ? new Date(offer.event_end_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
                  : "";

                return (
                  <tr
                    key={r.row_id}
                    onClick={() => handleSelectConsult(r)}
                    className="border-b border-border/60 hover:bg-accent/40 cursor-pointer transition-colors"
                    title="Clique para ver os detalhes completos da visita"
                  >
                    <td className="px-3 py-2.5 w-[75px]">
                      <div className="font-semibold text-foreground">{created.d}</div>
                      <div className="text-[11px] text-muted-foreground">{created.h}</div>
                    </td>
                    <td className="px-3 py-2.5 w-[140px]">
                      <div className="font-semibold text-[#d946ef] truncate" title={entity?.name?? undefined}>
                        {entity?.name || "—"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">{doc}</div>
                      <div className="text-[11px] text-muted-foreground">{phone || "—"}</div>
                    </td>
                    <td className="px-3 py-2.5 w-[140px]">
                      <div className="font-semibold text-foreground">{productName}</div>
                      <div className="text-[10px] text-muted-foreground font-medium uppercase mt-0.5">
                        ORIGEM: {r.utm_source ? r.utm_source : "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 max-w-[190px] sm:max-w-[220px]">
                      <div className="font-semibold text-foreground truncate" title={offer?.offer_description ?? undefined}>
                        {offer?.offer_description || "—"}
                      </div>
                      <div className="text-[10px] text-muted-foreground font-medium mt-0.5">
                        {BRL(offer?.offer_value)} {endEvent ? `(Fim: ${endEvent})` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 w-[150px]">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(statusName)}`}
                      >
                        {statusName}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 w-[130px]">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="flex h-9 w-9 items-center justify-center rounded-md bg-transparent overflow-hidden shrink-0"
                          title={r.partners?.name}
                        >
                          {r.partners?.logo_url ? (
                            <img
                              src={r.partners.logo_url}
                              className="h-full w-full object-cover"
                              alt={r.partners.name}
                            />
                          ) : (
                            <span className="flex items-center justify-center h-full w-full text-[10px] font-bold uppercase">
                              {r.partners?.name?.slice(0, 3) || "—"}
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-medium text-foreground truncate" title={r.partners?.name}>
                          {r.partners?.name || "—"}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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

      <Sheet open={!!activeConsult} onOpenChange={(open) => !open && setActiveConsult(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0 flex flex-col h-full bg-white">
          {activeConsult &&
            (() => {
              const sim = activeConsult;
              const entity = sim.visit_entities || {};
              const offer = sim.visit_offers || {};
              const statusName = getVisitStatus(sim);
              const ed = entity?.entity_details || {};

              // O Root Payload (da primeira navegação) detém as configurações imutáveis do layout.
              const rootPayload =
                typeof sim.raw_payload === "string"
                  ? (() => {
                      try {
                        return JSON.parse(sim.raw_payload);
                      } catch {
                        return {};
                      }
                    })()
                  : sim.raw_payload || {};

              const pageConfigs = rootPayload.page_configs || null;
              const pageFaqs = safeArray(rootPayload.page_faqs);
              const rawConfigs = rootPayload?.consent_configs;
              const extractedConsentConfigs = Array.isArray(rawConfigs) ? rawConfigs : [];

              return (
                <div className="flex flex-col h-full overflow-hidden">
                  <div className="p-4 sm:p-6 pb-4 border-b bg-white shrink-0">
                    <SheetHeader className="space-y-3 text-left">
                      <div className="space-y-1 pr-8 text-left w-full">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">
                            {sim.product_types?.name || "Consulta / Visita"}
                          </span>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${statusClass(statusName)}`}
                          >
                            {statusName}
                          </span>
                        </div>
                        <SheetTitle className="text-lg sm:text-xl font-bold text-slate-900 break-words text-left w-full">
                          {entity?.name || "Lead sem nome"}
                        </SheetTitle>
                      </div>
                    </SheetHeader>
                  </div>

                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    <PanelVisit visitData={sim} />
                    <PanelEntity entity={entity} entityDetails={ed} />

                    {Object.keys(offer).length > 0 && <PanelOffer offer={offer} />}
                    {Object.keys(offer).length > 0 && <PanelSeller offer={offer} />}

                    {safeArray(sim.visit_consents).length > 0 && (
                      <PanelAcceptedConsents consents={sim.visit_consents} />
                    )}

                    {pageConfigs && <PanelProduct config={pageConfigs} />}

                    {extractedConsentConfigs.length > 0 && <PanelConsents configs={extractedConsentConfigs} />}

                    {pageFaqs.length > 0 && <PanelFAQ faqs={pageFaqs} isPrint={false} />}
                    {!!pageConfigs?.footer && <PanelFooter footer={pageConfigs.footer as any} />}
                  </div>

                  <div className="p-4 bg-white border-t border-gray-200 flex items-center justify-between gap-3 shrink-0 shadow-lg">
                    <Button
                      variant="outline"
                      onClick={handlePrintSheet}
                      className="flex-1 rounded-xl text-xs gap-2 border-[#B300FF]/35 text-[#B300FF] hover:bg-[#B300FF]/5 h-10 font-semibold"
                    >
                      <Printer className="h-4 w-4" /> Imprimir / PDF
                    </Button>
                    <Button
                      onClick={() => setActiveConsult(null)}
                      className="flex-1 rounded-xl text-xs bg-[#B300FF] hover:bg-[#9f00e6] text-white h-10 font-semibold"
                    >
                      Fechar
                    </Button>
                  </div>
                </div>
              );
            })()}
        </SheetContent>
      </Sheet>

      <div style={{ display: "none" }}>
        <div ref={printRef} className="w-full text-slate-900 bg-white p-8">
          {activeConsult &&
            (() => {
              const sim = activeConsult;
              const created = formatDate(sim.created_at);
              const entity = sim.visit_entities || {};
              const offer = sim.visit_offers || {};
              const statusName = getVisitStatus(sim);
              const ed = entity?.entity_details || {};

              const rootPayload =
                typeof sim.raw_payload === "string"
                  ? (() => {
                      try {
                        return JSON.parse(sim.raw_payload);
                      } catch {
                        return {};
                      }
                    })()
                  : sim.raw_payload || {};
              const pageConfigs = rootPayload.page_configs || null;
              const pageFaqs = safeArray(rootPayload.page_faqs);
              const rawConfigs = rootPayload?.consent_configs;
              const extractedConsentConfigs = Array.isArray(rawConfigs) ? rawConfigs : [];

              return (
                <div className="space-y-6">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-bold text-[#B300FF] uppercase">
                          {sim.product_types?.name || "Consulta / Visita"}
                        </span>
                        <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full border bg-slate-50 uppercase`}>
                          {statusName}
                        </span>
                      </div>
                      <h1 className="text-2xl font-bold">{entity?.name || "Lead sem nome"}</h1>
                    </div>
                    <div className="text-right text-xs text-slate-500 font-mono">
                      Data: {created.d} às {created.h}
                    </div>
                  </div>

                  <PanelVisit visitData={sim} />
                  <PanelEntity entity={entity} entityDetails={ed} />

                  <PanelOffer offer={offer} />
                  <PanelSeller offer={offer} />
                  <PanelAcceptedConsents consents={safeArray(sim.visit_consents)} />

                  {pageConfigs && Object.keys(pageConfigs).length > 0 && <PanelProduct config={pageConfigs} />}
                  {extractedConsentConfigs.length > 0 && <PanelConsents configs={extractedConsentConfigs} />}
                  {pageFaqs.length > 0 && <PanelFAQ faqs={pageFaqs} isPrint={false} />}
                  {!!pageConfigs?.footer && <PanelFooter footer={pageConfigs.footer as any} />}
                </div>
              );
            })()}
        </div>
      </div>
    </div>
  );
}
