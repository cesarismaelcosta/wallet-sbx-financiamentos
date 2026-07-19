/**
 * @fileoverview ORQUESTRADOR CENTRAL (Gateway de Roteamento Bilateral)
 * @path supabase/functions/orchestrator/index.ts
 * 
 * ============================================================================
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
import { captureInfrastructure } from "../_shared/infrastructure.ts";
import { sql } from "../_shared/db.ts";
import { withSecurity } from "../_shared/server.ts";
import { validateVisitOwnership, validateOfferIntegrity } from "../_shared/gatekeeper.ts";
import { persistVisitData } from "./persist-data.ts";

import {
  Entity,
  Manager,
  Seller,
  Event,
  Vehicle,
  Offer,
  InteractionContext,
  OrchestratorPayload,
  OrchestratorResponse,
  OriginDetails,
} from "../_shared/types.ts";

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
import { debugLog } from "../_shared/logger.ts";


/**
 * ============================================================================
 * HELPER FUNCTIONS (Gatekeeper de Dados e Motor de Decisão)
 * ============================================================================
 */

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
serve(withSecurity('orchestrator', async (req: Request) => {

  // Salva a origem logo no milissegundo zero para casos de erro no codigo não tratados
  const globalFallbackUrl = req.headers.get("x-original-url") || "/";

  try  {

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    // =========================================================================
    // SEGURANÇA: Validação de Identidade pelo token opaco próprio
    // Como o GET e o POST exigem autenticação, validamos aqui no início.
    // =========================================================================
    let auth;
    try {
        auth = await validateRequest(req);
    } catch (err: any) {
        // 1. Descoberta da Origem
        const originPath = req.headers.get("x-original-url");
        const authUrl = req.headers.get("x-auth-fallback-url");

        if (!originPath) {
            // Failsafe: Se o frontend não enviou o header, barramos aqui.
            return {
              status: 400,
              data: { 
                success: false,
                code: "INTERNAL_ERROR",
                message: "Erro de segurança: A origem da requisição não foi identificada.",
                fallback_url: "/"
              }
            };
        }

        // 2. Padronização de Variáveis
        let userMessage = "Falha de autenticação. Por favor, faça login novamente.";
        let errorCode = "UNAUTHORIZED";
        let fallbackUrl = authUrl;
        let statusCode = 401;

        // 3. Tradução do Erro para Experiência do Usuário (UX)
        if (err.message.includes("SESSION_EXPIRED")) {
            userMessage = "Sua sessão expirou. Por favor, faça login novamente.";
            errorCode = "SESSION_EXPIRED";
            
        } else if (err.message.includes("FORBIDDEN")) {
            userMessage = "Você não tem permissão para acessar este recurso.";
            errorCode = "FORBIDDEN";
            fallbackUrl = originPath; // Apenas devolve para a página atual, não pede login
            statusCode = 403;
            
        } else if (err.message.includes("INTERNAL_ERROR")) {
            userMessage = "Ocorreu um erro interno ao validar sua sessão.";
            errorCode = "INTERNAL_ERROR";
            fallbackUrl = "/"; // Devolve para a home em caso de falha de banco/infra
            statusCode = 500;
        }

        // 4. Retorno seguindo o contrato oficial da API
        return { 
          status: statusCode,
          data: { 
            success: false,
            code: errorCode,
            message: userMessage, 
            fallback_url: fallbackUrl 
          }
        };
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

        if (visitError || !visit) throw new Error("Visita não encontrada ou expirada.");

        // C.1: Validação Triangular (Obrigatória para toda e qualquer visita)
        await validateVisitOwnership(
            supabase, 
            auth, 
            visitId
        );

        // C.2: Validação de Oferta (Condicional: Só valida se a offer_id existir)
        const visitOfferData = visit.visit_offers?.[0] || {};
        let offerId = visitOfferData.offer_id;

        if (offerId) {
            debugLog("🚨 [GET] Validando integridade da oferta:", offerId);
            try {
                const validatedOffer = await validateOfferIntegrity(
                    supabase, 
                    auth, 
                    visitId, 
                    offerId
                );
                // Só toca no objeto se a validação passar
                visitOfferData.offer_value = validatedOffer.offer.offer_value;
            } catch (err: any) {
                debugLog("🚨 [validateOfferIntegrity] Falha na validação:", err.message);

                let userMessage = "Ocorreu um erro ao carregar a oferta.";
                let errorCode = "UNKNOWN_ERROR"; 

                if (err.message.includes("OFFER_NOT_FOUND")) {
                    userMessage = "Esta oferta não está mais disponível ou não foi encontrada.";
                    errorCode = "OFFER_NOT_FOUND";
                } else if (err.message.includes("INVALID_RELATIONSHIP")) {
                    userMessage = "Você não tem permissão para acessar esta oferta.";
                    errorCode = "INVALID_RELATIONSHIP";
                } else if (err.message.includes("SESSION_EXPIRED")) {
                    userMessage = "Sua sessão expirou. Por favor, faça login novamente.";
                    errorCode = "SESSION_EXPIRED";
                } else if (err.message.includes("UPSTREAM_CONNECTION_ERROR")) {
                    userMessage = "Estamos com instabilidade no serviço de ofertas. Tente novamente em instantes.";
                    errorCode = "UPSTREAM_CONNECTION_ERROR";
                }

                const errorForUI = new Error(userMessage);
                
                // Injetando as propriedades para o catch global ler depois
                (errorForUI as any).errorCode = errorCode; 
                (errorForUI as any).fallback_url = visit.origin_url;
                
                throw errorForUI; 
            }
        } else {
            // Se não tem offerId, o fluxo ignora a validação e segue feliz
            debugLog("ℹ️ Nenhuma oferta vinculada a esta visita. Pulando validação.");
        }

        // D: Resolução de Regras e Parâmetros (Cascata Inversa)
        const visitEntityData = visit.visit_entities?.[0] || {};
        const orchestratorConfigs = await resolveOrchestratorConfigs(
          supabase,
          visitOfferData.event_details?.event_id, 
          visitOfferData.seller_details?.seller_id, 
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

        return { status: 200, data: hydratedPayload };

      } catch (error: any) {
          debugLog(`[Orquestrador GET Error]: ${error.message}`);
          
          // Extraímos o código que injetamos lá no bloco de validação. 
          // Se não existir, é um erro genérico.
          const errorCode = error.errorCode || "UNKNOWN_ERROR";
          debugLog("fallback url:", error.fallback_url);

          return {
              status: 400,
              data: { 
                  success: false,
                  code: errorCode,           // <--- Agora o front-end recebe isso!
                  message: error.message,      // <--- A mensagem amigável
                  fallback_url: error.fallback_url || "/" 
              }
          };
      }
    }

    // =========================================================================
    // PIPELINE DE ESCRITA (POST): Orquestração do Clique
    // =========================================================================
    if (req.method === "POST") {

      
        // 🚨 ======================================================= 🚨
        // 🧪 TESTE MANUAL: FORÇANDO O ATAQUE IDOR
        // Substitui o visit_id real do front-end por um de outra pessoa
        // payload.visit_id = "COLE_AQUI_O_VISIT_ID_DO_OUTRO_CARA";
        payload.offer_id = "1111111";
        
        debugLog("🧪 TESTE IDOR: Forçando offer_id para:", payload.offer_id);
        // 🚨 ======================================================= 🚨

      // Escopo seguro para o fallback: protege o catch caso `req.json()` quebre.
      let safeFallbackUrl = req.headers.get("x-original-url") || "/";
      
      try {
        const payload: OrchestratorPayload = await req.json();
        
        safeFallbackUrl = payload.origin_url || payload.interaction_context?.origin_url || safeFallbackUrl;

        // A: Captura de Contexto Nativo (Device/Geo)
        const infra = await captureInfrastructure(req);
        
        // B: Gatekeeper de Dados (Formatação e Regras Estruturais)
        const { category_id, product_id, action } = await validatePayload(supabase, payload);

        // =====================================================================
        // C: GATEKEEPER DE SEGURANÇA E NEGÓCIO (Zero-Trust)
        // Obrigatório executar ANTES de qualquer inserção/alteração no banco.
        // =====================================================================
        const targetVisitId = payload.visit_id || null;
        const targetEntityId = payload.entity?.entity_id || null;
        
        debugLog("🚨 [validateVisitOwnership POST] Validando visita:", targetVisitId);
        await validateVisitOwnership(
            supabase, 
            auth, 
            targetVisitId, 
            targetEntityId
        );

        const offerId = payload.offer?.offer_id;
        if (offerId) {
            debugLog("🚨 [validateOfferIntegrity POST] Validando integridade da oferta:", offerId);
            try {
                await validateOfferIntegrity(
                    supabase, 
                    auth, 
                    targetVisitId, 
                    offerId
                );
                debugLog("✅ Oferta validada com sucesso.");
            } catch (err: any) {
                debugLog("🚨 [validateOfferIntegrity POST] Falha na validação:", err.message);

                let userMessage = "Ocorreu um erro ao carregar a oferta.";
                let errorCode = "UNKNOWN_ERROR";

                if (err.message.includes("OFFER_NOT_FOUND")) {
                    userMessage = "Esta oferta não está mais disponível ou não foi encontrada.";
                    errorCode = "OFFER_NOT_FOUND";
                } else if (err.message.includes("INVALID_RELATIONSHIP")) {
                    userMessage = "Você não tem permissão para acessar esta oferta.";
                    errorCode = "INVALID_RELATIONSHIP";
                } else if (err.message.includes("SESSION_EXPIRED")) {
                    userMessage = "Sua sessão expirou. Por favor, faça login novamente.";
                    errorCode = "SESSION_EXPIRED";
                } else if (err.message.includes("UPSTREAM_CONNECTION_ERROR")) {
                    userMessage = "Estamos com instabilidade no serviço de ofertas. Tente novamente em instantes.";
                    errorCode = "UPSTREAM_CONNECTION_ERROR";
                }

                const errorForUI = new Error(userMessage);
                
                (errorForUI as any).errorCode = errorCode; 
                (errorForUI as any).fallback_url = safeFallbackUrl;
                
                throw errorForUI; 
            }
        } else {
            debugLog("ℹ️ Nenhum offer_id fornecido. Pulando validação de integridade.");
        }

        // =====================================================================
        // D: Motor de Decisão (Onde o usuário vai pousar?)
        // =====================================================================
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

        // E: Enriquecimento do Payload com a Rota Resolvida
        payload.target_url = destination.url; 
        payload.is_integrated = destination.is_integrated; 
        payload.integration_method = destination.integration_method;
        payload.integration_details = destination.integration_details;
        payload.partner_id = destination.partner_id; 

        debugLog("Origem: ", payload.origin_url);

        // =====================================================================
        // F: Persistência Segura (One-Shot Database Insertion)
        // Agora protegido pelo Gatekeeper na etapa C.
        // =====================================================================
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

        // G: Montagem do Payload de Retorno (Command: REDIRECT)
        const simulationId = payload.simulation_id || null;
        let finalUrl = `${destination.url}?visit_id=${visitId}&visit_update_id=${visitUpdateId}`;
        if (simulationId) finalUrl += `&simulation_id=${simulationId}`;

        debugLog("[POST] payload final de retorno:", { payload, visitId, visitUpdateId, simulationId });

        return {
          status: 200,
          data: {
            action: "REDIRECT",
            url: finalUrl,
            visit_id: visitId,
            visit_update_id: visitUpdateId,
            simulation_id: simulationId, 
            partner_id: payload.partner_id,
          }
        };

      } catch (error: any) {
        debugLog(`[Orquestrador POST Error REAL]: ${error.message}`);
        
        const errorCode = error.errorCode || "UNKNOWN_ERROR";

        return {
          status: 400,
          data: { 
              success: false,
              code: errorCode,              // <--- Agora o front-end recebe isso!
              message: error.message,       // <--- A mensagem amigável
              fallback_url: error.fallback_url || safeFallbackUrl 
          }
        };
      }
    }

    // Falha de Método HTTP
    return { 
      status: 405, 
      data: { error: "Método HTTP não permitido." } 
    };
  } catch (fatalError: any) {
      // O FAILSAFE ABSOLUTO
      // Se qualquer coisa quebrar (syntax error, banco fora do ar, null pointer),
      // cai aqui ANTES de vazar para o withSecurity.
      
      debugLog(`🚨 [CRASH FATAL INTERCEPTADO]: ${fatalError.message}`);
      
      return {
          status: 500,
          data: {
              success: false,
              code: "INTERNAL_SERVER_ERROR",
              message: "Ocorreu um erro interno inesperado. Tente novamente.",
              fallback_url: globalFallbackUrl // Faz jornada voltar para a origem
          }
      };
  }
}));