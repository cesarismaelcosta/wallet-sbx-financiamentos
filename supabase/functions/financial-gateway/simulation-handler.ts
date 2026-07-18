/**
 * SIMULATION HANDLER - CAMADA DE NORMALIZAÇÃO E PERSISTÊNCIA
 * @author Cesar Ismael
 * @description Este módulo atua como o "Sanitizador" do Gateway. Sua função é receber payloads 
 * de diversas origens (sbX, sbXPAY, Mobile, etc), normalizar os dados para um esquema plano (Flat) 
 * e garantir a gravação íntegra na tabela 'simulations'.
 * 
 * --- PILARES TÉCNICOS ---
 * 1. NORMALIZAÇÃO: O "Desempacotador" transforma objetos aninhados em tipos primitivos e seguros.
 * 2. VALIDAÇÃO CONDICIONAL: Implementa travas de negócio específicas por categoria de bem.
 * 3. LOOKUP DE CONFIGURAÇÃO: Resolve IDs de produtos e URLs de parceiros dinamicamente via banco.
 * 4. PERSISTÊNCIA INTEGRAL: Executa o Triple-Write (Simulations, Updates, Opt-in) para compliance.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { insertSimulationData } from "./persist-data.ts";
import { updateSimulationData } from "./persist-data.ts";
import { sql } from '../_shared/db.ts';

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

import { 
  SimulationResponse,
  Consultation, 
  SimulationFinancials, 
  VehicleCollateral, 
  HomeCollateral, 
  SimulationPayload, 
  SimulationConsent, 
  SimulationUpdate 
} from "../_shared/types.ts";

import { processSimulationFandi } from "./fandi-service.ts";
import { processSimulationCreditCard } from "./credit-card-service.ts";
import { processSimulationPartner } from "./partner-service.ts";
import { processSimulationCreditasAutoEquity } from "./creditas-auto-equity-service.ts";

// CONFIGURAÇÃO DE CORS - LIBERAÇÃO DE TRÁFEGO
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * CONFIGURAÇÕES TÉCNICAS E FLAGS DE AMBIENTE
 */

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
import { debugLog } from "../_shared/logger.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

/**
 * Helper para extrair OS e Device básico do User Agent
 */
function parseUserAgent(ua: string) {
  const os = ua.includes('Windows') ? 'Windows' : 
             ua.includes('Mac') ? 'MacOS' : 
             ua.includes('Android') ? 'Android' : 
             ua.includes('iPhone') ? 'iOS' : 'Linux/Other';
             
  const device = ua.includes('Mobi') ? 'Mobile' : 'Desktop';
  return { os, device };
}

/**
 * Captura dados detalhados de infraestrutura e geolocalização.
 * 
 * Lógica de Geo:
 * 1. Tenta recuperar via headers da Cloudflare (produção Supabase).
 * 2. Se falhar (localhost/dev), utiliza o IP-API como fallback.
 * 
 * @param {Request} req - O objeto da requisição HTTP.
 * @returns {Promise<object>} Objeto contendo IP, Geo, OS e Device Type.
 */
async function captureInfrastructure(req: Request): Promise<OriginDetails> {
  const ua = req.headers.get('user-agent') || '';
  // Melhora a captura do IP
  const ip = req.headers.get('x-real-ip') || 
             req.headers.get('cf-connecting-ip') || 
             req.headers.get('x-forwarded-for')?.split(',')[0] || 
             '0.0.0.0';
  
  const { os, device } = parseUserAgent(ua);

  // Tenta capturar dos headers da Vercel/Supabase (mais comuns no Edge)
  let geo = {
    country: req.headers.get('x-vercel-ip-country') || req.headers.get('cf-ipcountry'),
    state: req.headers.get('x-vercel-ip-country-region') || req.headers.get('cf-region'),
    city: req.headers.get('x-vercel-ip-city') || req.headers.get('cf-ipcity')
  };

  // 3. SE ALGUM CAMPO ESTIVER FALTANDO, DISPARA O FALLBACK
  // Mudamos a condição para ser mais agressiva: se não tem cidade ou estado, busca no IP-API
  if (!geo.country || geo.country === 'XX' || !geo.city) {
    try {
      // Importante: se o IP for 0.0.0.0 ou 127.0.0.1, o ip-api não retorna nada útil localmente
      const queryIp = (ip === '0.0.0.0' || ip === '127.0.0.1') ? '' : ip;
      const res = await fetch(`http://ip-api.com/json/${queryIp}?fields=countryCode,regionName,city`);
      const fallback = await res.json();
      
      geo = {
        country: fallback?.countryCode || geo.country || 'N/A',
        state: fallback?.regionName || geo.state || 'N/A',
        city: fallback?.city || geo.city || 'N/A'
      };
    } catch (e) {
      console.warn("[sbX Infrastructure] Falha no fallback de Geo:", e.message);
    }
  }

  return {
    ip_address: ip,
    user_agent: ua,
    country: geo.country,
    state: geo.state,
    city: geo.city,
    operating_system: os,
    device_type: device
  } as OriginDetails;
}


