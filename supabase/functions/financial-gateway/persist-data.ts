// Importa o cliente já configurado
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

// Chave de controle para logs de depuração
const DEBUG_MODE = true;

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[ORCHESTRATOR-DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};


/**
 * RESOLVE PARTNER RESULT
 * @description Normaliza retornos brutos de parceiros em IDs estruturados de 8 dígitos.
 * Lógica de ID: [PartnerID(2)][StatusID(2)][Counter(4)]
 * * Esta função opera dentro de uma transação atômica para garantir integridade referencial.
 * * @author Cesar Ismael
 * @param sql - Instância da transação ativa do postgres.js.
 * @param partnerId - ID do parceiro (ex: 1 para Fandi).
 * @param statusId - Status da operação (ex: 1-8).
 * @param rawMessage - Mensagem textual retornada pelo gateway de simulação.
 * @returns {Promise<string | null>} O ID de 8 dígitos gerado ou encontrado, ou null em caso de erro.
 */
export async function resolvePartnerResult(
  sql: any,
  partnerId: number,
  statusId: number | null,
  rawMessage: string | null
): Promise<string | null> {

  // Validação de segurança: Interrompe o processo se dados críticos estiverem ausentes
  if (!rawMessage || !partnerId || !statusId) return null;

  const sanitizedMessage = rawMessage.trim();
  
  try {
    // 1. Busca por um ID existente (Otimização para evitar duplicidade de registros)
    // O uso de `sql` aqui garante que a query rode dentro da mesma transação do fluxo principal
    const [existing] = await sql`
      SELECT id FROM result_partner_types 
      WHERE partner_id = ${partnerId} 
      AND description = ${sanitizedMessage}
      LIMIT 1
    `;

    if (existing) return existing.id;

    // 2. Cálculo do próximo contador para gerar ID sequencial único
    // Conta quantos registros existem para esse parceiro e status para definir o próximo valor
    const [{ count }] = await sql`
      SELECT count(*) as count FROM result_partner_types 
      WHERE partner_id = ${partnerId} 
      AND status_id = ${statusId}
    `;

    const nextCounter = Number(count) + 1;
    
    // 3. Mascaramento rigoroso do ID: [2 dig. Partner][2 dig. Status][4 dig. Contador]
    const pPart = String(partnerId).padStart(2, '0');
    const sPart = String(statusId).padStart(2, '0');
    const cPart = String(nextCounter).padStart(4, '0').slice(-4);
    const newId = `${pPart}${sPart}${cPart}`;

    // 4. Inserção do novo tipo de resultado na tabela de referência
    await sql`
      INSERT INTO result_partner_types (id, partner_id, status_id, description)
      VALUES (${newId}, ${partnerId}, ${statusId}, ${sanitizedMessage})
    `;

    return newId;

  } catch (error) {
    // Registro de erro crítico mantendo o rastreamento da transação
    console.error(`[RESOLVE-PARTNER-RESULT-CRITICAL] Falha ao persistir tipo de parceiro:`, error);
    return null; 
  }
}

/**
 * PERSISTE DADOS DA SIMULAÇÃO (INSERT)
 * @description Executa a escrita primária de uma nova simulação. 
 * Realiza o "Triple-Write" (Simulations, Offers, Updates) de forma atômica.
 * * @param sql - Instância de conexão do postgres.js.
 * @param payload - Objeto completo da jornada contendo entidade, oferta e dados financeiros.
 * @param infra - Metadados de ambiente (Geo, IP, Dispositivo) para auditoria.
 * @param gatewayResult - Resposta do parceiro financeiro (Fandi/Creditas).
 * @param action - Ação disparada (ex: SIMULATE).
 * @param action_description - Rastreabilidade textual da ação.
 * @param step - Etapa do fluxo (Eligibility vs Execution).
 * @returns O ID da simulação criada.
 */
