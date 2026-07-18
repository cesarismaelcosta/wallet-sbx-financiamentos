/**
 * @file fandi-service.ts
 * @description Especialista em processamento de Webhooks da MeResolve (Fandi).
 * Implementa pipeline de segurança severa (HMAC, TTL, Cross-Tenant) e Idempotência nativa.
 */

// 1. Cliente REST (para leitura rápida com RLS e Outer Joins)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// 2. Driver SQL Transacional (para escritas ACID)
import { sql } from '../_shared/db.ts';

// 3. Utilitários internos
import { captureInfrastructure } from "../_shared/infrastructure.ts";
import { generateSignature } from "../_shared/crypto.ts";

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
import { debugLog } from "../_shared/logger.ts";

// Configurações de Segurança e Negócio
const MAX_AGE_MS = 5 * 60 * 1000;   // 5 minutos - Janela de validade do Webhook
const MERESOLVE_PARTNER_ID = 2;     // ID Oficial do Tenant da Fandi no banco

// ============================================================================
// DATA ACCESS LAYER (DAL) - Transacional
// ============================================================================

/**
 * Atualiza o estado da simulação via Webhook com Atomicidade Total (ACID).
 * Se qualquer instrução falhar, o banco executa ROLLBACK automático.
 */
async function updateSimulationData(
  sql: any,
  simulationId: string,
  simulationUpdateId: string,
  statusFinalId: number,
  financialInstId: number | null,
  infra: any,
  rawPayload: any,
  simulationDetails: any
) {
  try {
    return await sql.begin(async (t: any) => {
      // 1. INSERT UPDATES: Grava o rastro de auditoria vinculando o protocolo único
      const [update] = await t`
        INSERT INTO simulation_updates (
          id,                  -- CORRIGIDO: Forçando a chave primária real
          simulation_id, 
          operation, 
          status_id, 
          stage_id,
          ip_address, 
          country, 
          state, 
          city, 
          user_agent, 
          device_type, 
          operating_system,
          origin_details, 
          simulation_details, 
          raw_payload
        ) VALUES (
          ${simulationUpdateId}, 
          ${simulationId}, 
          'UPDATE', 
          ${statusFinalId}, 
          2, 
          ${infra.ip_address}, 
          ${infra.country}, 
          ${infra.state}, 
          ${infra.city}, 
          ${infra.user_agent},
          ${infra.device_type}, 
          ${infra.operating_system}, 
          ${infra}::jsonb, 
          ${simulationDetails}::jsonb, 
          ${rawPayload}::jsonb
        )
        RETURNING id
      `;

      // 2. UPDATE MESTRE: Atualiza os dados finais da simulação
      await t`
        UPDATE simulations SET
          status_id = ${statusFinalId},
          financial_institution_id = ${financialInstId},
          updated_at = NOW()
        WHERE id = ${simulationId}
      `;

      return update.id;
    });
  } catch (error) {
    console.error("[FATAL] Erro na transação do banco. Rollback executado:", error);
    throw error;
  }
}

// ============================================================================
// BUSINESS LOGIC LAYER (WEBHOOK HANDLER)
// ============================================================================

