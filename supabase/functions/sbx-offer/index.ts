/**
 * @fileoverview Edge Function: SBX-OFFER (Offer Details BFF - Stateless)
 * @path supabase/functions/sbx-offer/index.ts
 *
 * ============================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * ============================================================================
 * BFF responsável por obter os detalhes completos de uma oferta e leilão no ecossistema Superbid.
 * 
 * [MUDANÇAS CRÍTICAS DA ARQUITETURA STATELESS]:
 * 1. Segurança de Borda: Exige obrigatoriamente o nosso JWT interno via `validateRequest`.
 * 2. Imunidade a Cross-Environment: O ambiente (`staging` | `production`) é extraído 
 *    diretamente do payload criptografado do JWT. Ninguém pode adulterar a rota via Query String.
 * 3. Catálogo Público Upstream: Como a Superbid permite leitura pública de ofertas, a função 
 *    realiza o proxy de forma anônima e limpa, eliminando a dependência de tokens opacos no banco.
 *
 * @author César Ismael Pereira da Costa
 * @version 4.0.0 (Stateless & Environment Sealed)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateRequest } from "../_shared/auth.ts";
import { withSecurity } from "../_shared/server.ts";
import { Vehicle } from "../_shared/types.ts";
import { debugLog } from "../_shared/logger.ts";

const OFFER_BASE_URLS = {
  production: "https://offer-query.superbid.net",
  staging: "https://offer-query.stage.superbid.net"
};

const EVENT_BASE_URLS = {
  production: "https://event-query.superbid.net",
  staging: "https://event-query.stage.superbid.net"
};

serve(withSecurity('sbx-offer', async (req: Request) => {
  
  // =========================================================================
  // FASE 1: GATEKEEPER DE BORDA (Validação Stateless do JWT)
  // =========================================================================
  let auth;
  try {
    auth = await validateRequest(req);
  } catch (err: any) {
    const authUrl = req.headers.get("x-auth-fallback-url") || "/accounts/signin";
    debugLog(`[sbx-offer] Falha de autenticação na borda: ${err.message}`);
    return {
      status: 401,
      data: { 
        success: false, 
        code: "UNAUTHORIZED", 
        message: "Sessão inválida ou expirada. Por favor, faça login novamente.", 
        fallback_url: authUrl 
      }
    };
  }

  // =========================================================================
  // FASE 2: LÓGICA DE NEGÓCIO E PROXY UPSTREAM
  // =========================================================================
  try {
    const reqUrl = new URL(req.url);
    const offerId = reqUrl.searchParams.get("offer_id");

    if (!offerId) {
      throw Object.assign(new Error("ID da oferta não informado."), { errorCode: "MISSING_OFFER_ID" });
    }

    // O ambiente é lido estritamente do token lacrado, impedindo adulteração externa
    const env = auth.environment || "staging";
    const offerBaseUrl = OFFER_BASE_URLS[env] || OFFER_BASE_URLS.staging;
    const eventBaseUrl = EVENT_BASE_URLS[env] || EVENT_BASE_URLS.staging;

    const upstreamUrl = `${offerBaseUrl}/offers/?portalId=[2,15]&locale=pt_BR&timeZoneId=America/Sao_Paulo&searchType=opened&filter=id:[${offerId}]&pageNumber=1&pageSize=15&orderBy=price:desc&requestOrigin=marketplace&preOrderBy=orderByFirstOpenedOffersAndSecondHasPhoto`;

    debugLog(`[sbx-offer] Buscando oferta ID: ${offerId} no ambiente seguro: ${env}`);

    // Requisição limpa e pública para a Superbid (Sem necessidade de Bearer Token do usuário)
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

    // -----------------------------------------------------------------------
    // STEP 2.1: BUSCA COMPLEMENTAR DE EVENTO / LEILÃO NA OFFER
    // -----------------------------------------------------------------------
    const eventData = rawOffer.auction || {};

    // -----------------------------------------------------------------------
    // STEP 2.2: EXTRAÇÃO DE METADADOS DE VEÍCULO (Se aplicável)
    // -----------------------------------------------------------------------
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

    // =========================================================================
    // FASE 3: MONTAGEM DO CONTRATO DE RESPOSTA BFF
    // =========================================================================
    return {
      status: 200,
      data: {
        offer: {
          offer_id: String(rawOffer.id),
          lot_number: rawOffer.lotNumber || 1,
          offer_description: rawOffer.product?.shortDesc || rawOffer.offerDescription?.offerDescription || "",
          offer_detailed_description: rawOffer.offerDescription?.offerDescription || "",
          offer_value: rawOffer.price || 0,
          price_formatted: rawOffer.priceFormatted || rawOffer.offerDetail?.directSaleValueFormatted || rawOffer.offerDetail?.initialBidValueFormatted || "",
          system_metric: rawOffer.systemMetric || null,
          category_id: rawOffer.product?.productType?.id || 0,
          category: rawOffer.product?.productType?.description || "",
          sub_category_id: rawOffer.product?.subCategory?.id || "",
          sub_category: rawOffer.product?.subCategory?.description || "",
          offer_status: rawOffer.offerStatus || "",
          sale_status: rawOffer.saleStatus || "",
          end_date: rawOffer.endDate || "",
          is_shopping: rawOffer.isShopping || false, 
          offer_type_id: rawOffer.offerTypeId ?? null,
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
          event_id: String(eventData.id || ""),
          event_description: eventData.desc || "",
          event_start_date: eventData.beginDate || "",
          event_end_date: eventData.endDate || "",
          modality_id: eventData.modalityId ?? null,
          modality_desc: eventData.modalityDesc || "",
          status_id: eventData.statusId ?? null
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
    debugLog(`[sbx-offer] Falha operacional: ${err.message}`);
    return {
      status: err.errorCode === "OFFER_NOT_FOUND" ? 404 : 500,
      data: { 
        success: false, 
        code: err.errorCode || "UNKNOWN_ERROR", 
        message: err.message || "Erro interno no processamento da oferta." 
      }
    };
  }
}));