/**
 * Atualiza o estado da jornada na tabela 'visits' e gera um registro de auditoria em 'visit_updates'.
 * * @param supabaseClient - Instância do Supabase Service Role (acesso administrativo).
 * @param visitId - O ID da visita (tabela 'visits') que está sendo atualizado.
 * @param newAction - O novo estado da jornada ('CONSULT' ou 'SIMULATE').
 * @throws Error se a atualização no banco falhar.
 */
async function updateVisitStatus(
  supabaseClient: any, 
  visitId: string, 
  newAction: 'VISIT' | 'CONSULT' | 'REDIRECT' | 'SIMULATE' | 'CONTACT',
  actionDescription: string,
  payload: SimulationPayload
) {
  debugLog(`Atualizando status da visita ${visitId} para: ${newAction}`);

  // 1. Atualiza o estado atual na tabela 'visits' (Painel de Bordo)
  const { error: visitError } = await supabaseClient
    .from('visits')
    .update({ 
      action: newAction,
      action_description: actionDescription,
      updated_at: new Date().toISOString() 
    })
    .eq('id', visitId);

  if (visitError) throw new Error(`Falha ao atualizar status da visita: ${visitError.message}`);
    
  // 2. Registra o rastro histórico na tabela 'visit_updates' (Diário de Bordo)
  const { error: updateError } = await supabaseClient
    .from('visit_updates')
    .insert({
       visit_id: visitId,
       utm_source: payload.interaction_context.utm_source,
       utm_medium: payload.interaction_context.utm_medium,
       utm_campaign: payload.interaction_context.utm_campaign,
       origin_url: payload.interaction_context.origin_url,
       target_url: payload.target_url,
       action: newAction,
       action_description: actionDescription
    });

  if (updateError) debugLog("Aviso: Falha ao registrar log de estado em visit_updates:", updateError.message);
}

/**
 * PROCESS SIMULATION HANDLER
 * @author Cesar Ismael
 * @description O motor principal de simulação. Este módulo atua como o orquestrador de estado e transação:
 * 1. Sanitiza e normaliza dados de entrada (Entities, Offers, Financials).
 * 2. Executa a Persistência Integral (Triple-Write: simulations, updates, consents).
 * 3. Delega o processamento financeiro aos fluxos específicos de parceiros (Fandi, Creditas, etc).
 * 4. Resolve o estado da jornada (Consultas vs Simulações) e normaliza a resposta de saída.
 * 
 * @param req - Objeto de requisição HTTP (utilizado para extração automática de dados de infraestrutura e geo).
 * @param payload - Objeto tipado `SimulationPayload` contendo todos os dados do proponente, oferta e contexto financeiro.
 * @returns Promise<object> - Payload final estruturado com `sucesso`, `simulation_id`, `consults` e a `action` recomendada para o front-end.
 * @throws Error - Dispara exceção em caso de falha na persistência (DB), erro de comunicação com parceiros (Gateway) ou dados inválidos.
 */
