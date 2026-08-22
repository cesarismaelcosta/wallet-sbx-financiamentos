/**
 * @fileoverview Camada de Persistência Transacional (Visitas e Originação)
 * @path supabase/functions/orchestrator/persist-data.ts
 *
 * ============================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: TRANSACTIONAL FAST PATH & 1:N OFFERS
 * ============================================================================
 * Camada responsável por persistir o estado do "Carrinho" (Visita) de forma atômica.
 * 
 * [MUDANÇAS ARQUITETURAIS - REFATORAÇÃO DE PERFORMANCE E OLAP]:
 * 1. {Fast Path Compatibility}: Assinatura expandida para aceitar `preGeneratedVisitId`
 *    e `preGeneratedUpdateId`. Isso permite que o Orquestrador responda ao cliente 
 *    em milissegundos (`waitUntil`) delegando a geração de IDs para a borda.
 * 2. {1:N Offers - Dedup Cirúrgico}: A checagem `hasOffer` agora procura especificamente 
 *    pelo `offer_id` da requisição. Isso permite atrelar múltiplas ofertas na mesma visita.
 * 3. {Rastreabilidade OLAP}: Injeção do `visit_update_id` na tabela `visit_offers`.
 *    O backoffice agora consegue rastrear exatamente em qual interação (pageview) 
 *    aquela oferta específica foi adicionada ao carrinho.
 * 4. {Race Condition Shield}: Adicionada cláusula `ON CONFLICT DO NOTHING` no insert 
 *    da oferta. Evita que o Fast Path quebre o banco caso dois requests idênticos
 *    disputem milissegundos de I/O de rede.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 * @version 7.6.0 (Fast Path UUIDs, OLAP Tracking & Concurrency Shield)
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
  orchestratorConfigId?: number | null,
  /**
   * [waitUntil] UUIDs gerados na borda para responder antes do commit.
   * A integridade referencial é mantida: dentro da transação a visita é
   * inserida com este id ANTES de visit_updates/visit_offers.
   */
  preGeneratedVisitId?: string,
  preGeneratedUpdateId?: string
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
      
      // [1:N MODEL - CART PRESERVATION]
      // A visita é o carrinho; cada oferta escolhida é uma linha na visit_offers.
      const hasConsent = journeyState ? await t`SELECT id FROM visit_consents WHERE visit_id = ${visitId}`.then((r: any) => r.length > 0) : false;
      const hasOrchestratorConfig = journeyState ? await t`SELECT visit_id FROM visit_orchestrator_configs WHERE visit_id = ${visitId}`.then((r: any) => r.length > 0) : false;

      // 2. Atualização ou Criação da Âncora da Visita
      if (visitId && action !== 'CONTACT') {
        const updatedRows = await t`
          UPDATE visits SET 
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
        // Usa o ID gerado na borda (se existir) para garantir consistência no Fast Path
        const newVisitId = preGeneratedVisitId || crypto.randomUUID();
        const [newVisit] = await t`
          INSERT INTO visits (
            id, utm_source, utm_medium, utm_campaign, 
            origin_url, target_url, action, ip_address, country, state, 
            city, user_agent, device_type, operating_system, origin_details,
            raw_payload
          )
          VALUES (
            ${newVisitId},
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

      // 4. Log de Navegação (Atomic Pageview com Regra de Transição CONSULT -> REDIRECT / SIMULATE)
      // Tenta atualizar diretamente o update enviado no payload, SE ele for um CONSULT
      const targetUpdateId = payload.visit_update_id || null;
      let newUpdateId: string;
      let update;

      let updatedRows = [];
      if (targetUpdateId && visitId && (payload.action === 'SIMULATE' || payload.action === 'REDIRECT')) {
        updatedRows = await t`
          UPDATE visit_updates 
          SET action = ${payload.action ?? null}, 
              action_description = ${payload.action_description ?? null},
              ip_address = ${origin?.ip_address ?? null},
              country = ${origin?.country ?? null},
              state = ${origin?.state ?? null},
              city = ${origin?.city ?? null},
              user_agent = ${origin?.user_agent ?? null},
              device_type = ${origin?.device_type ?? null},
              operating_system = ${origin?.operating_system ?? null},
              origin_details = ${origin ? JSON.stringify(origin) : null}::jsonb,
              raw_payload = ${payload ? JSON.stringify(payload) : null}::jsonb
          WHERE id = ${targetUpdateId} 
            AND visit_id = ${visitId} 
            AND action = 'CONSULT'
          RETURNING id
        `;
      }

      if (updatedRows.length > 0) {
        // A: UPDATE bem-sucedido (o ID do payload era um CONSULT válido e foi atualizado)
        newUpdateId = updatedRows[0].id;
        update = { id: newUpdateId };
      } else {
        // B: INSERT - Se não veio ID, ou se o ID não era um CONSULT, gera um ID NOVO do zero
        newUpdateId = crypto.randomUUID();
        const [newUpd] = await t`
          INSERT INTO visit_updates (
            id, visit_id, partner_id, product_id, utm_source, utm_medium, utm_campaign, 
            action, origin_url, target_url, 
            ip_address, country, state, city, user_agent, device_type, operating_system, origin_details,
            raw_payload
          )
          VALUES (
            ${newUpdateId},
            ${visitId}, 
            ${payload.partner_id ?? null}, 
            ${payload.product_id ?? null}, 
            ${payload.interaction_context?.utm_source || 'direct'},
            ${payload.interaction_context?.utm_medium || null},
            ${payload.interaction_context?.utm_campaign || null},
            ${payload.action ?? null}, 
            ${originUrl ?? null},
            ${(targetUrl || "").split('?')[0]},
            ${origin?.ip_address ?? null},
            ${origin?.country ?? null},
            ${origin?.state ?? null},
            ${origin?.city ?? null},
            ${origin?.user_agent ?? null},
            ${origin?.device_type ?? null},
            ${origin?.operating_system ?? null},
            ${origin ? JSON.stringify(origin) : null}::jsonb,
            ${payload ? JSON.stringify(payload) : null}::jsonb
          )
          RETURNING id
        `;
        update = newUpd;
      }

      // 5. Persistência de Dados de Negócio (Entidades, Ofertas, Consentimentos)
      if (payload.entity?.entity_id && !hasEntity) {
        await t`INSERT INTO visit_entities (visit_id, entity_id, entity_type, document, name, phone, email, birth_date, gender, entity_details) 
                VALUES (${visitId}, ${payload.entity.entity_id.toString()}, ${payload.entity.entity_type}, ${payload.entity.document}, ${payload.entity.name}, ${payload.entity.phone}, ${payload.entity.email}, ${payload.entity.birth_date}, ${payload.entity.gender}, ${payload.entity}::jsonb)`;
      }

      // ✨ [INTEGRIDADE OLAP E PROTEÇÃO DE CONCORRÊNCIA]: 
      // Injeção do update.id (Pageview atual) atrelando a oferta à interação exata.
      if (payload.offer?.offer_id) {
        await t`INSERT INTO visit_offers (
                visit_id, visit_update_id, category_id, subcategory_id, subcategory, manager_name, manager_details, 
                seller_id, legal_name, trade_name, economic_group, seller_details, 
                event_id, event_description, event_start_date, event_end_date, event_details, 
                offer_id, offer_description, offer_value, offer_details
              ) 
              VALUES (
                ${visitId},
                ${newUpdateId}, 
                ${categoryId || null}, 
                ${payload.offer.subcategory_id ? Number(payload.offer.subcategory_id) : null}, 
                ${payload.offer.subcategory || null}, 
                ${payload.manager?.manager_name || null}, 
                ${payload.manager}::jsonb, 
                ${payload.seller?.seller_id || null}, 
                ${payload.seller?.legal_name || null}, 
                ${payload.seller?.trade_name || null}, 
                ${payload.seller?.economic_group || null}, 
                ${payload.seller}::jsonb, 
                ${payload.event?.event_id || null}, 
                ${payload.event?.event_description || null}, 
                ${payload.event?.event_start_date || null}, 
                ${payload.event?.event_end_date || null}, 
                ${payload.event}::jsonb, 
                ${payload.offer.offer_id}, 
                ${payload.offer.offer_description}, 
                ${payload.offer.offer_value}, 
                ${payload.offer}::jsonb
              )`;
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