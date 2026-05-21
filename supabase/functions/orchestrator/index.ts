/**
 * ORQUESTRADOR CENTRAL (Gateway de Roteamento)
 * Este módulo atua como a única porta de entrada para todas as interações vindas da Superbid.
 * Sua responsabilidade é garantir que cada "clique" seja devidamente registrado (visita)
 * e direcionado para o destino correto (página de simulação ou parceiro).
 * A página de simulação de cada produto, se houver, chamará o respectivo parceiro.
 * Alguns produtos poderão ser redirecionados para a página do parceiro.
 */

/**
 * @fileoverview Orquestrador de Fluxos - Ponto único de entrada.
 * @description Centraliza o registro de visitas (visits e visit_offers).
 * 
 * @input {JSON} Payload de Entrada (OrchestratorPayload):
 * - entity: { entity_id, name, document, phone, email, birth_date, gender }
 * - interaction_context: { utm_source, origin_url }
 * - product_id: number (Obrigatório para campanhas externas)
 * - manager/seller/event/offer: Snapshots detalhados para persistência em visit_offers.
 * - visit_id: ID da sessão para persistência da jornada.
 * - utm_source: Origem (Ex: 'direct' (entrada direta na página), 'banner', 'whatsapp', 'instagram', 'email').
 * - utm_medium:Meio (Ex: 'cpc', 'push', 'qr-code', 'organic').
 * - utm_campaign: Nome da campanha (Ex: 'cashback_maio', 'lote_400').
 *
 * @output {JSON} Resposta de Roteamento (OrchestratorResponse):
 * - action: "REDIRECT"
 * - url: URL com visit_id injetado para hidratação no destino.
 **/


import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * CONFIGURAÇÕES TÉCNICAS E FLAGS DE AMBIENTE
 */

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


// CONFIGURAÇÃO DE CORS
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * REGRAS DE OBRIGATORIEDADE E INTEGRIDADE:
 * - interaction_context: Sempre obrigatório.
 * - client: Obrigatório para todas as origens.
 * - product_id: Obrigatório se utm_source IN ('banner', 'whatsapp', 'email', 'sms').
 * - category_id: Opcional (se enviado, deve existir em category_types).
 * - event/offer: Obrigatórios se utm_source === 'offer'.
 * - vehicle: Obrigatório se categoria mapeada para 'Caminhões' ou 'Carros'.
 */

/**
 * @interface Origin
 * @description Representa o contexto técnico e geográfico da requisição.
 * Utilizada para as colunas fixas e para o snapshot JSONB 'origin_details'.
 */
interface Origin {
  ip_address: string;
  country: string;
  state: string;
  city: string;
  user_agent: string;
  device_type: string;
  operating_system: string;
  timestamp: string;
  tls_version: string | null;
}

/**
 * @interface Entity
 * @description Representa o proponente. 
 * A mudança para 'number | string' no entity_id é para suportar o tipo TEXT do banco.
 */
interface Entity {
  entity_id: number | string; 
  name: string;
  document: string;
  phone: string;
  email: string;
  birth_date: string; // ISO String ou YYYY-MM-DD
  gender: string;
  [key: string]: any; // Permite campos extras genéricos (ex: renda, profissão)
}

/**
 * @interface Manager
 * @description Representa o operador/gerenciador da oferta (manager_details).
 * Esta entidade é responsável pela operação do leilão ou evento.
 */
interface Manager {
  manager_name: string;
  [key: string]: any; // Captura metadados específicos para a coluna JSONB manager_details
}

/**
 * @interface Seller
 * @description Representa o vendedor/proprietário real do bem (seller_details).
 * Importante para fluxos onde o operador (Manager) é diferente do dono do produto.
 */
interface Seller {
  seller_id: string;
  legal_name: string;
  trade_name: string;
  economic_group: string;
  [key: string]: any; // Captura metadados específicos para a coluna JSONB seller_details/seller_details
}

/**
 * @interface Event
 * @description Snapshot do contexto temporal e descritivo do evento (event_details).
 * Focada estritamente em metadados do leilão ou campanha.
 */
interface Event {
  event_id: string;
  event_description: string;
  event_start_date: string;
  event_end_date: string;
  [key: string]: any; // Captura campos como 'numero_leilao' ou 'tipo_evento' (event_details)
}

/**
 * @interface Vehicle
 * @description Atributos técnicos específicos para o nicho de veículos.
 */
interface Vehicle {
  manufacture_year: number;
  model_year: number;
  fipe_code: string;
  fipe_value?: number;
  [key: string]: any; // Captura cor, placa, chassi ou quilometragem
}