export async function processSimulation(req: Request, payload: SimulationPayload, step: 'CHECK_ELIGIBILITY' | 'EXECUTE_SIMULATION' = 'EXECUTE_SIMULATION') {

  if (!payload) throw new Error("Payload vazio.");

  // Pega informações da origem da chamada
  const infra = await captureInfrastructure(req);

  // =========================================================================
  // PASSO 1: PERSISTÊNCIA (MAPEAMENTO PARA TABELA 'simulations')
  // =========================================================================
  // EXTRAÇÃO SEGURA (Blindagem contra undefined/null) ---
  const entity = payload.entity ?? {};
  const manager = (payload.manager as Manager) ?? {};
  const seller = (payload.seller as Seller) ?? {};
  const event = (payload.event as Event) ?? {};
  const offer = (payload.offer as Offer) ?? {};
  const simulation = (payload.simulation_details as SimulationFinancials) ?? {};
  const vehicle = (offer as Offer)?.vehicle_details ?? {};

  // Envia log para o Supabase, se ligado
  debugLog("PAYLOAD RECEBIDO -> PAYLOAD:", payload)
  debugLog("PAYLOAD RECEBIDO -> ENTITY:", entity)
  debugLog("PAYLOAD RECEBIDO -> MANAGER:", manager)
  debugLog("PAYLOAD RECEBIDO -> SELLER:", seller)
  debugLog("PAYLOAD RECEBIDO -> EVENT:", event)
  debugLog("PAYLOAD RECEBIDO -> OFFER:", offer)
  debugLog("PAYLOAD RECEBIDO -> SIMULATION:", simulation)
  debugLog("PAYLOAD RECEBIDO -> VEHICLE:", vehicle)

  // =========================================================================
  // PASSO 3: SINCRONIZAÇÃO COM PARCEIROS EXTERNOS (GATEWAY DE CRÉDITO)
  // =========================================================================

  // Inicialização de variáveis de controle de fluxo
  let gatewayResult: SimulationResponse | null = null;
  let bestConsult: Consultation | null = null; 
  let result_partner_id: number | null = null; 

  // Variável auxiliar no escopo da função processSimulation
  let SimulationId: string | number | null = payload.simulation_id || null;

  // Definição da ação para o painel de visitas (atualizar para SIMULATE)
  const action = 'SIMULATE';

  switch (payload.partner_id) {
    case 1: // sbxPAY
      // Gera o UUID.
      // Geração prévia permite a utilização do simulation_id, por exemplo, em webhooks
      payload.simulation_id = crypto.randomUUID();
      
      debugLog("INICIO SIMULAÇÃO CARTÃO: ", payload);
      gatewayResult = await processSimulationCreditCard(payload);
      const action_description = 'SIMULATE_CONDITIONS';
      payload.action_description = action_description;
      // Insere simulação
      const result = await insertSimulationData(sql, payload, infra, gatewayResult, action, action_description)
      // Atualiza o payload com os IDs reais do banco
      payload.simulation_update_id = String(result.simulation_update_id);
      break;

    case 2: { // Fandi (Integrado ou não)
      const isIntegratedRoute = payload?.is_integrated === true;

      if (isIntegratedRoute) {
        // Gera o UUID.
        // Geração prévia permite a utilização do simulation_id, por exemplo, em webhooks
        payload.simulation_id = crypto.randomUUID();

        debugLog("REQUISITANDO MOTOR INTEGRADO (FANDI API): ", payload);
        gatewayResult = await processSimulationFandi(payload);
        const action_description = 'SIMULATE_ELIGIBILITY';
        payload.action_description = action_description;
        // Insere simulação
        const result = await insertSimulationData(sql, payload, infra, gatewayResult, action, action_description)
        // Atualiza o payload com os IDs reais do banco
        payload.simulation_id = String(result.simulation_id);
        payload.simulation_update_id = String(result.simulation_update_id);
      } else {
        // Gera o UUID.
        // Geração prévia permite a utilização do simulation_id, por exemplo, em webhooks
        payload.simulation_id = crypto.randomUUID();

        debugLog("REQUISITANDO MOTOR LOCAL (SIMULAÇÃO FLUXO PARCEIRO): ", payload);
        gatewayResult = await processSimulationPartner(payload);
        const action_description = 'SIMULATE_CONDITIONS';
        payload.action_description = action_description;
        // Insere simulação
        const result = await insertSimulationData(sql, payload, infra, gatewayResult, action, action_description)
        // Atualiza o payload com os IDs reais do banco
        payload.simulation_update_id = String(result.simulation_update_id);
      }
      break; 
    }

    case 3: { // CREDITAS (Parceiro ID 3)
      debugLog(`INICIO FLUXO CREDITAS - PRODUTO: ${payload.product_id} | FASE: ${payload.step}`, payload);

      if (payload.product_id === 7) { // CAR EQUITY
        if (payload.step === 'CHECK_ELIGIBILITY') {
          // Gera o UUID.
          // Geração prévia permite a utilização do simulation_id, por exemplo, em webhooks
          payload.simulation_id = crypto.randomUUID();
                    
          gatewayResult = await processSimulationCreditasAutoEquity(payload, payload.step);
          const action_description = 'SIMULATION_CHECK_ELIGIBILITY';
          payload.action_description = action_description;
          // Insere simulação
          const result = await insertSimulationData(sql, payload, infra, gatewayResult, action, action_description, payload.step)
          // Atualiza o payload com os IDs reais do banco
          payload.simulation_update_id = String(result.simulation_update_idd);
          debugLog("após inserir em creditas", payload.simulation_id)
        } else {
          // EXECUTE_SIMULATION
          gatewayResult = await processSimulationCreditasAutoEquity(payload, payload.step);
          const action_description = 'SIMULATE_CONDITIONS';
          payload.action_description = action_description;
          debugLog("antes de atualizar em creditas", payload.simulation_id)
          // Atualiza simulação
          const simulationUpdateId = await updateSimulationData(sql, payload.simulation_id, payload, infra, gatewayResult, action, action_description)
          // Atualiza o payload com os IDs reais do banco
          payload.simulation_update_id = simulationUpdateId;
        }
      } else if (payload.product_id === 6) { // HOME EQUITY
        debugLog("Fluxo Home Equity ainda não implementado para o Parceiro 3.");
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
    } // Fim do case 3

    default:
      throw new Error(`Parceiro ${payload.partner_id} não suportado.`);
  }

  // Logo antes de montar o JSON de resposta
  // Isso garante que não dependemos de variáveis de escopo instáveis
  const finalConsult = gatewayResult?.consults?.find(c => c.is_selected === true) || gatewayResult?.consults?.[0];

  const payloadFinal = {
    success: gatewayResult?.success || false,
    status_id: finalConsult?.status_id,
    simulation_id: payload.simulation_id,
    simulation_update_id: payload.simulation_update_id,
    mensagem: gatewayResult?.message,
    consults: gatewayResult?.consults || []
  };

  // LOG PARA VOCÊ CONFERIR NO SUPABASE
  debugLog("JSON FINAL SENDO DESPACHADO:", JSON.stringify(payloadFinal));

  return payloadFinal;
}