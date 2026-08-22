/**
 * @fileoverview FINANCIAL GATEWAY - CAMADA DE PERSISTÊNCIA E AUDITORIA
 * @path supabase/functions/financial-gateway/persist-data.ts
 *
 * ============================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: FORENSIC AUDITING & BACKOFFICE COMPATIBILITY
 * ============================================================================
 * [MUDANÇAS ARQUITETURAIS - ZERO-TRUST & OLAP]:
 * 1. {Trusted Snapshots}: As colunas `entity_details`, `offer_details`, etc.,
 *    recebem os dados 100% validados e hidratados pelo `hydrate-data.ts`.
 * 2. {Raw Payload Enriched}: A coluna `raw_payload` recebe o objeto `payload`
 *    completo e REIDRATADO. Isso garante total compatibilidade com a 
 *    desserialização do Backoffice, exibindo dados reais e imunes a fraude,
 *    já que a origem desses dados agora é o próprio servidor (S2S).
 * 3. {Auditoria Uniforme}: Correção estrutural onde o payload mestre enriquecido 
 *    é gravado de forma consistente em TODAS as tabelas filhas (consults, 
 *    updates, consents), evitando objetos soltos e quebra de relatórios no BI.
 * 
 * @author Cesar Ismael Pereira da Costa
 * @author Gemini Pro
 * @version 2.0.1 (Zero-Trust Persistency with Backoffice Compat)
 */

import { sql } from './../_shared/db.ts';

import { 
  OriginDetails, 
  Entity,
  Manager,
  Seller,
  Event,
  Offer,
  SimulationPayload,
  SimulationResponse,
  Consultation, 
  SimulationFinancials 
} from "../_shared/types.ts";

import { debugLog } from "../_shared/logger.ts";

/**
 * RESOLVE PARTNER RESULT
 * @description Normaliza retornos brutos de parceiros em IDs estruturados de 8 dígitos.
 * Lógica de ID: [PartnerID(2)][StatusID(2)][Counter(4)]
 * Esta função opera dentro de uma transação atômica para garantir integridade referencial.
 */
export async function resolvePartnerResult(
  sql: any,
  partnerId: number,
  statusId: number | null,
  rawMessage: string | null
): Promise<string | null> {

  if (!rawMessage || !partnerId || !statusId) return null;
  const sanitizedMessage = rawMessage.trim();
  
  try {
    const [existing] = await sql`
      SELECT id FROM result_partner_types 
      WHERE partner_id = ${partnerId} 
      AND description = ${sanitizedMessage}
      LIMIT 1
    `;

    if (existing) return existing.id;

    const [{ count }] = await sql`
      SELECT count(*) as count FROM result_partner_types 
      WHERE partner_id = ${partnerId} 
      AND status_id = ${statusId}
    `;

    const nextCounter = Number(count) + 1;
    
    const pPart = String(partnerId).padStart(2, '0');
    const sPart = String(statusId).padStart(2, '0');
    const cPart = String(nextCounter).padStart(4, '0').slice(-4);
    const newId = `${pPart}${sPart}${cPart}`;

    await sql`
      INSERT INTO result_partner_types (id, partner_id, status_id, description)
      VALUES (${newId}, ${partnerId}, ${statusId}, ${sanitizedMessage})
    `;

    return newId;

  } catch (error) {
    console.error(`[RESOLVE-PARTNER-CRITICAL] Falha ao persistir tipo de parceiro:`, error);
    return null; 
  }
}

/**
 * PERSISTE DADOS DA SIMULAÇÃO (INSERT)
 * @description Executa a escrita primária de uma nova simulação. 
 * Realiza o "Triple-Write" (Simulations, Offers, Updates) de forma atômica.
 */
