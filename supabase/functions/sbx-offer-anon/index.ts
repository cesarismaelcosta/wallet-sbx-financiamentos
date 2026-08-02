/**
 * @fileoverview Edge Function: SBX-OFFER-ANON (Anonymous Offer BFF)
 *
 * ============================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * ============================================================================
 * Rota PÚBLICA (Anônima) para consulta de ofertas e eventos na Superbid.
 * Não exige JWT ou validação de sessão, tirando proveito da natureza aberta 
 * do catálogo upstream para montar a tela de detalhes do produto.
 * 
 * @module sbx-offer-anon
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";

const OFFER_BASE_URLS = {
  production: "https://offer-query.superbid.net",
  staging: "https://offer-query.stage.superbid.net"
};

const EVENT_BASE_URLS = {
  production: "https://event-query.superbid.net",
  staging: "https://event-query.stage.superbid.net"
};

serve(withSecurity('sbx-offer-anon', async (req: Request) => {
  try {
    const reqUrl = new URL(req.url);
    const offerId = reqUrl.searchParams.get("offer_id");
    const env = reqUrl.searchParams.get("environment") || "staging";

    if (!offerId) {
      throw Object.assign(new Error("ID da oferta não informado."), { errorCode: "MISSING_OFFER_ID" });
    }

    const offerBaseUrl = OFFER_BASE_URLS[env as keyof typeof OFFER_BASE_URLS] || OFFER_BASE_URLS.staging;
    const eventBaseUrl = EVENT_BASE_URLS[env as keyof typeof EVENT_BASE_URLS] || EVENT_BASE_URLS.staging;

    const upstreamUrl = `${offerBaseUrl}/offers/?portalId=[2,15]&locale=pt_BR&timeZoneId=America/Sao_Paulo&searchType=opened&filter=id:[${offerId}]&pageNumber=1&pageSize=15&orderBy=price:desc&requestOrigin=marketplace&preOrderBy=orderByFirstOpenedOffersAndSecondHasPhoto`;

    debugLog(`[sbx-offer-anon] Buscando oferta ID: ${offerId} no ambiente: ${env}`);

    // Requisição ANÔNIMA (sem Header de Authorization) para o catálogo público
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
      throw Object.assign(new Error(`Falha na API da Superbid (${response.status})`), { errorCode: "UPSTREAM_ERROR" });
    }
    
    const data = await response.json();
    const rawOffer = data.offers?.[0];

    if (!rawOffer) {
      throw Object.assign(new Error(`Oferta não encontrada (Lote: ${offerId}).`), { errorCode: "OFFER_NOT_FOUND" });
    }

    // 2. Busca Complementar do Evento (também anônima)
    let eventData: any = {};
    const auctionId = rawOffer.auction?.id;
    if (auctionId) {
      const eventUrl = `${eventBaseUrl}/events/v2/?portalId=[2,15]&locale=pt_BR&timeZoneId=America%2FSao_Paulo&filter=id:${auctionId}&pageSize=1`;
      
      const eventResponse = await fetch(eventUrl, {
        method: "GET",
        headers: { 
          "Accept": "application/json", 
          "Content-Type": "application/json" 
        },
      });

      if (eventResponse.ok) {
        eventData = (await eventResponse.json()).events?.[0] || {};
      }
    }

    // 3. Extração de Veículos (Se aplicável)
    const productTypeId = rawOffer.product?.productType?.id;
    const isVehicleCategory = [10, 11].includes(productTypeId);
    let vehicleData = undefined;

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

    // 4. Retorno do Contrato BFF
    return {
      status: 200,
      data: {
        success: true,
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
    debugLog(`[sbx-offer-anon] Falha: ${err.message}`);
    return {
      status: err.errorCode === "OFFER_NOT_FOUND" ? 404 : 400,
      data: { success: false, code: err.errorCode || "UNKNOWN_ERROR", message: err.message }
    };
  }
}));