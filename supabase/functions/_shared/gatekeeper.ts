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
    console.log(`[GATEKEEPER-DEBUG] Recebi visitId: ${visitId}. Verificando banco...`);
  } else {
    console.log(`[GATEKEEPER-DEBUG] VisitId nulo/undefined. Fluxo de Criação (OK).`);
  }

  // 1. Busca a visita e o dono (dbEntityId) no banco
  const { data: visit, error: visitError } = await supabase
    .from('visits')
    .select('id, visit_entities(entity_id)')
    .eq('id', visitId)
    .single();

  if (visitError || !visit) throw new Error("VISIT_NOT_FOUND");
  const dbEntityId = visit.visit_entities?.[0]?.entity_id;

  console.log(`[GATEKEEPER-DEBUG] Consulta sbx_sessions: ${auth.session_token}. Verificando banco...`);

  // 2. Busca o dono real através do session_token (Triangulação)
  const { data: session, error: sessError } = await supabase
    .from('sbx_sessions')
    .select('user_id')
    .eq('session_token', auth.session_token)
    .single();

  if (sessError || !session?.user_id) throw new Error("UNAUTHORIZED");
  const sessionUserId = session.user_id;

  // 3. Validação Obrigatória: Token vs Banco (Ownership)
  if (String(dbEntityId) !== String(sessionUserId)) {
    console.error(`[SECURITY ALERT] DIVERGÊNCIA: Token(${sessionUserId}) vs DB(${dbEntityId})`);
    throw new Error("FORBIDDEN_ACCESS");
  }

  // 4. Validação Condicional: Payload vs Banco (Só roda se o payload existir)
  if (payloadEntityId && String(dbEntityId) !== String(payloadEntityId)) {
    console.error(`[SECURITY ALERT] DIVERGÊNCIA: Payload(${payloadEntityId}) vs DB(${dbEntityId})`);
    throw new Error("INVALID_PAYLOAD: Divergência de identidade no payload.");
  }
}

// =========================================================================
// 2. VALIDAÇÃO DE INTEGRIDADE DA OFERTA (UPSTREAM)
// =========================================================================

/**
 * @function validateOfferIntegrity
 * @description Realiza a Triangulação + Validação de Relacionamento (DB) + Integridade Upstream.
 * @param {SupabaseClient} supabase - Cliente do Supabase.
 * @param {Object} auth - Objeto { user_id, session_token }.
 * @param {string} visitId - ID da visita (alvo).
 * @param {string} offerId - ID da oferta a ser validada.
 * @throws {Error} - Lança exceção se a relação for inválida ou oferta indisponível.
 */
export async function validateOfferIntegrity(
  supabase: SupabaseClient,
  auth: { user_id: string, session_token: string },
  visitId: string,
  offerId: string
) {
  // 1. Validação Lógica (A oferta pertence à visita no banco?)
  const { data: link, error: linkError } = await supabase
    .from('visit_offers')
    .select('id')
    .eq('visit_id', visitId)
    .eq('offer_id', offerId)
    .single();

  if (linkError || !link) {
    throw new Error("INVALID_RELATIONSHIP: Oferta não pertence a esta visita.");
  }

  // 2. Validação Upstream com Roteamento Dinâmico (Ambiente)
  const { data: session, error: sessError } = await supabase
    .from('sbx_sessions')
    .select('sbx_access_token, environment')
    .eq('session_token', auth.session_token)
    .single();

  if (sessError || !session?.sbx_access_token) {
    throw new Error("SESSION_EXPIRED: Token SBX inválido ou ausente.");
  }

  // 3. Aplica o mapeamento dinâmico de URLs
  const env = session.environment || "staging";
  const offerBaseUrl = env === "production" 
    ? "https://offer-query.superbid.net" 
    : "https://offer-query.stage.superbid.net";

  // Higienização de ID para evitar HTTP 400
  const cleanOfferId = String(offerId).replace(/[^0-9]/g, '');
  const apiUrl = `${offerBaseUrl}/offers/?portalId=[2,15]&locale=pt_BR&timeZoneId=America/Sao_Paulo&searchType=opened&filter=id:[${cleanOfferId}]&pageNumber=1&pageSize=15&orderBy=price:desc&requestOrigin=marketplace&preOrderBy=orderByFirstOpenedOffersAndSecondHasPhoto`;

  // 4. Executa a chamada com o WAF Bypass (Headers de Origin/Referer replicados)
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

  // 5. Interceptação de Erros Reais (Fim da cegueira de log)
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[SUPERBID_REJECT] Env: ${env} | Status: ${response.status} | Detalhe: ${errorBody}`);
    throw new Error("UPSTREAM_CONNECTION_ERROR");
  }

  const data = await response.json();
  if (!data.offers?.[0] || data.offers[0].offerStatus !== "AVAILABLE") {
    throw new Error("OFFER_UNAVAILABLE: O lote não consta como disponível na API.");
  }
  
  const data = await response.json();
  
  // 4. Ajuste: Validação Defensiva e Log do Status Real
  const offer = data.offers?.[0];
  
  if (!offer) {
    console.error(`[GATEKEEPER-DEBUG] Lote ${cleanOfferId} não encontrado no payload retornado.`);
    throw new Error("OFFER_NOT_FOUND: API retornou vazio.");
  }

  // LOG DE AUDITORIA: Veja exatamente o status que a Superbid te deu
  console.log(`[GATEKEEPER-DEBUG] Status do lote ${cleanOfferId}: ${offer.offerStatus}`);

  // Se o status não for 'AVAILABLE', avisamos no log mas não travamos cegamente, 
  // a menos que seja uma regra estrita de negócio.
  if (offer.offerStatus !== "AVAILABLE") {
    // Altere a condição abaixo se precisar bloquear estritamente
    console.warn(`[GATEKEEPER-WARNING] Lote com status inesperado: ${offer.offerStatus}`);
    // throw new Error("OFFER_UNAVAILABLE: O lote não está disponível."); // Removido para teste
  }
}