export async function insertSimulationData(
  sql: any,
  payload: SimulationPayload, 
  infra: OriginDetails,
  gatewayResult: SimulationResponse,
  action: 'VISIT' | 'CONSULT' | 'REDIRECT' | 'SIMULATE' | 'CONTACT',
  action_description: string,
  step: 'CHECK_ELIGIBILITY' | 'EXECUTE_SIMULATION' = 'EXECUTE_SIMULATION',
  syncVisit: boolean = true 
): Promise<{ simulationId: string, simulationUpdateId: string }> {

  try {
    return await sql.begin(async (t: any) => {
      
      const entity = (payload.entity as Entity) ?? {};
      const manager = (payload.manager as Manager) ?? {};
      const seller = (payload.seller as Seller) ?? {};
      const event = (payload.event as Event) ?? {};
      const offer = (payload.offer as Offer) ?? {};
      const simulation = (payload.simulation_details as SimulationFinancials) ?? {};
      const consents = payload.consents ?? [];
      
      const stageMap: Record<string, number> = { 'CHECK_ELIGIBILITY': 1, 'EXECUTE_SIMULATION': 2 };
      const stageId = stageMap[step];

      let bestConsult: Consultation = {
        status_id: null, is_selected: null, message: null, external_operation_id: null,
        financial_institution_id: null, financial_institution_name: null,
        requested_value: simulation.requested_value ?? null,
        down_payment_amount: simulation.down_payment_amount ?? null,
        down_payment_percentage: simulation.down_payment_percentage ?? null,
        financed_amount: simulation.financed_amount ?? null,
        installments: simulation.installments ?? null,
        cet_rate: simulation.cet_rate ?? null,
        installment_value: simulation.installment_value ?? null,
      };
      
      let mainResultPartnerId = null;

      if (step === 'EXECUTE_SIMULATION') {
        let selectedConsult = gatewayResult.consults.find(c => c.is_selected === true) || gatewayResult.consults[0];
        if (selectedConsult) {
          bestConsult = selectedConsult;
          mainResultPartnerId = await resolvePartnerResult(t, payload.partner_id, bestConsult.status_id, bestConsult.message);
        }
      }

      // INSERT MESTRE: Salva a proposta na tabela 'simulations'.
      // O `payload` aqui é o objeto reidratado (Enriched) pelo Backend. 
      // Garante que o Backoffice consiga ler o raw_payload.entity e raw_payload.offer com dados verdadeiros.
      const [sim] = await t`
        INSERT INTO simulations (
          id, visit_id, is_integrated, integration_method, partner_id, product_id,
          entity_id, entity_type, document, name, phone, email, birth_date, gender, entity_details,
          financial_institution_id, requested_value, down_payment_amount, down_payment_percentage,
          financed_amount, installments, cet_rate, installment_value, simulation_details,
          stage_id, status_id, result_partner_id, external_operation_id, raw_payload
        ) VALUES (
          ${payload.simulation_id}, ${payload.visit_id}, ${payload.is_integrated ?? false}, ${payload.integration_method}, ${payload.partner_id}, ${payload.product_id},
          ${entity.entity_id}, ${entity.entity_type}, ${entity.document}, ${entity.name}, ${entity.phone}, ${entity.email}, ${entity.birth_date}, ${entity.gender}, ${entity}::jsonb,
          ${bestConsult.financial_institution_id}, ${bestConsult.requested_value}, ${bestConsult.down_payment_amount}, ${bestConsult.down_payment_percentage},
          ${bestConsult.financed_amount}, ${bestConsult.installments}, ${bestConsult.cet_rate}, ${bestConsult.installment_value}, ${bestConsult}::jsonb,
          ${stageId}, ${bestConsult.status_id}, ${mainResultPartnerId}, ${bestConsult.external_operation_id}, ${payload}::jsonb
        )
        RETURNING id
      `;
      const simulationId = sim.id;

      // INSERT OFERTA
      await t`
        INSERT INTO simulation_offers (
          simulation_id, category_id, subcategory_id, subcategory, manager_name, manager_details, seller_id, legal_name, 
          trade_name, economic_group, seller_details, event_id, event_description, 
          event_start_date, event_end_date, event_details, offer_id, offer_description, 
          offer_value, offer_details, raw_payload
        ) VALUES (
          ${simulationId}, ${offer.category_id || null}, ${offer.subcategory_id ? Number(offer.subcategory_id) : null}, ${offer.subcategory || null}, ${manager.manager_name || null}, ${manager}::jsonb, ${seller.seller_id || null}, ${seller.legal_name || null},
          ${seller.trade_name || null}, ${seller.economic_group || null}, ${seller}::jsonb, ${event.event_id || null}, ${event.event_description || null},
          ${event.event_start_date || null}, ${event.event_end_date || null}, ${event}::jsonb, ${offer.offer_id || null}, ${offer.offer_description || null},
          ${offer.offer_value || null}, ${offer}::jsonb, ${payload}::jsonb
        )
      `;

      // INSERT UPDATES
      const [update] = await t`
        INSERT INTO simulation_updates (
          simulation_id, operation, stage_id, status_id, result_partner_id,
          ip_address, country, state, city, user_agent, device_type, operating_system,
          origin_details, simulation_details, raw_payload
        ) VALUES (
          ${simulationId}, 'INSERT', ${stageId}, ${bestConsult.status_id}, ${mainResultPartnerId},
          ${infra.ip_address}, ${infra.country}, ${infra.state}, ${infra.city}, ${infra.user_agent},
          ${infra.device_type}, ${infra.operating_system}, ${infra}::jsonb, ${bestConsult}::jsonb, ${payload}::jsonb
        )
        RETURNING id
      `;
      const simulationUpdateId = update.id;

      // PERSISTE CONSULTAS: O raw_payload aqui recebe o payload mestre enriquecido, e não o objeto isolado.
      for (const consult of (gatewayResult.consults || [])) {
        await t`
            INSERT INTO simulation_consults (
            simulation_id, financial_institution_id, status_id, 
            requested_value, down_payment_amount, down_payment_percentage, 
            financed_amount, installments, cet_rate, installment_value, 
            external_operation_id, simulation_details, raw_payload
            ) VALUES (
            ${simulationId}, 
            ${consult.financial_institution_id?.toString() ?? null}, 
            ${consult.status_id ?? null}, 
            ${consult.requested_value ?? null},
            ${consult.down_payment_amount ?? null},
            ${consult.down_payment_percentage ?? null},
            ${consult.financed_amount ?? null},
            ${consult.installments ?? null},
            ${consult.cet_rate ?? null},
            ${consult.installment_value ?? null},
            ${consult.external_operation_id ?? null},
            ${consult ?? {}}::jsonb, 
            ${payload}::jsonb
            )
        `;
      }

      // PERSISTE CONSENTIMENTOS
      if (consents && consents.length > 0) {
        for (const c of consents) {
          const isAccepted = c.accepted === true || c.acceptedConsents === true;
          const acceptedAt = c.accepted_at || c.acceptedConsents_at || new Date().toISOString();

          await t`
            INSERT INTO simulation_consents (
                simulation_id, consent_id, accepted, accepted_at, partner_id, product_id,
                entity_id, document, name, email, phone, birth_date, gender, entity_details,
                ip_address, country, state, city, user_agent, device_type, operating_system,
                origin_details, manager_details, seller_details, event_details, offer_details, 
                page_snapshot, raw_payload
            ) 
            VALUES (
                ${simulationId}, 
                ${c.consent_id ?? null}, 
                ${isAccepted},       
                ${acceptedAt},       
                ${payload.partner_id ?? null}, ${payload.product_id},
                ${entity.entity_id ?? null}, ${entity.document ?? null}, ${entity.name ?? null}, ${entity.email ?? null}, ${entity.phone ?? null}, ${entity.birth_date ?? null}, ${entity.gender ?? null}, ${entity ?? {}}::jsonb,
                ${infra.ip_address ?? null}, ${infra.country ?? null}, ${infra.state ?? null}, ${infra.city ?? null}, ${infra.user_agent ?? null}, ${infra.device_type ?? null}, ${infra.operating_system ?? null},
                ${infra ?? {}}::jsonb, ${manager ?? {}}::jsonb, ${seller ?? {}}::jsonb, ${event ?? {}}::jsonb, ${offer ?? {}}::jsonb,
                ${{ 
                    branding: payload.page_configs || {}, 
                    rules: payload.rules || {}, 
                    faq: payload.page_faqs || [], 
                    consents_rendered: payload.consent_configs || [], 
                    legal_text: c.legal_text_snapshot || {} 
                }}::jsonb, 
                ${payload}::jsonb
            )
          `;
        }
      }

      // PERSISTE NOTIFICAÇÕES NA OUTBOX
      const notifications = (gatewayResult as any).raw?.notifications;
      if (Array.isArray(notifications)) {
        for (const n of notifications) {
          await t`
            INSERT INTO public.notification_outbox (
              context_type, visit_id, visit_update_id, simulation_id, simulation_update_id, 
              channel, template_slug, recipient_type, recipient, subject, rendered_content, attachments, raw_payload
            ) VALUES (
              'SIMULATION', ${payload.visit_id || null}, ${payload.visit_update_id || null}, ${simulationId}, ${simulationUpdateId || null},
              ${n.channel}, ${n.template_slug}, ${n.recipient_type}, ${n.recipient}, 
              ${n.subject || null}, ${n.email_body}, ${n.attachments ?? null}::jsonb, ${n.raw_payload || payload}::jsonb
            )
          `;
        }
      }

      // ATUALIZAÇÃO DO FUNIL DE VISITAS
      if (syncVisit && payload.visit_id) {
        
        await t`
          UPDATE visits 
          SET action = ${action}, 
              action_description = ${action_description ?? null}, 
              updated_at = NOW() 
          WHERE id = ${payload.visit_id}
        `;

        let targetUpdateId = payload.visit_update_id;
        let existingUpdate = null;

        if (targetUpdateId) {
          const [found] = await t`
            SELECT id, action FROM visit_updates 
            WHERE id = ${targetUpdateId} AND visit_id = ${payload.visit_id}
            LIMIT 1
          `;
          existingUpdate = found;
        }

        let finalVisitUpdateId: string;
        const canUpdateConsult = existingUpdate && 
                                 existingUpdate.action === 'CONSULT' && 
                                 (action === 'SIMULATE' || action === 'REDIRECT');

        if (canUpdateConsult) {
          await t`
            UPDATE visit_updates 
            SET action = ${action}, 
                action_description = ${action_description ?? null},
                ip_address = ${infra.ip_address ?? null},
                country = ${infra.country ?? null},
                state = ${infra.state ?? null},
                city = ${infra.city ?? null},
                user_agent = ${infra.user_agent ?? null},
                device_type = ${infra.device_type ?? null},
                operating_system = ${infra.operating_system ?? null},
                origin_details = ${infra}::jsonb,
                raw_payload = ${payload}::jsonb
            WHERE id = ${existingUpdate.id}
          `;
          finalVisitUpdateId = existingUpdate.id;
        } else {
          finalVisitUpdateId = crypto.randomUUID();
          
          await t`
            INSERT INTO visit_updates (
              id, visit_id, partner_id, product_id, utm_source, utm_medium, utm_campaign, 
              action, action_description, origin_url, target_url,
              ip_address, country, state, city, user_agent, device_type, operating_system, origin_details,
              raw_payload, created_at
            )
            VALUES (
              ${finalVisitUpdateId},
              ${payload.visit_id}, 
              ${payload.partner_id ?? null}, 
              ${payload.product_id ?? null}, 
              ${payload.interaction_context?.utm_source || 'direct'},
              ${payload.interaction_context?.utm_medium || null},
              ${payload.interaction_context?.utm_campaign || null},
              ${action}, 
              ${action_description ?? null},
              ${payload.interaction_context?.origin_url || null},
              ${payload.target_url ? payload.target_url.split('?')[0] : null},
              ${infra.ip_address ?? null},
              ${infra.country ?? null},
              ${infra.state ?? null},
              ${infra.city ?? null},
              ${infra.user_agent ?? null},
              ${infra.device_type ?? null},
              ${infra.operating_system ?? null},
              ${infra}::jsonb,
              ${payload}::jsonb,
              NOW()
            )
          `;

          if (payload.offer && Object.keys(payload.offer).length > 0) {
            await t`
              INSERT INTO visit_offers (
                visit_id, visit_update_id, manager_name, manager_details, seller_id, legal_name, 
                economic_group, trade_name, seller_details, event_id, event_description, 
                event_start_date, event_end_date, event_details, offer_id, offer_description, 
                offer_value, category_id, subcategory_id, subcategory, offer_details, created_at
              ) VALUES (
                ${payload.visit_id}, 
                ${finalVisitUpdateId}, 
                ${manager.manager_name ?? null}, 
                ${manager}::jsonb, 
                ${seller.seller_id ?? null}, 
                ${seller.legal_name ?? null}, 
                ${seller.economic_group ?? null}, 
                ${seller.trade_name ?? null}, 
                ${seller}::jsonb, 
                ${event.event_id ?? null}, 
                ${event.event_description ?? null}, 
                ${event.event_start_date ?? null}, 
                ${event.event_end_date ?? null}, 
                ${event}::jsonb, 
                ${offer.offer_id ?? null}, 
                ${offer.offer_description ?? null}, 
                ${offer.offer_value ?? null}, 
                ${offer.category_id ?? null}, 
                ${offer.subcategory_id ? Number(offer.subcategory_id) : null}, 
                ${offer.subcategory ?? null}, 
                ${offer}::jsonb,
                NOW()
              )
            `;
          }
        }

        payload.visit_update_id = finalVisitUpdateId;
      }

      return { 
        simulation_id: simulationId, 
        simulation_update_id: simulationUpdateId 
      };

    });
  } catch (error) {
    console.error("[FATAL] Erro na inserção de dados da simulação:", error);
    throw error;
  }
}

