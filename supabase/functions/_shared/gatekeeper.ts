/**
 * @fileoverview Middleware de Autorização (Gatekeeper)
 * @path supabase/functions/_shared/gatekeeper.ts
 *
 * =========================================================================
 * GATEKEEPER DE SEGURANÇA (Zero-Trust Authorization & DDD)
 * =========================================================================
 * Centraliza a validação de acesso a recursos e a comunicação Upstream.
 * Funções 100% autônomas: recebem o payload e resolvem suas próprias queries.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { debugLog } from "./logger.ts";

// =========================================================================
// 1. GATEKEEPER DE JORNADA: VISITA + OFERTA
// =========================================================================

/**
 * @function validateVisitAndOfferIntegrity
 * @description Funde a Validação Triangular de Visita e o Gatekeeper Upstream.
 *              1. Busca o token 1 única vez (pega user_id e sbx_access_token).
 *              2. Valida IDOR da Visita e Vínculo da Oferta (se houver).
 *              3. Bate na API da Superbid e retorna a Oferta formatada.
 * 
 * @param {SupabaseClient} supabase - Cliente do Supabase com Service Role.
 * @param {Object} auth - Objeto contendo { session_token }.
 * @param {string | null} visitId - ID da visita alvo. Nulo se for criação.
 * @param {Object} payload - Objeto com entity_id e offer_id.
 * @returns {Promise<any>} - Retorna o objeto hidratado da oferta ou null.
 */
