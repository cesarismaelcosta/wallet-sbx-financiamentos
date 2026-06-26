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
import { persistVisitData } from "./persist-data.ts";
import { sql } from '../_shared/db.ts';

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

  const originData: OriginDetails = {
    ip_address: ip,
    country: geo.country || 'N/A',
    state: geo.state || 'N/A',
    city: geo.city || 'N/A',
    user_agent: ua,
    device_type: device,
    operating_system: os,
    metadata: {
      timestamp: new Date().toISOString(), // Adicionado para cumprir a interface
      tls_version: req.headers.get('x-tls-version') || null // Adicionado para cumprir a interface
    }
  };

  return originData;
}

/**
 * Função: validatePayload
 * @description Valida a integridade total do payload campo a campo.
 * Mantém o rigor da versão original, diferenciando a obrigatoriedade entre VISIT e SIMULATION.
 */
async function validatePayload(
  supabaseClient: any, 
  payload: OrchestratorPayload
): Promise<{ category_id?: number, product_id?: number, action: 'VISIT' | 'CONSULT' | 'REDIRECT' | 'SIMULATE' | 'CONTACT' }> {
  
  const errors: string[] = [];
  let found_category_id: number | undefined;
  let found_product_id: number | undefined = payload.product_id;

  // 1. Definição da Ação e Contexto (Normalização)
  const action = payload.action?.toUpperCase();
  payload.action = action as 'VISIT' | 'CONSULT' | 'REDIRECT' | 'SIMULATE' | 'CONTACT';

  // Identificação e Contexto (Sempre Obrigatório)
  if (!payload.interaction_context?.utm_source) errors.push("interaction_context.utm_source ausente.");
  const source = payload.interaction_context?.utm_source;

  // Valida origin_url no contexto
  if (!payload.interaction_context?.origin_url) {
    errors.push("interaction_context.origin_url ausente.");
  }

  // 2. Validação de origin_url e target_url na raiz (usado pelo persistVisitData)
  if (!payload.origin_url) {
    errors.push("origin_url ausente na raiz do payload. É obrigatório para o roteamento.");
  }

  // target_url para ações de tráfego direto
  // Se for VISIT, REDIRECT ou CONTACT, é o frontend quem está pilotando a navegação. Ele sabe a página que carregou, então ele é obrigado a informar o target_url.
  // Se for SIMULATE, é o backend quem pilota o destino. Então, a validação não exige o target_url de quem fez a chamada.
  if (['VISIT', 'REDIRECT', 'CONTACT'].includes(action)) {
    if (!payload.target_url) {
      errors.push(`target_url ausente. Obrigatório enviar o destino da página para ações do tipo ${action}.`);
    }
  }

  // =========================================================================
  // 3. VALIDAÇÃO DO NÓ: ENTITY (DINÂMICO PF VS PJ)
  // =========================================================================
  if (action === 'SIMULATE' || action === 'CONSULT' || payload.entity) {
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
  // Se 'payload.offer' estiver vazio ou nulo, o sistema entende que é uma jornada direta
  const hasOfferContext = !!payload.offer && (source === 'offer' || !!payload.offer.offer_id);

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
      debugLog("ValidatePayload categoria recebida:" & payload.offer?.category)

      const { data: catData } = await supabaseClient
        .from('category_types')
        .select('id, product_id')
        .ilike('name', `%${payload.offer.category}%`)
        .single();

      debugLog("ValidatePayload encontratndo id da categoria em category_types:" & catData.id)
      
      if (!catData) {
        errors.push(`Categoria '${payload.offer.category}' não mapeada.`);
      } else {
        found_category_id = catData.id;
        payload.offer!.category_id = catData.id;

        // Só atribui se o payload.product_id for nulo, undefined ou vazio
        if (!payload.product_id && catData.product_id) {
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
 * @function resolveDestination
 * @description Resolve o destino de redirecionamento. 
 * Para SIMULATION, busca no banco. Para VISIT, valida e retorna a URL enviada.
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
): Promise<{ 
    orchestrator_config_id?: number,
    url: string, 
    partner_id?: number, 
    is_integrated?: boolean,
    integration_method?: string, 
    integration_details?: any 
}> {
  
  // 1. CASO VISIT: Retorna a URL que veio no payload (ou uma padrão do sistema)
  debugLog(`RESOLVE DESTINATION: Ação ${action} recebida. Iniciando resolução de destino...category: ${categoryId}... product_id: ${productId}... eventId: ${eventId}... sellerId: ${sellerId}... entityDocument: ${entityDocument}`);

  if (action === 'VISIT' || action === 'REDIRECT' || action === 'CONTACT') {
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
        .select('id, page_url, partner_id, is_integrated, integration_method, integration_details, entity_type')
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
        orchestrator_config_id: data.id,
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
 * @function resolveOrchestratorConfigs
 * @description Executa a busca em cascata (Filtro de Prioridade) nas configurações JSONB.
 */
async function resolveOrchestratorConfigs(
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
      const visitUpdateId = url.searchParams.get('visit_update_id');
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

      // 1. Validação de Entrada: Garante que a requisição possui as chaves mestra (visit_id e visit_update_id).
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
          target_url,
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
            category_id,
            offer_details
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
      const orchestratorConfigs = await resolveOrchestratorConfigs(
        supabase,
        visitOfferData.event_details?.event_id,       // Prioridade 1 : evento
        visitOfferData.seller_detaiLs?.seller_id,     // Prioridade 2 : seller
        visitOfferData.category_id,                   // Prioridade 3 : categoria
        visit.product_id,                             // Prioridade 4 : produto
        visitEntityData.document                      // Para filtrar as configs ativas para o perfil correto (PF ou PJ)
      );

      // Bloqueio de segurança caso o banco retorne nulo por falta de amarração de rota
      if (!orchestratorConfigs) {
        throw new Error(`[resolveOrchestratorConfigs]: Configurações não localizadas para o produto/evento/seller/categoria/tipo de documento.`);
      }

      debugLog("PARAMETRIZAÇÕES DO ORCHESTRATOR: ", orchestratorConfigs);

      /**
       * CONTRATO DE HIDRATAÇÃO SIMPLIFICADO (sbX Minimalist)
       * @description Simplifica o acesso aos dados removendo o sufixo _details.
       * @author Cesar Ismael
       */
      const hydratedPayload = {
        visit_id: visit.id,
        visit_update_id: visitUpdateId,
        simulation_id: simulationId || null,
        product_id: visit.product_id,
        partner_id: orchestratorConfigs.partner_id,
        origin_url: visit.origin_url,
        // --- Contexto ---
        interaction_context: {
          utm_source: visit.utm_source,
          utm_medium: visit.utm_medium,
          utm_campaign: visit.utm_campaign,
          origin_url: visit.origin_url,
        },
        target_url: visit.target_url,
        // --- Entidades (Ajustado para a nova tabela visit_entities) ---
        entity: visitEntityData.entity_details || {},
        manager: visitOfferData.manager_details || {},
        seller: visitOfferData.seller_details || {},
        event: visitOfferData.event_details || {},
        offer: visitOfferData.offer_details || {},

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
          requested_value: visitOfferData.offer_details?.offer_value ? parseFloat(visitOfferData.offer_details.offer_value) : null,
          installments: null,
          down_payment_percentage: orchestratorConfigs?.simulation_rules?.min_down_payment_percentage ?? null, // Sem fallback numérico fixo
          down_payment_amount: (visitOfferData.offer_details?.offer_value && orchestratorConfigs?.simulation_rules?.min_down_payment_percentage)
            ? (parseFloat(visitOfferData.offer_details.offer_value) * (orchestratorConfigs?.simulation_rules?.min_down_payment_percentage / 100)) 
            : null
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
      debugLog("Payload enviado no 'POST': ", payload)
      
      // 1. Validação do Payload e Definição da Ação (VISIT ou SIMULATION)
      const { category_id, product_id, action } = await validatePayload(supabase, payload);

      debugLog("Retorno validatePayload: ", category_id)
      debugLog("Retorno validatePayload: ", product_id)
      debugLog("Retorno validatePayload: ", action)

      // 2. Resolução de Destino (Busca onde o usuário deve pousar)
      const destination = await resolveDestination(
        supabase, 
        action, 
        payload.target_url,
        payload.event?.event_id, 
        payload.seller?.seller_id,
        category_id, 
        product_id,
        payload.entity?.document   // Document para identificar se é PF ou PJ
      );

      payload.target_url = destination.url; // Garantimos que o payload tenha a URL final para o log de navegação
      payload.is_integrated = destination.is_integrated; // Injetamos a informação de integração para uso futuro
      payload.integration_method = destination.integration_method;
      payload.integration_details = destination.integration_details;
      payload.partner_id = destination.partner_id; // Amarração direta para atualização do campo partner_id na visita, facilitando análises futuras por parceiro

      debugLog("DESTINO RESOLVIDO: ", destination);
      debugLog("PAYLOAD APÓS RESOLUÇÃO DE DESTINO: partnet_id ", payload.partner_id);

      // 3. Persistência (Usa o visit_id que mapeamos na interface)
      // Aqui ele faz o "One-Shot" para não duplicar sua visita.
      const { visitId, visitUpdateId } = await persistVisitData(
        sql, 
        payload, 
        infra, 
        category_id, 
        payload.action,
        payload.origin_url,
        destination.url,
        payload.visit_id,
        destination.orchestrator_config_id
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
        partner_id: payload.partner_id 
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