/**
 * @interface Offer
 * @description A oferta comercial genérica. 
 * Não mapeamos detalhes específicos (veículo, imóvel) aqui para manter a 
 * flexibilidade total via index signature.
 */
interface Offer {
  offer_id: string;
  offer_description: string;
  offer_value: number;
  category_id?: number;    // Injetado pelo Orquestrador após o de-para
  category: string;        // Texto vindo do site/sandbox
  [key: string]: any;      // Aqui entrará 'vehicle', 'equity' ou qualquer outro detalhe enviado
}

/**
 * @interface InteractionContext
 * @description Define a origem e o contexto da interação do usuário.
 * É o rastreador que determina as regras de validação que serão aplicadas.
 * 
 * @property {string} utm_source - O canal de entrada:
 *   - 'offer': Clique originado de um lote/item específico no site.
 *   - 'banner', 'whatsapp', 'email', 'sms': Origens de campanhas de marketing.
 * @property {string} origin_url - A URL exata onde o usuário estava (referência de origem).
 */
interface InteractionContext {
  utm_source: 'direct' | 'offer' | 'lp' | 'banner' | 'whatsapp' | 'email' | 'sms';
  utm_medium: 'none' | 'sms' | 'push' | 'qr-code' | 'organic';
  utm_campaign: string;
  origin_url: string;
}

/**
 * @interface OrchestratorPayload
 * @description O contrato mestre de entrada para o ecossistema sbX.
 * Reflete a estrutura de snapshots (details) das novas tabelas.
 */
interface OrchestratorPayload {
  // IDENTIFICAÇÃO (Sempre Obrigatórios)
  interaction_context: InteractionContext;  // Obrigatório: GPS da visita (origem/canal)
  entity?: Entity;                           // Obrigatório: Snapshot do proponente (entity_details)

  // CONTEXTO DE NEGÓCIO (Opcionais na raiz, validados por regra)
  manager?: Manager;  // Obrigatório se utm_source === 'offer' (manager_details)
  seller?: Seller;    // Opcional: Dono do bem (seller_details)
  event?: Event;      // Opcional: Contexto do leilão (event_details)
  offer?: Offer;      // Opcional: Detalhes do bem e preço (offer_details)

  // ROTEAMENTO
  is_integrated?: boolean;                    // Indica se a visita veio de um parceiro integrado (ex: Fandi, Cartão) ou do Sandbox
  integration_method?: string;                // integration_method = 'API', 'EMAIL', 'FILE', 'MANUAL'
  integration_details?: Record<string, any>;  // Permite enviar detalhes específicos do parceiro (ex: nome do parceiro, CNPJ, ponto de venda, webhook URL, etc.)  
  product_id?: number; 
  action?: 'VISIT' | 'SIMULATION';
  visit_id?: string; 
  visit_update_id?: string;         // Identificador da visit_update da página atual
  origin_visit_update_id?: string;  // Identificador da visit_update da página anterior
  simulation_id?: string;
  origin_url?:string;
  target_url?:string;
}

/**
 * @interface OrchestratorResponse
 * @description Define o comando de saída enviado pelo Orquestrador para o cliente.
 * Determina como a transição de contexto (redirecionamento) deve ser executada.
 */
interface OrchestratorResponse {
  /**
   * @property {string} action - O tipo de comportamento esperado:
   *   - 'REDIRECT': Navegação direta (ex: via location.href).
   *   - 'POST_REDIRECT': Requer submissão de formulário via POST (usado para dados sensíveis).
   */
  action: "REDIRECT" | "POST_REDIRECT";

  /** @property {string} url - O destino final já resolvido pela inteligência de roteamento. */
  url: string;

  /** @property {string} method - Método HTTP para a execução da ação ('GET' ou 'POST'). */
  method: "GET" | "POST";

  /**
   * @property {object} payload - Bloco de dados opcional para transporte de contexto.
   * @property {string} payload.visit_id - A chave mestra gerada para rastreabilidade da jornada.
   * @property {any} [payload.key] - Permite injetar outros identificadores necessários na página de destino.
   */
  payload?: {
    visit_id: string;
    [key: string]: any;
  };
}

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
async function captureInfrastructure(req: Request) {
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
  };
}

/**
 * Função: validatePayload
 * @description Valida a integridade total do payload campo a campo.
 * Mantém o rigor da versão original, diferenciando a obrigatoriedade entre VISIT e SIMULATION.
 */
