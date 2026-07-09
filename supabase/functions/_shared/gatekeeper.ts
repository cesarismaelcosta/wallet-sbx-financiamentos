import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * @function validateVisitOwnership
 * @description Realiza a Validação Triangular forçada.
 * @param {SupabaseClient} supabase - Cliente do Supabase com Service Role.
 * @param {Object} auth - Objeto contendo { user_id, session_token }.
 * @param {string} visitId - ID da visita (o alvo).
 * @param {string} payloadEntityId - ID enviado no payload para validação.
 * @throws {Error} - Lança FORBIDDEN_ACCESS se houver divergência.
 */
export async function validateVisitOwnership(
  supabase: SupabaseClient,
  auth: { user_id: string, session_token: string }, // AJUSTADO PARA SNAKE_CASE
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

  // AJUSTADO: Lendo session_token do objeto
  console.log(`[GATEKEEPER-DEBUG] Consulta sbx_sessions: ${auth.session_token}. Verificando banco...`);

  // 2. Busca o dono real através do session_token (Triangulação)
  const { data: session, error: sessError } = await supabase
    .from('sbx_sessions')
    .select('user_id')
    .eq('session_token', auth.session_token) // AJUSTADO AQUI
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
  auth: { user_id: string, session_token: string }, // AJUSTADO PARA SNAKE_CASE
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

  // 2. Validação Upstream (Superbid)
  const { data: session, error: sessError } = await supabase
    .from('sbx_sessions')
    .select('sbx_access_token')
    .eq('session_token', auth.session_token) // AJUSTADO AQUI
    .single();

  if (sessError || !session?.sbx_access_token) {
    throw new Error("SESSION_EXPIRED: Token SBX inválido.");
  }

  // Limpa qualquer aspa perdida (%22) que venha da URL do front-end
  const cleanOfferId = String(offerId).replace(/[^0-9]/g, '');

  // Usa %5B e %5D no lugar de [ ] para evitar HTTP 400 Bad Request
  const apiUrl = `https://offer-query.superbid.net/offers/?filter=id:%5B${cleanOfferId}%5D`;

  const response = await fetch(apiUrl, {
    headers: { "Authorization": `Bearer ${session.sbx_access_token}`, "Accept": "application/json" }
  });

  // Se a SBX recusar, vamos ver o motivo real.
  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`[GATEKEEPER-DEBUG] Superbid recusou a conexão. Status: ${response.status}. Body:`, errorBody);
    throw new Error("UPSTREAM_CONNECTION_ERROR");
  }

  const data = await response.json();
  if (!data.offers?.[0] || data.offers[0].offerStatus !== "AVAILABLE") {
    throw new Error("OFFER_UNAVAILABLE");
  }
}