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
 * 1. Segurança de Borda: Exige obrigatoriamente o nosso JWT interno — validado
 *    centralmente pelo wrapper `withSecurity` (registry.ts: authMode.type ===
 *    'session', enforcement: 'wrapper'), não mais chamando `validateRequest`
 *    aqui dentro. O resultado chega pronto via `ctx.auth`.
 * 2. Imunidade a Cross-Environment: O ambiente (`staging` | `production`) é extraído
 *    diretamente do payload criptografado do JWT. Ninguém pode adulterar a rota via Query String.
 * 3. Catálogo Público Upstream: Como a Superbid permite leitura pública de ofertas, a função
 *    realiza o proxy de forma anônima e limpa, eliminando a dependência de tokens opacos no banco.
 *
 * @author César Ismael Pereira da Costa
 * @version 4.1.0 (Sessão centralizada no wrapper — v2.0.0 do registry/server)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withSecurity, type RequestContext } from "../_shared/server.ts";
import { Vehicle } from "../_shared/types.ts";
import { debugLog } from "../_shared/logger.ts";

const OFFER_BASE_URLS = {
  production: "https://api.s4bdigital.net",
  staging: "https://stgapi.s4bdigital.net",
};

const EVENT_BASE_URLS = {
  production: "https://event-query.superbid.net",
  staging: "https://event-query.stage.superbid.net"
};

serve(withSecurity('sbx-offer', async (req: Request, ctx?: RequestContext) => {

  // =========================================================================
  // FASE 1: GATEKEEPER DE BORDA
  // [v2.0.0]: sessão já validada centralmente pelo wrapper (registry.ts:
  // authMode.type === 'session', enforcement: 'wrapper') — `ctx.auth` chega
  // pronto aqui. SESSION_EXPIRED (com handoff token) e UNAUTHORIZED são
  // tratados em `_shared/session-guard.ts`; o handler nem chega a rodar se
  // a sessão for inválida.
  // =========================================================================
  const auth = ctx?.auth;

  // =========================================================================
  // FASE 2: LÓGICA DE NEGÓCIO E PROXY UPSTREAM
  // =========================================================================
  try {
    const reqUrl = new URL(req.url);
    const offerId = reqUrl.searchParams.get("offer_id");

    if (!offerId) {
      throw Object.assign(new Error("ID da oferta não informado."), { errorCode: "MISSING_OFFER_ID" });
    }

    // O ambiente é lido estritamente do token lacrado
    const env = auth?.environment || "staging";
    const offerBaseUrl = OFFER_BASE_URLS[env as keyof typeof OFFER_BASE_URLS] || OFFER_BASE_URLS.staging;

    // Endpoint do Gateway S4B (Imune ao bloqueio da Cloudflare)
    const upstreamUrl = `${offerBaseUrl}/offerpanel/api/app-context?offerId=${offerId}&timeZoneId=America%2FSao_Paulo`;

    debugLog(`[sbx-offer] Buscando oferta ID: ${offerId} no ambiente seguro: ${env} -> ${upstreamUrl}`);

    const fetchOptions = {
      method: "GET",
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "User-Agent": req.headers.get("user-agent") ?? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Origin": "https://www.superbid.net",
        "Referer": "https://www.superbid.net/",
      },
    };

    const upstreamUrl = `${offerBaseUrl}/offerpanel/api/app-context?offerId=${offerId}&timeZoneId=America%2FSao_Paulo`;
    const response = await fetch(upstreamUrl, fetchOptions);

    if (!response.ok) {
      throw Object.assign(
        new Error(`Falha no Gateway S4B (${response.status})`), 
        { errorCode: "UPSTREAM_ERROR" }
      );
    }
    
    const rawData = await response.json();

    // ATENÇÃO: Verifique a chave raiz da resposta do app-context
    // Se os dados da oferta vierem direto na raiz ou em rawData.offer:
    const rawOffer = rawData.offer || rawData;

    if (!rawOffer || !rawOffer.id) {
      throw Object.assign(new Error(`Oferta não encontrada (ID: ${offerId}).`), { errorCode: "OFFER_NOT_FOUND" });
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
          offer_value: rawOffer.price || rawOffer.offerDetail?.referenceValue || 0,
          price_formatted: rawOffer.priceFormatted || rawOffer.offerDetail?.referenceValueFormatted || "",          system_metric: rawOffer.systemMetric || null,
          category_id: rawOffer.product?.productType?.id || 0,
          category: rawOffer.product?.productType?.description || "",
          subcategory_id: rawOffer.product?.subCategory?.id || "",
          subcategory: rawOffer.product?.subCategory?.description || "",
          offer_status_available: Boolean(rawOffer.offerStatus?.available),
          offer_status_sold: Boolean(rawOffer.offerStatus?.sold),
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