/**
 * @fileoverview EDGE FUNCTION: SBX-OFFER (Offer Details BFF)
 * * ============================================================================
 * ARQUITETURA DE SEGURANÇA E CONTEXTO (BFF Contract)
 * ============================================================================
 * Este módulo atua como Backend For Frontend para hidratação de ofertas.
 * 
 * 1. Identidade: Delega a validação criptográfica para o shared/auth (validateRequest).
 * 2. SSOT (Single Source of Truth): Extrai o `environment` e `sbx_access_token` 
 *    EXCLUSIVAMENTE do banco de dados (session_tokens). O frontend não dita o ambiente.
 * 3. Integração: Consulta o catálogo da Superbid com o access token real (Upstream).
 * 4. Resiliência: Intercepta tokens upstream expirados (401) e devolve o contrato padrão.
 * 5. Type Safety: Mapeia o payload bruto com tipagem forte para o frontend.
 * 
 * @author Cesar Ismael Pereira da Costa
 * @description Single Source of Truth para consulta de ofertas e eventos com Handshake Zero Trust.
 * @version 2.6.0 (Integração Total com sbX Core Auth e Blindagem de Ambiente)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// IMPORTANTE: Trazendo o Gatekeeper unificado do ecossistema
import { validateRequest } from "../_shared/auth.ts";
import type { Offer, Manager, Event, Seller, Vehicle } from "../../../src/features/financial-hub/components/shared/types.ts";

/**
 * ============================================================================
 * CONFIGURAÇÕES GLOBAIS E SEGURANÇA
 * ============================================================================
 */
const DEBUG_MODE = Deno.env.get("DEBUG_MODE") === "true";