export async function tratarWebhookFandi(req: Request, params: string[]) {
  // --------------------------------------------------------------------------
  // FASE 1: VALIDAÇÃO DE SEGURANÇA CROSS-ORIGIN E CRIPTOGRÁFICA
  // Evita gasto de processamento e conexões de banco com payloads falsos.
  // --------------------------------------------------------------------------

  const [simulationId, simulationUpdateId, timestampStr, receivedSignature] = params;

  if (!simulationId || !simulationUpdateId || !timestampStr || !receivedSignature) {
    debugLog("Falha estrutural: URL não contém todos os parâmetros de segurança.");
    throw new Error("Parâmetros de segurança ausentes ou mal formatados na URL.");
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp) || (Date.now() - timestamp > MAX_AGE_MS)) {
    debugLog(`Violação temporal: Webhook muito antigo. Timestamp: ${timestampStr}`);
    throw new Error("Janela de validade do Webhook expirada.");
  }

  const MASTER_SECRET = Deno.env.get('WEBHOOK_MASTER_SECRET');
  if (!MASTER_SECRET) {
    throw new Error("Falha crítica: WEBHOOK_MASTER_SECRET não configurado.");
  }

  // Remontamos a string do lacre na mesma ordem da origem
  const expectedPayload = `${simulationId}.${simulationUpdateId}.${timestampStr}`;
  const expectedSignature = await generateSignature(expectedPayload, MASTER_SECRET);

  // Verificação de assinatura
  const encoder = new TextEncoder();
  const expectedBytes = encoder.encode(expectedSignature);
  const receivedBytes = encoder.encode(receivedSignature);

  // Se os tamanhos forem diferentes, a assinatura está errada de cara.
  // A comparação de tamanho não é um problema de timing.
  if (expectedBytes.length !== receivedBytes.length) {
      debugLog("Violação de Integridade: HMAC tamanho incompatível.");
      throw new Error("Assinatura digital inválida.");
  }

  // Compara bytes em tempo constante para evitar ataque de timing
  const isValid = crypto.subtle.timingSafeEqual(expectedBytes, receivedBytes);

  if (!isValid) {
      debugLog("Violação de Integridade: HMAC incompatível.");
      throw new Error("Assinatura digital inválida.");
  }

  // ========================================================================
  // FASE 2: VALIDAÇÃO DE ESTADO NO BANCO DE DADOS (OUTER JOIN)
  // ========================================================================

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Removido o .maybeSingle(). Agora tratamos como array, impossível dar PGRST116.
  const { data: simulations, error: dbError } = await supabase
    .from('simulations')
    .select(`
      id,
      partner_id,
      simulation_updates ( id )
    `)
    .eq('id', simulationId);

  // 1. Tratamento de Erro Real do Banco
  if (dbError) {
    console.error(`[DEBUG-ERRO-DB] Erro ao buscar no banco:`, dbError);
    throw new Error("Falha interna de banco de dados na validação de integridade.");
  }

  // 2. Validação de Existência (Se o array estiver vazio, a simulação não existe)
  if (!simulations || simulations.length === 0) {
    debugLog(`Alerta: Simulação ${simulationId} não localizada.`);
    throw new Error("SIMULATION_NOT_FOUND");
  }

  // Pegamos o objeto único, já que garantimos que o array tem algo
  const simulation = simulations[0];

  // 3. Barreira Cross-Tenant
  if (simulation.partner_id !== MERESOLVE_PARTNER_ID) {
    console.error(`[ALERTA CRÍTICO] Simulação ${simulationId} não pertence à MeResolve! ID: ${simulation.partner_id}`);
    throw new Error("Acesso negado. Conflito de propriedade (Cross-Tenant).");
  }

  // 4. Barreira de Idempotência (Em memória)
  const isDuplicate = simulation.simulation_updates?.some(
    (simulationUpdate: any) => simulationUpdate.id === simulationUpdateId 
  );

  if (isDuplicate) {
    debugLog(`Evento duplicado capturado. Abortando com sucesso silencioso. simulationUpdateId: ${simulationUpdateId}`);
    return { success: true, message: "Evento já registrado", simulation_update_id: simulationUpdateId };
  }

  // --------------------------------------------------------------------------
  // FASE 3: PARSE DO PAYLOAD E LÓGICA DE NEGÓCIO
  // --------------------------------------------------------------------------

  const infra = await captureInfrastructure(req);
  let body: any;

  try {
    body = await req.json();
  } catch (e) {
    debugLog("Violação de formato: Payload JSON inválido.");
    throw new Error("O corpo da requisição não é um JSON válido.");
  }

  debugLog("Segurança validada. Iniciando processamento de negócio.", simulationId);

  const s = body.Simulacao || body.simulacao; 
  const v = body.Veiculo || body.veiculo;     
  
  const bacenOriginal = s?.CodigoBacen || s?.codigoBacen;
  const codigoProposta = body.CodigoProposta || body.codigoProposta;

  const statusFinalId = bacenOriginal ? 1 : 2;
  const financialInstId = bacenOriginal ? parseInt(bacenOriginal, 10) : null;

  const simulationDetails = {
    installments: s?.QuantidadeParcelas || s?.quantidadeParcelas,
    down_payment: s?.ValorEntrada || s?.valorEntrada,
    requested_value: v?.Valor || v?.valor,
    installment_value: s?.ValorParcela || s?.valorParcela,
    financial_institution_name: s?.NomeIF || s?.nomeIF,
    status_fandi: statusFinalId,
    updated_at: new Date().toISOString()
  };

  debugLog(`Avaliação concluída. Bacen: ${bacenOriginal} -> Status: ${statusFinalId}`);

  // --------------------------------------------------------------------------
  // FASE 4: AUDITORIA E CONSOLIDAÇÃO DE DADOS (TRANSAÇÃO SQL)
  // --------------------------------------------------------------------------

  try {
    // Chama a função atômica usando o driver 'sql' puro
    await updateSimulationData(
      sql,
      simulationId,
      simulationUpdateId,
      statusFinalId,
      financialInstId,
      infra,
      body,
      simulationDetails
    );

    debugLog(`Processamento 100% concluído para simulationUpdateId: ${simulationUpdateId}`);

    return { 
      success: true, 
      fandi_id: codigoProposta, 
      status_applied: statusFinalId,
      update_id: simulationUpdateId
    };
  } catch (error) {
    debugLog("Falha ao consolidar dados no banco de dados.", error);
    throw new Error("Falha ao consolidar transação financeira no banco de dados.");
  }
}