export async function validateVisitAndOfferIntegrity(
  supabase: SupabaseClient,
  auth: { session_token: string },
  visitId: string | null | undefined,
  payload: { entity_id?: string | null; offer_id?: string | null }
): Promise<any> {
  const targetEntityId = payload.entity_id;
  const targetOfferId = payload.offer_id;

  // 1. Busca Unificada de Sessão (User ID + Token Upstream)
  const now = new Date().toISOString();
  const { data: session, error: sessError } = await supabase
    .from('session_tokens')
    .select('user_id, sbx_access_token, environment')
    .eq('session_token', auth.session_token)
    .gt('expires_at', now)
    .single();

  if (sessError || !session?.user_id) throw new Error("UNAUTHORIZED");
  const sessionUserId = session.user_id;

  // 2. Validação da Visita e Vínculo com a Oferta (Ownership/IDOR)
  if (visitId) {
    debugLog(`[Gatekeeper] Validando Visita (${visitId}) e Vínculos no DB...`);
    
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('id, visit_entities(entity_id), visit_offers(offer_id)')
      .eq('id', visitId)
      .single();

    if (visitError || !visit) throw new Error("VISIT_NOT_FOUND");
    const dbEntityId = visit.visit_entities?.[0]?.entity_id;

    // A. Token vs Banco (IDOR Protection)
    if (String(dbEntityId) !== String(sessionUserId)) {
      debugLog(`[Security] FRAUDE: Token(${sessionUserId}) tentou alterar DB(${dbEntityId})`);
      throw new Error("FORBIDDEN_ACCESS");
    }

    // B. Payload vs Banco (Identidade)
    if (targetEntityId && String(dbEntityId) !== String(targetEntityId)) {
      debugLog(`[Security] DIVERGÊNCIA: Entidade solicitada (${targetEntityId}) vs DB(${dbEntityId})`);
      throw new Error("INVALID_RELATIONSHIP: Divergência de identidade na solicitação.");
    }

    // C. Payload vs Banco (Vínculo da Oferta)
    if (targetOfferId) {
      const isOfferLinked = visit.visit_offers?.some((o: any) => String(o.offer_id) === String(targetOfferId));
      if (!isOfferLinked) {
        debugLog(`[Security] FRAUDE: Oferta ${targetOfferId} não pertence à Visita ${visitId}.`);
        throw new Error("INVALID_RELATIONSHIP: Oferta não pertence a esta visita.");
      }
    }
  } else {
    // Cenário CREATE: Valida se o usuário não está forjando entidade de outro
    debugLog(`[Gatekeeper] Fluxo CREATE. Validando Sessão vs Entidade Solicitada.`);
    if (targetEntityId && String(sessionUserId) !== String(targetEntityId)) {
      debugLog(`[Security] FRAUDE: Token(${sessionUserId}) tentou forjar visita para Entity(${targetEntityId})`);
      throw new Error("FORBIDDEN_ACCESS");
    }
  }

  // 3. Validação Upstream da Oferta (Superbid)
  if (!targetOfferId) {
    debugLog(`[Gatekeeper] Nenhuma oferta fornecida. Pulando Upstream.`);
    return null;
  }

  if (!session.sbx_access_token) {
    throw new Error("SESSION_EXPIRED: Token SBX inválido ou ausente.");
  }

  const env = session.environment || "staging";
  const offerBaseUrl = env === "production" 
    ? "https://offer-query.superbid.net" 
    : "https://offer-query.stage.superbid.net";

  const cleanOfferId = String(targetOfferId).replace(/[^0-9]/g, '');
  const params = new URLSearchParams({
    portalId: "[2,15]",
    locale: "pt_BR",
    timeZoneId: "America/Sao_Paulo",
    searchType: "opened",
    filter: `id:[${cleanOfferId}]`,
    pageNumber: "1",
    pageSize: "15",
    orderBy: "price:desc",
    requestOrigin: "marketplace",
    preOrderBy: "orderByFirstOpenedOffersAndSecondHasPhoto"
  });

  const apiUrl = `${offerBaseUrl}/offers/?${params.toString()}`;

  const response = await fetch(apiUrl, {
    method: "GET",
    headers: { 
      "Authorization": `Bearer ${session.sbx_access_token}`, 
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Origin": "https://www.superbid.net",
      "Referer": "https://www.superbid.net/"
    }
  });

  const apiData = await response.json(); 
  
  if (!response.ok) {
    debugLog(`[SUPERBID_REJECT] Env: ${env} | Status: ${response.status} | Detalhe: ${JSON.stringify(apiData)}`);
    throw new Error("UPSTREAM_CONNECTION_ERROR");
  }

  const offer = apiData.offers?.[0];
  if (!offer) {
    debugLog(`[Gatekeeper] Lote ${cleanOfferId} não retornado pela API.`);
    throw new Error("OFFER_NOT_FOUND: API retornou vazio.");
  }

  // O Objeto Contract Exato
  const offerResult = {
    offer: {
      offer_id: String(offer.id),
      lot_number: offer.lotNumber || 1,
      offer_description: offer.product?.shortDesc || offer.offerDescription?.offerDescription || "",
      offer_detailed_description: offer.offerDescription?.offerDescription || "",
      offer_value: offer.price || 0,
      category_id: offer.product?.productType?.id || 0,
      category: offer.product?.productType?.description || "",
      offer_status: offer.offerStatus || "",
      sale_status: offer.saleStatus || "",
      end_date: offer.endDate || "",
      photos: (Array.isArray(offer.product?.galleryJson) ? offer.product.galleryJson : []).map((p: any) => ({
        highlight: p.highlight || false,
        link: p.link,
        thumbnail: p.thumbnailUrl,
        file_name: p.originalFileName,
        type: p.type,
        content_type: p.contentType || "image/jpeg"
      }))
    },
    manager: {
      manager_id: offer.manager?.id || 0,
      manager_name: offer.manager?.name || ""
    },
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
      economic_group: offer.seller?.company?.[0]?.fantasyName || "N/A"
    }
  };

  debugLog(`[Gatekeeper] Sucesso. Lote ${cleanOfferId} hidratado. Status: ${offer.offerStatus}`);
  return offerResult;
}

// =========================================================================
// 2. GATEKEEPER DE SIMULAÇÃO (CROSS-TAMPERING)
// =========================================================================