async function validatePayload(
  supabaseClient: any, 
  payload: OrchestratorPayload
): Promise<{ category_id?: number, product_id?: number, action: 'VISIT' | 'SIMULATION' }> {
  
  const errors: string[] = [];
  let found_category_id: number | undefined;
  let found_product_id: number | undefined = payload.product_id;

  // 1. Definição da Ação (Normalização)
  const action = (payload.action?.toUpperCase() === 'SIMULATION') ? 'SIMULATION' : 'VISIT';
  payload.action = action;

  // 2. Identificação e Contexto (Sempre Obrigatório)
  if (!payload.interaction_context?.utm_source) errors.push("interaction_context.utm_source ausente.");
  const source = payload.interaction_context?.utm_source;

  // =========================================================================
  // 3. VALIDAÇÃO DO NÓ: ENTITY (DINÂMICO PF VS PJ)
  // =========================================================================
  if (action === 'SIMULATION' || payload.entity) {
    if (!payload.entity?.entity_id) errors.push("entity.entity_id ausente.");
    if (!payload.entity?.name) errors.push("entity.name ausente.");
    if (!payload.entity?.document) errors.push("entity.document ausente.");
    if (!payload.entity?.phone) errors.push("entity.phone ausente.");
    if (!payload.entity?.email) errors.push("entity.email ausente.");

    // Higieniza o documento para analisar o tamanho do rastro real
    const cleanDoc = String(payload.entity?.document || "").replace(/\D/g, "");
    const isPJ = cleanDoc.length === 14;

    // Se NÃO for PJ (ou seja, for conta PF), aplica obrigatoriedade estrita
    if (!isPJ) {
      if (!payload.entity?.birth_date) errors.push("entity.birth_date ausente. Campo obrigatório para Pessoa Física (PF).");
      if (!payload.entity?.gender) errors.push("entity.gender ausente. Campo obrigatório para Pessoa Física (PF).");
    } else {
      // Sanitização preventiva para PJ não estourar restrições de coluna do banco no insert
      if (payload.entity) {
        payload.entity.gender = payload.entity.gender || "";
        payload.entity.birth_date = payload.entity.birth_date || "";
      }
    }
  } 

  // =========================================================================
  // 4. VALIDAÇÃO DOS NÓS DE CONTEXTO (OFFER, SELLER, MANAGER, EVENT)
  // =========================================================================
  // Se for SIMULATION ou se a origem for 'offer' ou se o nó 'offer' existir, validamos tudo.
  const hasOfferContext = action === 'SIMULATION' || source === 'offer' || payload.offer;

  if (hasOfferContext) {
    // --- Nó MANAGER ---
    if (!payload.manager?.manager_name) errors.push("manager.manager_name é obrigatório.");

    // --- Nó SELLER ---
    if (!payload.seller?.seller_id) errors.push("seller.seller_id é obrigatório.");
    if (!payload.seller?.legal_name) errors.push("seller.legal_name é obrigatório.");
    if (!payload.seller?.trade_name) errors.push("seller.trade_name é obrigatório.");
    if (!payload.seller?.economic_group) errors.push("seller.economic_group é obrigatório.");

    // --- Nó EVENT ---
    if (!payload.event?.event_id) errors.push("event.event_id é obrigatório.");
    if (!payload.event?.event_description) errors.push("event.event_description é obrigatório.");
    if (!payload.event?.event_start_date) errors.push("event.event_start_date é obrigatório.");
    if (!payload.event?.event_end_date) errors.push("event.event_end_date é obrigatório.");

    // --- Nó OFFER ---
    if (!payload.offer?.offer_id) errors.push("offer.offer_id é obrigatório.");
    if (!payload.offer?.offer_description) errors.push("offer.offer_description é obrigatório.");
    if (!payload.offer?.offer_value) errors.push("offer.offer_value é obrigatório.");

    // Resolução de Categoria (Se houver texto de categoria)
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

        if (!found_product_id) {
          found_product_id = catData.product_id;
          payload.product_id = catData.product_id;
        }
      }
    }
  }

  // 5. Validação de Canais de Marketing
  if (['banner', 'whatsapp', 'email', 'sms'].includes(source || '') && !found_product_id) {
    errors.push(`Para o canal '${source}', o 'product_id' é obrigatório.`);
  }

  // 6. Lançamento de Erros
  if (errors.length > 0) throw new Error(`[sbX Validation Error]: ${errors.join(" | ")}`);

  return { category_id: found_category_id, product_id: found_product_id, action };
}

/**
 * Função: persistVisitData
 * @description Realiza a persistência atômica e inteligente da jornada sbX.
 * Valida a reentrada via visit_id, evita duplicidade de contexto e garante o log de navegação.
 */
