/**
 * @fileoverview Middleware de Autorização (Gatekeeper)
 * @path supabase/functions/_shared/gatekeeper.ts
 *
 * =========================================================================
 * GATEKEEPER DE SEGURANÇA (Zero-Trust Authorization)
 * =========================================================================
 * Centraliza a validação de acesso a recursos e a comunicação Upstream.
 *
 * [RESPONSABILIDADES]:
 * 1. Validação Triangular: JWT vs Banco de Dados (Visita) vs Payload.
 * 2. IDOR Protection: Impede acesso a recursos de terceiros.
 * 3. Roteamento Dinâmico: Resolve staging/production direto da sessão.
 * 4. WAF Bypass: Utiliza headers origin/referer para a API da Superbid.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
import { debugLog } from "../_shared/logger.ts";


// =========================================================================
// 1. VALIDAÇÃO DE PROPRIEDADE DA VISITA (OWNERSHIP)
// =========================================================================

/**
 * @function validateVisitOwnership
 * @description Realiza a Validação Triangular (Sessão x Visita DB x Payload).
 *              Atua de forma autônoma: se `visitId` for fornecido, valida
 *              contra o banco (Update). Se não, valida a identidade
 *              (`targetEntityId`) contra o token da sessão (Create).
 * 
 * @param {SupabaseClient} supabase - Cliente do Supabase com Service Role.
 * @param {Object} auth - Objeto contendo { user_id, session_token }.
 * @param {string | null} visitId - ID da visita alvo. Nulo se for criação.
 * @param {string | null} targetEntityId - ID da entidade alvo extraída do payload.
 * @throws {Error} - Lança FORBIDDEN_ACCESS, VISIT_NOT_FOUND ou UNAUTHORIZED em caso de anomalias.
 */
export async function validateVisitOwnership(
  supabase: SupabaseClient,
  auth: { user_id: string; session_token: string },
  visitId?: string | null,
  targetEntityId?: string | null
) {
  // 1. Busca o dono real através do session_token (Triangulação base)
  const now = new Date().toISOString();
  const { data: session, error: sessError } = await supabase
    .from('session_tokens')
    .select('user_id')
    .eq('session_token', auth.session_token)
    .gt('expires_at', now)
    .single();

  if (sessError || !session?.user_id) throw new Error("UNAUTHORIZED");
  const sessionUserId = session.user_id;

  // =========================================================
  // CENÁRIO A: UPDATE (A visita já existe no banco)
  // =========================================================
  if (visitId) {
    debugLog(`[validateVisitOwnership] Fluxo UPDATE. Verificando DB para visitId: ${visitId}`);
    
    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('id, visit_entities(entity_id)')
      .eq('id', visitId)
      .single();

    if (visitError || !visit) throw new Error("VISIT_NOT_FOUND");
    const dbEntityId = visit.visit_entities?.[0]?.entity_id;

    // A.1: Token vs Banco (IDOR Protection)
    if (String(dbEntityId) !== String(sessionUserId)) {
      debugLog(`[validateVisitOwnership] FRAUDE: Token(${sessionUserId}) tentou alterar DB(${dbEntityId})`);
      throw new Error("FORBIDDEN_ACCESS");
    }

    // A.2: Payload vs Banco (Prevenção de sobrescrita de identidade)
    if (targetEntityId && String(dbEntityId) !== String(targetEntityId)) {
      debugLog(`[validateVisitOwnership] DIVERGÊNCIA: Entidade solicitada (${targetEntityId}) vs DB(${dbEntityId})`);
      throw new Error("[validateVisitOwnership] INVALID_PAYLOAD: Divergência de identidade na solicitação.");
    }
    
    return; // Propriedade confirmada para atualização.
  }

  // =========================================================
  // CENÁRIO B: CREATE (A visita é nova)
  // =========================================================
  debugLog(`[validateVisitOwnership] Fluxo CREATE. Validando Sessão vs Entidade Solicitada.`);
  
  if (targetEntityId && String(sessionUserId) !== String(targetEntityId)) {
      debugLog(`[validateVisitOwnership] FRAUDE: Token(${sessionUserId}) tentou forjar visita para Entity(${targetEntityId})`);
      throw new Error("FORBIDDEN_ACCESS");
  }

  // Propriedade confirmada para criação.
}

