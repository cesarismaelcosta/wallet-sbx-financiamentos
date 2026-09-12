/**
 * @fileoverview Camada de Persistência Transacional (Visitas e Originação)
 * @path supabase/functions/orchestrator/persist-data.ts
 * @version 7.8.2
 *
 * ============================================================================
 * PRINCÍPIOS DA CAMADA DE PERSISTÊNCIA (EXECUTOR BURRO)
 * ============================================================================
 * 1. {Contrato Estrito (Zero Adivinhação)}:
 *    Esta função NÃO deduz estado e NÃO faz consultas prévias (SELECT). 
 *    Toda a decisão (INSERT vs UPDATE, se a entidade já existe) é injetada 
 *    explicitamente pelo Orquestrador através das flags booleanas.
 *
 * 2. {Travas de Consistência (ACID)}:
 *    Uso de `RETURNING id`. Se um UPDATE falhar (retornar 0 linhas), a 
 *    transação aborta com erro [FATAL], impedindo o surgimento de registros "zumbis".
 * 
 * 3. {Bulk Parallelism & Pipelining}: 
 *    Agrupamento dinâmico das queries filhas (ofertas, entidades, configurações)
 *    em um único `Promise.all`, reduzindo drasticamente a latência de escrita.
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { debugLog } from "../_shared/logger.ts";
import type { OrchestratorPayload, OriginDetails } from "../_shared/types.ts";

export async function persistVisitData(
  sql: any,
  // ============================================================================
  // CONTRATO EXPLÍCITO: Parâmetros ditados pelo Orquestrador (Fonte da Verdade)
  // ============================================================================
  action: 'VISIT' | 'CONSULT' | 'REDIRECT' | 'SIMULATE' | 'CONTACT',
  visitId: string,
  visitUpdateId: string,
  isNewVisit: boolean,
  isNewUpdate: boolean,
  hasSignedEntity: boolean, // Orquestrador avisa se a entidade já existe vinculada à visita
  // ============================================================================
  payload: OrchestratorPayload,
  origin: OriginDetails,
  categoryId?: number,
  originUrl?: string,
  targetUrl?: string,
  orchestratorConfigId?: number | null
): Promise<{ visitId: string; visitUpdateId: string }> {

  try {
    // Início da transação atômica: Tudo é gravado ou nada é gravado.
    return await sql.begin(async (t: any) => {
      
      // =========================================================================
      // 1. TABELA PRINCIPAL (visits) - O "Cabeçalho" da Jornada
      // =========================================================================
      if (isNewVisit) {
        // Primeiro acesso: Cria a âncora principal do visitante
        await t`
          INSERT INTO visits (
            id, action, action_description, origin_url, target_url, raw_payload, utm_source, utm_medium, utm_campaign,
            ip_address, country, state, city, user_agent, device_type, operating_system, origin_details
          ) VALUES (
            ${visitId}, ${action}, ${payload.action_description ?? null}, ${originUrl ?? null}, ${(targetUrl || "").split('?')[0]}, ${payload}::jsonb,
            ${payload.interaction_context?.utm_source ?? null}, ${payload.interaction_context?.utm_medium ?? null}, ${payload.interaction_context?.utm_campaign ?? null},
            ${origin.ip_address ?? null}, ${origin.country ?? null}, ${origin.state ?? null}, ${origin.city ?? null}, 
            ${origin.user_agent ?? null}, ${origin.device_type ?? null}, ${origin.operating_system ?? null}, ${origin ?? null}::jsonb
          )
        `;
      } else {
        // Evolução de Jornada (Conversão): Atualiza o estado da âncora.
        const updatedVisit = await t`
          UPDATE visits SET 
            action = ${action},
            action_description = ${payload.action_description ?? null},
            target_url = ${(targetUrl || "").split('?')[0]}
            ${action === 'SIMULATE' ? t`, raw_payload = ${payload}::jsonb` : t``}
          WHERE id = ${visitId}
          RETURNING id
        `;

        // 🔒 TRAVA ESTRITA ACID: Prevenção contra Sessões Fantasmas.
        // Se o banco não encontrar o visitId para atualizar, abortamos a transação inteira.
        // Isso impede falhas silenciosas ou violações de Foreign Key nas tabelas filhas.
        if (updatedVisit.length === 0) {
           throw new Error(`[FATAL] Inconsistência de Estado: A visita âncora ${visitId} não foi encontrada.`);
        }
      }

      // =========================================================================
      // 2. TABELA DE LOG TEMPORAL (visit_updates) - O Rastro da Interação
      // =========================================================================
      if (isNewUpdate) {
        // Ações de Topo de Funil (Navegação) exigem a criação de um novo registro temporal
        await t`
          INSERT INTO visit_updates (
            id, visit_id, action, action_description, origin_url, target_url, raw_payload,
            partner_id, product_id, utm_source, utm_medium, utm_campaign,
            ip_address, country, state, city, user_agent, device_type, operating_system, origin_details
          ) VALUES (
            ${visitUpdateId}, ${visitId}, ${action}, ${payload.action_description ?? null}, ${originUrl ?? null}, ${(targetUrl || "").split('?')[0]}, ${payload}::jsonb,
            ${payload.partner_id ?? null}, ${payload.product_id ?? null}, ${payload.interaction_context?.utm_source || 'direct'}, ${payload.interaction_context?.utm_medium ?? null}, ${payload.interaction_context?.utm_campaign ?? null},
            ${origin.ip_address ?? null}, ${origin.country ?? null}, ${origin.state ?? null}, ${origin.city ?? null}, 
            ${origin.user_agent ?? null}, ${origin.device_type ?? null}, ${origin.operating_system ?? null}, ${origin ?? null}::jsonb
          )
        `;
      } else {
        // Ações de Fundo de Funil (Conversão) evoluem o snapshot temporal da página atual
        const updatedLog = await t`
          UPDATE visit_updates SET 
            action = ${action}, 
            action_description = ${payload.action_description ?? null},
            raw_payload = ${payload}::jsonb
          WHERE id = ${visitUpdateId} 
            AND visit_id = ${visitId}
          RETURNING id
        `;
        
        // 🔒 TRAVA ESTRITA ACID: Impede mutações em updates inexistentes (dessincronização de Front).
        if (updatedLog.length === 0) {
          throw new Error(`[FATAL] Inconsistência de Estado: O update_id ${visitUpdateId} não foi encontrado para atualização da ação ${action}.`);
        }
      }

      // =========================================================================
      // 🚀 3. BULK PARALLELISM: Execução simultânea de dependências filhas
      // =========================================================================
      // Agrupamos todas as instruções secundárias em um array para executá-las 
      // em paralelo, reduzindo drasticamente o tempo total da transação.
      const pendingWrites: Promise<any>[] = [];

      // 3.1. Vínculo de Auditoria das Configurações do Orquestrador
      // Grava o vínculo APENAS na criação de um novo log temporal, economizando I/O.
      if (isNewUpdate && orchestratorConfigId) {
        pendingWrites.push(t`
          INSERT INTO visit_orchestrator_configs (visit_id, visit_update_id, orchestrator_config_id) 
          VALUES (${visitId}, ${visitUpdateId}, ${orchestratorConfigId})
          ON CONFLICT (visit_id, visit_update_id, orchestrator_config_id) DO NOTHING
        `);
      }

      // 3.2. Persistência de Dados de Negócio (Entidades)
      // ✨ REGRA DE NEGÓCIO: O Orquestrador hidrata a entidade em todos os requests,
      // mas nós SÓ inserimos no banco no exato request em que a identidade S2S foi chancelada.
      if (hasSignedEntity && payload.entity?.entity_id) {
        pendingWrites.push(t`
          INSERT INTO visit_entities (visit_id, entity_id, entity_type, document, name, phone, email, birth_date, gender, entity_details) 
          VALUES (${visitId}, ${payload.entity.entity_id.toString()}, ${payload.entity.entity_type}, ${payload.entity.document}, ${payload.entity.name}, ${payload.entity.phone}, ${payload.entity.email}, ${payload.entity.birth_date}, ${payload.entity.gender}, ${payload.entity}::jsonb)
        `);
      }

      // 3.3. Integridade OLAP e Escudo de Concorrência (Ofertas)
      // O 'ON CONFLICT DO UPDATE' previne quebras caso duas requisições Fast Path 
      // disputem o mesmo milissegundo, garantindo sempre o registro da última mutação de preço/detalhes.
      if (payload.offer?.offer_id) {
        pendingWrites.push(t`
          INSERT INTO visit_offers (
                visit_id, visit_update_id, category_id, subcategory_id, subcategory, manager_name, manager_details, 
                seller_id, legal_name, trade_name, economic_group, seller_details, 
                event_id, event_description, event_start_date, event_end_date, event_details, 
                offer_id, offer_description, offer_value, offer_details
              ) 
              VALUES (
                ${visitId}, ${visitUpdateId}, ${categoryId || null}, ${payload.offer.subcategory_id ? Number(payload.offer.subcategory_id) : null}, 
                ${payload.offer.subcategory || null}, ${payload.manager?.manager_name || null}, ${payload.manager ?? null}::jsonb, 
                ${payload.seller?.seller_id || null}, ${payload.seller?.legal_name || null}, ${payload.seller?.trade_name || null}, 
                ${payload.seller?.economic_group || null}, ${payload.seller ?? null}::jsonb, ${payload.event?.event_id || null}, 
                ${payload.event?.event_description || null}, ${payload.event?.event_start_date || null}, ${payload.event?.event_end_date || null}, 
                ${payload.event ?? null}::jsonb, ${payload.offer.offer_id}, ${payload.offer.offer_description}, 
                ${payload.offer.offer_value}, ${payload.offer ?? null}::jsonb
              )
              ON CONFLICT (visit_id, visit_update_id, offer_id) DO UPDATE SET
                offer_value = EXCLUDED.offer_value,
                offer_description = EXCLUDED.offer_description,
                offer_details = EXCLUDED.offer_details,
                event_details = EXCLUDED.event_details,
                manager_details = EXCLUDED.manager_details,
                seller_details = EXCLUDED.seller_details
        `);
      }

      // 3.4. Determinismo Temporal LGPD (Consentimentos)
      if (payload.consents?.length > 0) {
        for (const c of payload.consents) {
          const acceptedValue = c.accepted === true || c.acceptedConsents === true;
          const acceptedAt = c.accepted_at || c.acceptedConsents_at || new Date().toISOString();

          pendingWrites.push(t`
            INSERT INTO visit_consents (
              visit_id, visit_update_id, consent_id, accepted, accepted_at, target_url, entity_id, 
              name, email, document, phone, birth_date, gender, entity_details, 
              ip_address, country, state, city, user_agent, device_type, 
              operating_system, origin_details, page_snapshot, raw_payload
            ) VALUES (
              ${visitId}, ${visitUpdateId}, ${c.consent_id}, ${acceptedValue}, ${acceptedAt}, 
              ${(targetUrl || "").split('?')[0]}, ${payload.entity?.entity_id || null}, 
              ${payload.entity?.name || null}, ${payload.entity?.email || null}, ${payload.entity?.document || null}, 
              ${payload.entity?.phone || null}, ${payload.entity?.birth_date || null}, ${payload.entity?.gender || null}, 
              ${payload.entity ?? null}::jsonb, ${origin?.ip_address || null}, ${origin?.country || null}, 
              ${origin?.state || null}, ${origin?.city || null}, ${origin?.user_agent || null}, ${origin?.device_type || null}, 
              ${origin?.operating_system || null}, ${origin ?? null}::jsonb, 
              ${{ branding: payload.page_configs, consents_rendered: payload.consent_configs, legal_text: c.legal_text_snapshot }}::jsonb, 
              ${payload}::jsonb
            )
            ON CONFLICT ON CONSTRAINT visit_consents_update_consent_unique DO UPDATE SET
              accepted = EXCLUDED.accepted,
              accepted_at = EXCLUDED.accepted_at,
              page_snapshot = EXCLUDED.page_snapshot,
              raw_payload = EXCLUDED.raw_payload,
              updated_at = EXCLUDED.created_at
          `);
        }
      }

      // ✨ Dispara todas as escritas filhas SIMULTANEAMENTE (Pipelining)
      if (pendingWrites.length > 0) {
        await Promise.all(pendingWrites);
      }

      return { visitId, visitUpdateId };
    });
  } catch (error) {
    debugLog("[FATAL] Erro na persistência atômica da visita:", error);
    throw error; // Repassa o erro para o Orquestrador lidar com o HTTP Status
  }
}

/**
 * ✨ [ZERO-TRUST OLAP SYNC]
 * Sincroniza os dados hidratados da oferta no banco durante requisições GET (Background).
 * Garante que nosso Data Lake reflita eventuais mutações (como preço atualizado)
 * ocorridas no Upstream (Superbid) após a criação da visita, sem onerar o TTI do front.
 */
export async function syncHydratedOffer(
  sql: any, visitId: string, visitUpdateId: string, offer: any, event: any, manager: any, seller: any
): Promise<void> {
  if (!offer?.offer_id) return;
  try {
    await sql`
      UPDATE visit_offers 
      SET offer_value = ${offer.offer_value}, offer_description = ${offer.offer_description}, offer_details = ${offer}::jsonb,
          event_details = ${event ?? null}::jsonb, manager_details = ${manager ?? null}::jsonb, seller_details = ${seller ?? null}::jsonb
      WHERE visit_id = ${visitId} AND visit_update_id = ${visitUpdateId} AND offer_id = ${offer.offer_id}
    `;
    debugLog(`[Persist] Oferta ${offer.offer_id} sincronizada via GET no background.`);
  } catch (error) {
    debugLog("[FATAL] Erro ao sincronizar oferta via GET:", error);
  }
}