/**
 * @function validateSimulationIntegrity
 * @description Gatekeeper Financeiro (Autônomo). 
 *              Garante que a simulação manipulada no payload pertence à jornada.
 *              - Cenário A (Simulação Nova): Cruza payload contra a Visita (visits).
 *              - Cenário B (Reuso): Cruza payload contra a Simulação (simulations_offers).
 * 
 * @param {SupabaseClient} supabase - Cliente do Supabase (Service Role).
 * @param {string} visitId - ID obrigatório da visita atual.
 * @param {Object} payload - Objeto com { simulation_id, entity_id, offer_id }.
 * @throws {Error} - Lança INVALID_RELATIONSHIP ou INVALID_PAYLOAD em caso de fraude.
 */
export async function validateSimulationIntegrity(
  supabase: SupabaseClient,
  visitId: string,
  payload: { simulation_id?: string | null; entity_id?: string | null; offer_id?: string | null }
): Promise<void> {
  const { simulation_id, entity_id, offer_id } = payload;

  // =====================================================================
  // CENÁRIO A: CRIAÇÃO DE NOVA SIMULAÇÃO (simulation_id está vazio)
  // =====================================================================
  if (!simulation_id) {
    debugLog(`[Gatekeeper] Simulação Nova. Validando aderência do payload à Visita.`);
    
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('visit_entities(entity_id), visit_offers(offer_id)')
      .eq('id', visitId)
      .single();

    if (visitError || !visit) throw new Error("VISIT_NOT_FOUND");

    const dbEntityId = visit.visit_entities?.[0]?.entity_id;
    if (entity_id && String(dbEntityId) !== String(entity_id)) {
      debugLog(`[Security] Entidade do payload (${entity_id}) diverge da visita (${dbEntityId})`);
      throw new Error("INVALID_RELATIONSHIP: Divergência de identidade para a simulação.");
    }
    
    if (offer_id) {
      const isOfferLinked = visit.visit_offers?.some((o: any) => String(o.offer_id) === String(offer_id));
      if (!isOfferLinked) {
        debugLog(`[Security] Oferta (${offer_id}) injetada não pertence à Visita.`);
        throw new Error("INVALID_RELATIONSHIP: Oferta solicitada não pertence a esta visita.");
      }
    }
    return; // Sucesso na criação!
  }

  // =====================================================================
  // CENÁRIO B: REUSO DE SIMULAÇÃO (Triangula Payload vs Visita vs Simulação)
  // =====================================================================
  debugLog(`[Gatekeeper] Simulação Existente. Validando Cross-Tampering.`);

  const { data: sim, error: simError } = await supabase
    .from('simulations')
    .select('id, visit_id, entity_id, simulation_offers(offer_id)')
    .eq('id', simulation_id)
    .eq('visit_id', visitId) // Filtra direto no banco para garantir a Visita
    .single();

  if (simError || !sim) {
    debugLog(`[Security] Simulação ${simulation_id} não pertence à Visita ${visitId}`);
    throw new Error("INVALID_RELATIONSHIP: Você não tem permissão para acessar esta simulação.");
  }

  if (entity_id && String(sim.entity_id) !== String(entity_id)) {
    debugLog(`[Security] CROSS-TAMPERING: Simulação é da Entidade ${sim.entity_id}, payload enviou ${entity_id}`);
    throw new Error("INVALID_RELATIONSHIP: Inconsistência de identidade na Simulação.");
  }

  if (offer_id) {
    const isOfferLinked = sim.simulation_offers?.some((so: any) => String(so.offer_id) === String(offer_id));
    if (!isOfferLinked) {
      debugLog(`[Security] CROSS-TAMPERING: Simulação não possui vínculo com a oferta (${offer_id})`);
      throw new Error("INVALID_RELATIONSHIP: Inconsistência grave entre Simulação e Oferta.");
    }
  }
}