/**
 * Função: persistVisitData
 * @description Realiza a persistência atômica e inteligente da jornada sbX.
 */
async function persistVisitData(
  supabaseClient: any,
  payload: OrchestratorPayload,
  origin: Origin,
  categoryId?: number,
  targetUrl?: string,
  existingVisitId?: string | null
): Promise<{ visitId: string; visitUpdateId: string | undefined }> {
  
  let visitId = existingVisitId;
  let hasEntity = false;
  let hasOffer = false;

  // 1. RESOLUÇÃO DE ORIGEM (A "Ponte" entre páginas)
  // AJUSTE: Não assumimos a URL atual como padrão para evitar origin == target
  let calculatedOriginUrl = "";

  // -------------------------------------------------------------------------
  // 1. VALIDAÇÃO DE JORNADA (ONE-SHOT) OU CRIAÇÃO DE NOVA VISITA
  // -------------------------------------------------------------------------
  if (visitId) {
    debugLog("REENTRADA NA JORNADA - VISIT_ID: ", visitId);

    // BUSCA DO RASTRO ANTERIOR (Prioridade Máxima)
    if (payload.origin_visit_update_id) {
      const { data: lastStep } = await supabaseClient
        .from('visit_updates')
        .select('target_url')
        .eq('id', payload.origin_visit_update_id)
        .eq('visit_id', visitId)
        .maybeSingle();

      if (lastStep?.target_url) {
        calculatedOriginUrl = lastStep.target_url;
        debugLog("ORIGEM RECUPERADA PELO UPDATE_ID: ", calculatedOriginUrl);
      }
    }

    // FALLBACK 1: Se não achou o ID do rastro, mas o front mandou uma origin_url diferente da atual
    if (!calculatedOriginUrl && payload.interaction_context?.origin_url) {
       if (payload.interaction_context.origin_url.split('?')[0] !== targetUrl.split('?')[0]) {
         calculatedOriginUrl = payload.interaction_context.origin_url;
       }
    }
    
    // FALLBACK 2: Se ainda está vazio (ex: F5 na página), usamos o referrer ou deixamos vazio
    if (!calculatedOriginUrl) {
       calculatedOriginUrl = payload.origin_url || ""; 
    }

    // Consulta de estado (Entity/Offer)
    const { data: journeyState, error: checkError } = await supabaseClient
      .from('visits')
      .select(`id, visit_entities(id), visit_offers(id)`)
      .eq('id', visitId)
      .maybeSingle();

    if (checkError || !journeyState) {
      // Se o ID é inválido, forçamos a criação de uma nova visita
      visitId = null;
    } else {
      hasEntity = journeyState.visit_entities?.length > 0;
      hasOffer = journeyState.visit_offers?.length > 0;

      // Atualiza a visita pai com o contexto atual
      await supabaseClient
        .from('visits')
        .update({ 
          product_id: payload?.product_id || null,
          partner_id: payload?.partner_id || null
        })
        .eq('id', visitId);
    }
  }

  // Se não temos visitId (novo ou inválido), criamos a âncora
  if (!visitId) {
    const { data: newVisit, error: insertError } = await supabaseClient
      .from('visits')
      .insert([{
        product_id: payload.product_id,
        utm_source: payload.interaction_context?.utm_source || 'direct',
        utm_medium: payload.interaction_context?.utm_medium || null,
        utm_campaign: payload.interaction_context?.utm_campaign || null,
        origin_url: (calculatedOriginUrl || "").split('?')[0],
        target_url: (targetUrl || "").split('?')[0],
        action: payload.action,
        ip_address: origin.ip_address,
        country: origin.country,
        state: origin.state,
        city: origin.city,
        user_agent: origin.user_agent,
        device_type: origin.device_type,
        operating_system: origin.operating_system,
        origin_details: origin 
      }])
      .select('id')
      .single();

    if (insertError) throw new Error(`Erro ao criar registro de visita: ${insertError.message}`);
    visitId = newVisit.id;
  }

  // -------------------------------------------------------------------------
  // 2. LOG DE NAVEGAÇÃO (VISIT_UPDATES)
  // -------------------------------------------------------------------------
  const { data: updateData, error: updateError } = await supabaseClient
    .from('visit_updates')
    .insert([{
      visit_id: visitId,
      utm_source: payload.interaction_context?.utm_source || 'direct',
      utm_medium: payload.interaction_context?.utm_medium || null,
      utm_campaign: payload.interaction_context?.utm_campaign || null,
      
      // AJUSTE: Usamos a URL calculada (herança) e limpamos o lixo da query string
      origin_url: (calculatedOriginUrl || "").split('?')[0], 
      target_url: (targetUrl || "").split('?')[0],
      
      action: payload.action,
      action_description: payload?.action_description || null
    }])
    .select('id')
    .single();

  debugLog("ATUALIZANDO origin: ", (calculatedOriginUrl || "").split('?')[0]);
  debugLog("ATUALIZANDO target: ", (targetUrl || "").split('?')[0]);
  
  if (updateError) debugLog("Aviso: Erro ao persistir rastro (update):", updateError.message);

  const visitUpdateId = updateData?.id;

  // -------------------------------------------------------------------------
  // 3. PERSISTÊNCIA DE ENTIDADE (CONDICIONAL)
  // -------------------------------------------------------------------------
  if (payload.entity && payload.entity.entity_id && !hasEntity) {
    const { error: entityError } = await supabaseClient
      .from('visit_entities')
      .insert([{
        visit_id: visitId,
        entity_id: payload.entity.entity_id.toString(),
        document: payload.entity.document,
        name: payload.entity.name,
        phone: payload.entity.phone,
        email: payload.entity.email,
        birth_date: payload.entity.birth_date,
        gender: payload.entity.gender,
        entity_details: payload.entity 
      }]);
    if (entityError) debugLog("Aviso: Erro ao persistir entidade:", entityError.message);
  }

  // -------------------------------------------------------------------------
  // 4. PERSISTÊNCIA DE OFERTA (CONDICIONAL)
  // -------------------------------------------------------------------------
  if (payload.offer && payload.offer.offer_id && !hasOffer) {
    const { error: offerError } = await supabaseClient
      .from('visit_offers')
      .insert([{
        visit_id: visitId,
        category_id: categoryId,
        manager_name: payload.manager?.manager_name,
        manager_details: payload.manager,
        seller_id: payload.seller?.seller_id,
        legal_name: payload.seller?.legal_name,
        trade_name: payload.seller?.trade_name,
        economic_group: payload.seller?.economic_group,
        seller_details: payload.seller,
        event_id: payload.event?.event_id,
        event_description: payload.event?.event_description,
        event_start_date: payload.event?.event_start_date,
        event_end_date: payload.event?.event_end_date,
        event_details: payload.event,
        offer_id: payload.offer.offer_id,
        offer_description: payload.offer.offer_description,
        offer_value: payload.offer.offer_value,
        offer_details: payload.offer
      }]);
    if (offerError) debugLog("Aviso: Erro ao persistir oferta:", offerError.message);
  }

  return { 
    visitId: visitId!, 
    visitUpdateId: visitUpdateId
  };
}