export async function insertSimulationData(
  sql: any,
  payload: SimulationPayload, 
  infra: OriginDetails,
  gatewayResult: SimulationResponse,
  action: 'VISIT' | 'CONSULT' | 'REDIRECT' | 'SIMULATE' | 'CONTACT',
  action_description: string,
  step: 'CHECK_ELIGIBILITY' | 'EXECUTE_SIMULATION' = 'EXECUTE_SIMULATION'
): Promise<{ simulationId: string, simulationUpdateId: string }> {

  try {
    // Abre a transação atômica. Se qualquer um dos inserts abaixo falhar, o postgres.js reverte tudo.
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
      // NOTA: O cast ::jsonb garante que o Postgres trate o objeto nativamente como JSONB, sem barras.
      const [sim] = await t`
        INSERT INTO simulations (
          visit_id, is_integrated, integration_method, partner_id, product_id,
          entity_id, document, name, phone, email, birth_date, gender, entity_details,
          financial_institution_id, requested_value, down_payment_amount, down_payment_percentage,
          financed_amount, installments, cet_rate, installment_value, simulation_details,
          stage_id, status_id, result_partner_id, external_operation_id, raw_payload
        ) VALUES (
          ${payload.visit_id}, ${payload.is_integrated ?? false}, ${payload.integration_method}, ${payload.partner_id}, ${payload.product_id},
          ${entity.entity_id}, ${entity.document}, ${entity.name}, ${entity.phone}, ${entity.email}, ${entity.birth_date}, ${entity.gender}, ${entity}::jsonb,
          ${bestConsult.financial_institution_id}, ${bestConsult.requested_value}, ${bestConsult.down_payment_amount}, ${bestConsult.down_payment_percentage},
          ${bestConsult.financed_amount}, ${bestConsult.installments}, ${bestConsult.cet_rate}, ${bestConsult.installment_value}, ${bestConsult}::jsonb,
          ${stageId}, ${bestConsult.status_id}, ${mainResultPartnerId}, ${bestConsult.external_operation_id}, ${payload}::jsonb
        )
        RETURNING id
      `;

      const simulationId = sim.id;

      // INSERT OFERTA: Persiste o contexto comercial, essencial para auditoria de originação.
      await t`
        INSERT INTO simulation_offers (
          simulation_id, manager_name, manager_details, seller_id, legal_name, 
          trade_name, economic_group, seller_details, event_id, event_description, 
          event_start_date, event_end_date, event_details, offer_id, offer_description, 
          offer_value, category_id, offer_details, raw_payload
        ) VALUES (
          ${simulationId}, ${manager.manager_name || null}, ${manager}::jsonb, ${seller.seller_id || null}, ${seller.legal_name || null},
          ${seller.trade_name || null}, ${seller.economic_group || null}, ${seller}::jsonb, ${event.event_id || null}, ${event.event_description || null},
          ${event.event_start_date || null}, ${event.event_end_date || null}, ${event}::jsonb, ${offer.offer_id || null}, ${offer.offer_description || null},
          ${offer.offer_value || null}, ${offer.category_id || null}, ${offer}::jsonb, ${payload}::jsonb
        )
      `;

      // INSERT UPDATES: Grava o rastro de auditoria da inserção.
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

      // 4. PERSISTE CONSULTAS (Loop Blindado e Completo)
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
            ${payload ?? {}}::jsonb
            )
        `;
      }

      // 5. PERSISTE CONSENTIMENTOS (Padrão Unificado)
      if (consents && consents.length > 0) {
        for (const c of consents) {
          // Normalização: Captura o valor aceito independentemente da nomenclatura
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
                ${payload ?? {}}::jsonb
            )
          `;
        }
      }

      return { 
        simulationId, 
        simulationUpdateId
      };
    });

  } catch (error) {
    console.error("[FATAL] Erro na inserção de dados da simulação:", error);
    throw error;
  }
}

/**
 * ATUALIZA DADOS DA SIMULAÇÃO (UPDATE)
 * @description Modifica uma simulação existente após receber retornos assíncronos
 * do gateway. Adiciona novas entradas em 'simulation_consults' e reflete o novo
 * status na tabela 'simulations'.
 * * @param sql - Instância de conexão do postgres.js.
 * @param simulationId - O ID do registro na tabela 'simulations'.
 * @param payload - Objeto completo com dados do cliente e oferta.
 * @param infra - Metadados de infraestrutura.
 * @param gatewayResult - Retorno do motor de simulação.
 * @param action - Ação da visita.
 * @param action_description - Descrição do rastro.
 */
export async function updateSimulationData(
  sql: any,
  simulationId: string | number,
  payload: SimulationPayload,
  infra: OriginDetails,
  gatewayResult: SimulationResponse,
  action: string,
  action_description: string
): Promise<string | number> {
  try {
    return await sql.begin(async (t: any) => {
      // Define a melhor consultoria para persistência
      let bestConsult = gatewayResult.consults.find(c => c.is_selected === true) || gatewayResult.consults[0];
      if (!bestConsult.is_selected) bestConsult.is_selected = true;

      // Resolve a referência do parceiro dentro da transação atual
      const mainResultPartnerId = await resolvePartnerResult(t, payload.partner_id, bestConsult.status_id, bestConsult.message);

      // INSERT CONSULTAS: Loop para registrar todas as propostas retornadas pelo gateway.
      for (const consult of gatewayResult.consults) {
        await t`
          INSERT INTO simulation_consults (
            simulation_id, financial_institution_id, requested_value, down_payment_amount,
            down_payment_percentage, financed_amount, installments, cet_rate,
            installment_value, external_operation_id, status_id, simulation_details, raw_payload
          ) VALUES (
            ${simulationId}, ${consult.financial_institution_id?.toString()}, ${consult.requested_value}, ${consult.down_payment_amount},
            ${consult.down_payment_percentage}, ${consult.financed_amount}, ${consult.installments}, ${consult.cet_rate},
            ${consult.installment_value}, ${consult.external_operation_id}, ${consult.status_id}, ${consult}::jsonb, ${consult}::jsonb
          )
        `;
      }

      // UPDATE MESTRE: Atualiza os dados financeiros da proposta selecionada.
      await t`
        UPDATE simulations SET
          status_id = ${bestConsult.status_id},
          result_partner_id = ${mainResultPartnerId},
          external_operation_id = ${bestConsult.external_operation_id},
          simulation_details = ${gatewayResult}::jsonb,
          raw_payload = ${ { request: payload, response: gatewayResult } }::jsonb,
          updated_at = NOW()
        WHERE id = ${simulationId}
      `;

      return simulationId;
    });
  } catch (error) {
    console.error("[FATAL] Erro na atualização de dados da simulação:", error);
    throw error;
  }
}



