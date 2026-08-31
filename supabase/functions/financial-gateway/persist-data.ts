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
 * 2. {Auditoria Uniforme}: O payload mestre de auditoria é gravado de forma
 *    consistente em TODAS as tabelas filhas (consults, updates, offers),
 *    evitando objetos soltos e quebra de relatórios no BI.
 *
 * [MUDANÇAS v2.2.0 - AUDIT PAYLOAD SEM DUPLICAÇÃO DE PII]:
 * 3. {Audit Payload}: `raw_payload` deixa de receber o payload reidratado
 *    INTEIRO e passa a receber `buildAuditPayload(payload)`:
 *      - o THIN original do cliente (IDs, step, simulation_details, consents);
 *      - os blocos de configuração que o Backoffice LÊ de fato do raw_payload:
 *        `page_configs`, `consent_configs`, `page_faqs`, `rules`;
 *      - metadados de proveniência (`hydration_source`, `config_matched_by`).
 *    A PII (nome, CPF, telefone, e-mail, nascimento) e os dados da oferta NÃO
 *    entram: já estão normalizados em `document`/`name`/`phone`/`email`/
 *    `entity_details` e em `simulation_offers.*_details`.
 *    ⚠️ SECURITY REVIEW: gravar o payload enriquecido aqui replicava a PII em
 *    4 tabelas, ampliando a superfície LGPD sem ganho informacional.
 * 4. {Compat Backoffice verificada}: `backoffice.simulations.lazy.tsx` e
 *    `backoffice.consults.lazy.tsx` consomem de `raw_payload` apenas
 *    `page_configs`, `consent_configs` e `page_faqs` — todos preservados na raiz.
 * 5. {BUGFIX}: no UPDATE, `simulations.raw_payload` era sobrescrito por
 *    `{ request, response }`, aninhando `page_configs` sob `request` e
 *    esvaziando as abas de Branding/FAQ/Consentimentos do Backoffice. Agora o
 *    audit payload fica na raiz e a resposta do parceiro em `gateway_response`.
 * 6. {Type Fix}: `insertSimulationData` declarava `{ simulationId,
 *    simulationUpdateId }` mas retorna `{ simulation_id, simulation_update_id }`
 *    (formato consumido pelo `simulation-handler.ts`). Assinatura corrigida.
 * 7. {Exceções deliberadas}: `simulation_consents` mantém PII (prova legal) e
 *    `notification_outbox` mantém o payload cheio no fallback, senão os e-mails
 *    do parceiro renderizariam sem dados do proponente.
 *
 * @author Cesar Ismael Pereira da Costa
 * @author Gemini Pro
 * @version 2.2.0 (Zero-Trust Persistency, PII-lean Audit, Backoffice Compat + Performance)
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
 * BUILD AUDIT PAYLOAD
 * @description Monta o objeto gravado nas colunas `raw_payload`.
 *
 * REGRA: reflete o REQUISITO HTTP (thin, já sanitizado) somado ao CONTEXTO DE
 * RENDERIZAÇÃO que o Backoffice precisa reexibir. Nunca PII.
 *
 * Contrato consumido pelo Backoffice (NÃO remover estas chaves da raiz):
 *   - `page_configs`    -> aba de Branding da simulação
 *   - `consent_configs` -> aba de Consentimentos renderizados
 *   - `page_faqs`       -> aba de FAQ
 */