/**
 * @function resolveDestination
 * @description Resolve o destino de redirecionamento. 
 * Para SIMULATION, busca no banco. Para VISIT, valida e retorna a URL enviada.
 */
async function resolveDestination(
  supabaseClient: any, 
  action: 'VISIT' | 'SIMULATION',
  payloadTargetUrl?: string, 
  eventId?: string | number, 
  sellerId?: string | number,
  categoryId?: number,
  productId?: number,
  entityDocument?: string
): Promise<{ 
    url: string, 
    partner_id?: number, 
    is_integrated?: boolean,
    integration_method?: string, 
    integration_details?: any 
}> {
  
  // 1. CASO VISIT: Retorna a URL que veio no payload (ou uma padrão do sistema)
  if (action === 'VISIT') {
    if (!payloadTargetUrl) {
      throw new Error("Para ações de 'VISIT', a target_url é obrigatória no payload.");
    }
    return { 
      url: payloadTargetUrl 
    };
  }

  // Identifica o perfil do lead atual ('PF' ou 'PJ') baseando-se no tamanho do documento limpo
  const cleanDoc = String(entityDocument || "").replace(/\D/g, "");
  const currentProfile = cleanDoc.length === 14 ? 'PJ' : 'PF';

  // 2. Hierarquia de prioridades
  const priorities = [
    { type: 'PRODUCT', id: productId ? Number(productId) : undefined },
    { type: 'EVENT', id: eventId ? Number(eventId) : undefined },
    { type: 'SELLER', id: sellerId ? Number(sellerId) : undefined },
    { type: 'CATEGORY', id: categoryId ? Number(categoryId) : undefined }
  ];
  
  for (const priority of priorities) {
    if (priority.id && !isNaN(priority.id)) {
      // Log para conferir o que está saindo para a query
      debugLog(`resolveDestination tentando query: ${priority.type} com ID: ${priority.id}`);
      // Com filtro para respeitar as chaves: 'PF', 'PJ' ou 'PF+PJ' configuradas na tabela
      const { data, error } = await supabaseClient
        .from('orchestrator_configs')
        .select('page_url, partner_id, is_integrated, integration_method, integration_details, entity_type')
        .eq('lookup_id', priority.id)
        .eq('config_type', priority.type)
        .eq('is_active', true)
        .in('entity_type', [currentProfile, 'PF+PJ'])
        .maybeSingle();

      if (error) {
        debugLog(`[ROTEAMENTO AVISO] Erro na query de ${priority.type}:`, error.message);
        continue; // Deu erro no banco, pula para a próxima prioridade
      }

      if (!data) {
        debugLog(`[ROTEAMENTO AVISO] Registro não encontrado para ${priority.type} ID ${priority.id}. Continuando busca...`);
        continue; // e não achou dados, obriga o loop a passar para o próximo item!
      }

      // Se achou o registro, mata a execução do loop e retorna o destino na hora
      debugLog(`[ROTEAMENTO SUCESSO] Match cravado via ${priority.type} -> `, data);
      return { 
        url: data.page_url, 
        partner_id: data.partner_id,
        is_integrated: data.is_integrated,
        integration_method: data.integration_method,
        integration_details: data.integration_details
      };
    }
  }
  
  // Só vai chegar aqui se o loop rodar as 4 prioridades e todas retornarem vazias ou com erro, ou se os IDs forem inválidos (ex: string "undefined" que não é convertida para número).
  throw new Error("Nenhuma configuração de destino ativa encontrada para esta simulação.");
}

