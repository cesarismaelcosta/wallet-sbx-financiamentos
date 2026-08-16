/**
 * @fileoverview Middleware de Autorização (Gatekeeper)
 * @path supabase/functions/_shared/gatekeeper.ts
 *
 * =========================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: ZERO-TRUST & CART PRESERVATION
 * =========================================================================
 * Centraliza a validação de acesso a recursos e a integridade de jornada.
 * Opera 100% em memória validando o token Stateless via `verifySessionToken`.
 * 
 * [MUDANÇAS ARQUITETURAIS - DDD: VERIFY vs LINK]:
 * 1. {Link vs Verify}: Introdução do parâmetro `mode`. Permite que o Gatekeeper 
 *    aceite a mutação da jornada (inserção de nova oferta na mesma Visita) sem 
 *    afrouxar as regras de Identity Ownership (IDOR) e Validação Upstream.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 * @version 5.1.0 (Validação Diferenciada: Verify vs Link)
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { debugLog } from "./logger.ts";
import { verifySessionToken } from "./jwt.ts";

// =========================================================================
// 1. GATEKEEPER DE JORNADA: VISITA + OFERTA
// =========================================================================

export async function validateVisitAndOfferIntegrity(
  supabase: SupabaseClient,
  auth: { session_token: string },
  visitId: string | null | undefined,
  payload: { entity_id?: string | null; offer_id?: string | null },
  /**
   * "verify" (default): a oferta DEVE já estar vinculada à visita (GET, simulação).
   * "link": este POST criará o vínculo. Validação upstream (Superbid) e Ownership continuam.
   */
  mode: "verify" | "link" = "verify"
): Promise<any> {
  const targetEntityId = payload.entity_id;
  const targetOfferId = payload.offer_id;

  // =====================================================================
  // FASE 1: VALIDAÇÃO STATELSS DA SESSÃO EM MEMÓRIA
  // =====================================================================
  if (!auth?.session_token) {
    throw new Error("UNAUTHORIZED: Token de sessão ausente.");
  }

  const validationResult = await verifySessionToken(auth.session_token);
  if (!validationResult.valid || !validationResult.data) {
    debugLog(`[Gatekeeper Auth Fail]: ${validationResult.errorMessage}`);
    throw new Error("SESSION_EXPIRED: Token de sessão inválido ou expirado.");
  }

  const sessionUserId = validationResult.data.userId;
  const env = validationResult.environment || "production";

  if (!sessionUserId) {
    throw new Error("UNAUTHORIZED: ID do usuário não localizado no token.");
  }

  // =====================================================================
  // FASE 2: VALIDAÇÃO DA VISITA E VÍNCULO COM A OFERTA (Ownership/IDOR)
  // =====================================================================
  if (visitId) {
    debugLog(`[Gatekeeper] Validando Visita (${visitId}) e Vínculos no DB (Mode: ${mode})...`);
    
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
    if (targetOfferId && mode === "verify") {
      const isOfferLinked = visit.visit_offers?.some((o: any) => String(o.offer_id) === String(targetOfferId));
      if (!isOfferLinked) {
        debugLog(`[Security] FRAUDE: Oferta ${targetOfferId} não pertence à Visita ${visitId}.`);
        throw new Error("INVALID_RELATIONSHIP: Oferta não pertence a esta visita.");
      }
    } else if (targetOfferId) {
      debugLog(`[Gatekeeper] mode=link: Vínculo de oferta permitido para criação. Upstream prosseguirá.`);
    }
  } else {
    // Cenário CREATE: Valida se o usuário não está forjando entidade de outro
    debugLog(`[Gatekeeper] Fluxo CREATE. Validando Sessão vs Entidade Solicitada.`);
    if (targetEntityId && String(sessionUserId) !== String(targetEntityId)) {
      debugLog(`[Security] FRAUDE: Token(${sessionUserId}) tentou forjar visita para Entity(${targetEntityId})`);
      throw new Error("FORBIDDEN_ACCESS");
    }
  }

  // =====================================================================
  // FASE 3: VALIDAÇÃO UPSTREAM DA OFERTA (Superbid)
  // =====================================================================
  if (!targetOfferId) {
    debugLog(`[Gatekeeper] Nenhuma oferta fornecida. Pulando Upstream.`);
    return null;
  }

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
 *               Garante que a simulação manipulada no payload pertence à jornada.
 *               - Cenário A (Simulação Nova): Cruza payload contra a Visita (visits).
 *               - Cenário B (Reuso): Cruza payload contra a Simulação (simulations_offers).
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