/**
 * ATUALIZA DADOS DA SIMULAÇÃO (UPDATE)
 * @description Modifica uma simulação existente após receber retornos assíncronos do gateway.
 */
export async function updateSimulationData(
  sql: any,
  simulationId: string | number,
  payload: SimulationPayload,
  infra: OriginDetails,
  gatewayResult: SimulationResponse,
  action: string,
  action_description: string,
  step: 'CHECK_ELIGIBILITY' | 'EXECUTE_SIMULATION' = 'EXECUTE_SIMULATION'
): Promise<string | number> {
  try {
    return await sql.begin(async (t: any) => {

      let bestConsult = gatewayResult.consults.find(c => c.is_selected === true) || gatewayResult.consults[0];
      if (!bestConsult.is_selected) bestConsult.is_selected = true;

      const mainResultPartnerId = await resolvePartnerResult(t, payload.partner_id, bestConsult.status_id, bestConsult.message);

      const stageMap: Record<string, number> = { 'CHECK_ELIGIBILITY': 1, 'EXECUTE_SIMULATION': 2 };
      const stageId = stageMap[step];

      for (const consult of gatewayResult.consults) {
        await t`
          INSERT INTO simulation_consults (
            simulation_id, financial_institution_id, requested_value, down_payment_amount,
            down_payment_percentage, financed_amount, installments, cet_rate,
            installment_value, external_operation_id, status_id, simulation_details, raw_payload
          ) VALUES (
            ${simulationId}, ${consult.financial_institution_id?.toString()}, ${consult.requested_value}, ${consult.down_payment_amount},
            ${consult.down_payment_percentage}, ${consult.financed_amount}, ${consult.installments}, ${consult.cet_rate},
            ${consult.installment_value}, ${consult.external_operation_id}, ${consult.status_id}, ${consult}::jsonb, ${payload}::jsonb
          )
        `;
      }

      const [update] = await t`
        INSERT INTO simulation_updates (
          simulation_id, operation, stage_id, status_id, result_partner_id,
          ip_address, country, state, city, user_agent, device_type, operating_system,
          origin_details, simulation_details, raw_payload
        ) VALUES (
          ${simulationId}, 'UPDATE', ${stageId}, ${bestConsult.status_id}, ${mainResultPartnerId},
          ${infra.ip_address}, ${infra.country}, ${infra.state}, ${infra.city}, ${infra.user_agent},
          ${infra.device_type}, ${infra.operating_system}, ${infra}::jsonb, ${bestConsult}::jsonb, ${payload}::jsonb
        )
        RETURNING id
      `;

      const simulationUpdateId = update.id;

      await t`
        UPDATE simulations SET
          status_id = ${bestConsult.status_id},
          stage_id = ${stageId},
          result_partner_id = ${mainResultPartnerId},
          external_operation_id = ${bestConsult.external_operation_id},
          simulation_details = ${gatewayResult}::jsonb,
          raw_payload = ${ { request: payload, response: gatewayResult } }::jsonb,
          updated_at = NOW()
        WHERE id = ${simulationId}
      `;

      const notifications = (gatewayResult as any).raw?.notifications;
      if (Array.isArray(notifications)) {
        for (const n of notifications) {
          await t`
            INSERT INTO public.notification_outbox (
              context_type, visit_id, visit_update_id, simulation_id, simulation_update_id, 
              channel, template_slug, recipient_type, recipient, subject, rendered_content, attachments, raw_payload
            ) VALUES (
              'SIMULATION', ${payload.visit_id || null}, ${payload.visit_update_id || null}, ${simulationId}, ${simulationUpdateId || null},
              ${n.channel}, ${n.template_slug}, ${n.recipient_type}, ${n.recipient}, 
              ${n.subject || null}, ${n.email_body}, ${n.attachments ?? null}::jsonb, ${n.raw_payload || payload}::jsonb
            )
          `;
        }
      }

      return simulationUpdateId;
    });
  } catch (error) {
    console.error("[FATAL] Erro na atualização de dados da simulação:", error);
    throw error;
  }
}