function buildAuditPayload(payload: SimulationPayload): Record<string, any> {
  const thin = (payload as any).raw_client_payload ?? {
    // Fallback defensivo: se o Gateway não anexou o thin (invocação por job,
    // reprocessamento ou teste), reconstruímos a superfície mínima de IDs.
    visit_id: payload.visit_id ?? null,
    visit_update_id: payload.visit_update_id ?? null,
    offer_id: (payload.offer as Offer)?.offer_id ?? null,
    simulation_id: payload.simulation_id ?? null,
    product_id: payload.product_id ?? null,
    partner_id: payload.partner_id ?? null,
    action: (payload as any).action ?? null,
    action_description: (payload as any).action_description ?? null,
    step: (payload as any).step ?? null,
    target_url: payload.target_url ?? null,
    interaction_context: payload.interaction_context ?? null,
    simulation_details: payload.simulation_details ?? null,
    consents: payload.consents ?? null,
  };

  return {
    ...thin,

    // Contexto de renderização — lido pelo Backoffice a partir do raw_payload.
    page_configs: payload.page_configs ?? {},
    consent_configs: payload.consent_configs ?? [],
    page_faqs: payload.page_faqs ?? [],
    rules: payload.rules ?? {},

    // Roteamento resolvido server-side (sem PII).
    is_integrated: payload.is_integrated ?? false,
    integration_method: payload.integration_method ?? null,

    // Proveniência forense: de onde veio a oferta e qual config casou.
    hydration_source: (payload as any).hydration_source ?? null,
    config_matched_by: (payload as any).config_matched_by ?? null,
    orchestrator_config_id: (payload as any).orchestrator_config_id ?? null,
  };
}

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
): Promise<{ simulation_id: string, simulation_update_id: string }> {

  try {
    return await sql.begin(async (t: any) => {
      
      const entity = (payload.entity as Entity) ?? {};
      const manager = (payload.manager as Manager) ?? {};
      const seller = (payload.seller as Seller) ?? {};
      const event = (payload.event as Event) ?? {};
      const offer = (payload.offer as Offer) ?? {};
      const simulation = (payload.simulation_details as SimulationFinancials) ?? {};
      const consents = payload.consents ?? [];

      const auditPayload = buildAuditPayload(payload);
      
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
          ${stageId}, ${bestConsult.status_id}, ${mainResultPartnerId}, ${bestConsult.external_operation_id}, ${auditPayload}::jsonb
        )
        RETURNING id
      `;
      const simulationId = sim.id;

      // INSERT UPDATES (Precisa rodar antes do promise.all por causa do simulationUpdateId)
      const [update] = await t`
        INSERT INTO simulation_updates (
          simulation_id, operation, stage_id, status_id, result_partner_id,
          ip_address, country, state, city, user_agent, device_type, operating_system,
          origin_details, simulation_details, raw_payload
        ) VALUES (
          ${simulationId}, 'INSERT', ${stageId}, ${bestConsult.status_id}, ${mainResultPartnerId},
          ${infra.ip_address}, ${infra.country}, ${infra.state}, ${infra.city}, ${infra.user_agent},
          ${infra.device_type}, ${infra.operating_system}, ${infra}::jsonb, ${bestConsult}::jsonb, ${auditPayload}::jsonb
        )
        RETURNING id
      `;
      const simulationUpdateId = update.id;

      // =========================================================================
      // 🚀 EXECUÇÃO PARALELA DE I/O (PIPELINING DA REDE)
      // =========================================================================
      const parallelTasks = [];

      // 📦 PERSISTÊNCIA DA OFERTA COM O SEU ON CONFLICT INTACTO
      if (offer && Object.keys(offer).length > 0) {
        parallelTasks.push(t`
          INSERT INTO simulation_offers (
            simulation_id, category_id, subcategory_id, subcategory, manager_name, manager_details, seller_id, legal_name, 
            trade_name, economic_group, seller_details, event_id, event_description, 
            event_start_date, event_end_date, event_details, offer_id, offer_description, 
            offer_value, offer_details, raw_payload
          ) VALUES (
            ${simulationId}, ${offer.category_id || null}, ${offer.subcategory_id ? Number(offer.subcategory_id) : null}, ${offer.subcategory || null}, ${manager.manager_name || null}, ${manager}::jsonb, ${seller.seller_id || null}, ${seller.legal_name || null},
            ${seller.trade_name || null}, ${seller.economic_group || null}, ${seller}::jsonb, ${event.event_id || null}, ${event.event_description || null},
            ${event.event_start_date || null}, ${event.event_end_date || null}, ${event}::jsonb, ${offer.offer_id || null}, ${offer.offer_description || null},
            ${offer.offer_value || null}, ${offer}::jsonb, ${auditPayload}::jsonb
          )
          ON CONFLICT (simulation_id, offer_id) DO UPDATE SET
            category_id = EXCLUDED.category_id,
            subcategory_id = EXCLUDED.subcategory_id,
            subcategory = EXCLUDED.subcategory,
            manager_name = EXCLUDED.manager_name,
            manager_details = EXCLUDED.manager_details,
            seller_id = EXCLUDED.seller_id,
            legal_name = EXCLUDED.legal_name,
            trade_name = EXCLUDED.trade_name,
            economic_group = EXCLUDED.economic_group,
            seller_details = EXCLUDED.seller_details,
            event_id = EXCLUDED.event_id,
            event_description = EXCLUDED.event_description,
            event_start_date = EXCLUDED.event_start_date,
            event_end_date = EXCLUDED.event_end_date,
            event_details = EXCLUDED.event_details,
            offer_description = EXCLUDED.offer_description,
            offer_value = EXCLUDED.offer_value,
            offer_details = EXCLUDED.offer_details
        `);
      }

      // 📦 PERSISTE CONSULTAS (BULK INSERT)
      if (gatewayResult.consults && gatewayResult.consults.length > 0) {
        const consultsRows = gatewayResult.consults.map(consult => ({
            simulation_id: simulationId, 
            financial_institution_id: consult.financial_institution_id?.toString() ?? null, 
            status_id: consult.status_id ?? null, 
            requested_value: consult.requested_value ?? null,
            down_payment_amount: consult.down_payment_amount ?? null,
            down_payment_percentage: consult.down_payment_percentage ?? null,
            financed_amount: consult.financed_amount ?? null,
            installments: consult.installments ?? null,
            cet_rate: consult.cet_rate ?? null,
            installment_value: consult.installment_value ?? null,
            external_operation_id: consult.external_operation_id ?? null,
            simulation_details: t.json(consult ?? {}), 
            raw_payload: t.json(auditPayload)
        }));
        parallelTasks.push(t`INSERT INTO simulation_consults ${t(consultsRows)}`);
      }

      // 📦 PERSISTE CONSENTIMENTOS (BULK INSERT)
      if (consents && consents.length > 0) {
        const consentRows = consents.map(c => {
          const isAccepted = c.accepted === true || c.acceptedConsents === true;
          const acceptedAt = c.accepted_at || c.acceptedConsents_at || new Date().toISOString();
          return {
            simulation_id: simulationId, consent_id: c.consent_id ?? null, accepted: isAccepted, accepted_at: acceptedAt, 
            partner_id: payload.partner_id ?? null, product_id: payload.product_id,
            entity_id: entity.entity_id ?? null, document: entity.document ?? null, name: entity.name ?? null, 
            email: entity.email ?? null, phone: entity.phone ?? null, birth_date: entity.birth_date ?? null, gender: entity.gender ?? null, 
            entity_details: t.json(entity ?? {}), ip_address: infra.ip_address ?? null, country: infra.country ?? null, 
            state: infra.state ?? null, city: infra.city ?? null, user_agent: infra.user_agent ?? null, 
            device_type: infra.device_type ?? null, operating_system: infra.operating_system ?? null,
            origin_details: t.json(infra ?? {}), manager_details: t.json(manager ?? {}), seller_details: t.json(seller ?? {}), 
            event_details: t.json(event ?? {}), offer_details: t.json(offer ?? {}),
            page_snapshot: t.json({ 
                branding: payload.page_configs || {}, rules: payload.rules || {}, faq: payload.page_faqs || [], 
                consents_rendered: payload.consent_configs || [], legal_text: c.legal_text_snapshot || {} 
            }), 
            raw_payload: t.json(payload)
          };
        });
        parallelTasks.push(t`INSERT INTO simulation_consents ${t(consentRows)}`);
      }

      // 📦 PERSISTE NOTIFICAÇÕES (BULK INSERT)
      const notifications = (gatewayResult as any).raw?.notifications;
      if (Array.isArray(notifications) && notifications.length > 0) {
        const notifRows = notifications.map(n => ({
          context_type: 'SIMULATION', visit_id: payload.visit_id || null, visit_update_id: payload.visit_update_id || null,
          simulation_id: simulationId, simulation_update_id: simulationUpdateId || null, channel: n.channel,
          template_slug: n.template_slug, recipient_type: n.recipient_type, recipient: n.recipient,
          subject: n.subject || null, rendered_content: n.email_body, attachments: n.attachments ? t.json(n.attachments) : null,
          raw_payload: t.json(n.raw_payload || payload)
        }));
        parallelTasks.push(t`INSERT INTO public.notification_outbox ${t(notifRows)}`);
      }

      // 📦 ATUALIZAÇÃO DO FUNIL DE VISITAS
      if (syncVisit && payload.visit_id) {
        parallelTasks.push((async () => {
          await t`
            UPDATE visits SET action = ${action}, action_description = ${action_description ?? null}, updated_at = NOW() 
            WHERE id = ${payload.visit_id}
          `;

          let existingUpdate = null;
          if (payload.visit_update_id) {
            const [found] = await t`
              SELECT id, action FROM visit_updates 
              WHERE id = ${payload.visit_update_id} AND visit_id = ${payload.visit_id} LIMIT 1
            `;
            existingUpdate = found;
          }

          let finalVisitUpdateId: string;
          const canUpdateConsult = existingUpdate && existingUpdate.action === 'CONSULT' && (action === 'SIMULATE' || action === 'REDIRECT');

          if (canUpdateConsult) {
            await t`
              UPDATE visit_updates 
              SET action = ${action}, action_description = ${action_description ?? null}, ip_address = ${infra.ip_address ?? null},
                  country = ${infra.country ?? null}, state = ${infra.state ?? null}, city = ${infra.city ?? null},
                  user_agent = ${infra.user_agent ?? null}, device_type = ${infra.device_type ?? null},
                  operating_system = ${infra.operating_system ?? null}, origin_details = ${infra}::jsonb, raw_payload = ${auditPayload}::jsonb
              WHERE id = ${existingUpdate.id}
            `;

            // SEU ON CONFLICT INTACTO NA VISITA
            if (payload.offer && Object.keys(payload.offer).length > 0) {
              await t`
                INSERT INTO visit_offers (
                  visit_id, visit_update_id, manager_name, manager_details, seller_id, legal_name, 
                  economic_group, trade_name, seller_details, event_id, event_description, 
                  event_start_date, event_end_date, event_details, offer_id, offer_description, 
                  offer_value, category_id, subcategory_id, subcategory, offer_details, created_at
                ) VALUES (
                  ${payload.visit_id}, ${existingUpdate.id}, ${manager.manager_name ?? null}, ${manager}::jsonb, 
                  ${seller.seller_id ?? null}, ${seller.legal_name ?? null}, ${seller.economic_group ?? null}, 
                  ${seller.trade_name ?? null}, ${seller}::jsonb, ${event.event_id ?? null}, ${event.event_description ?? null}, 
                  ${event.event_start_date ?? null}, ${event.event_end_date ?? null}, ${event}::jsonb, 
                  ${offer.offer_id ?? null}, ${offer.offer_description ?? null}, ${offer.offer_value ?? null}, 
                  ${offer.category_id ?? null}, ${offer.subcategory_id ? Number(offer.subcategory_id) : null}, 
                  ${offer.subcategory ?? null}, ${offer}::jsonb, NOW()
                )
                ON CONFLICT (visit_id, visit_update_id, offer_id) DO UPDATE SET
                  manager_name = EXCLUDED.manager_name, manager_details = EXCLUDED.manager_details, seller_id = EXCLUDED.seller_id,
                  legal_name = EXCLUDED.legal_name, economic_group = EXCLUDED.economic_group, trade_name = EXCLUDED.trade_name,
                  seller_details = EXCLUDED.seller_details, event_id = EXCLUDED.event_id, event_description = EXCLUDED.event_description,
                  event_start_date = EXCLUDED.event_start_date, event_end_date = EXCLUDED.event_end_date, event_details = EXCLUDED.event_details,
                  offer_description = EXCLUDED.offer_description, offer_value = EXCLUDED.offer_value, category_id = EXCLUDED.category_id,
                  subcategory_id = EXCLUDED.subcategory_id, subcategory = EXCLUDED.subcategory, offer_details = EXCLUDED.offer_details
              `;
            }

            finalVisitUpdateId = existingUpdate.id;
          } else {
            finalVisitUpdateId = crypto.randomUUID();
            
            await t`
              INSERT INTO visit_updates (
                id, visit_id, partner_id, product_id, utm_source, utm_medium, utm_campaign, 
                action, action_description, origin_url, target_url,
                ip_address, country, state, city, user_agent, device_type, operating_system, origin_details,
                raw_payload, created_at
              ) VALUES (
                ${finalVisitUpdateId}, ${payload.visit_id}, ${payload.partner_id ?? null}, ${payload.product_id ?? null}, 
                ${payload.interaction_context?.utm_source || 'direct'}, ${payload.interaction_context?.utm_medium || null},
                ${payload.interaction_context?.utm_campaign || null}, ${action}, ${action_description ?? null},
                ${payload.interaction_context?.origin_url || null}, ${payload.target_url ? payload.target_url.split('?')[0] : null},
                ${infra.ip_address ?? null}, ${infra.country ?? null}, ${infra.state ?? null}, ${infra.city ?? null},
                ${infra.user_agent ?? null}, ${infra.device_type ?? null}, ${infra.operating_system ?? null},
                ${infra}::jsonb, ${auditPayload}::jsonb, NOW()
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
                  ${payload.visit_id}, ${finalVisitUpdateId}, ${manager.manager_name ?? null}, ${manager}::jsonb, 
                  ${seller.seller_id ?? null}, ${seller.legal_name ?? null}, ${seller.economic_group ?? null}, 
                  ${seller.trade_name ?? null}, ${seller}::jsonb, ${event.event_id ?? null}, ${event.event_description ?? null}, 
                  ${event.event_start_date ?? null}, ${event.event_end_date ?? null}, ${event}::jsonb, 
                  ${offer.offer_id ?? null}, ${offer.offer_description ?? null}, ${offer.offer_value ?? null}, 
                  ${offer.category_id ?? null}, ${offer.subcategory_id ? Number(offer.subcategory_id) : null}, 
                  ${offer.subcategory ?? null}, ${offer}::jsonb, NOW()
                )
              `;
            }
          }

          payload.visit_update_id = finalVisitUpdateId;
        })());
      }

      // 🔥 Dispara TODAS as operações independentes juntas
      await Promise.all(parallelTasks);

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

      const auditPayload = buildAuditPayload(payload);

      let bestConsult = gatewayResult.consults.find(c => c.is_selected === true) || gatewayResult.consults[0];
      if (!bestConsult.is_selected) bestConsult.is_selected = true;

      const mainResultPartnerId = await resolvePartnerResult(t, payload.partner_id, bestConsult.status_id, bestConsult.message);

      const stageMap: Record<string, number> = { 'CHECK_ELIGIBILITY': 1, 'EXECUTE_SIMULATION': 2 };
      const stageId = stageMap[step];

      // Insert do Update primeiro para pegar o ID
      const [update] = await t`
        INSERT INTO simulation_updates (
          simulation_id, operation, stage_id, status_id, result_partner_id,
          ip_address, country, state, city, user_agent, device_type, operating_system,
          origin_details, simulation_details, raw_payload
        ) VALUES (
          ${simulationId}, 'UPDATE', ${stageId}, ${bestConsult.status_id}, ${mainResultPartnerId},
          ${infra.ip_address}, ${infra.country}, ${infra.state}, ${infra.city}, ${infra.user_agent},
          ${infra.device_type}, ${infra.operating_system}, ${infra}::jsonb, ${bestConsult}::jsonb, ${auditPayload}::jsonb
        )
        RETURNING id
      `;
      const simulationUpdateId = update.id;

      // =========================================================================
      // 🚀 EXECUÇÃO PARALELA DE I/O (UPDATE)
      // =========================================================================
      const parallelTasks = [];

      parallelTasks.push(t`
        UPDATE simulations SET
          status_id = ${bestConsult.status_id},
          stage_id = ${stageId},
          result_partner_id = ${mainResultPartnerId},
          external_operation_id = ${bestConsult.external_operation_id},
          simulation_details = ${gatewayResult}::jsonb,
          raw_payload = ${ { ...auditPayload, gateway_response: gatewayResult } }::jsonb,
          updated_at = NOW()
        WHERE id = ${simulationId}
      `);

      if (gatewayResult.consults && gatewayResult.consults.length > 0) {
        const consultsRows = gatewayResult.consults.map(consult => ({
          simulation_id: simulationId,
          financial_institution_id: consult.financial_institution_id?.toString() ?? null,
          status_id: consult.status_id ?? null,
          requested_value: consult.requested_value ?? null,
          down_payment_amount: consult.down_payment_amount ?? null,
          down_payment_percentage: consult.down_payment_percentage ?? null,
          financed_amount: consult.financed_amount ?? null,
          installments: consult.installments ?? null,
          cet_rate: consult.cet_rate ?? null,
          installment_value: consult.installment_value ?? null,
          external_operation_id: consult.external_operation_id ?? null,
          simulation_details: t.json(consult ?? {}),
          raw_payload: t.json(auditPayload)
        }));
        parallelTasks.push(t`INSERT INTO simulation_consults ${t(consultsRows)}`);
      }

      const notifications = (gatewayResult as any).raw?.notifications;
      if (Array.isArray(notifications) && notifications.length > 0) {
        const notifRows = notifications.map(n => ({
          context_type: 'SIMULATION', visit_id: payload.visit_id || null, visit_update_id: payload.visit_update_id || null,
          simulation_id: simulationId, simulation_update_id: simulationUpdateId || null, channel: n.channel,
          template_slug: n.template_slug, recipient_type: n.recipient_type, recipient: n.recipient,
          subject: n.subject || null, rendered_content: n.email_body, attachments: n.attachments ? t.json(n.attachments) : null,
          raw_payload: t.json(n.raw_payload || payload)
        }));
        parallelTasks.push(t`INSERT INTO public.notification_outbox ${t(notifRows)}`);
      }

      await Promise.all(parallelTasks);

      return simulationUpdateId;
    });
  } catch (error) {
    console.error("[FATAL] Erro na atualização de dados da simulação:", error);
    throw error;
  }
}