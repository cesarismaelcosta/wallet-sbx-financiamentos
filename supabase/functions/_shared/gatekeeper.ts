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
 * ============================================================================
 * CONFIGURAÇÕES GLOBAIS E SEGURANÇA
 * ============================================================================
 */
const DEBUG_MODE = true;

/**
 * @function debugLog
 * @description Centraliza os logs do pipeline. Em produção, DEBUG_MODE deve ser false
 * para evitar exposição de PII (Personally Identifiable Information) nos logs da Edge Function.
 */
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[GATEKEEPER-DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

// =========================================================================
// 1. VALIDAÇÃO DE PROPRIEDADE DA VISITA (OWNERSHIP)
// =========================================================================

/**
 * @function validateVisitOwnership
 * @description Realiza a Validação Triangular forçada (Sessão x Visita x Payload).
 * @param {SupabaseClient} supabase - Cliente do Supabase com Service Role.
 * @param {Object} auth - Objeto contendo { user_id, session_token }.
 * @param {string} visitId - ID da visita (o alvo).
 * @param {string} payloadEntityId - ID enviado no payload para validação.
 * @throws {Error} - Lança FORBIDDEN_ACCESS se houver divergência.
 */
export async function validateVisitOwnership(
  supabase: SupabaseClient,
  auth: { user_id: string, session_token: string },
  visitId: string,
  payloadEntityId?: string | null
) {
  if (visitId) {
    debugLog(`Recebi visitId: ${visitId}. Verificando banco...`);
  } else {
    debugLog(`VisitId nulo/undefined. Fluxo de Criação (OK).`);
  }

  // 1. Busca a visita e o dono (dbEntityId) no banco
  const { data: visit, error: visitError } = await supabase
    .from('visits')
    .select('id, visit_entities(entity_id)')
    .eq('id', visitId)
    .single();

  if (visitError || !visit) throw new Error("VISIT_NOT_FOUND");
  const dbEntityId = visit.visit_entities?.[0]?.entity_id;

  debugLog(`[validateVisitOwnership] Consulta session_tokens: ${auth.session_token}. Verificando banco...`);

  // 2. Busca o dono real através do session_token (Triangulação)
  const now = new Date().toISOString();
  const { data: session, error: sessError } = await supabase
    .from('session_tokens')
    .select('user_id')
    .eq('session_token', auth.session_token)
    .gt('expires_at', now)
    .single();

  if (sessError || !session?.user_id) throw new Error("UNAUTHORIZED");
  const sessionUserId = session.user_id;

  // 3. Validação Obrigatória: Token vs Banco (Ownership)
  if (String(dbEntityId) !== String(sessionUserId)) {
    debugLog(`[validateVisitOwnership]  DIVERGÊNCIA: Token(${sessionUserId}) vs DB(${dbEntityId})`);
    throw new Error("FORBIDDEN_ACCESS");
  }

  // 4. Validação Condicional: Payload vs Banco (Só roda se o payload existir)
  if (payloadEntityId && String(dbEntityId) !== String(payloadEntityId)) {
    debugLog(`[validateVisitOwnership]  DIVERGÊNCIA: Payload(${payloadEntityId}) vs DB(${dbEntityId})`);
    throw new Error("[validateVisitOwnership] INVALID_PAYLOAD: Divergência de identidade no payload.");
  }
}

// =========================================================================
// 2. VALIDAÇÃO DE INTEGRIDADE DA OFERTA (UPSTREAM)
// =========================================================================

/**
 * @function validateOfferIntegrity
 * @description Realiza a Triangulação + Validação de Relacionamento (DB) + Integridade Upstream.
 *              Esta função é o Gatekeeper central para validar que a oferta solicitada
 *              pertence à visita e está disponível na API da Superbid.
 * 
 * [RESPONSABILIDADES]:
 * 1. Ownership Check: Valida se a oferta pertence à visita no Supabase.
 * 2. Session Integrity: Valida token da sessão (SBX).
 * 3. Upstream Request: Proxy para API da Superbid replicando headers de origem.
 * 4. Contract Validation: Garante que o retorno da API não seja vazio.
 *
 * @param {SupabaseClient} supabase - Cliente do Supabase (Service Role).
 * @param {Object} auth - Objeto contendo { user_id, session_token }.
 * @param {string} visitId - ID da visita (alvo).
 * @param {string} offerId - ID da oferta a ser validada.
 * @throws {Error} - Lança exceção se a relação for inválida, sessão expirada ou oferta indisponível.
 */
export async function validateOfferIntegrity(
  supabase: SupabaseClient,
  auth: { user_id: string, session_token: string },
  visitId: string,
  offerId: string
): Promise<any> {
  // 1. Validação de Relacionamento (DB)
  const { data: link, error: linkError } = await supabase
    .from('visit_offers')
    .select('id')
    .eq('visit_id', visitId)
    .eq('offer_id', offerId)
    .single();

  if (linkError || !link) {
    throw new Error("INVALID_RELATIONSHIP: Oferta não pertence a esta visita.");
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

    // 4. Construção da URL (Sintaxe idêntica ao sbx-offer funcional)
    // Utilizamos colchetes brutos [ ] pois o parser da Superbid exige isso para os arrays
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
  const apiData = await response.json(); // Leitura única, sem colisão de variável
  
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

  // Retornando o payload completo e hidratado
  return offerResult;
  
  // 8. Log de Auditoria
  debugLog(`[validateOfferIntegrity] Sucesso. Lote ${cleanOfferId} encontrado. Status: ${offer.offerStatus}`);
}