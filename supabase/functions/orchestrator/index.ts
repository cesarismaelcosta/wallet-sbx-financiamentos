/**
 * @fileoverview ORQUESTRADOR CENTRAL (Gateway de Roteamento Bilateral)
 * * ============================================================================
 * ARQUITETURA DE REDE E ROTEAMENTO (sbX Core)
 * ============================================================================
 * Este módulo é o coração do ecossistema sbX. Ele opera como E/S (Entrada/Saída):
 * - MODO LEITURA (GET): Hidrata o front-end com os dados da jornada atual.
 * - MODO ESCRITA (POST): Valida a intenção, registra a visita e define a rota.
 * 
 * @author Cesar Ismael Pereira da Costa
 * @description Single Source of Truth para roteamento dinâmico baseado em regras de negócio (PF/PJ, Parceiros, Canais).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateRequest } from "../_shared/auth.ts";
import { validateVisitOwnership, validateOfferIntegrity } from "../_shared/gatekeeper.ts";
import { persistVisitData } from "./persist-data.ts";
import { sql } from "../_shared/db.ts";
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
  OrchestratorResponse,
} from "../_shared/types.ts";

/**
 * ============================================================================
 * CONFIGURAÇÕES GLOBAIS E SEGURANÇA
 * ============================================================================
 */
const DEBUG_MODE = true;

/**
 * @function debugLog
 * @description Centraliza os logs do pipeline. Em produção, DEBUG_MODE deve ser false
 * para evitar exposição de PII (Personally Identifiable Information) nos logs da Edge Function.
 */
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[ORCHESTRATOR-DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

/**
 * CONFIGURAÇÃO GLOBAL DE CORS (Única Fonte de Verdade)
 * @description Regras estritas de Cross-Origin.
 * A inclusão do 'x-session-token' é vital para o Handshake Zero Trust (Validação de Identidade).
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

/**
 * ============================================================================
 * HELPER FUNCTIONS (Infraestrutura e Validação)
 * ============================================================================
 */

/**
 * @function parseUserAgent
 * @description Extrai Sistema Operacional e Dispositivo básico do cabeçalho da requisição.
 */
function parseUserAgent(ua: string) {
  const os = ua.includes("Windows") ? "Windows"
    : ua.includes("Mac") ? "MacOS"
    : ua.includes("Android") ? "Android"
    : ua.includes("iPhone") ? "iOS"
    : "Linux/Other";
  const device = ua.includes("Mobi") ? "Mobile" : "Desktop";
  return { os, device };
}

/**
 * @function captureInfrastructure
 * @description Captura telemetria e geolocalização do lead.
 * Possui um sistema de Fallback: tenta ler os headers da CDN (Supabase/Vercel).
 * Se falhar (ex: ambiente local), faz uma chamada externa via IP-API.
 */
async function captureInfrastructure(req: Request) {
  const ua = req.headers.get("user-agent") || "";
  const ip = req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0] || "0.0.0.0";
  const { os, device } = parseUserAgent(ua);

  let geo = {
    country: req.headers.get("x-vercel-ip-country") || req.headers.get("cf-ipcountry"),
    state: req.headers.get("x-vercel-ip-country-region") || req.headers.get("cf-region"),
    city: req.headers.get("x-vercel-ip-city") || req.headers.get("cf-ipcity"),
  };

  // Fallback Agressivo de Geolocation
  if (!geo.country || geo.country === "XX" || !geo.city) {
    try {
      const queryIp = ip === "0.0.0.0" || ip === "127.0.0.1" ? "" : ip;
      const res = await fetch(`http://ip-api.com/json/${queryIp}?fields=countryCode,regionName,city`);
      const fallback = await res.json();

      geo = {
        country: fallback?.countryCode || geo.country || "N/A",
        state: fallback?.regionName || geo.state || "N/A",
        city: fallback?.city || geo.city || "N/A",
      };
    } catch (e) {
      console.warn("[sbX Infrastructure] Falha no fallback de Geo:", e.message);
    }
  }

  return {
    ip_address: ip,
    country: geo.country || "N/A",
    state: geo.state || "N/A",
    city: geo.city || "N/A",
    user_agent: ua,
    device_type: device,
    operating_system: os,
    metadata: {
      timestamp: new Date().toISOString(),
      tls_version: req.headers.get("x-tls-version") || null,
    },
  } as OriginDetails;
}

