/**
 * @fileoverview sbX API Gateway & Orchestrator
 * @module supabase/functions/orchestrator
 * * @description 
 * Ponto de entrada central (Single Point of Entry) para todas as jornadas financeiras e de parceiros.
 * Responsável por gerenciar o ciclo de vida da visita, roteamento inteligente e hidratação de contexto.
 * * * --- ARQUITETURA DE TRANSPORTE (ZERO-URL-STATE) ---
 * Este microsserviço opera sob o padrão de estado atômico e isolado.
 * 1. O servidor NÃO injeta chaves de sessão (visit_id, update_id) na URL de navegação (`target_url`).
 * 2. O payload HTTP (JSON) atua como o único transportador oficial de chaves de identidade.
 * 3. A aplicação cliente (Front-end) é responsável por interceptar o payload, persistir no cofre 
 * (sessionStorage) e executar a navegação limpa, prevenindo o vazamento de estado na History Stack.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { persistVisitData } from "./persist-data.ts";
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

/** ============================================================================
 * CONFIGURAÇÕES GLOBAIS E UTILITÁRIOS
 * ============================================================================ */

const DEBUG_MODE = true;

/**
 * Utilitário central de log. Condicionado à flag de debug para evitar ruído 
 * excessivo nos logs do Supabase em ambiente de produção (se desativado).
 * @param {string} message - Ação ou contexto do log.
 * @param {any} [data] - Objeto de dados para dump (opcional).
 */
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[ORCHESTRATOR-DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

/**
 * Analisador primário de User Agent para classificação de tráfego.
 * @param {string} ua - String bruta do cabeçalho 'user-agent'.
 * @returns {{os: string, device: string}} Classificação macro do dispositivo.
 */
function parseUserAgent(ua: string) {
  const os = ua.includes('Windows') ? 'Windows' : 
             ua.includes('Mac') ? 'MacOS' : 
             ua.includes('Android') ? 'Android' : 
             ua.includes('iPhone') ? 'iOS' : 'Linux/Other';
             
  const device = ua.includes('Mobi') ? 'Mobile' : 'Desktop';
  return { os, device };
}

/** ============================================================================
 * SERVIÇOS DE DOMÍNIO (DOMAIN SERVICES)
 * ============================================================================ */

/**
 * Resolve a identidade e geolocalização do cliente na borda (Edge).
 * Implementa estratégia de fallback: tenta extrair headers do CDN/Gateway primeiro,
 * recorrendo a uma API externa (ip-api) apenas se os dados cruciais estiverem ausentes.
 * * @param {Request} req - Objeto de requisição HTTP nativo do Deno.
 * @returns {Promise<OriginDetails>} Snapshot rastreável da origem do usuário.
 */
async function captureInfrastructure(req: Request): Promise<OriginDetails> {
  const ua = req.headers.get('user-agent') || '';
  
  // Resolução de IP considerando proxies reversos e arquitetura serverless
  const ip = req.headers.get('x-real-ip') || 
             req.headers.get('cf-connecting-ip') || 
             req.headers.get('x-forwarded-for')?.split(',')[0] || 
             '0.0.0.0';
  
  const { os, device } = parseUserAgent(ua);

  // Tentativa Primária: Headers do provedor de infra (Cloudflare / Vercel)
  let geo = {
    country: req.headers.get('x-vercel-ip-country') || req.headers.get('cf-ipcountry'),
    state: req.headers.get('x-vercel-ip-country-region') || req.headers.get('cf-region'),
    city: req.headers.get('x-vercel-ip-city') || req.headers.get('cf-ipcity')
  };

  // Tentativa Secundária (Fallback): Consulta DNS/IP se a infra falhar em identificar
  if (!geo.country || geo.country === 'XX' || !geo.city) {
    try {
      const queryIp = (ip === '0.0.0.0' || ip === '127.0.0.1') ? '' : ip;
      const res = await fetch(`http://ip-api.com/json/${queryIp}?fields=countryCode,regionName,city`);
      const fallback = await res.json();
      
      geo = {
        country: fallback?.countryCode || geo.country || 'N/A',
        state: fallback?.regionName || geo.state || 'N/A',
        city: fallback?.city || geo.city || 'N/A'
      };
    } catch (e: any) {
      console.warn("[sbX Infrastructure] Falha no fallback de Geo:", e.message);
    }
  }

  return {
    ip_address: ip,
    country: geo.country || 'N/A',
    state: geo.state || 'N/A',
    city: geo.city || 'N/A',
    user_agent: ua,
    device_type: device,
    operating_system: os,
    metadata: {
      timestamp: new Date().toISOString(), 
      tls_version: req.headers.get('x-tls-version') || null 
    }
  };
}

/**
 * Validador de Contrato de Entrada (Schema Guard).
 * Assegura que o payload respeita as regras de negócio antes de qualquer acesso ao banco.
 * Lida com a mutação estrutural entre clientes Pessoa Física (PF) e Jurídica (PJ).
 * * @param {any} supabaseClient - Instância conectada do banco de dados.
 * @param {OrchestratorPayload} payload - Corpo da requisição a ser avaliado.
 * @throws {Error} Interrompe a execução caso encontre inconformidades (Validation Error).
 * @returns {Promise<{ category_id?: number, product_id?: number, action: string }>} Contexto sanitarizado.
 */
async function validatePayload(
  supabaseClient: any, 
  payload: OrchestratorPayload
): Promise<{ category_id?: number, product_id?: number, action: 'VISIT' | 'CONSULT' | 'REDIRECT' | 'SIMULATE' | 'CONTACT' }> {
  
  const errors: string[] = [];
  let found_category_id: number | undefined;
  let found_product_id: number | undefined = payload.product_id;

  const action = payload.action?.toUpperCase() as 'VISIT' | 'CONSULT' | 'REDIRECT' | 'SIMULATE' | 'CONTACT';
  payload.action = action;

  // 1. Validações de Roteamento de Origem
  if (!payload.interaction_context?.utm_source) errors.push("interaction_context.utm_source ausente.");
  if (!payload.interaction_context?.origin_url) errors.push("interaction_context.origin_url ausente.");
  if (!payload.origin_url) errors.push("origin_url ausente na raiz do payload. É obrigatório para o roteamento.");
  
  if (['VISIT', 'REDIRECT', 'CONTACT'].includes(action) && !payload.target_url) {
    errors.push(`target_url ausente. Obrigatório enviar o destino da página para ações do tipo ${action}.`);
  }

  // 2. Validações de Entidade (Dynamic PF/PJ Checking)
  if (action === 'SIMULATE' || action === 'CONSULT' || payload.entity) {
    if (!payload.entity?.entity_id) errors.push("entity.entity_id ausente.");
    if (!payload.entity?.name) errors.push("entity.name ausente.");
    if (!payload.entity?.document) errors.push("entity.document ausente.");
    if (!payload.entity?.phone) errors.push("entity.phone ausente.");
    if (!payload.entity?.email) errors.push("entity.email ausente.");

    // Avaliação do tipo de documento pelo tamanho limpo (11 PF / 14 PJ)
    const cleanDoc = String(payload.entity?.document || "").replace(/\D/g, "");
    const isPJ = cleanDoc.length === 14;

    if (!isPJ) {
      if (!payload.entity?.birth_date) errors.push("entity.birth_date ausente (Obrigatório para PF).");
      if (!payload.entity?.gender) errors.push("entity.gender ausente (Obrigatório para PF).");
    } else if (payload.entity) {
      // Previne erros de tipagem no banco ao inserir nulos em campos string
      payload.entity.gender = payload.entity.gender || "";
      payload.entity.birth_date = payload.entity.birth_date || "";
    }
  } 

  // 3. Validações de Oferta e Contexto de Venda
  const source = payload.interaction_context?.utm_source;
  const hasOfferContext = !!payload.offer && (source === 'offer' || !!payload.offer.offer_id);

  if (hasOfferContext) {
    if (!payload.manager?.manager_name) errors.push("manager.manager_name é obrigatório.");
    if (!payload.seller?.seller_id) errors.push("seller.seller_id é obrigatório.");
    if (!payload.seller?.legal_name) errors.push("seller.legal_name é obrigatório.");
    if (!payload.event?.event_id) errors.push("event.event_id é obrigatório.");
    if (!payload.offer?.offer_id) errors.push("offer.offer_id é obrigatório.");
    if (!payload.offer?.offer_value) errors.push("offer.offer_value é obrigatório.");

    // Resolução dinâmica de Category ID via texto
    if (payload.offer?.category) {
      const { data: catData } = await supabaseClient
        .from('category_types')
        .select('id, product_id')
        .ilike('name', `%${payload.offer.category}%`)
        .single();
      
      if (!catData) {
        errors.push(`Categoria '${payload.offer.category}' não mapeada.`);
      } else {
        found_category_id = catData.id;
        payload.offer!.category_id = catData.id;
        
        // Categoria herda product_id se o payload não definir explicitamente
        if (!payload.product_id && catData.product_id) {
          found_product_id = catData.product_id;
          payload.product_id = catData.product_id;
        }
      }
    }
  }

  // 4. Regras de Canais Externos
  if (['banner', 'whatsapp', 'email', 'sms'].includes(source || '') && !found_product_id) {
    errors.push(`Para o canal '${source}', o 'product_id' é obrigatório.`);
  }

  if (errors.length > 0) throw new Error(`[sbX Validation Error]: ${errors.join(" | ")}`);

  return { category_id: found_category_id, product_id: found_product_id, action };
}

/**
 * Resolução Dinâmica de Destino (Routing Engine).
 * Calcula a rota exata de navegação e as configurações de integração baseadas
 * em uma árvore de prioridades rigorosa: Produto > Evento > Seller > Categoria.
 * * @param {any} supabaseClient - Instância do banco.
 * @param {string} action - Ação solicitada no payload.
 * @param {string} [payloadTargetUrl] - URL manual (obrigatória para VISIT).
 * @throws {Error} Caso o fluxo seja SIMULATE e não exista configuração ativa no banco.
 * @returns {Promise<Object>} URL de destino resolvida e metadados de parceria.
 */
async function resolveDestination(
  supabaseClient: any, 
  action: 'VISIT' | 'CONSULT' | 'REDIRECT' | 'SIMULATE' | 'CONTACT',
  payloadTargetUrl?: string, 
  eventId?: string | number, 
  sellerId?: string | number,
  categoryId?: number,
  productId?: number,
  entityDocument?: string
) {
  
  // Fast-track para roteamento estático conduzido pelo Front-end
  if (['VISIT', 'REDIRECT', 'CONTACT'].includes(action)) {
    if (!payloadTargetUrl) throw new Error(`Ação '${action}' requer target_url no payload.`);
    return { url: payloadTargetUrl };
  }

  const cleanDoc = String(entityDocument || "").replace(/\D/g, "");
  const currentProfile = cleanDoc.length === 14 ? 'PJ' : 'PF';

  // Árvore de Prioridade (Cascata de Roteamento)
  const priorities = [
    { type: 'PRODUCT', id: productId ? Number(productId) : undefined },
    { type: 'EVENT', id: eventId ? Number(eventId) : undefined },
    { type: 'SELLER', id: sellerId ? Number(sellerId) : undefined },
    { type: 'CATEGORY', id: categoryId ? Number(categoryId) : undefined }
  ];
  
  for (const priority of priorities) {
    if (priority.id && !isNaN(priority.id)) {
      const { data, error } = await supabaseClient
        .from('orchestrator_configs')
        .select('id, page_url, partner_id, is_integrated, integration_method, integration_details, entity_type')
        .eq('lookup_id', priority.id)
        .eq('config_type', priority.type)
        .eq('is_active', true)
        .in('entity_type', [currentProfile, 'PF+PJ'])
        .maybeSingle();

      if (error || !data) continue; // Tenta o próximo nível hierárquico

      debugLog(`[ROTEAMENTO SUCESSO] Match: ${priority.type} ID ${priority.id}`);
      return { 
        orchestrator_config_id: data.id,
        url: data.page_url, 
        partner_id: data.partner_id,
        is_integrated: data.is_integrated,
        integration_method: data.integration_method,
        integration_details: data.integration_details
      };
    }
  }
  
  throw new Error("Nenhuma configuração de destino ativa encontrada para o contexto atual.");
}

/**
 * Resolução de Configurações (Hydration Engine).
 * Recupera regras de negócio, limites de simulação e UI (branding/FAQ) para o front-end.
 * Utiliza a mesma árvore de prioridade do roteamento.
 */
async function resolveOrchestratorConfigs(
  supabase: any,
  eventId?: any,
  sellerId?: any,
  categoryId?: any,
  productId?: any,
  entityDocument?: string
) {
  const cleanDoc = String(entityDocument || "").replace(/\D/g, "");
  const currentProfile = cleanDoc.length === 14 ? 'PJ' : 'PF';

  const priorities = [
    { type: 'PRODUCT', id: productId },
    { type: 'EVENT', id: eventId },
    { type: 'SELLER', id: sellerId },
    { type: 'CATEGORY', id: categoryId }
  ];

  for (const priority of priorities) {
    if (priority.id && priority.id !== "undefined") {
      const { data, error } = await supabase
        .from('orchestrator_configs')
        .select('partner_id, rules, consent_configs, page_configs, page_faqs, is_integrated, integration_method, integration_details, simulation_rules')
        .eq('lookup_id', Number(priority.id)) 
        .eq('config_type', priority.type)
        .eq('is_active', true)
        .in('entity_type', [currentProfile, 'PF+PJ'])
        .maybeSingle();

      if (!error && data) return data;
    }
  }
  return null;
}

/** ============================================================================
 * GATEWAY HTTP (EDGE FUNCTION HANDLER)
 * ============================================================================ */

serve(async (req: Request) => {
    
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token, x-visit-id, x-visit-update-id, x-simulation-id",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Content-Type": "application/json"
  };

  // Resposta imediata para Preflight (Padrão W3C)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { status: 200, headers: corsHeaders });
  }

  // Cliente operando em Modo Bypass (Service Role) para consolidar dados espalhados
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );

  /**
   * FLUXO DE LEITURA (GET) - HIDRATAÇÃO DO FRONT-END
   * Extrai o contexto do banco de dados baseado na sessão e devolve ao cliente.
   * Totalmente protegido contra exposição de URL; confia exclusivamente nos Headers HTTP.
   */
  if (req.method === 'GET') {
    try {
      const visitId = req.headers.get('x-visit-id');
      const visitUpdateId = req.headers.get('x-visit-update-id');
      const simulationId = req.headers.get('x-simulation-id');
      const sessionToken = req.headers.get("x-session-token");

      // Autenticação Rigorosa de Chamada
      if (!sessionToken) {
        return new Response(JSON.stringify({ code: "AUTH_REQUIRED", message: "Token de sessão ausente." }), { 
          status: 401, headers: corsHeaders 
        });
      }
      if (!visitId) throw new Error("Parâmetro 'x-visit-id' obrigatório no cabeçalho.");

      // Identidade do requisitante
      const jwtPayload = JSON.parse(atob(sessionToken.split('.')[1]));
      const sessionUserId = jwtPayload.sub; 

      // Join Nativo: Recupera a visita e seus instantâneos
      const { data: visit, error: visitError } = await supabase
        .from('visits')
        .select(`
          id, product_id, partner_id, utm_source, utm_medium, utm_campaign, origin_url, target_url,
          visit_entities ( entity_id, name, document, phone, email, birth_date, gender, entity_details ),
          visit_offers ( offer_id, offer_value, manager_details, seller_details, event_details, offer_details, category_id )
        `)
        .eq('id', visitId)
        .single();

      if (visitError || !visit) throw new Error("Visita não encontrada ou expirada.");

      // Cross-User Security Check: Previne que o Usuário A injete o ID da Visita do Usuário B
      const visitEntityData = visit.visit_entities?.[0] || {};
      if (visitEntityData.entity_id && visitEntityData.entity_id !== String(sessionUserId)) {
        return new Response(JSON.stringify({ code: "FORBIDDEN_ACCESS", message: "Acesso negado à sessão." }), { 
          status: 403, headers: corsHeaders 
        });
      }

      const visitOfferData = visit.visit_offers?.[0] || {};
      
      // Construção do Motor de Regras e Branding
      const orchestratorConfigs = await resolveOrchestratorConfigs(
        supabase,
        visitOfferData.event_details?.event_id,       
        visitOfferData.seller_detaiLs?.seller_id,     
        visitOfferData.category_id,                   
        visit.product_id,                             
        visitEntityData.document                      
      );

      if (!orchestratorConfigs) {
        throw new Error("Falha Crítica: Regras e Configurações não localizadas para o contexto.");
      }

      let simulationData = null;
      if (simulationId) {
        const { data: sim } = await supabase.from('simulations').select('*').eq('id', simulationId).single();
        if (sim) simulationData = sim;
      }

      // Montagem do Payload de Hidratação (Retorno Limpo)
      const hydratedPayload = {
        visit_id: visit.id,
        visit_update_id: visitUpdateId,
        simulation_id: simulationId || null,
        product_id: visit.product_id,
        partner_id: orchestratorConfigs.partner_id,
        origin_url: visit.origin_url,
        interaction_context: {
          utm_source: visit.utm_source,
          utm_medium: visit.utm_medium,
          utm_campaign: visit.utm_campaign,
          origin_url: visit.origin_url,
        },
        target_url: visit.target_url,
        entity: visitEntityData.entity_details || {},
        manager: visitOfferData.manager_details || {},
        seller: visitOfferData.seller_details || {},
        event: visitOfferData.event_details || {},
        offer: visitOfferData.offer_details || {},
        rules: orchestratorConfigs?.rules, 
        consent_configs: orchestratorConfigs?.consent_configs,
        page_configs: orchestratorConfigs?.page_configs,
        page_faqs: orchestratorConfigs?.page_faqs,
        is_integrated: orchestratorConfigs?.is_integrated,
        integration_method: orchestratorConfigs?.integration_method,
        integration_details: orchestratorConfigs?.integration_details,
        simulation_details: simulationData?.simulation_details || {
          requested_value: visitOfferData.offer_details?.offer_value ? parseFloat(visitOfferData.offer_details.offer_value) : null,
          installments: null,
          down_payment_percentage: orchestratorConfigs?.simulation_rules?.min_down_payment_percentage ?? null,
          down_payment_amount: (visitOfferData.offer_details?.offer_value && orchestratorConfigs?.simulation_rules?.min_down_payment_percentage)
            ? (parseFloat(visitOfferData.offer_details.offer_value) * (orchestratorConfigs?.simulation_rules?.min_down_payment_percentage / 100)) 
            : null
        }
      };

      return new Response(JSON.stringify(hydratedPayload), { status: 200, headers: corsHeaders });

    } catch (error: any) {
      console.error(`[Orquestrador GET Error]: ${error.message}`);
      return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: corsHeaders });
    }
  }

  /**
   * FLUXO DE ESCRITA (POST) - ORQUESTRAÇÃO DE NAVEGAÇÃO
   * Recebe ações, cadastra snapshots e orienta a UI para qual rota seguir.
   */
  if (req.method === 'POST') {
    try {
      const payload: OrchestratorPayload = await req.json();
      const infra = await captureInfrastructure(req);
      
      const { category_id, product_id, action } = await validatePayload(supabase, payload);

      const destination = await resolveDestination(
        supabase, action, payload.target_url, payload.event?.event_id, 
        payload.seller?.seller_id, category_id, product_id, payload.entity?.document 
      );

      // Injeta variáveis de integração na cadeia de persistência
      payload.target_url = destination.url; 
      payload.is_integrated = destination.is_integrated; 
      payload.integration_method = destination.integration_method;
      payload.integration_details = destination.integration_details;
      payload.partner_id = destination.partner_id; 

      // Gravação Definitiva no Banco (Criação de Entidades e Ofertas Atreladas)
      const { visitId, visitUpdateId } = await persistVisitData(
        sql, payload, infra, category_id, action,
        payload.origin_url, destination.url, payload.visit_id, destination.orchestrator_config_id
      );

      // ARQUITETURA ZERO-URL-STATE (O Retorno)
      // A string de URL enviada para instruir a interface (redirect) não contém chaves sensíveis.
      return new Response(JSON.stringify({ 
        action: 'REDIRECT',
        url: destination.url, 
        visit_id: visitId,
        visit_update_id: visitUpdateId,
        simulation_id: payload.simulation_id || null, 
        partner_id: payload.partner_id 
      }), { status: 200, headers: corsHeaders });

    } catch (error: any) {
      debugLog(`[Orquestrador Error]: ${error.message}`);
      return new Response(JSON.stringify({ 
        error: error.message,
        details: "Erro interno no processamento do pipeline" 
      }), { status: 400, headers: corsHeaders });
    }
  }

  // Falha Segura para métodos verbais desconhecidos (ex: PUT, DELETE)
  return new Response(JSON.stringify({ error: "Método não permitido" }), {
    status: 405, headers: corsHeaders
  });
});