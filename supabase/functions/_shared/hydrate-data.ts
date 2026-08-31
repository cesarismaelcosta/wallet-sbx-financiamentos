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
 * 2. Eager Fetching (I/O Paralelo): Esconde a latência do banco de dados disparando
 *    consultas à API externa em background sempre que a oferta é conhecida antecipadamente.
 * 3. Edge Caching (Módulo): Protege o upstream contra Thundering Herd durante rajadas de cliques.
 * 4. Sanitização Rigorosa: `pickThin` limpa chaves indesejadas antes do processamento.
 *
 * [FLUXO DE RESOLUÇÃO DA OFERTA (v3.5.1 - Eager Architecture & DB Cache)]:
 * 1. Caminho A - Paralelismo (Fast-Lane): Se o `offer_id` vem no Payload (ex: Handoff),
 *    a requisição Superbid é disparada IMEDIATAMENTE (sem await) enquanto o Supabase
 *    valida a segurança. O tempo total cai para a duração da query mais lenta.
 * 2. Caminho B - Cascata (Fallback): Se não houver payload, o sistema aguarda o
 *    Supabase descobrir o `offer_id` via cursor da URL para só então chamar a Superbid.
 * 3. Jornadas Estéreis: Sem `offer_id`, assume jornada sem oferta (ex: Dashboard)
 *    e retorna contexto estéril, guiado pela `target_url`, sem I/O de rede.
 * 4. ✨ Smart DB Caching: Lê os dados salvos nativamente pelo `persist-data.ts`. 
 *    Se a oferta foi atualizada há menos de 5 minutos (cálculo nativo do DB), 
 *    pula o fetch na Superbid.
 *
 * @author Cesar Ismael Pereira da Costa
 * @version 3.5.1
 */

import { debugLog } from "./logger.ts";
import { Vehicle } from "./types.ts";

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
  price_formatted: string;
  system_metric: any;
  category_id: number;
  category: string;
  subcategory_id: string | number | null;
  subcategory: string;
  offer_status_available: boolean;
  offer_status_sold: boolean;
  end_date: string;
  is_shopping: boolean;
  offer_type_id: number | null;
  location: {
    neighborhood: string;
    city: string;
    state: string;
    country: string;
  };
  // AQUI VOCÊ FAZ A LIGAÇÃO COM O SEU TYPES.TS:
  vehicle_details?: Vehicle;
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
    modality_id: number | null;
    modality_desc: string;
    status_id: number | null;
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

// TTL de 5 min focado em proteção contra duplo clique (Double Submission) e Rajadas (Bursts)
const OFFER_TTL_MS = 5 * 60 * 1000;
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
 * Sanitiza datas vindas do banco ou payloads externos, forçando o padrão ISO YYYY-MM-DD
 * Protege contra instâncias Date convertidas para String (ex: "Tue Jul 02 1974...")
 */
