/**
 * @fileoverview Motor de Hidratação de Jornadas (Hydration Engine)
 * @path supabase/functions/_shared/hydrate-data.ts
 *
 * =========================================================================
 * ARQUITETURA DE DADOS: ZERO-TRUST E RECUPERAÇÃO DE CONTEXTO
 * =========================================================================
 * Módulo de leitura S2S (Server-to-Server). É o gêmeo de leitura do `persist-data.ts`.
 * Reconstrói o contexto da visita combinando dados locais (Postgres) e externos (Superbid).
 *
 * [CARACTERÍSTICAS PRINCIPAIS]:
 * 1. Prevenção de IDOR: O JWT da sessão atual deve bater com o `entity_id` da visita salva.
 * 2. Edge Caching (Módulo): Protege o upstream contra Thundering Herd durante rajadas de cliques.
 * 3. Sanitização Rigorosa: `pickThin` limpa chaves indesejadas antes do processamento.
 *
 * [FLUXO DE RESOLUÇÃO DA OFERTA (v3.3.0)]:
 * 1. Prioridade Payload (POST): Usa o `offer_id` que vem explícito na requisição (ex: Handoff).
 * 2. Prioridade Cursor (GET): Se não houver payload, busca o último `offer_id` salvo na 
 *    tabela `visit_offers` usando o cursor da URL (`visit_update_id`).
 * 3. Jornadas Estéreis: Se nenhum ID for encontrado, assume jornada sem oferta 
 *    (ex: Dashboard/Seguros) e retorna contexto estéril, guiado pela `target_url`.
 *
 * @author Cesar Ismael Pereira da Costa
 * @version 3.3.0
 */

import { debugLog } from "./logger.ts";

// =========================================================================
// [1] CONTRATOS DE DADOS CONFIÁVEIS (TRUSTED TYPES)
// =========================================================================

export interface TrustedEntity {
  entity_id: string;
  entity_type: string;
  name: string;
  document: string;
  phone: string;
  email: string;
  birth_date: string | null;
  gender: string | null;
  entity_details: Record<string, unknown>;
}

export interface TrustedOffer {
  offer_id: string;
  lot_number: number;
  offer_description: string;
  offer_detailed_description: string;
  offer_value: number;
  category_id: number;
  /** Subcategoria da Superbid (product.subProductType). Dirige regra/produto. */
  subcategory_id: number | null;
  category: string;
  offer_status_available: boolean;
  offer_status_sold: boolean;
  end_date: string;
  winner_id: string | null;
  buyer_id: string | null;
  photos: Array<Record<string, unknown>>;
}

export interface TrustedOfferBundle {
  offer: TrustedOffer;
  manager: { manager_id: number; manager_name: string };
  event: {
    event_id: string;
    event_description: string;
    event_start_date: string;
    event_end_date: string;
    event_short_description: string;
  };
  seller: { seller_id: string; legal_name: string; trade_name: string; economic_group: string };
}

/** Modo de hidratação: "light" evita qualquer I/O externo (Fast Path de navegação). */
export type HydrationMode = "light" | "full";

export interface HydratedContext {
  visitExists: true;
  visitUpdateId: string;
  productId: number | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  originUrl: string | null;
  targetUrl: string | null;
  trustedEntity: TrustedEntity;
  trustedOffer: TrustedOffer | null;
  trustedManager: TrustedOfferBundle["manager"] | null;
  trustedEvent: TrustedOfferBundle["event"] | null;
  trustedSeller: TrustedOfferBundle["seller"] | null;
  resolvedOfferId: string | null;
  source: "payload_offer_id" | "db_last_offer" | null; 
  mode: HydrationMode;
}

// =========================================================================
// [2] EDGE CACHE STATE (IN-MEMORY)
// =========================================================================

// TTL de 60s focado em proteção contra duplo clique (Double Submission) e Rajadas (Bursts)
const OFFER_TTL_MS = 60_000;
// Timeout do upstream: acima disso preferimos falhar rápido a segurar a borda.
const UPSTREAM_TIMEOUT_MS = 4_000;
// Teto do cache de módulo — evita crescimento indefinido no worker de longa vida.
const MAX_CACHE_SIZE = 500;