/**
 * @function resolveSimulationConfigs
 * @description Executa a busca em cascata (Filtro de Prioridade) nas configurações JSONB.
 */
async function resolveSimulationConfigs(
  supabase: any,
  eventId?: any,
  sellerId?: any,
  categoryId?: any,
  productId?: any,
  entityDocument?: string // Passando o documento para filtrar as configs ativas para o perfil correto (PF ou PJ)
) {

  // 1. Identifica o perfil do lead atual ('PF' ou 'PJ') limpando pontos e traços
  const cleanDoc = String(entityDocument || "").replace(/\D/g, "");
  const currentProfile = cleanDoc.length === 14 ? 'PJ' : 'PF';

  // Define a hierarquia de prioridades
  const priorities = [
    { type: 'PRODUCT', id: productId },
    { type: 'EVENT', id: eventId },
    { type: 'SELLER', id: sellerId },
    { type: 'CATEGORY', id: categoryId }
  ];

  for (const priority of priorities) {
    // Só tenta buscar se o ID existir e não for a string "undefined"
    if (priority.id && priority.id !== "undefined") {
      debugLog(`RESOLVE SIMULATION CONFIG: Consultando configuração via ${priority.type} (ID: ${priority.id})`);
      
      const { data, error } = await supabase
        .from('orchestrator_configs')
        .select('partner_id, rules, consent_configs, page_configs, page_faqs, is_integrated, integration_method, integration_details')
        .eq('lookup_id', Number(priority.id)) 
        .eq('config_type', priority.type)
        .eq('is_active', true)
        .in('entity_type', [currentProfile, 'PF+PJ'])
        .maybeSingle();

      if (error) {
        debugLog("ERRO NA CONSULTA RULES E CONFIGS EM OSQUESTRATOR_CONFIGS: Erro na busca", error.message);
        continue;
      }

      if (data) {
        debugLog("CONSULTA RULES E CONFIGS EM OSQUESTRATOR_CONFIGS:", data);
        return data;
      }
      
      debugLog("CONSULTA RULES E CONFIGS EM OSQUESTRATOR_CONFIGS:", `Nada encontrado para ${priority.type} ID ${priority.id}`);
    }
  }

  debugLog("CONSULTA RULES E CONFIGS EM OSQUESTRATOR_CONFIGS:", "Nenhuma configuração ativa encontrada.");
  return null;
}

/**
 * HANDLER PRINCIPAL: serve
 * @description Ponto de entrada único para requisições da Superbid.
 * Este handler agora opera como um componente de E/S (Entrada e Saída) Bilateral:
 * * 1. MODO LEITURA (GET) - "Hidratação":
 * Recupera o raw_payload usando o visit_id para preencher formulários automaticamente.
 * * 2. MODO ESCRITA (POST) - "Orquestração":
 * Valida, registra a visita e define o destino (redirecionamento).
 */
