/**
 * @fileoverview SIMULATION HANDLER - CAMADA DE NORMALIZAÇÃO E PERSISTÊNCIA
 * @path supabase/functions/financial-gateway/simulation-handler.ts
 * 
 * @author Cesar Ismael Pereira da Costa
 * @description Este módulo atua como o motor transacional do Gateway. Sua função é receber payloads 
 * HIDRATADOS de diversas origens (sbX, sbXPAY, Mobile), normalizar os dados para um esquema plano 
 * (Flat) e garantir a gravação íntegra na tabela 'simulations'.
 * 
 * ============================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: TRUSTED DATA ENGINE
 * ============================================================================
 * [MUDANÇAS ARQUITETURAIS - ZERO TRUST]:
 * 1. {Trusted Input}: Este módulo assume que `payload.entity` e `payload.offer`
 *    foram injetados SERVER-SIDE. Ele opera cego às manipulações do cliente.
 * 2. {Cross-Tampering Defense}: A dupla validação de integridade persiste como 
 *    "Defense in Depth", mas consumindo a Entidade confiável da Hidratação.
 * 3. {Raw Payload Auditing}: Grava no log o "Thin Payload" original enviado pelo 
 *    cliente, preservando o histórico exato do requirimento HTTP.
 * 
 * @version 2.0.0 (Zero-Trust Trusted Data Consumer)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertSimulationData, updateSimulationData } from "./persist-data.ts";
import { sql } from '../_shared/db.ts';
import { validateSimulationIntegrity } from "../_shared/gateKeeper.ts"
import { debugLog } from "../_shared/logger.ts";

import { 
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

import { resolveOrchestratorConfigs } from "../_shared/orchestrator-configs.ts";
import { processSimulationFandi } from "./fandi-service.ts";
import { processSimulationCreditCard } from "./credit-card-service.ts";
import { processSimulationCreditasAutoEquity } from "./creditas-auto-equity-service.ts";
import { captureInfrastructure } from "../_shared/infrastructure.ts";

// CONFIGURAÇÃO DE CORS - LIBERAÇÃO DE TRÁFEGO
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

/**
 * PROCESS SIMULATION HANDLER
 * @description O motor principal de simulação. Atua como o orquestrador de estado e transação:
 * 1. Sanitiza e normaliza dados de entrada.
 * 2. Executa a Persistência Integral (Triple-Write).
 * 3. Delega o processamento financeiro aos parceiros.
 * 4. Resolve o estado da jornada (Consultas vs Simulações).
 * 
 * @param req - Objeto de requisição HTTP (utilizado para extração infra/geo).
 * @param payload - `SimulationPayload` hidratado com os Trusted Types.
 * @param step - Fase do fluxo ('CHECK_ELIGIBILITY' | 'EXECUTE_SIMULATION').
 */