// =========================================================================
// 2. VALIDAÇÃO DE INTEGRIDADE DA OFERTA (UPSTREAM)
// =========================================================================

/**
 * @function validateOfferIntegrity
 * @description Gatekeeper Upstream. Avalia os parâmetros para decidir entre validar
 *              a relação DB (Update) ou ir direto ao Upstream (Create).
 *              Garante a existência, disponibilidade e formatação da oferta via API parceira.
 * 
 * [RESPONSABILIDADES]:
 * 1. Ownership Check: Valida se a oferta pertence à visita (apenas em fluxos de Update).
 * 2. Session Integrity: Valida token da sessão (SBX).
 * 3. Upstream Request: Proxy para API da Superbid replicando headers de origem.
 * 4. Contract Validation: Garante que o retorno da API siga o modelo esperado.
 *
 * @param {SupabaseClient} supabase - Cliente do Supabase (Service Role).
 * @param {Object} auth - Objeto contendo { user_id, session_token }.
 * @param {string | null} visitId - ID da visita alvo. Nulo se for criação.
 * @param {string} offerId - ID da oferta a ser validada no Upstream.
 * @returns {Promise<any>} - Retorna o objeto hidratado e normalizado da oferta.
 * @throws {Error} - Lança exceção se relação for inválida, sessão expirar ou oferta indisponível.
 */
export async function validateOfferIntegrity(
  supabase: SupabaseClient,
  auth: { user_id: string; session_token: string },
  visitId: string | null | undefined,
  offerId: string
): Promise<any> {
  if (!offerId) {
    debugLog(`[validateOfferIntegrity] Nenhuma oferta fornecida. Pulando validação.`);
    return null;
  }

  // 1. Validação de Relacionamento (DB) - APENAS SE FOR UPDATE
  if (visitId) {
    const { data: link, error: linkError } = await supabase
      .from('visit_offers')
      .select('id')
      .eq('visit_id', visitId)
      .eq('offer_id', offerId)
      .single();

    if (linkError || !link) {
      throw new Error("INVALID_RELATIONSHIP: Oferta não pertence a esta visita.");
    }
  } else {
    debugLog(`[validateOfferIntegrity] Fluxo CREATE. Pulando vínculo DB, indo para Upstream.`);
  }

  // 2. Validação de Sessão (Upstream Token)
  const now = new Date().toISOString();
  const { data: session, error: sessError } = await supabase
    .from('session_tokens')
    .select('sbx_access_token, environment')
    .eq('session_token', auth.session_token)
    .gt('expires_at', now)
    .single();

  if (sessError || !session?.sbx_access_token) {
    throw new Error("SESSION_EXPIRED: Token SBX inválido ou ausente.");
  }

  // 3. Roteamento de Ambiente
  const env = session.environment || "staging";
  const offerBaseUrl = env === "production" 
    ? "https://offer-query.superbid.net" 
    : "https://offer-query.stage.superbid.net";

  // 4. Construção da URL
  const cleanOfferId = String(offerId).replace(/[^0-9]/g, '');
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

  // 5. Execução (WAF Bypass Headers)
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

  // 6. Parsers e Validação de Resposta
  const apiData = await response.json(); 
  
  if (!response.ok) {
    debugLog(`[SUPERBID_REJECT] Env: ${env} | Status: ${response.status} | Detalhe: ${JSON.stringify(apiData)}`);
    throw new Error("UPSTREAM_CONNECTION_ERROR");
  }

  // 7. Extração de Oferta (Payload Contract)
  const offer = apiData.offers?.[0];
  
  if (!offer) {
    debugLog(`[validateOfferIntegrity] Lote ${cleanOfferId} não retornado pela API.`);
    throw new Error("[validateOfferIntegrity] OFFER_NOT_FOUND: API retornou vazio.");
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

  // 8. Log de Auditoria
  debugLog(`[validateOfferIntegrity] Sucesso. Lote ${cleanOfferId} encontrado. Status: ${offer.offerStatus}`);

  return offerResult;
}