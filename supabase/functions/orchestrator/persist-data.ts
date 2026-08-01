/**
 * ============================================================================
 * @fileoverview Camada de Persistência Transacional (Visitas e Originação)
 * @path supabase/functions/orchestrator/persist-data.ts
 * ============================================================================
 */

import { sql } from './../_shared/db.ts';
import { 
  OriginDetails, 
  Entity,
  Manager,
  Seller,
  Event,
  Vehicle,
  Offer,
  InteractionContext,
  OrchestratorPayload,
  OrchestratorResponse
} from "../_shared/types.ts";
import { debugLog } from "../_shared/logger.ts";

/**
 * Função: persistVisitData
 * @description Realiza a persistência atômica da jornada sbX.
 * Utiliza transações nativas do PostgreSQL para garantir que, em caso de falha,
 * nenhum dado parcial (zumbi) seja gravado no banco de dados.
 * @param sql - Instância de conexão do postgres.js (ou transação ativa)
 * @param payload - Objeto com dados do produto, parceiro e contexto
 * @param origin - Detalhes da origem (IP, dispositivo, geolocalização)
 * @param categoryId - Opcional, ID da categoria da oferta
 * @param action - Ação realizada pelo usuário
 * @param originUrl - URL de origem
 * @param targetUrl - URL de destino
 * @param existingVisitId - ID de uma visita anterior, caso exista
 * @param orchestratorConfigId - ID da configuração do orquestrador para auditoria
 * @returns Promise com os IDs da visita e da atualização
 */