export async function processSimulation(
  req: Request, 
  payload: SimulationPayload, 
  step: 'CHECK_ELIGIBILITY' | 'EXECUTE_SIMULATION' = 'EXECUTE_SIMULATION'
) {

  if (!payload) throw new Error("INVALID_PAYLOAD: Payload não fornecido para a simulação.");

  // =========================================================================
  // 🛡️ ZERO-TRUST GUARD: DEFESA EM PROFUNDIDADE (CROSS-TAMPERING)
  // -------------------------------------------------------------------------
  // [v2.1.0] O Gateway já executou este cruzamento em `mode: "link"` e marcou
  // `__integrity_validated`. Repetir aqui custaria 1-2 roundtrips por simulação
  // sem ganho de segurança (o payload não passou por rede entre os dois pontos).
  // Mantemos a validação para quando o motor é invocado por OUTRO caminho
  // (job, reprocessamento, teste), onde a marca não existe.
  // =========================================================================
  if (!(payload as any).__integrity_validated) {
  try {
    // IMPORTANTE: Aqui usamos o `entity_id` já garantido (Server-Side) pelo Gateway Hydration
    await validateSimulationIntegrity(
      supabase,
      payload.visit_id,
      {
        simulation_id: payload.simulation_id ?? null,
        entity_id: String(payload.entity?.entity_id), // Dado Seguro (Não vem da UI)
        offer_id: payload.offer?.offer_id ?? null     // Dado Seguro (Não vem da UI)
      },
      "link", // Consistência eventual do vínculo visit_offers (waitUntil em voo)
    );
  } catch (err: any) {
    debugLog("🚨 [Motor Simulação] Falha na validação de integridade:", err.message);

    let userMessage = "Ocorreu um erro ao processar sua simulação.";
    let errorCode = "UNKNOWN_ERROR";
    const targetFallback = payload.interaction_context?.origin_url || "/";

    if (err.message.includes("OFFER_NOT_FOUND") || err.message.includes("OFFER_NOT_AVAILABLE")) {
        userMessage = "Esta oferta não está mais disponível ou não foi encontrada.";
        errorCode = "OFFER_NOT_FOUND";
    } else if (err.message.includes("INVALID_RELATIONSHIP")) {
        userMessage = "Você não tem permissão para simular nesta oferta ou carrinho.";
        errorCode = "INVALID_RELATIONSHIP";
    } else if (err.message.includes("FORBIDDEN") || err.message.includes("INVALID_PAYLOAD")) {
        userMessage = "Inconsistência nos dados de segurança (Bloqueio).";
        errorCode = "FORBIDDEN";
    }

    const errorForUI = new Error(userMessage);
    (errorForUI as any).errorCode = errorCode;
    (errorForUI as any).fallback_url = targetFallback;

    throw errorForUI;
  }
  } else {
    debugLog("⚡ [Motor Simulação] Integridade já validada pelo Gateway. Pulando roundtrip duplicado.");
  }

  // Captura informações da origem da chamada (User-Agent, IP, TLS)
  const infra = await captureInfrastructure(req);

  // =========================================================================
  // PASSO 1: EXTRAÇÃO SEGURA (CADA OBJETO AQUI JÁ É "TRUSTED" SERVER-SIDE)
  // =========================================================================
  const entity = (payload.entity as Entity) ?? {};
  const manager = (payload.manager as Manager) ?? {};
  const seller = (payload.seller as Seller) ?? {};
  const event = (payload.event as Event) ?? {};
  const offer = (payload.offer as Offer) ?? {};
  
  // Detalhes financeiros (Os únicos dados que de fato vieram do Front-end: prazos/entradas)
  const simulation = (payload.simulation_details as SimulationFinancials) ?? {};
  const vehicle = (offer as Offer)?.vehicle_details ?? {};

  // ✨ [ZERO-TRUST SERVER-SIDE HYDRATION ROBUSTA]: 
  // Sempre busca as configs do orquestrador e preenche o que estiver faltando no payload.
  const resolvedConfig = await resolveOrchestratorConfigs({
    supabase,
    eventId: event.event_id ?? null,
    sellerId: seller.seller_id ?? null,
    productId: payload.product_id ?? offer.category_id ?? null,
    subcategoryId: offer.subcategory_id ?? null,
    categoryId: offer.category_id ?? null,
    entityType: entity.entity_type ?? "F",
  });

  // Mescla inteligente: mantém o que veio do client/upstream ou aplica o resolvido pelo servidor
  payload.page_configs = (payload.page_configs && Object.keys(payload.page_configs).length > 0) 
    ? payload.page_configs 
    : resolvedConfig.page_configs;

  payload.consent_configs = (Array.isArray(payload.consent_configs) && payload.consent_configs.length > 0) 
    ? payload.consent_configs 
    : resolvedConfig.consent_configs;

  payload.page_faqs = (Array.isArray(payload.page_faqs) && payload.page_faqs.length > 0) 
    ? payload.page_faqs 
    : resolvedConfig.page_faqs;

  payload.rules = (payload.rules && Object.keys(payload.rules).length > 0) 
    ? payload.rules 
    : resolvedConfig.rules;

  payload.is_integrated = payload.is_integrated ?? resolvedConfig.is_integrated;
  payload.integration_method = payload.integration_method ?? resolvedConfig.integration_method;

  // Logging Exclusivo do Servidor (Seguro para Debug)
  debugLog("✅ [Motor Simulação] Payload Confiável Pronto -> ENTITY:", entity.document);
  debugLog("✅ [Motor Simulação] Payload Confiável Pronto -> OFFER:", offer.offer_id);
  debugLog("✅ [Motor Simulação] Payload Confiável Pronto -> SIMULATION:", simulation);

  // =========================================================================
  // PASSO 2: SINCRONIZAÇÃO COM PARCEIROS EXTERNOS (MOTOR DE CRÉDITO)
  // =========================================================================
  let gatewayResult: SimulationResponse | null = null;
  const action = 'SIMULATE'; // Ação master de funil para o Painel

  switch (payload.partner_id) {
    
    case 1: // sbxPAY (Cartão de Crédito)
      payload.simulation_id = payload.simulation_id || crypto.randomUUID();
      
      debugLog("💳 INICIO SIMULAÇÃO CARTÃO: ", payload.simulation_id);
      gatewayResult = await processSimulationCreditCard(payload);
      
      payload.action_description = 'SIMULATE_CONDITIONS';
      
      // Inserção da Simulação no Banco (passando True para sincronizar visitas)
      const resultCC = await insertSimulationData(sql, payload, infra, gatewayResult, action, payload.action_description, 'EXECUTE_SIMULATION', true);
      payload.simulation_update_id = String(resultCC.simulation_update_id);
      break;

    case 2: // Fandi (Financiamento B2B/B2C)
      payload.simulation_id = payload.simulation_id || crypto.randomUUID();

      debugLog("🏢 REQUISITANDO MOTOR INTEGRADO (FANDI API): ", payload.simulation_id);
      gatewayResult = await processSimulationFandi(payload);
      
      payload.action_description = 'SIMULATE_ELIGIBILITY';
      
      const resultFandi = await insertSimulationData(sql, payload, infra, gatewayResult, action, payload.action_description, 'EXECUTE_SIMULATION', true);
      payload.simulation_id = String(resultFandi.simulation_id);
      payload.simulation_update_id = String(resultFandi.simulation_update_id);
      break;

    case 3: // CREDITAS (Garantia de Veículos/Imóveis)
      debugLog(`🏦 INICIO FLUXO CREDITAS - PRODUTO: ${payload.product_id} | FASE: ${step}`, payload.simulation_id);

      if (payload.product_id === 7) { // CAR EQUITY (Auto Equity)
        
        if (step === 'CHECK_ELIGIBILITY') {
          payload.simulation_id = payload.simulation_id || crypto.randomUUID();
                    
          gatewayResult = await processSimulationCreditasAutoEquity(payload, step);
          payload.action_description = 'SIMULATION_CHECK_ELIGIBILITY';
          
          const resultCreditas = await insertSimulationData(sql, payload, infra, gatewayResult, action, payload.action_description, step, true);
          payload.simulation_update_id = String(resultCreditas.simulation_update_id);
          
        } else {
          // EXECUTE_SIMULATION (Fase de cotação final e efetivação)
          gatewayResult = await processSimulationCreditasAutoEquity(payload, step);
          payload.action_description = 'SIMULATE_CONDITIONS';
          
          if (!payload.simulation_id) {
            throw new Error("O simulation_id é obrigatório para avançar à fase de EXECUTE_SIMULATION.");
          }
          
          const simulationUpdateId = await updateSimulationData(sql, payload.simulation_id, payload, infra, gatewayResult, action, payload.action_description, step);
          payload.simulation_update_id = String(simulationUpdateId);
        }
        
      } else if (payload.product_id === 6) { // HOME EQUITY
        debugLog("Fluxo Home Equity ainda não implementado para o Parceiro 3 (Creditas).");
        gatewayResult = {
          success: false,
          message: "Produto Home Equity em implementação.",
          consults: [],
          raw: { error: "Not Implemented" }
        };
      } else {
        throw new Error(`Produto ${payload.product_id} não suportado para o Parceiro 3.`);
      }
      break;

    default:
      throw new Error(
        `BUSINESS_ERROR: Parceiro (ID: ${payload.partner_id}) não configurado no Motor. ` +
        `Config resolvida via ${(payload as any).config_matched_by ?? "nenhum eixo"}.`
      );
  }

  // =========================================================================
  // PASSO 3: CONSOLIDAÇÃO DA RESPOSTA PARA O FRONT-END
  // =========================================================================
  
  // Normaliza o bloco de consultoria vencedor/ativo
  const finalConsult = gatewayResult?.consults?.find(c => c.is_selected === true) || gatewayResult?.consults?.[0];

  const payloadFinal = {
    success: gatewayResult?.success || false,
    status_id: finalConsult?.status_id,
    simulation_id: payload.simulation_id,
    simulation_update_id: payload.simulation_update_id,
    mensagem: gatewayResult?.message,
    consults: gatewayResult?.consults || [],
    // ✨ INCLUSÃO DA HIDRATEÇÃO SERVER-SIDE (O .state que o Front-end precisa)
    state: {
      entity: payload.entity,
      offer: payload.offer,
      seller: payload.seller,
      event: payload.event,
      manager: payload.manager,
      rules: payload.rules,
      page_configs: payload.page_configs,
      consent_configs: payload.consent_configs,
      simulationResult: {
        consults: gatewayResult?.consults || [],
        simulation_id: payload.simulation_id,
        simulation_update_id: payload.simulation_update_id,
      }
    }
  };

  debugLog("📡 [Motor Simulação] JSON FINAL DESPACHADO PARA O GATEWAY HTTP:", JSON.stringify(payloadFinal));

  return payloadFinal;
}