/**
 * @function validatePayload
 * @description O "Gatekeeper" de Dados. Valida a integridade do payload campo a campo.
 * Regra de Negócio Crítica: Aplica obrigatoriedade dinâmica baseada no tipo de conta (PF vs PJ).
 */
async function validatePayload(
  supabaseClient: any,
  payload: OrchestratorPayload,
): Promise<{ category_id?: number; product_id?: number; action: "VISIT" | "CONSULT" | "REDIRECT" | "SIMULATE" | "CONTACT" }> {
  const errors: string[] = [];
  let found_category_id: number | undefined;
  let found_product_id: number | undefined = payload.product_id;

  const action = payload.action?.toUpperCase() as "VISIT" | "CONSULT" | "REDIRECT" | "SIMULATE" | "CONTACT";
  payload.action = action;

  // 1. Validação de Contexto de Tráfego
  if (!payload.interaction_context?.utm_source) errors.push("interaction_context.utm_source ausente.");
  const source = payload.interaction_context?.utm_source;

  if (!payload.interaction_context?.origin_url) errors.push("interaction_context.origin_url ausente.");
  if (!payload.origin_url) errors.push("origin_url ausente na raiz do payload. É obrigatório para o roteamento.");

  // Se a ação dita o destino no front-end, o front-end é obrigado a informar para onde está indo
  if (["VISIT", "REDIRECT", "CONTACT"].includes(action) && !payload.target_url) {
    errors.push(`target_url ausente. Obrigatório enviar o destino da página para ações do tipo ${action}.`);
  }

  // 2. Validação da Entidade (PF vs PJ)
  if (action === "SIMULATE" || action === "CONSULT" || payload.entity) {
    if (!payload.entity?.entity_id) errors.push("entity.entity_id ausente.");
    if (!payload.entity?.name) errors.push("entity.name ausente.");
    if (!payload.entity?.document) errors.push("entity.document ausente.");
    if (!payload.entity?.phone) errors.push("entity.phone ausente.");
    if (!payload.entity?.email) errors.push("entity.email ausente.");

    // Higienização para identificar PJ (14 dígitos)
    const cleanDoc = String(payload.entity?.document || "").replace(/\D/g, "");
    const isPJ = cleanDoc.length === 14;

    if (!isPJ) {
      if (!payload.entity?.birth_date) errors.push("entity.birth_date ausente. Obrigatório para PF.");
      if (!payload.entity?.gender) errors.push("entity.gender ausente. Obrigatório para PF.");
    } else {
      // Sanitiza preventivamente os campos PF caso venham nulos na requisição PJ
      if (payload.entity) {
        payload.entity.gender = payload.entity.gender || "";
        payload.entity.birth_date = payload.entity.birth_date || "";
      }
    }
  }

  // 3. Validação de Contexto da Oferta (Leilão/B2B2C)
  const hasOfferContext = !!payload.offer && (source === "offer" || !!payload.offer.offer_id);
  if (hasOfferContext) {
    if (!payload.manager?.manager_name) errors.push("manager.manager_name é obrigatório.");
    if (!payload.seller?.seller_id) errors.push("seller.seller_id é obrigatório.");
    if (!payload.seller?.legal_name) errors.push("seller.legal_name é obrigatório.");
    if (!payload.seller?.trade_name) errors.push("seller.trade_name é obrigatório.");
    if (!payload.seller?.economic_group) errors.push("seller.economic_group é obrigatório.");
    if (!payload.event?.event_id) errors.push("event.event_id é obrigatório.");
    if (!payload.event?.event_description) errors.push("event.event_description é obrigatório.");
    if (!payload.event?.event_start_date) errors.push("event.event_start_date é obrigatório.");
    if (!payload.event?.event_end_date) errors.push("event.event_end_date é obrigatório.");
    if (!payload.offer?.offer_id) errors.push("offer.offer_id é obrigatório.");
    if (!payload.offer?.offer_description) errors.push("offer.offer_description é obrigatório.");
    if (!payload.offer?.offer_value) errors.push("offer.offer_value é obrigatório.");

    // Resolução Semântica de Categoria
    if (payload.offer?.category) {
      debugLog("ValidatePayload categoria recebida:", payload.offer?.category);
      const { data: catData } = await supabaseClient
        .from("category_types")
        .select("id, product_id")
        .ilike("name", `%${payload.offer.category}%`)
        .single();

      if (!catData) {
        errors.push(`Categoria '${payload.offer.category}' não mapeada.`);
      } else {
        found_category_id = catData.id;
        payload.offer!.category_id = catData.id;
        if (!payload.product_id && catData.product_id) {
          found_product_id = catData.product_id;
          payload.product_id = catData.product_id;
        }
      }
    }
  }

  // 4. Validação Cross-Channel
  if (["banner", "whatsapp", "email", "sms"].includes(source || "") && !found_product_id) {
    errors.push(`Para o canal '${source}', o 'product_id' é obrigatório.`);
  }

  if (errors.length > 0) throw new Error(`[sbX Validation Error]: ${errors.join(" | ")}`);
  return { category_id: found_category_id, product_id: found_product_id, action };
}