/**
 * @function debugLog
 * @description Centraliza os logs do pipeline. Em produção, DEBUG_MODE deve ser false
 * para evitar exposição de PII (Personally Identifiable Information) ou dados internos da Superbid.
 */
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[SBX-OFFER-DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

/**
 * CONFIGURAÇÃO GLOBAL DE CORS (Única Fonte de Verdade)
 * @description Espelha as regras estritas do Orquestrador Central.
 * A inclusão do 'x-session-token' é vital para o Handshake Zero Trust (Validação de Identidade).
 * NOTA DE SEGURANÇA: x-sbx-env foi removido. O ambiente agora é ditado 100% pelo Backend/DB.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token, x-original-url, x-auth-fallback-url",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

/**
 * ============================================================================
 * HANDLER PRINCIPAL (PIPELINE DE LEITURA)
 * ============================================================================
 */
serve(async (req: Request) => {
  // 1. AVALIAÇÃO DE CORS E PREFLIGHT
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 2. INICIALIZAÇÃO DE CONTEXTO (Bypass RLS para operações internas de sessão)
  const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!, 
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
  });

  // =========================================================================
  // FASE 1: SEGURANÇA E IDENTIDADE (Handshake Zero Trust)
  // =========================================================================
  let auth;
  try {
      auth = await validateRequest(req);
  } catch (err: any) {
      // 1. Descoberta da Origem
      const originPath = req.headers.get("x-original-url");
      const authUrl = req.headers.get("x-auth-fallback-url");

      if (!originPath) {
          return new Response(JSON.stringify({ 
              success: false,
              code: "INTERNAL_ERROR",
              message: "Erro de segurança: A origem da requisição não foi identificada.",
              fallback_url: "/"
          }), { 
              status: 400, 
              headers: { ...corsHeaders, "Content-Type": "application/json" } 
          });
      }

      // 2. Padronização de Variáveis e Tradução UX
      let userMessage = "Falha de autenticação. Por favor, faça login novamente.";
      let errorCode = "UNAUTHORIZED";
      let fallbackUrl = authUrl;
      let statusCode = 401;

      if (err.message.includes("SESSION_EXPIRED")) {
          userMessage = "Sua sessão expirou. Por favor, faça login novamente.";
          errorCode = "SESSION_EXPIRED";
      } else if (err.message.includes("FORBIDDEN")) {
          userMessage = "Você não tem permissão para acessar este recurso.";
          errorCode = "FORBIDDEN";
          fallbackUrl = originPath; 
          statusCode = 403;
      } else if (err.message.includes("INTERNAL_ERROR")) {
          userMessage = "Ocorreu um erro interno ao validar sua sessão.";
          errorCode = "INTERNAL_ERROR";
          fallbackUrl = "/"; 
          statusCode = 500;
      }

      // 3. Retorno seguindo o contrato oficial da API
      return new Response(JSON.stringify({ 
          success: false,
          code: errorCode,
          message: userMessage,
          fallback_url: fallbackUrl 
      }), { 
          status: statusCode, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
  }

  // =========================================================================
  // FASE 2: LÓGICA DE NEGÓCIO (Single Source of Truth)
  // =========================================================================
  try {
    const originPath = req.headers.get("x-original-url") || "/";
    const authUrl = req.headers.get("x-auth-fallback-url") || "/";

    // A. Busca do Access Token e Ambiente da Superbid no Banco
    const sessionToken = req.headers.get("x-session-token");
    
    // 🔒 SSOT: A verdade sobre o ambiente vem exclusivamente do banco de dados.
    const { data: session } = await supabaseAdmin
        .from("session_tokens")
        .select("sbx_access_token, environment") 
        .eq("session_token", auth?.jti || sessionToken) 
        .single();
        
    if (!session) {
      const err = new Error("Sua sessão na plataforma expirou ou foi revogada.");
      (err as any).code = "SESSION_EXPIRED";
      (err as any).fallback_url = authUrl;
      throw err;
    }

    // B. Contexto e Parâmetros da Oferta
    const reqUrl = new URL(req.url);
    const offerId = reqUrl.searchParams.get("offer_id");

    if (!offerId) {
      const err = new Error("O parâmetro 'offer_id' é obrigatório para esta requisição.");
      (err as any).code = "MISSING_OFFER_ID";
      (err as any).fallback_url = originPath;
      throw err;
    }

    // 🔒 SEGURANÇA BLINDADA: O ambiente da integração Upstream é ditado pelo banco.
    const env = session.environment || "stage";
    debugLog(`[INFO] Roteando requisição para ambiente Upstream: ${env}`);

    // C. Integração Upstream (Superbid API)
    const offerBaseUrl = env === "production" 
        ? "https://offer-query.superbid.net" 
        : "https://offer-query.stage.superbid.net";
        
    const eventBaseUrl = env === "production" 
        ? "https://event-query.superbid.net" 
        : "https://event-query.stage.superbid.net";

    const upstreamUrl = `${offerBaseUrl}/offers/?portalId=[2,15]&locale=pt_BR&timeZoneId=America/Sao_Paulo&searchType=opened&filter=id:[${offerId}]&pageNumber=1&pageSize=15&orderBy=price:desc&requestOrigin=marketplace&preOrderBy=orderByFirstOpenedOffersAndSecondHasPhoto`;

    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: { 
        "Authorization": `Bearer ${session.sbx_access_token}`, 
        "Accept": "application/json", 
        "Content-Type": "application/json",
        "Origin": "https://www.superbid.net",
        "Referer": "https://www.superbid.net/"
      },
    });

    if (response.status === 401) {
      const err = new Error("Sua sessão com a plataforma expirou. Por favor, faça login novamente.");
      (err as any).code = "SESSION_EXPIRED";
      (err as any).fallback_url = authUrl;
      throw err;
    }

    if (!response.ok) {
        const errBody = await response.text();
        const err = new Error(`Instabilidade na integração com a plataforma (${response.status}).`);
        (err as any).code = "UPSTREAM_ERROR";
        (err as any).fallback_url = originPath;
        throw err;
    }

    const data = await response.json();
    const rawOffer = data.offers?.[0];

    if (!rawOffer) {
      const err = new Error(`Oferta não encontrada ou indisponível (Lote: ${offerId}).`);
      (err as any).code = "OFFER_NOT_FOUND";
      (err as any).fallback_url = originPath;
      throw err;
    }

    // D. Busca de Dados do Evento
    let eventData: any = {};
    const auctionId = rawOffer.auction?.id;

    if (auctionId) {
        const eventUrl = `${eventBaseUrl}/events/v2/?portalId=[2,15]&locale=pt_BR&timeZoneId=America%2FSao_Paulo&filter=id:${auctionId}&pageSize=1`;
        
        const eventResponse = await fetch(eventUrl, {
          method: "GET",
          headers: { 
            "Authorization": `Bearer ${session.sbx_access_token}`,
            "Accept": "application/json", 
            "Content-Type": "application/json",
            "Origin": "https://www.superbid.net",
            "Referer": "https://www.superbid.net/"
          },
        });
        
        if (eventResponse.ok) {
            const eventJson = await eventResponse.json();
            eventData = eventJson.events?.[0] || {};
        }
    }

    // E. Mapeamento do Payload (BFF Contract com Type Safety)
    const productTypeId = rawOffer.product?.productType?.id;
    const isVehicleCategory = [10, 11].includes(productTypeId);
    let vehicleData: Vehicle | undefined;

    if (isVehicleCategory) {
        const groups = rawOffer.product?.template?.groups || [];
        const getGroupProp = (groupId: string, propId: string) => 
            groups.find((g: any) => g.id === groupId)?.properties.find((p: any) => p.id === propId)?.value;

        vehicleData = {
            manufacture_year: Number(getGroupProp("identificacao", "anofabricacao")) || 0,
            model_year: Number(getGroupProp("identificacao", "anomodelo")) || 0,
            fipe_code: getGroupProp("financiamento", "codigofipe") || "",
        };
    }

    const payloadResult: { offer: Offer; manager: Manager; event: Event; seller: Seller } = {
      offer: {
        offer_id: String(rawOffer.id),
        lot_number: rawOffer.lotNumber || 1,
        offer_description: rawOffer.product?.shortDesc || rawOffer.offerDescription?.offerDescription || "",
        offer_detailed_description: rawOffer.offerDescription?.offerDescription || "",
        offer_value: rawOffer.price || 0,
        category_id: rawOffer.product?.productType?.id || 0,
        category: rawOffer.product?.productType?.description || "",
        sub_category_id: rawOffer.product?.subCategory?.id || "",
        sub_category: rawOffer.product?.subCategory?.description || "",
        offer_status: rawOffer.offerStatus || "",
        sale_status: rawOffer.saleStatus || "",
        end_date: rawOffer.endDate || "",
        location: {
          neighborhood: rawOffer.product?.location?.neighborhood || "Não informado",
          city: rawOffer.product?.location?.city || "Não informado",
          state: rawOffer.product?.location?.state || "Não informado",
          country: rawOffer.product?.location?.country || "Brasil"
        },
        ...(vehicleData && { vehicle_details: vehicleData }),
        photos: rawOffer.product?.galleryJson?.map((p: any) => ({
          highlight: p.highlight || false,
          link: p.link,
          thumbnail: p.thumbnailUrl,
          file_name: p.originalFileName,
          type: p.type || "photo",
          content_type: p.contentType || "image/jpeg"
        })) || []
      },
      manager: {
        manager_id: rawOffer.manager?.id || 0,
        manager_name: rawOffer.manager?.name || "N/A"
      },
      event: {
        event_id: String(rawOffer.auction?.id || ""),
        event_description: `${rawOffer.auction?.desc || ""}${rawOffer.auction?.desc && eventData.fullDescription ? " - " : ""}${eventData.fullDescription || ""}`.trim(),
        event_start_date: rawOffer.auction?.beginDate || "",
        event_end_date: rawOffer.auction?.endDate || "",
        modality_id: eventData.modalityId ?? null,
        status_id: eventData.statusId ?? null,
        event_short_description: rawOffer.auction?.desc || "",
        event_full_description: eventData.fullDescription || "",
        event_image_url: eventData.imageURL || ""
      },
      seller: {
        seller_id: String(rawOffer.seller?.id || ""),
        legal_name: rawOffer.seller?.name || "N/A",
        trade_name: rawOffer.seller?.company?.[0]?.fantasyName || "N/A",
        economic_group: rawOffer.seller?.company?.[0]?.fantasyName || "N/A"
      }
    };

    // F. Resposta de Sucesso
    return new Response(JSON.stringify(payloadResult), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" }, 
      status: 200 
    });

  } catch (err: any) {
    debugLog(`[SBX-OFFER] Falha na operação: ${err.message}`);
    
    // Extrativismo de Propriedades Injetadas ou Default
    const errorCode = err.code || "UNKNOWN_ERROR";
    const fallbackUrl = err.fallback_url || "/";
    
    let statusCode = 400;
    if (errorCode === "UNAUTHORIZED" || errorCode === "SESSION_EXPIRED") statusCode = 401;
    if (errorCode === "FORBIDDEN") statusCode = 403;
    if (errorCode === "UPSTREAM_ERROR") statusCode = 502;
    if (errorCode === "UNKNOWN_ERROR") statusCode = 500;

    return new Response(JSON.stringify({ 
        success: false,
        code: errorCode,             
        message: err.message,        
        fallback_url: fallbackUrl 
    }), { 
        status: statusCode, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});