// Armazenamos a PROMISE para resolver o "Thundering Herd Problem"
const offerCache = new Map<string, { dataPromise: Promise<TrustedOfferBundle>; expiresAt: number }>();

// =========================================================================
// [3] MOTOR DE HIDRATAÇÃO (ORQUESTRAÇÃO DE LEITURA)
// =========================================================================

/**
 * @description Constrói o contexto da jornada cruzando JWT, Banco de Dados local e API Externa.
 * @throws PROFILE_UNAVAILABLE | FORBIDDEN_ACCESS | OFFER_NOT_AVAILABLE | UPSTREAM_CONNECTION_ERROR
 */
export async function hydrateVisitContext(args: {
  sql: any;
  visitId: string;
  visitUpdateId: string;
  offerId?: string | null;
  userId?: string | null; 
  environment: "staging" | "production";
  mode?: HydrationMode;
  trustedS2SEntity?: any | null; // ✨ INJEÇÃO S2S (Zero-Trust Bypass)
}): Promise<HydratedContext> {
  const { sql, visitId, visitUpdateId, offerId, userId, environment, mode = "full", trustedS2SEntity } = args;

  let trustedEntity: TrustedEntity;
  let dbProductId: number | null = null;
  let dbOfferId: string | null = null;
  let dbUtmSource: string | null = null;
  let dbUtmMedium: string | null = null;
  let dbUtmCampaign: string | null = null;
  let dbOriginUrl: string | null = null;
  let dbTargetUrl: string | null = null;

  // =====================================================================
  // 1. RESOLUÇÃO DE IDENTIDADE (Banco vs S2S Bypass)
  // =====================================================================
  if (trustedS2SEntity) {
    // ✨ BYPASS S2S: O Backend mastigou e assinou. Confiamos cegamente e evitamos I/O.
    trustedEntity = {
      entity_id: String(trustedS2SEntity.entity_id),
      entity_type: trustedS2SEntity.entity_type ?? "F",
      name: trustedS2SEntity.name ?? "",
      document: trustedS2SEntity.document ?? "",
      phone: trustedS2SEntity.phone ?? "",
      email: trustedS2SEntity.email ?? "",
      birth_date: trustedS2SEntity.birth_date ? String(trustedS2SEntity.birth_date) : null,
      gender: trustedS2SEntity.gender ?? null,
      entity_details: (trustedS2SEntity.metadata ? trustedS2SEntity : {}) as Record<string, unknown>,
    };
  } else {
    // 🛡️ REQUISIÇÃO DO CLIENTE: Validamos no Banco de Dados
    if (!visitId || !visitUpdateId || !userId) {
      debugLog("🚨 [Hydrate] IDs insuficientes. Abortando leitura.");
      throw new Error("PROFILE_UNAVAILABLE");
    }

    const [row] = await sql`
      SELECT
        v.id                AS visit_id,
        u.id                AS update_id,
        u.product_id,
        o.offer_id,         /* 👈 Puxa o ID da oferta gravado no banco */
        v.utm_source,
        v.utm_medium,
        v.utm_campaign,
        v.origin_url,
        v.target_url,
        e.entity_id, e.entity_type, e.name, e.document, e.phone,
        e.email, e.birth_date, e.gender, e.entity_details
      FROM visits v
      LEFT JOIN visit_updates u ON u.visit_id = v.id AND u.id = ${visitUpdateId} 
      LEFT JOIN visit_offers o ON o.visit_update_id = u.id /* 👈 NOVO JOIN NA TABELA CERTA */
      JOIN visit_entities e ON e.visit_id = v.id
      WHERE v.id = ${visitId}
      LIMIT 1`;

    if (!row) throw new Error("PROFILE_UNAVAILABLE");

    if (String(row.entity_id) !== String(userId)) {
      debugLog(`🚨 [Hydrate][Security] Spoofing. Token(${userId}) tentou ler DB(${row.entity_id})`);
      throw new Error("FORBIDDEN_ACCESS");
    }

    trustedEntity = {
      entity_id: String(row.entity_id),
      entity_type: row.entity_type ?? "PF",
      name: row.name ?? "",
      document: row.document ?? "",
      phone: row.phone ?? "",
      email: row.email ?? "",
      birth_date: row.birth_date ? String(row.birth_date) : null,
      gender: row.gender ?? null,
      entity_details: (row.entity_details ?? {}) as Record<string, unknown>,
    };

    // ✨ Atribuição segura ao escopo superior
    dbProductId = row.product_id ?? null;
    dbOfferId = row.offer_id ?? null;
    dbUtmSource = row.utm_source ?? null;
    dbUtmMedium = row.utm_medium ?? null;
    dbUtmCampaign = row.utm_campaign ?? null;
    dbOriginUrl = row.origin_url ?? null;
    dbTargetUrl = row.target_url ?? null;
  }

  // =====================================================================
  // 2. RESOLUÇÃO DA OFERTA (Limpa & Direta)
  // =====================================================================
  const targetOfferId = offerId || dbOfferId || "";
  let resolvedOfferId = targetOfferId ? String(targetOfferId).replace(/[^0-9]/g, "") : "";
  let source: HydratedContext["source"] = offerId ? "payload_offer_id" : (dbOfferId ? "db_last_offer" : null);

  // ✨ sa targetMode claro.
  const sterile = (targetMode: HydrationMode): HydratedContext => ({
    visitExists: true,
    visitUpdateId,
    productId: dbProductId,
    utmSource: dbUtmSource,
    utmMedium: dbUtmMedium,
    utmCampaign: dbUtmCampaign,
    originUrl: dbOriginUrl,
    targetUrl: dbTargetUrl,
    trustedEntity,
    trustedOffer: null,
    trustedManager: null,
    trustedEvent: null,
    trustedSeller: null,
    resolvedOfferId: resolvedOfferId || null,
    source: resolvedOfferId ? source : null,
    mode: targetMode,
  });

  // Home Estéril / Dashboard / Seguros
  // Se não tem oferta informada, não tenta adivinhar. Retorna contexto limpo.
  if (!resolvedOfferId) return sterile(mode);

  // Fast Path: Nenhuma I/O de rede desnecessária se foi requisitado modo 'light'
  if (mode === "light") {
    debugLog(`⚡ [Hydrate] Modo LIGHT. Oferta ${resolvedOfferId} resolvida sem fetch upstream.`);
    return sterile("light");
  }

  // =====================================================================
  // 3. UPSTREAM FETCH OBRIGATÓRIO (S2S)
  // =====================================================================
  const bundle = await fetchOfferUpstream(resolvedOfferId, environment);

  return {
    visitExists: true,
    visitUpdateId,
    productId: dbProductId,
    utmSource: dbUtmSource,
    utmMedium: dbUtmMedium,
    utmCampaign: dbUtmCampaign,
    originUrl: dbOriginUrl,
    targetUrl: dbTargetUrl,
    trustedEntity,
    trustedOffer: bundle.offer,
    trustedManager: bundle.manager,
    trustedEvent: bundle.event,
    trustedSeller: bundle.seller,
    resolvedOfferId,
    source,
    mode: "full",
  };
}

