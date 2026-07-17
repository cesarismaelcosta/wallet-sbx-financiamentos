/**
 * @fileoverview EDGE FUNCTION: SBX-OFFER (Offer Details BFF)
 * * =========================================================================
 * [ARQUITETURA DE SEGURANÇA E CONTEXTO (BFF Contract)]
 * =========================================================================
 * 1. Identidade: Validação criptográfica via validateRequest.
 * 2. SSOT: Ambiente e acesso via session_tokens (DB).
 * 3. Integração: Mapeamento da Superbid API com Type Safety.
 * 
 * @author Cesar Ismael Pereira da Costa
 * @version 2.9.0 (Reintegração do Gatekeeper Auth)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decode } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { withSecurity } from "../_shared/server.ts";
import { validateRequest } from "../_shared/auth.ts"; // Reintegrado
import { Vehicle } from "../_shared/types.ts";

const DEBUG_MODE = Deno.env.get("DEBUG_MODE") === "true";
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) console.log(`[SBX-OFFER-DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : "");
};

serve(withSecurity('sbx-offer', async (req: Request) => {

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!, 
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
  });

  // =========================================================================
  // FASE 1: GATEKEEPER (Validação de Segurança)
  // =========================================================================
  try {
      await validateRequest(req);
  } catch (err: any) {
      const originPath = req.headers.get("x-original-url") || "/";
      const authUrl = req.headers.get("x-auth-fallback-url") || "/";

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

      return {
        status: statusCode,
        data: { success: false, code: errorCode, message: userMessage, fallback_url: fallbackUrl }
      };
  }

  // =========================================================================
  // FASE 2: INTEGRAÇÃO E NEGÓCIO (SSOT & Upstream)
  // =========================================================================
  try {
    const originPath = req.headers.get("x-original-url") || "/";
    const authUrl = req.headers.get("x-auth-fallback-url") || "/";
    const sessionToken = req.headers.get("x-session-token")!;
    
    const [, jwtPayload] = decode(sessionToken);
    const sessionId = (jwtPayload as any).jti;

    const { data: session } = await supabaseAdmin
        .from("session_tokens")
        .select("sbx_access_token, environment") 
        .eq("session_token", sessionId) 
        .single();
        
    if (!session) {
      throw Object.assign(new Error("Sessão na plataforma expirou."), { errorCode: "SESSION_EXPIRED", fallback_url: authUrl });
    }

    const reqUrl = new URL(req.url);
    const offerId = reqUrl.searchParams.get("offer_id");

    if (!offerId) {
      throw Object.assign(new Error("ID da oferta não informado."), { errorCode: "MISSING_OFFER_ID", fallback_url: originPath });
    }

    const env = session.environment || "stage";
    const offerBaseUrl = env === "production" ? "https://offer-query.superbid.net" : "https://offer-query.stage.superbid.net";
    const eventBaseUrl = env === "production" ? "https://event-query.superbid.net" : "https://event-query.stage.superbid.net";

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
      throw Object.assign(new Error("Sessão na plataforma expirou."), { errorCode: "SESSION_EXPIRED", fallback_url: authUrl });
    }

    if (!response.ok) {
        throw Object.assign(new Error(`Falha na API: ${response.status}`), { errorCode: "UPSTREAM_ERROR", fallback_url: originPath });
    }
    
    const data = await response.json();
    const rawOffer = data.offers?.[0];

    if (!rawOffer) {
      throw Object.assign(new Error(`Oferta não encontrada (Lote: ${offerId}).`), { errorCode: "OFFER_NOT_FOUND", fallback_url: originPath });
    }

    // [Lógica de Evento e Veículo mantida abaixo...]
    let eventData: any = {};
    const auctionId = rawOffer.auction?.id;
    if (auctionId) {
        const eventUrl = `${eventBaseUrl}/events/v2/?portalId=[2,15]&locale=pt_BR&timeZoneId=America%2FSao_Paulo&filter=id:${auctionId}&pageSize=1`;
        const eventResponse = await fetch(eventUrl, {
          method: "GET",
          headers: { "Authorization": `Bearer ${session.sbx_access_token}`, "Accept": "application/json", "Content-Type": "application/json" },
        });
        if (eventResponse.ok) {
            const eventJson = await eventResponse.json();
            eventData = eventJson.events?.[0] || {};
        }
    }

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

    return {
      status: 200,
      data: {
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
      }
    };

  } catch (err: any) {
    debugLog(`[SBX-OFFER] Falha operacional: ${err.message}`);
    
    return {
      status: err.errorCode === "SESSION_EXPIRED" ? 401 : 500,
      data: {
        success: false,
        code: err.errorCode || "UNKNOWN_ERROR",
        message: err.message || "Erro interno no processamento de oferta.",
        fallback_url: err.fallback_url || "/"
      }
    };
  }
}));