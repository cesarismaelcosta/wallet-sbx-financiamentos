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
import { getSafeRedirectUrl } from "../_shared/security.ts";

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
import { STATUS } from "../_shared/types.ts";

import { resolveOrchestratorConfigs } from "../_shared/orchestrator-configs.ts";
import { processSimulationFandi } from "./fandi-service.ts";
import { processSimulationCreditCard } from "./credit-card-service.ts";
import { isFlowcrediMortgage, processFlowcrediMortgage } from "./flowcredi-mortgage-service.ts";
import { isFlowcrediHomeEquity, processFlowcrediHomeEquity } from "./flowcredi-home-equity-service.ts";
import { isFlowcrediAutoEquity, processFlowcrediAutoEquity } from "./flowcredi-auto-equity-service.ts";
import { isFlowBusinessError } from "./flowcredi-service.ts";
import { captureInfrastructure } from "../_shared/infrastructure.ts";

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
 * @param step - Fase do fluxo ('EXECUTE_SIMULATION' | 'SUBMIT_LEAD').
 */
export async function processSimulation(
  req: Request, 
  payload: SimulationPayload, 
  step: 'EXECUTE_SIMULATION' | 'SUBMIT_LEAD' = 'EXECUTE_SIMULATION'
) {

  if (!payload) throw new Error("INVALID_PAYLOAD: Payload não fornecido para a simulação.");

  // 🚀 [PERFORMANCE]: dispara aqui SEM await — roda em paralelo com a validação
  // de integridade e o resolveOrchestratorConfigs logo abaixo (ambos round-trips
  // de banco), em vez de bloquear a simulação inteira esperando o fallback de
  // geo (ip-api.com) sozinho, na frente da fila. Mesmo padrão já usado no
  // orchestrator/index.ts. Só é `await`ado lá embaixo, no primeiro ponto onde
  // `infra` é de fato consumido (insertSimulationData/updateSimulationData).
  const infraPromise = captureInfrastructure(req);

  // =========================================================================
  // 🛡️ ZERO-TRUST GUARD: DEFESA EM PROFUNDIDADE (CROSS-TAMPERING)
  // -------------------------------------------------------------------------
  // [v2.1.0] O Gateway já executou este cruzamento em `mode: "link"` e marcou
  // `__integrity_validated`. Repetir aqui custaria 1-2 roundtrips por simulação
  // sem ganho de segurança (o payload não passou por rede entre os dois pontos).
  // Mantemos a validação para quando o motor é invocado por OUTRO caminho
  // (job, reprocessamento, teste), onde a marca não existe.
  // =========================================================================
  if (!payload.__integrity_validated) {
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
  } catch (caught: unknown) {
    const err = caught as Error;
    debugLog("🚨 [Motor Simulação] Falha na validação de integridade:", err.message);

    let userMessage = "Ocorreu um erro ao processar sua simulação.";
    let errorCode = "UNKNOWN_ERROR";
    // 🛡️ Previne Open Redirect: origin_url vem do payload do cliente e precisa ser saneado.
    const targetFallback = getSafeRedirectUrl(payload.interaction_context?.origin_url);

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

    const errorForUI: Error & { errorCode?: string; fallback_url?: string } = new Error(userMessage);
    errorForUI.errorCode = errorCode;
    errorForUI.fallback_url = targetFallback;

    throw errorForUI;
  }
  } else {
    debugLog("⚡ [Motor Simulação] Integridade já validada pelo Gateway. Pulando roundtrip duplicado.");
  }

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

  // 🚀 [PERFORMANCE]: só resolve aqui — depois de já ter rodado em paralelo com
  // validateSimulationIntegrity + resolveOrchestratorConfigs acima. Na prática
  // o `await` abaixo tende a ser imediato (a promise já deve ter resolvido).
  const infra = await infraPromise;

  // =========================================================================
  // PASSO 2: SINCRONIZAÇÃO COM PARCEIROS EXTERNOS (MOTOR DE CRÉDITO)
  // =========================================================================
  let gatewayResult: SimulationResponse | null = null;
  const action = 'SIMULATE'; // Ação master de funil para o Painel

  // ✨ FUNÇÃO DE AUTO-CURA: Gera um retorno padronizado quando qualquer parceiro cai.
  const buildFallbackResult = (err: unknown): SimulationResponse => ({
    success: false,
    message: "Serviço indisponível no parceiro no momento.",
    consults: [{
      status_id: STATUS.FALHA, // Falha (status_types 8): parceiro fora do ar / timeout
      is_selected: true,
      message: (err as Error | null | undefined)?.message || "Timeout/Falha na API do Parceiro",
      // Campos do contrato Consultation: gravados no UPDATE/INSERT (postgres.js recusa undefined)
      external_operation_id: null,
      financial_institution_id: null,
      financial_institution_name: null,
      requested_value: null,
      down_payment_amount: null,
      down_payment_percentage: null,
      financed_amount: null,
      installments: null,
      cet_rate: null,
      installment_value: null,
    }],
    raw: { error: (err as Error | null | undefined)?.message, stack: (err as Error | null | undefined)?.stack }
  });

  switch (payload.partner_id) {
    
    // -----------------------------------------------------------------------
    // PARCEIRO 1: sbxPAY (Cartão de Crédito)
    // -----------------------------------------------------------------------
    case 1: 
      payload.simulation_id = payload.simulation_id || crypto.randomUUID();
      payload.action_description = 'SIMULATE_CONDITIONS';
      
      try {
        debugLog("💳 INICIO SIMULAÇÃO CARTÃO: ", payload.simulation_id);
        // 🛡️ Passa `resolvedConfig.rules` explicitamente (nunca `payload.rules`, que pode
        // ter sido ecoado do cliente) — o motor especializado valida contra isso.
        gatewayResult = await processSimulationCreditCard(payload, resolvedConfig.rules ?? {});
      } catch (err: unknown) {
        gatewayResult = buildFallbackResult(err);
        await insertSimulationData(sql, payload, infra, gatewayResult, action, payload.action_description, 'EXECUTE_SIMULATION', true);
        throw err; // Propaga o erro para a UI após garantir a persistência
      }
      
      const resultCC = await insertSimulationData(sql, payload, infra, gatewayResult, action, payload.action_description, 'EXECUTE_SIMULATION', true);
      payload.simulation_update_id = String(resultCC.simulation_update_id);
      break;

    // -----------------------------------------------------------------------
    // PARCEIRO 2: Fandi (Financiamento B2B/B2C)
    // -----------------------------------------------------------------------
    case 2: 
      payload.simulation_id = payload.simulation_id || crypto.randomUUID();
      payload.action_description = 'SIMULATE_ELIGIBILITY';

      try {
        debugLog("🏢 REQUISITANDO MOTOR INTEGRADO (FANDI API): ", payload.simulation_id);
        // 🛡️ Passa `resolvedConfig.rules` explicitamente (nunca `payload.rules`, que pode
        // ter sido ecoado do cliente) — o motor especializado valida ANTES de acionar
        // a API real da Fandi.
        gatewayResult = await processSimulationFandi(payload, resolvedConfig.rules ?? {}, supabase);
      } catch (err: unknown) {
        gatewayResult = buildFallbackResult(err);
        await insertSimulationData(sql, payload, infra, gatewayResult, action, payload.action_description, 'EXECUTE_SIMULATION', true);
        throw err;
      }
      
      const resultFandi = await insertSimulationData(sql, payload, infra, gatewayResult, action, payload.action_description, 'EXECUTE_SIMULATION', true);
      payload.simulation_id = String(resultFandi.simulation_id);
      payload.simulation_update_id = String(resultFandi.simulation_update_id);
      break;

    // -----------------------------------------------------------------------
    // PARCEIRO 3: FLOWCREDI (id que antes era da Creditas) — Garantia de Veículos/Imóveis
    // e Financiamento Imobiliário
    // -----------------------------------------------------------------------
    case 3: 
      debugLog(`🏦 INICIO FLUXO PARCEIRO 3 - PRODUTO: ${payload.product_id} | FASE: ${step}`, payload.simulation_id);

      // 🏠🚗 FLOWCREDI — Financiamento Imobiliário ("mortgage"), Home Equity ("home_equity") e
      // Car Equity ("auto_equity"), ativados por configuração (`rules.flowcredi_product` no
      // orchestrator_configs, nunca pelo front).
      // step EXECUTE_SIMULATION: simular (com as parcelas da melhor condição de cada banco) · SUBMIT_LEAD: enviar o lead.
      // Car Equity não tem simulação: o lead é a primeira chamada, então o simulation_id nasce aqui (vai no refId).
      if (isFlowcrediMortgage(resolvedConfig.rules) || isFlowcrediHomeEquity(resolvedConfig.rules) || isFlowcrediAutoEquity(resolvedConfig.rules)) {
        const processFlow = isFlowcrediMortgage(resolvedConfig.rules)
          ? processFlowcrediMortgage
          : isFlowcrediHomeEquity(resolvedConfig.rules) ? processFlowcrediHomeEquity : processFlowcrediAutoEquity;
        const isNewSimulation = !payload.simulation_id;
        if (isNewSimulation) payload.simulation_id = crypto.randomUUID();
        let flow: Awaited<ReturnType<typeof processFlowcrediMortgage>>;
        try {
          flow = await processFlow(payload, resolvedConfig.rules ?? {}, step);
        } catch (err: unknown) {
          if (isNewSimulation) payload.simulation_id = undefined as unknown as string;
          // Erro de validação (mensagem amigável) não vira registro; falha do parceiro sim.
          if (!isFlowBusinessError(err) && payload.simulation_id) {
            gatewayResult = buildFallbackResult(err);
            await updateSimulationData(sql, payload.simulation_id, payload, infra, gatewayResult, action, 'FLOWCREDI_ERROR', step);
          }
          throw err;
        }

        gatewayResult = flow.result;
        if (!flow.persist) {
          if (isNewSimulation) payload.simulation_id = undefined as unknown as string;
          break;
        }

        payload.action_description = flow.action === 'LEAD' ? 'SUBMIT_PROPOSAL' : 'SIMULATE_CONDITIONS';
        if (isNewSimulation) {
          const resultFlow = await insertSimulationData(sql, payload, infra, gatewayResult, action, payload.action_description, step, true);
          payload.simulation_id = String(resultFlow.simulation_id);
          payload.simulation_update_id = String(resultFlow.simulation_update_id);
        } else {
          const simulationUpdateId = await updateSimulationData(sql, payload.simulation_id, payload, infra, gatewayResult, action, payload.action_description, step);
          payload.simulation_update_id = String(simulationUpdateId);
        }
        break;
      }

      if (Number(payload.product_id) === 7) { // CAR EQUITY sem `rules.flowcredi_product = "auto_equity"`
        throw new Error("Produto temporariamente indisponível.");
      }
      break;

    // -----------------------------------------------------------------------
    // FALLBACK DE ROTEAMENTO
    // -----------------------------------------------------------------------
    default:
      throw new Error(
        `BUSINESS_ERROR: Parceiro (ID: ${payload.partner_id}) não configurado no Motor. ` +
        `Config resolvida via ${payload.config_matched_by ?? "nenhum eixo"}.`
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

  // 🛡️ Não serializar aqui: passar o objeto puro deixa o deepRedact do logger
  // mascarar CPF/nome/etc. Se virar string antes, o mascaramento não enxerga os campos.
  debugLog("📡 [Motor Simulação] JSON FINAL DESPACHADO PARA O GATEWAY HTTP:", payloadFinal);

  return payloadFinal;
}