// =========================================================================
// [4] COMUNICAÇÃO UPSTREAM (SUPERBID API)
// =========================================================================

/**
 * @description Realiza requisição otimizada para o Motor de Ofertas da Superbid.
 */
export async function fetchOfferUpstream(
  offerId: string,
  environment: "staging" | "production",
): Promise<TrustedOfferBundle> {
  const key = `${environment}:${offerId}`;
  const hit = offerCache.get(key);

  if (hit) {
    if (hit.expiresAt > Date.now()) {
      debugLog(`⚡ [Hydrate] Cache HIT (Promise/In-Memory) para Offer: ${key}`);
      return hit.dataPromise;
    }
    offerCache.delete(key);
  }

  const doFetch = async (): Promise<TrustedOfferBundle> => {
    const baseUrl = environment === "production"
      ? "https://offer-query.superbid.net"
      : "https://offer-query.stage.superbid.net";

    const params = new URLSearchParams({
      portalId: "[2,15]",
      locale: "pt_BR",
      timeZoneId: "America/Sao_Paulo",
      searchType: "opened",
      filter: `id:[${offerId}]`,
      pageNumber: "1",
      pageSize: "15",
      orderBy: "price:desc",
      requestOrigin: "marketplace",
      preOrderBy: "orderByFirstOpenedOffersAndSecondHasPhoto",
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${baseUrl}/offers/?${params.toString()}`, {
        method: "GET",
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: "https://www.superbid.net",
          Referer: "https://www.superbid.net/",
        },
      });
    } catch (err: any) {
      const reason = err?.name === "AbortError" ? "TIMEOUT" : "NETWORK";
      debugLog(`🚨 [Hydrate][UPSTREAM_${reason}] Env: ${environment} | Offer: ${offerId}`);
      throw new Error("UPSTREAM_CONNECTION_ERROR");
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      debugLog(`🚨 [Hydrate][UPSTREAM_REJECT] Env: ${environment} | Status: ${response.status}`);
      throw new Error("UPSTREAM_CONNECTION_ERROR");
    }

    const apiData = await response.json().catch(() => ({}));
    const offer = apiData.offers?.[0];

    if (!offer) {
      debugLog(`🚨 [Hydrate] Lote ${offerId} inexistente ou suprimido pela API.`);
      throw new Error("OFFER_NOT_AVAILABLE");
    }

    const bundle: TrustedOfferBundle = {
      offer: {
        offer_id: String(offer.id),
        lot_number: offer.lotNumber || 1,
        offer_description: offer.product?.shortDesc || offer.offerDescription?.offerDescription || "",
        offer_detailed_description: offer.offerDescription?.offerDescription || "",
        offer_value: offer.price || 0,
        category_id: offer.product?.productType?.id || 0,
        subcategory_id:
          offer.product?.subProductType?.id ??
          offer.product?.productSubType?.id ??
          offer.product?.subCategoryId ??
          null,
        category: offer.product?.productType?.description || "",
        offer_status_available: Boolean(offer.offerStatus?.available),
        offer_status_sold: Boolean(offer.offerStatus?.sold),
        end_date: offer.endDate || "",
        winner_id: offer.winner?.id ? String(offer.winner.id) : null,
        buyer_id: offer.buyer?.id ? String(offer.buyer.id) : null,
        photos: (Array.isArray(offer.product?.galleryJson) ? offer.product.galleryJson : []).map((p: any) => ({
          highlight: p.highlight || false,
          link: p.link,
          thumbnail: p.thumbnailUrl,
          file_name: p.originalFileName,
          type: p.type,
          content_type: p.contentType || "image/jpeg",
        })),
      },
      manager: { manager_id: offer.manager?.id || 0, manager_name: offer.manager?.name || "" },
      event: {
        event_id: String(offer.auction?.id || ""),
        event_description: `${offer.auction?.desc || ""}`,
        event_start_date: offer.auction?.beginDate || "",
        event_end_date: offer.auction?.endDate || "",
        event_short_description: offer.auction?.desc || "",
      },
      seller: {
        seller_id: String(offer.seller?.id || ""),
        legal_name: offer.seller?.name || "N/A",
        trade_name: offer.seller?.company?.[0]?.fantasyName || "N/A",
        economic_group: offer.seller?.company?.[0]?.fantasyName || "N/A",
      },
    };

    return bundle;
  };

  const fetchPromise = doFetch();

  if (offerCache.size >= MAX_CACHE_SIZE) {
    const oldest = offerCache.keys().next().value;
    if (oldest) offerCache.delete(oldest);
  }

  offerCache.set(key, { dataPromise: fetchPromise, expiresAt: Date.now() + OFFER_TTL_MS });

  fetchPromise.catch(() => {
    const current = offerCache.get(key);
    if (current?.dataPromise === fetchPromise) offerCache.delete(key);
  });

  return fetchPromise;
}

// =========================================================================
// [5] UTILS (SANITIZAÇÃO ZERO-TRUST)
// =========================================================================

/**
 * @description O Leão de Chácara (Thin Payload Enforcer).
 */
export function pickThin(raw: any): Record<string, any> {
  const allowed = [
    "visit_id",
    "visit_update_id",
    "offer_id",
    "action",
    "action_description",
    "simulation_id",
    "simulation_update_id",
    "product_id",
    "partner_id",
    "step",
    "origin_url",
    "target_url",
    "interaction_context",
    "consents",
    "simulation_details", // APENAS inputs do usuário (Prazo e Entrada)
  ];

  const thin: Record<string, any> = {};
  for (const key of allowed) {
    if (raw?.[key] !== undefined) thin[key] = raw[key];
  }
  return thin;
}