export async function persistVisitData(
  sql: any,
  payload: OrchestratorPayload,
  origin: OriginDetails,
  categoryId?: number,
  action?: 'VISIT' | 'CONSULT' | 'REDIRECT' | 'SIMULATE' | 'CONTACT',
  originUrl?: string,
  targetUrl?: string,
  existingVisitId?: string | null,
  orchestratorConfigId?: number | null
): Promise<{ visitId: string; visitUpdateId: string | undefined }> {

  try {
    // Início da transação atômica.
    return await sql.begin(async (t: any) => {
      let visitId: string = existingVisitId || "";
      let isNewVisit = !visitId;
      
      // 1. Verificação de estado atual (Consulta transacional)
      const rows = visitId 
        ? await t`SELECT id FROM visits WHERE id = ${visitId}` 
        : [];
      const journeyState = rows.length > 0 ? rows[0] : null;

      const hasEntity = journeyState ? await t`SELECT id FROM visit_entities WHERE visit_id = ${visitId}`.then((r: any) => r.length > 0) : false;
      const hasOffer = journeyState ? await t`SELECT id FROM visit_offers WHERE visit_id = ${visitId}`.then((r: any) => r.length > 0) : false;
      const hasConsent = journeyState ? await t`SELECT id FROM visit_consents WHERE visit_id = ${visitId}`.then((r: any) => r.length > 0) : false;
      const hasOrchestratorConfig = journeyState ? await t`SELECT visit_id FROM visit_orchestrator_configs WHERE visit_id = ${visitId}`.then((r: any) => r.length > 0) : false;

      // 2. Atualização ou Criação da Âncora da Visita
      if (visitId && action !== 'CONTACT') {
        const updatedRows = await t`
          UPDATE visits SET 
            product_id = COALESCE(${payload?.product_id || null}, product_id),
            partner_id = COALESCE(${payload?.partner_id || null}, partner_id),
            action = ${payload.action},
            target_url = ${ (targetUrl || "").split('?')[0] },
            raw_payload = ${payload}::jsonb
          WHERE id = ${visitId}
          RETURNING id
        `;
        const updated = updatedRows.length > 0 ? updatedRows[0] : null;
          
         if (!updated) isNewVisit = true;
      }

      if (isNewVisit) {
        const [newVisit] = await t`
          INSERT INTO visits (
            product_id, partner_id, utm_source, utm_medium, utm_campaign, 
            origin_url, target_url, action, ip_address, country, state, 
            city, user_agent, device_type, operating_system, origin_details,
            raw_payload
          )
          VALUES (
            ${payload.product_id ?? null}, ${payload.partner_id ?? null}, 
            ${payload.interaction_context?.utm_source ?? null},
            ${payload.interaction_context?.utm_medium ?? null},
            ${payload.interaction_context?.utm_campaign ?? null},
            ${originUrl ?? null},
            ${(targetUrl || "").split('?')[0]}, 
            ${payload.action ?? null}, 
            ${origin.ip_address ?? null}, ${origin.country ?? null}, ${origin.state ?? null}, 
            ${origin.city ?? null}, ${origin.user_agent ?? null}, ${origin.device_type ?? null}, 
            ${origin.operating_system ?? null}, ${origin ?? null}::jsonb,
            ${payload ?? null}::jsonb
          )
          RETURNING id
        `;
        visitId = newVisit.id;
      }

      // 3. Vínculo de Auditoria
      if (orchestratorConfigId && !hasOrchestratorConfig) {
        await t`INSERT INTO visit_orchestrator_configs (visit_id, orchestrator_config_id) VALUES (${visitId}, ${orchestratorConfigId})`;
      }

      // 4. Log de Navegação
      const [update] = await t`
        INSERT INTO visit_updates (
          visit_id, utm_source, utm_medium, utm_campaign, action, origin_url, target_url, raw_payload
        )
        VALUES (
          ${visitId}, 
          ${payload.interaction_context?.utm_source || 'direct'},
          ${payload.interaction_context?.utm_medium || null},
          ${payload.interaction_context?.utm_campaign || null},
          ${payload.action}, 
          ${ originUrl || null },
          ${ (targetUrl || "").split('?')[0] },
          ${payload}::jsonb
        )
        RETURNING id
      `;

      // 5. Persistência de Dados de Negócio (Entidades, Ofertas, Consentimentos)
      if (payload.entity?.entity_id && !hasEntity) {
        await t`INSERT INTO visit_entities (visit_id, entity_id, entity_type, document, name, phone, email, birth_date, gender, entity_details) 
                VALUES (${visitId}, ${payload.entity.entity_id.toString()}, ${payload.entity.entity_type}, ${payload.entity.document}, ${payload.entity.name}, ${payload.entity.phone}, ${payload.entity.email}, ${payload.entity.birth_date}, ${payload.entity.gender}, ${payload.entity}::jsonb)`;
      }

      if (payload.offer?.offer_id && !hasOffer) {
        await t`INSERT INTO visit_offers (visit_id, category_id, manager_name, manager_details, seller_id, legal_name, trade_name, economic_group, seller_details, event_id, event_description, event_start_date, event_end_date, event_details, offer_id, offer_description, offer_value, offer_details) 
                VALUES (${visitId}, ${categoryId || null}, ${payload.manager?.manager_name || null}, ${payload.manager}::jsonb, ${payload.seller?.seller_id || null}, ${payload.seller?.legal_name || null}, ${payload.seller?.trade_name || null}, ${payload.seller?.economic_group || null}, ${payload.seller}::jsonb, ${payload.event?.event_id || null}, ${payload.event?.event_description || null}, ${payload.event?.event_start_date || null}, ${payload.event?.event_end_date || null}, ${payload.event}::jsonb, ${payload.offer.offer_id}, ${payload.offer.offer_description}, ${payload.offer.offer_value}, ${payload.offer}::jsonb)`;
      }

      if (payload.consents?.length > 0 && !hasConsent) {
        for (const c of payload.consents) {
          const acceptedValue = c.accepted === true || c.acceptedConsents === true;
          const acceptedAt = c.accepted_at || c.acceptedConsents_at || new Date().toISOString();

          debugLog(`Persistindo consentimento: ${c.consent_id}`, { accepted: acceptedValue });

          await t`INSERT INTO visit_consents (
            visit_id, consent_id, accepted, accepted_at, target_url, entity_id, 
            name, email, document, phone, birth_date, gender, entity_details, 
            ip_address, country, state, city, user_agent, device_type, 
            operating_system, origin_details, page_snapshot, raw_payload
          ) VALUES (
            ${visitId}, ${c.consent_id}, ${acceptedValue}, ${acceptedAt}, 
            ${(targetUrl || "").split('?')[0]}, ${payload.entity.entity_id}, 
            ${payload.entity.name}, ${payload.entity.email}, ${payload.entity.document}, 
            ${payload.entity.phone}, ${payload.entity.birth_date}, ${payload.entity.gender}, 
            ${payload.entity}::jsonb, ${origin.ip_address}, ${origin.country}, 
            ${origin.state}, ${origin.city}, ${origin.user_agent}, ${origin.device_type}, 
            ${origin.operating_system}, ${origin}::jsonb, 
            ${{ branding: payload.page_configs, consents_rendered: payload.consent_configs, legal_text: c.legal_text_snapshot }}::jsonb, 
            ${payload}::jsonb
          )`;
        }
      }

      return { visitId, visitUpdateId: update.id };
    });
  } catch (error) {
    debugLog("[FATAL] Erro na persistência atômica da visita:", error);
    throw error;
  }
}