/**
 * @function resolveDestination
 * @description O Motor de Roteamento. Define a URL final e o parceiro responsável.
 * Opera via "Filtro de Prioridade (Cascata)": Produto > Evento > Seller > Categoria.
 */
async function resolveDestination(
  supabaseClient: any,
  action: "VISIT" | "CONSULT" | "REDIRECT" | "SIMULATE" | "CONTACT",
  payloadTargetUrl?: string,
  eventId?: string | number,
  sellerId?: string | number,
  categoryId?: number,
  productId?: number,
  entityDocument?: string,
) {
  debugLog(`RESOLVE DESTINATION: Ação ${action}. category: ${categoryId} | product_id: ${productId}`);

  // Se a ação for apenas navegação nativa, acata o destino do payload.
  if (action === "VISIT" || action === "REDIRECT" || action === "CONTACT") {
    if (!payloadTargetUrl) throw new Error("Para ações de 'VISIT', a target_url é obrigatória no payload.");
    return { url: payloadTargetUrl };
  }

  const cleanDoc = String(entityDocument || "").replace(/\D/g, "");
  const currentProfile = cleanDoc.length === 14 ? "PJ" : "PF";

  const priorities = [
    { type: "PRODUCT", id: productId ? Number(productId) : undefined },
    { type: "EVENT", id: eventId ? Number(eventId) : undefined },
    { type: "SELLER", id: sellerId ? Number(sellerId) : undefined },
    { type: "CATEGORY", id: categoryId ? Number(categoryId) : undefined },
  ];

  for (const priority of priorities) {
    if (priority.id && !isNaN(priority.id)) {
      debugLog(`Tentando query: ${priority.type} com ID: ${priority.id} para Perfil: ${currentProfile}`);
      const { data, error } = await supabaseClient
        .from("orchestrator_configs")
        .select("id, page_url, partner_id, is_integrated, integration_method, integration_details, entity_type")
        .eq("lookup_id", priority.id)
        .eq("config_type", priority.type)
        .eq("is_active", true)
        .in("entity_type", [currentProfile, "PF+PJ"])
        .maybeSingle();

      if (error) {
        debugLog(`[ROTEAMENTO AVISO] Erro na query de ${priority.type}:`, error.message);
        continue;
      }

      if (!data) continue; // Continua a cascata se não houver match

      debugLog(`[ROTEAMENTO SUCESSO] Match cravado via ${priority.type} -> `, data);
      return {
        orchestrator_config_id: data.id,
        url: data.page_url,
        partner_id: data.partner_id,
        is_integrated: data.is_integrated,
        integration_method: data.integration_method,
        integration_details: data.integration_details,
      };
    }
  }

  throw new Error("Nenhuma configuração de destino ativa encontrada para esta simulação.");
}

/**
 * @function resolveOrchestratorConfigs
 * @description Réplica da lógica de roteamento focada na extração das Regras (Rules/JSONB).
 * Necessária durante a fase de Hidratação (GET) para alimentar os componentes React.
 */