function sanitizeDateISO(dateInput: any): string | null {
  if (!dateInput) return null;
  try {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return String(dateInput); // Retorna original se for inconvertível
    return d.toISOString().split("T")[0]; // Pega apenas a parte YYYY-MM-DD
  } catch {
    return String(dateInput);
  }
}

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

  // ✨ Variáveis para armazenar o cache nativo do persist-data.ts
  let dbOfferDetails: TrustedOffer | null = null;
  let dbEventDetails: TrustedOfferBundle["event"] | null = null;
  let dbManagerDetails: TrustedOfferBundle["manager"] | null = null;
  let dbSellerDetails: TrustedOfferBundle["seller"] | null = null;
  let dbCacheAgeMs: number = Infinity; // A idade calculada pelo próprio Postgres

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
      birth_date: sanitizeDateISO(trustedS2SEntity.birth_date),
      gender: trustedS2SEntity.gender ?? null,
      entity_details: (trustedS2SEntity.metadata ? trustedS2SEntity : {}) as Record<string, unknown>,
    };
  } else {
    // 🛡️ REQUISIÇÃO DO CLIENTE: Validamos no Banco de Dados
    if (!visitId || !visitUpdateId || !userId) {
      debugLog("🚨 [Hydrate] IDs insuficientes. Abortando leitura.");
      throw new Error("PROFILE_UNAVAILABLE");
    }

    // ✨ QUERY MODIFICADA: Delega a conta de tempo (Math) para o motor do Postgres
    const [row] = await sql`
      SELECT
        v.id                AS visit_id,
        u.id                AS update_id,
        u.product_id,
        o.offer_id,         /* 👈 Puxa o ID da oferta gravado no banco */
        o.offer_details,    /* 👈 Cache JSONB (persist-data.ts) */
        o.event_details,    /* 👈 Cache JSONB (persist-data.ts) */
        o.manager_details,  /* 👈 Cache JSONB (persist-data.ts) */
        o.seller_details,   /* 👈 Cache JSONB (persist-data.ts) */
        
        /* 👈 O Postgres subtrai a data atual dele mesmo, eliminando erro de fuso horário */
        EXTRACT(EPOCH FROM (NOW() - COALESCE(o.updated_at, o.created_at))) * 1000 AS cache_age_ms,
        
        v.utm_source,
        v.utm_medium,
        v.utm_campaign,
        v.origin_url,
        v.target_url,
        e.entity_id, e.entity_type, e.name, e.document, e.phone,
        e.email, e.birth_date, e.gender, e.entity_details
      FROM visits v
      LEFT JOIN visit_updates u ON u.visit_id = v.id AND u.id = ${visitUpdateId} 
      LEFT JOIN visit_offers o ON o.visit_update_id = u.id 
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
      birth_date: sanitizeDateISO(row.birth_date),
      gender: row.gender ?? null,
      entity_details: (row.entity_details ?? {}) as Record<string, unknown>,
    };

    // ✨ Atribuição segura ao escopo superior
    dbProductId = row.product_id ?? null;
    dbOfferId = row.offer_id ?? null;
    dbOfferDetails = row.offer_details ?? null;
    dbEventDetails = row.event_details ?? null;
    dbManagerDetails = row.manager_details ?? null;
    dbSellerDetails = row.seller_details ?? null;
    dbCacheAgeMs = Number(row.cache_age_ms) || Infinity;

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
  let source: HydratedContext["source"] = offerId ? "payload_offer_id" : dbOfferId ? "db_last_offer" : null;

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
  // 3. AVALIAÇÃO DO CACHE DO BANCO DE DADOS (Smart DB Caching)
  // =====================================================================
  const isTargetingCachedOffer = resolvedOfferId === String(dbOfferId);
  const isDbCacheFresh = dbCacheAgeMs < OFFER_TTL_MS;

  // ✨ Pulo do Gato: Se o JSON está no banco e tem menos de 5 min (calculado pelo DB), retorna e encerra.
  if (isTargetingCachedOffer && isDbCacheFresh && dbOfferDetails) {
    debugLog(`⚡ [Hydrate] DB HIT. Oferta ${resolvedOfferId} recuperada do Postgres (Idade: ${Math.floor(dbCacheAgeMs/1000)}s)`);
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
      trustedOffer: dbOfferDetails,
      trustedManager: dbManagerDetails,
      trustedEvent: dbEventDetails,
      trustedSeller: dbSellerDetails,
      resolvedOfferId,
      source,
      mode: "full",
    };
  }

  // =====================================================================
  // 4. UPSTREAM FETCH OBRIGATÓRIO (S2S)
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
    const baseUrl =
      environment === "production" ? "https://offer-query.superbid.net" : "https://offer-query.stage.superbid.net";

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

    // -----------------------------------------------------------------------
    // STEP 2.1: BUSCA COMPLEMENTAR DE EVENTO / LEILÃO NA OFFER
    // -----------------------------------------------------------------------
    const eventData = offer.auction || {};

    // -----------------------------------------------------------------------
    // STEP 2.2: EXTRAÇÃO DE METADADOS DE VEÍCULO (Se aplicável)
    // -----------------------------------------------------------------------
    const productTypeId = offer.product?.productType?.id;
    const isVehicleCategory = [10, 11].includes(productTypeId);
    let vehicleData: Vehicle | undefined;

    if (isVehicleCategory) {
      const groups = offer.product?.template?.groups || [];
      const getGroupProp = (groupId: string, propId: string) =>
        groups.find((g: any) => g.id === groupId)?.properties.find((p: any) => p.id === propId)?.value;

      vehicleData = {
        manufacture_year: Number(getGroupProp("identificacao", "anofabricacao")) || 0,
        model_year: Number(getGroupProp("identificacao", "anomodelo")) || 0,
        fipe_code: getGroupProp("financiamento", "codigofipe") || "",
      };
    }

    // =========================================================================
    // FASE 3: MONTAGEM DO CONTRATO
    // =========================================================================
    const bundle: TrustedOfferBundle = {
      offer: {
        offer_id: String(offer.id),
        lot_number: offer.lotNumber || 1,
        offer_description: offer.product?.shortDesc || offer.offerDescription?.offerDescription || "",
        offer_detailed_description: offer.offerDescription?.offerDescription || "",
        offer_value: offer.price || offer.offerDetail?.referenceValue || 0,
        price_formatted: offer.priceFormatted || offer.offerDetail?.referenceValueFormatted || "",
        system_metric: offer.systemMetric || null,
        category_id: offer.product?.productType?.id || 0,
        category: offer.product?.productType?.description || "",
        subcategory_id: offer.product?.subCategory?.id || "",
        subcategory: offer.product?.subCategory?.description || "",
        offer_status_available: Boolean(offer.offerStatus?.available),
        offer_status_sold: Boolean(offer.offerStatus?.sold),
        end_date: offer.endDate || "",
        is_shopping: offer.isShopping || false,
        offer_type_id: offer.offerTypeId ?? null,
        location: {
          neighborhood: offer.product?.location?.neighborhood || "Não informado",
          city: offer.product?.location?.city || "Não informado",
          state: offer.product?.location?.state || "Não informado",
          country: offer.product?.location?.country || "Brasil",
        },
        ...(vehicleData && { vehicle_details: vehicleData }),
        winner_id: offer.winner?.id ? String(offer.winner.id) : null,
        buyer_id: offer.buyer?.id ? String(offer.buyer.id) : null,
        photos: (Array.isArray(offer.product?.galleryJson) ? offer.product.galleryJson : []).map((p: any) => ({
          highlight: p.highlight || false,
          link: p.link,
          thumbnail: p.thumbnailUrl,
          file_name: p.originalFileName,
          type: p.type || "photo",
          content_type: p.contentType || "image/jpeg",
        })),
      },
      manager: {
        manager_id: offer.manager?.id || 0,
        manager_name: offer.manager?.name || "N/A",
      },
      event: {
        event_id: String(eventData.id || ""),
        event_description: eventData.desc || "",
        event_start_date: eventData.beginDate || "",
        event_end_date: eventData.endDate || "",
        modality_id: eventData.modalityId ?? null,
        modality_desc: eventData.modalityDesc || "",
        status_id: eventData.statusId ?? null,
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
 *
 * CONTRATO ÚNICO (espelhado por THIN_KEYS em
 * src/features/financial-hub/core/services/gateway.ts):
 * - Cursores / intenção / escolhas do usuário: aceitos do cliente.
 * - Contexto de negócio (entity_id, offer/seller/event/category): NUNCA aceito
 *   do cliente. É sempre derivado de ctx.trusted* em hydrateVisitContext().
 * Qualquer chave fora desta allowlist é descartada silenciosamente.
 */
export function pickThin(raw: any): Record<string, any> {
  const allowed = [
    "visit_id",
    "visit_update_id",
    "origin_visit_update_id", // cursor de encadeamento de visita (não é dado de negócio)
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