serve(async (req: Request) => {
    
  /**
   * ETAPA 1: Setup Inicial e CORS
   * Essencial para permitir que o Sandbox (localhost) ou sites externos
   * consumam esta Edge Function.
   */

  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // Inicialização do cliente com Service Role para bypass de RLS
  // Essencial para que o modo GET consiga ler dados protegidos para o Front-end.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: {
        persistSession: false,
      },
    }
  );

  // =========================================================================
  // MODO LEITURA (GET): Hidratação de Contexto (O Pulo do Gato)
  // =========================================================================
  if (req.method === 'GET') {
    try {
      const url = new URL(req.url);
      const visitId = url.searchParams.get('visit_id');
      const simulationId = url.searchParams.get('simulation_id');

      // Se vier simulation_id, buscamos os dados da simulação para hidratar
      let simulationData = null;
      if (simulationId) {
        const { data: sim, error: simError } = await supabase
          .from('simulations')
          .select('*')
          .eq('id', simulationId)
          .single();
        
        if (!simError) simulationData = sim;
      }

      // 1. Validação de Entrada: Garante que a requisição possui a chave mestra (visit_id).
      if (!visitId) throw new Error("O parâmetro 'visit_id' é obrigatório.");

      // 2. BUSCA PROFUNDA (Join Nativo):
      // Consultamos a tabela 'visits' e trazemos via relacionamento a 'visit_entities' e 'visit_offers'.
      // O snapshot JSONB 'entity_details' é a nossa fonte primária de verdade.
      const { data: visit, error: visitError } = await supabase
        .from('visits')
        .select(`
          id,
          product_id,
          partner_id,
          utm_source,
          utm_medium,
          utm_campaign,
          origin_url,
          visit_entities (
            entity_id,
            name,
            document,
            phone,
            email,
            birth_date,
            gender,
            entity_details
          ),
          visit_offers (
            offer_id,
            offer_value,
            manager_details,
            seller_details,
            event_details,
            offer_details,
            category_id
          )
        `)
        .eq('id', visitId)
        .single();

      debugLog("VISIT no GET:", visit);

      // 3. Safety Guard: Bloqueia o processo se a visita não existir ou se houver erro de RLS.
      if (visitError || !visit) {
        console.error("[ORCHESTRATOR ERROR]:", visitError?.message);
        throw new Error("Visita não encontrada ou expirada.");
      }

      // 1. Snapshots dos dados relacionados
      const visitOfferData = visit.visit_offers?.[0] || {};
      const visitEntityData = visit.visit_entities?.[0] || {};

      // 2. BUSCA EM CASCATA: Evento > Seller > Categoria
      const orchestratorConfigs = await resolveSimulationConfigs(
        supabase,
        visitOfferData.event_details?.event_id,       // Prioridade 1 : evento
        visitOfferData.seller_detaiLs?.seller_id,     // Prioridade 2 : seller
        visitOfferData.category_id,                   // Prioridade 3 : categoria
        visit.product_id,                             // Prioridade 4 : produto
        visitEntityData.document                      // Para filtrar as configs ativas para o perfil correto (PF ou PJ)
      );

      // Bloqueio de segurança caso o banco retorne nulo por falta de amarração de rota
      if (!orchestratorConfigs) {
        throw new Error(`[resolveSimulationConfigs]: Configurações não localizadas para o produto/evento/seller/categoria/tipo de documento.`);
      }

      debugLog("PARAMETRIZAÇÕES DO ORCHESTRATOR: ", orchestratorConfigs);

      /**
       * CONTRATO DE HIDRATAÇÃO SIMPLIFICADO (sbX Minimalist)
       * @description Simplifica o acesso aos dados removendo o sufixo _details.
       * @author Engenharia Wallet sbX / Cesar Ismael
       */
      const hydratedPayload = {
        visit_id: visit.id,
        simulation_id: simulationId || null,
        product_id: visit.product_id,
        partner_id: visit.partner_id || orchestratorConfigs.partner_id,
        // --- Contexto ---
        interaction_context: {
          utm_source: visit.utm_source,
          utm_medium: visit.utm_medium,
          utm_campaign: visit.utm_campaign,
          origin_url: visit.origin_url,
        },
        // --- Entidades (Ajustado para a nova tabela visit_entities) ---
        entity: {
          ...visitEntityData.entity_details, // Se você ainda guardar JSONB lá
          entity_id: visitEntityData.entity_id,
          name: visitEntityData.name,
          document: visitEntityData.document,
          phone: visitEntityData.phone,
          email: visitEntityData.email,
          birth_date: visitEntityData.birth_date,
          gender: visitEntityData.gender
        }, 
        manager: visitOfferData.manager_details || {},
        seller: visitOfferData.seller_details || {},
        event: visitOfferData.event_details || {},
        offer: {
          ...visitOfferData.offer_details,
          offer_id: visitOfferData.offer_id,
          offer_value: parseFloat(visitOfferData.offer_value || 0)
        },
        // --- REGRAS DE NEGÓCIO (LIMITES) ---
        // --- INJEÇÃO DOS VALORES CONFIGURADOS NA ROTA ---
        rules: orchestratorConfigs?.rules, 
        consent_configs: orchestratorConfigs?.consent_configs,
        page_configs: orchestratorConfigs?.page_configs,
        page_faqs: orchestratorConfigs?.page_faqs,
        is_integrated: orchestratorConfigs?.is_integrated,
        integration_method: orchestratorConfigs?.integration_method,
        integration_details: orchestratorConfigs?.integration_details,

        simulation_details: simulationData?.simulation_details || {
          requested_value: parseFloat(visitOfferData.offer_value || 0),
          installments: null,
          down_payment_percentage: orchestratorConfigs?.simulation_rules?.min_down_payment_percentage || 20, 
          down_payment_amount: (parseFloat(visitOfferData.offer_value || 0)) * (orchestratorConfigs?.simulation_rules?.min_down_payment_percentage / 100)
        }
      };

      debugLog("HIDRATED PAYLOAD: ", hydratedPayload);

      // Retorno Bilateral: O Front recebe os dados prontos para o 'setForm' ou 'setSimData'.
      return new Response(JSON.stringify(hydratedPayload), {
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (error: any) {
      // Log de Erro: Monitoramento via logs do Supabase Functions.
      console.error(`[Orquestrador GET Error]: ${error.message}`);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  // =========================================================================
  // MODO ESCRITA (POST): Ciclo de Vida do Clique (Orquestração sbX)
  // =========================================================================
  if (req.method === 'POST') {
    try {
      const payload: OrchestratorPayload = await req.json();
      const infra = await captureInfrastructure(req);
      
      debugLog("INFOS DE ORIGEM DA CHAMADA NO 'POST': ", infra)

      // 1. Validação do Payload e Definição da Ação (VISIT ou SIMULATION)
      const { category_id, product_id, action } = await validatePayload(supabase, payload);

      // 2. Resolução de Destino (Busca onde o usuário deve pousar)
      const destination = await resolveDestination(
        supabase, action, payload.target_url,
        payload.event?.event_id, payload.seller?.seller_id,
        category_id, product_id,
        payload.entity?.document   // Document para identificar se é PF ou PJ
      );

      payload.target_url = destination.url; // Garantimos que o payload tenha a URL final para o log de navegação
      payload.is_integrated = destination.is_integrated; // Injetamos a informação de integração para uso futuro
      payload.integration_method = destination.integration_method;
      payload.integration_details = destination.integration_details;

      // 3. Persistência (Usa o visit_id que mapeamos na interface)
      // Aqui ele faz o "One-Shot" para não duplicar sua visita.
      const { visitId, visitUpdateId } = await persistVisitData(
        supabase, 
        payload, 
        infra, 
        category_id, 
        destination.url,
        payload.visit_id // O campo que acabamos de adicionar na interface
      );

      // Captura o simulation_id se ele vier no payload ou na jornada
      const simulationId = payload.simulation_id || null;

      // [AJUSTE NA RESPOSTA FINAL]: Injeção dinâmica do simulation_id na URL
      let finalUrl = `${destination.url}?visit_id=${visitId}&visit_update_id=${visitUpdateId}`;
      if (simulationId) {
        finalUrl += `&simulation_id=${simulationId}`;
      }

      return new Response(JSON.stringify({ 
        action: 'REDIRECT',
        url: finalUrl, 
        visit_id: visitId,
        visit_update_id: visitUpdateId,
        simulation_id: simulationId, // Herança para o estado reativo
        partner_id: destination.partner_id 
      }), { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });

      } catch (error: any) {
        debugLog(`[Orquestrador Error]: ${error.message}`);
        return new Response(JSON.stringify({ 
          error: error.message,
          details: "Erro interno no processamento do pipeline" 
        }), { 
          status: 400, // Evita o 500/503 genérico
          headers: { 
            ...corsHeaders, // Usa os headers definidos no topo
            "Content-Type": "application/json" 
          } 
        });
      }
  }

  // Caso receba um método não suportado (ex: PUT, DELETE)
  return new Response(JSON.stringify({ error: "Método não permitido" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});