async function resolveOrchestratorConfigs(
  supabase: any,
  eventId?: any,
  sellerId?: any,
  categoryId?: any,
  productId?: any,
  entityDocument?: string,
) {
  const cleanDoc = String(entityDocument || "").replace(/\D/g, "");
  const currentProfile = cleanDoc.length === 14 ? "PJ" : "PF";

  const priorities = [
    { type: "PRODUCT", id: productId },
    { type: "EVENT", id: eventId },
    { type: "SELLER", id: sellerId },
    { type: "CATEGORY", id: categoryId },
  ];

  for (const priority of priorities) {
    if (priority.id && priority.id !== "undefined") {
      const { data, error } = await supabase
        .from("orchestrator_configs")
        .select("partner_id, rules, consent_configs, page_configs, page_faqs, is_integrated, integration_method, integration_details")
        .eq("lookup_id", Number(priority.id))
        .eq("config_type", priority.type)
        .eq("is_active", true)
        .in("entity_type", [currentProfile, "PF+PJ"])
        .maybeSingle();

      if (error) continue;
      if (data) return data;
    }
  }
  return null;
}

/**
 * ============================================================================
 * HANDLER PRINCIPAL (E/S BILATERAL)
 * ============================================================================
 */
serve(async (req: Request) => {
  // 1. AVALIAÇÃO DE CORS E PREFLIGHT
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 2. INICIALIZAÇÃO DE CONTEXTO (Bypass RLS para operações críticas do motor)
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  // =========================================================================
  // SEGURANÇA: Validação de Identidade (Ponto central)
  // Como o GET e o POST exigem autenticação, validamos aqui no início.
  // =========================================================================
  let auth;
  try {
     auth = await validateRequest(req);
  } catch (err: any) {
     return new Response(JSON.stringify({ error: err.message }), { 
        status: 401, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
     });
  }

  // =========================================================================
  // PIPELINE DE LEITURA (GET): Hidratação do Front-End
  // =========================================================================
  if (req.method === "GET") {
    try {
      const url = new URL(req.url);
      const visitId = url.searchParams.get("visit_id");
      const visitUpdateId = url.searchParams.get("visit_update_id");
      const simulationId = url.searchParams.get("simulation_id");

      if (!visitId) throw new Error("O parâmetro 'visit_id' é obrigatório.");

      // Validação Triangular (Obrigatória para toda e qualquer visita)
      await validateVisitOwnership(
          supabase, 
          auth, 
          payload.visit_id
      );

      // Validação de Oferta (Condicional: Só valida se a offer_id existir)
      if (payload.offer?.offer_id) {
          await validateOfferIntegrity(
              supabase, 
              auth, 
              payload.visit_id, 
              payload.offer.offer_id
          );
      }

      // A: Busca de Simulação Prévia (Se Existir)
      let simulationData = null;
      if (simulationId) {
        const { data: sim, error: simError } = await supabase.from("simulations").select("*").eq("id", simulationId).single();
        if (!simError) simulationData = sim;
      }

      // B: DEEP JOIN - Extração do Snapshot Completo da Visita
      const { data: visit, error: visitError } = await supabase
        .from("visits")
        .select(`
          id, product_id, partner_id, utm_source, utm_medium, utm_campaign, origin_url, target_url,
          visit_entities ( entity_id, name, document, phone, email, birth_date, gender, entity_details ),
          visit_offers ( offer_id, offer_value, manager_details, seller_details, event_details, offer_details, category_id )
        `)
        .eq("id", visitId)
        .single();

      debugLog("VISIT no GET:", visit);

      // C: TRAVA DE SEGURANÇA (GATEKEEPER)
      // Bloqueia leituras anônimas ou tentativas de acesso a visitas de terceiros (Anti-Scraping / Anti-Leak).
      const sessionToken = req.headers.get("x-session-token");
      if (!sessionToken) {
        return new Response(JSON.stringify({ code: "AUTH_REQUIRED" }), { status: 401, headers: corsHeaders });
      }
      const sessionUserId = JSON.parse(atob(sessionToken.split('.')[1])).sub;
      const visitEntityData = visit.visit_entities?.[0] || {};
      
      if (visitEntityData.entity_id && visitEntityData.entity_id !== String(sessionUserId)) {
        console.warn(`[SECURITY] Usuário ${sessionUserId} tentou acessar visita de terceiros: ${visitId}`);
        return new Response(JSON.stringify({ code: "FORBIDDEN_ACCESS" }), { status: 403, headers: corsHeaders });
      }

      if (visitError || !visit) throw new Error("Visita não encontrada ou expirada.");

      // D: Resolução de Regras e Parâmetros (Cascata Inversa)
      const visitOfferData = visit.visit_offers?.[0] || {};
      const orchestratorConfigs = await resolveOrchestratorConfigs(
        supabase,
        visitOfferData.event_details?.event_id, 
        visitOfferData.seller_details?.seller_id, // Correção de typo original 'seller_detaiLs'
        visitOfferData.category_id, 
        visit.product_id, 
        visitEntityData.document, 
      );

      if (!orchestratorConfigs) {
        throw new Error(`[resolveOrchestratorConfigs]: Configurações não localizadas para o perfil e contexto informados.`);
      }

      // E: Construção do Payload Hidratado (Pronto para o React consumir)
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
          down_payment_amount: visitOfferData.offer_details?.offer_value && orchestratorConfigs?.simulation_rules?.min_down_payment_percentage
              ? parseFloat(visitOfferData.offer_details.offer_value) * (orchestratorConfigs?.simulation_rules?.min_down_payment_percentage / 100)
              : null,
        },
      };

      return new Response(JSON.stringify(hydratedPayload), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    } catch (error: any) {
      console.error(`[Orquestrador GET Error]: ${error.message}`);
      return new Response(JSON.stringify({ error: error.message }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  // =========================================================================
  // PIPELINE DE ESCRITA (POST): Orquestração do Clique
  // =========================================================================
  if (req.method === "POST") {
    try {
      const payload: OrchestratorPayload = await req.json();

      // B: Captura de Contexto Nativo (Device/Geo)
      const infra = await captureInfrastructure(req);
      const { category_id, product_id, action } = await validatePayload(supabase, payload);

      // Validação Triangular (Obrigatória para toda e qualquer visita)
      await validateVisitOwnership(
          supabase, 
          auth, 
          payload.visit_id, 
          payload.entity_id
      );

      // Validação de Oferta (Condicional: Só valida se a offer_id existir)
      if (payload.offer?.offer_id) {
          await validateOfferIntegrity(
              supabase, 
              auth, 
              payload.visit_id, 
              payload.offer.offer_id
          );
      }

      // C: Motor de Decisão (Onde o usuário vai pousar?)
      const destination = await resolveDestination(
        supabase,
        action,
        payload.target_url,
        payload.event?.event_id,
        payload.seller?.seller_id,
        category_id,
        product_id,
        payload.entity?.document, 
      );

      // D: Enriquecimento do Payload com a Rota Resolvida
      payload.target_url = destination.url; 
      payload.is_integrated = destination.is_integrated; 
      payload.integration_method = destination.integration_method;
      payload.integration_details = destination.integration_details;
      payload.partner_id = destination.partner_id; 

      // E: Persistência (One-Shot Database Insertion)
      const { visitId, visitUpdateId } = await persistVisitData(
        sql,
        payload,
        infra,
        category_id,
        payload.action,
        payload.origin_url,
        destination.url,
        payload.visit_id,
        destination.orchestrator_config_id,
      );

      // F: Montagem do Payload de Retorno (Command: REDIRECT)
      const simulationId = payload.simulation_id || null;
      let finalUrl = `${destination.url}?visit_id=${visitId}&visit_update_id=${visitUpdateId}`;
      if (simulationId) finalUrl += `&simulation_id=${simulationId}`;

      return new Response(
        JSON.stringify({
          action: "REDIRECT",
          url: finalUrl,
          visit_id: visitId,
          visit_update_id: visitUpdateId,
          simulation_id: simulationId, 
          partner_id: payload.partner_id,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } catch (error: any) {
      debugLog(`[Orquestrador POST Error]: ${error.message}`);
      return new Response(JSON.stringify({ error: error.message, details: "Erro interno no processamento do pipeline" }), 
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  // Falha de Método HTTP
  return new Response(JSON.stringify({ error: "Método HTTP não permitido." }), {
    status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});