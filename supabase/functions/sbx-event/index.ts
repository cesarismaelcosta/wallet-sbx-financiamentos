/**
 * @fileoverview Edge Function: SBX-EVENT (Event Details BFF - Stateless)
 * @path supabase/functions/sbx-event/index.ts
 *
 * ============================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE - DOCUMENTAÇÃO DE NEGÓCIO]
 * ============================================================================
 * BFF (Backend for Frontend) especializado em prover os metadados contextuais 
 * de um Evento/Leilão (semáforo, pipeline, contatos, modalidades).
 * 
 * DIRETRIZES DE ENGENHARIA E PRODUTO APLICADAS:
 * 
 * 1. DESACOPLAMENTO E PERFORMANCE:
 *    Esta função atua como um enriquecedor de dados. Ao remover a lógica de 
 *    eventos do `sbx-offer`, reduzimos a latência das listagens e centralizamos 
 *    a responsabilidade de dados "pesados" (pipeline, contatos) aqui.
 * 
 * 2. SEGURANÇA E AMBIENTE (SEALED-ENVIRONMENT):
 *    A função é imune a adulterações de URL via Query String, pois o ambiente 
 *    (`production` | `staging`) é lido estritamente do token JWT assinado.
 * 
 * 3. NORMALIZAÇÃO DE CONTRATO (SNAKE_CASE):
 *    Transforma o payload heterogêneo da Superbid em um contrato previsível, 
 *    facilmente consumível pelo front-end, garantindo que campos como 
 *    `semaphore_status` e `internal_parameters` sempre sigam o mesmo formato.
 * 
 * @author César Ismael Pereira da Costa
 * @version 1.0.0 (Stateless & Environment Sealed)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateRequest } from "../_shared/auth.ts";
import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";

const EVENT_BASE_URLS = {
  production: "https://event-query.superbid.net",
  staging: "https://event-query.stage.superbid.net"
};

serve(withSecurity('sbx-event', async (req: Request) => {
  
  debugLog(`[sbx-event] 🚀 Iniciando requisição.`);

  // =========================================================================
  // FASE 1: GATEKEEPER DE BORDA (Validação Stateless do JWT)
  // =========================================================================
  let auth;
  try {
    auth = await validateRequest(req);
  } catch (err: any) {
    const authUrl = req.headers.get("x-auth-fallback-url") || "/accounts/signin";
    debugLog(`[sbx-event] ❌ Falha de autenticação: ${err.message}`);
    return {
      status: 401,
      data: { 
        success: false, 
        code: "UNAUTHORIZED", 
        message: "Sessão inválida ou expirada.", 
        fallback_url: authUrl 
      }
    };
  }

  // =========================================================================
  // FASE 2: LÓGICA DE NEGÓCIO E PROXY UPSTREAM
  // =========================================================================
  try {
    const reqUrl = new URL(req.url);
    const eventId = reqUrl.searchParams.get("event_id");

    if (!eventId) {
      throw Object.assign(new Error("O parâmetro 'event_id' é obrigatório."), { errorCode: "MISSING_EVENT_ID" });
    }

    const env = auth.environment || "staging";
    const eventBaseUrl = EVENT_BASE_URLS[env] || EVENT_BASE_URLS.staging;

    // Proxy para o Upstream da Superbid
    const upstreamUrl = `${eventBaseUrl}/events/v2/?portalId=[2,15]&locale=pt_BR&timeZoneId=America/Sao_Paulo&filter=id:${eventId}&pageSize=1`;
    
    debugLog(`[sbx-event] Buscando evento ID: ${eventId} [${env}]`);

    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: { 
        "Accept": "application/json", 
        "Content-Type": "application/json",
        "Origin": "https://www.superbid.net",
        "Referer": "https://www.superbid.net/"
      },
    });

    if (!response.ok) {
      throw Object.assign(new Error(`Falha Upstream API: Status ${response.status}`), { errorCode: "UPSTREAM_ERROR" });
    }
    
    const data = await response.json();
    const rawEvento = data.events?.[0];

    if (!rawEvento) {
      throw Object.assign(new Error(`Evento não encontrado (ID: ${eventId}).`), { errorCode: "EVENT_NOT_FOUND" });
    }
    
    debugLog(`[sbx-event] ✨ Evento ${eventId} recuperado com sucesso.`);

    // =========================================================================
    // FASE 3: NORMALIZAÇÃO DE DADOS (Snake Case & Defensividade)
    // =========================================================================
    return {
      status: 200,
      data: {
        success: true,
        event: {
          event_id: String(rawEvento.id || ""),
          event_description: rawEvento.fullDescription || rawEvento.desc || "",
          event_start_date: rawEvento.eventPipeline?.stages?.[0]?.beginDate || rawEvento.firstOfferCloseDate || "",
          event_end_date: rawEvento.endDate || "",
          modality_id: rawEvento.modalityId ?? null,
          modality_desc: rawEvento.modalityDesc || "",
          status_id: rawEvento.statusId ?? null,
          event_short_description: rawEvento.desc || "",
          event_full_description: rawEvento.fullDescription || "",
          event_image_url: rawEvento.imageURL || "",

          // Semáforo dinâmico (null se ausente, garantindo integridade no Front)
          semaphore_status: rawEvento.semaphoreStatus ? {
            coming_soon: rawEvento.semaphoreStatus.comingSoon ?? false,
            allotment: rawEvento.semaphoreStatus.allotment ?? false,
            in_progress: rawEvento.semaphoreStatus.inProgress ?? false,
            finished: rawEvento.semaphoreStatus.finished ?? false,
            live: rawEvento.semaphoreStatus.live ?? false
          } : null,

          // Pipeline e estágios (mapeados para evitar poluição de case no Front)
          pipeline: rawEvento.eventPipeline ? {
            id: rawEvento.eventPipeline.id ?? null,
            description: rawEvento.eventPipeline.description || "",
            current_stage: rawEvento.eventPipeline.currentStage ?? null,
            stages: rawEvento.eventPipeline.stages?.map((stage: any) => ({
              event_id: stage.eventId ?? null,
              event_desc: stage.eventDesc || "",
              begin_date: stage.beginDate || "",
              end_date: stage.endDate || "",
              status_id: stage.statusId ?? null,
              is_active: stage.isActive ?? false,
              is_after_market: stage.isAfterMarket ?? false,
              initial_bid_value: stage.initialBidValue ?? null,
              formatted_initial_bid_value: stage.formattedInitialBidValue || null
            })) || []
          } : null,

          // Contatos e parâmetros (Normalizados)
          internal_parameters: {
            should_display_contact: rawEvento.internalParameters?.shouldDisplayContact ?? false,
            contact_phone_number: rawEvento.internalParameters?.contactPhoneNumber || null,
            contact_whatsapp_number: rawEvento.internalParameters?.contactWhatsappNumber || null,
            contact_email_address: rawEvento.internalParameters?.contactEmailAddress || null,
            lot_auction_type_id: rawEvento.internalParameters?.lotAuctionTypeId ?? null,
            has_question_room: rawEvento.internalParameters?.hasQuestionRoom ?? false,
            is_shopping: rawEvento.internalParameters?.isShopping ?? false,
            has_advisor_intermediation: rawEvento.internalParameters?.hasAdvisorIntermediation ?? false,
          }
        }
      }
    };

  } catch (err: any) {
    debugLog(`[sbx-event] 💥 Falha: ${err.message} | Code: ${err.errorCode || 'UNKNOWN'}`);
    const statusCode = ["MISSING_EVENT_ID", "EVENT_NOT_FOUND"].includes(err.errorCode) ? (err.errorCode === "EVENT_NOT_FOUND" ? 404 : 400) : 500;
    
    return {
      status: statusCode,
      data: { 
        success: false, 
        code: err.errorCode || "UNKNOWN_ERROR", 
        message: err.message || "Erro interno no processamento do evento." 
      }
    };
  }
}));