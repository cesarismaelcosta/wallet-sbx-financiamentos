/**
 * @fileoverview Edge Function: SBX-OFFER (Offer Details BFF)
 *
 * ARQUITETURA DE SEGURANÇA E CONTEXTO (BFF Contract):
 * Esta função atua como o BFF responsável por obter os detalhes completos de uma oferta,
 * lote e seu respectivo evento de leilão no ecossistema Superbid.
 *
 * PRINCIPAIS RESPONSABILIDADES & FLUXO DE EXECUÇÃO:
 * 1. Identidade & Autenticação Zero-Trust: Delega a verificação de sessão para `validateRequest(req)`,
 *    que valida a assinatura do JWT e extrai o `sbx_access_token` e o `environment` da SSOT no banco.
 * 2. Roteamento de Upstream por Ambiente: Mapeia dinamicamente as URLs base dos microsserviços
 *    da Superbid (`offer-query` e `event-query`) para `staging` ou `production`.
 * 3. Consulta em Cascata (Oferta + Evento):
 *    - Bate em `offer-query` filtrando pelo `offer_id` recebido na query string.
 *    - Se a oferta estiver vinculada a um evento de leilão (`auction.id`), enriquece os dados
 *      consultando em paralelo a API `event-query`.
 * 4. Extração de Atributos de Veículos: Analisa os grupos de propriedades do produto. Caso seja
 *    da categoria de veículos (productTypeId 10 ou 11), extrai os metadados de Ano Fabricação,
 *    Ano Modelo e Código FIPE.
 * 5. Sanitização & Contrato Enxuto BFF: Normaliza a resposta agregada em um contrato fortemente tipado
 *    contendo: detalhes da oferta, galeria de fotos, localização, leiloeiro/gestor, evento e vendedor.
 *
 * @author César Ismael Pereira da Costa
 * @version 3.0.0 (Eliminação de buscas duplicadas no DB, suporte nativo a HttpOnly e Standard Docs)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateRequest } from "../_shared/auth.ts";
import { withSecurity } from "../_shared/server.ts";
import { Vehicle } from "../_shared/types.ts";
import { debugLog } from "../_shared/logger.ts";

/**
 * Mapeamento de URLs base do microsserviço de busca de ofertas por ambiente
 */
const OFFER_BASE_URLS = {
  production: "https://offer-query.superbid.net",
  staging: "https://offer-query.stage.superbid.net"
};

/**
 * Mapeamento de URLs base do microsserviço de busca de eventos/leilões por ambiente
 */
const EVENT_BASE_URLS = {
  production: "https://event-query.superbid.net",
  staging: "https://event-query.stage.superbid.net"
};

// =========================================================================
// HANDLER PRINCIPAL (Envelopado pelo Wrapper Central de Segurança)
// =========================================================================
serve(withSecurity('sbx-offer', async (req: Request) => {

  // -----------------------------------------------------------------------
  // FASE 1: GATEKEEPER (Validação de Segurança Zero-Trust)
  // O validateRequest resolve os tokens upstream e o ambiente sem precisar de decode() manual.
  // -----------------------------------------------------------------------
  let auth;
  try {
    auth = await validateRequest(req);
  } catch (err: any) {
    const originPath = req.headers.get("x-original-url") || "/";
    const authUrl = req.headers.get("x-auth-fallback-url") || "/accounts/signin";

    let userMessage = "Falha de autenticação. Por favor, faça login novamente.";
    let errorCode = "UNAUTHORIZED";
    let fallbackUrl = authUrl;
    let statusCode = 401;

    // Tradução semântica das exceções de segurança para a UX do Frontend
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
      data: { 
        success: false, 
        code: errorCode, 
        message: userMessage, 
        fallback_url: fallbackUrl 
      }
    };
  }

  // -----------------------------------------------------------------------
  // FASE 2: INTEGRAÇÃO E NEGÓCIO (Upstream & Hydration)
  // -----------------------------------------------------------------------
  try {
    const originPath = req.headers.get("x-original-url") || "/";
    const authUrl = req.headers.get("x-auth-fallback-url") || "/accounts/signin";

    // Extração do identificador da oferta a partir da URL
    const reqUrl = new URL(req.url);
    const offerId = reqUrl.searchParams.get("offer_id");

    if (!offerId) {
      throw Object.assign(new Error("ID da oferta não informado."), { 
        errorCode: "MISSING_OFFER_ID", 
        fallback_url: originPath 
      });
    }

    // Resolução dos endpoints de Upstream baseados no ambiente validado da sessão
    const env = auth.environment || "staging";
    const offerBaseUrl = OFFER_BASE_URLS[env] || OFFER_BASE_URLS.staging;
    const eventBaseUrl = EVENT_BASE_URLS[env] || EVENT_BASE_URLS.staging;

    const upstreamUrl = `${offerBaseUrl}/offers/?portalId=[2,15]&locale=pt_BR&timeZoneId=America/Sao_Paulo&searchType=opened&filter=id:[${offerId}]&pageNumber=1&pageSize=15&orderBy=price:desc&requestOrigin=marketplace&preOrderBy=orderByFirstOpenedOffersAndSecondHasPhoto`;

    debugLog(`[sbx-offer] Buscando oferta ID: ${offerId} no ambiente Upstream: ${env}`);

    // Chamada à API de ofertas da Superbid
    const response = await fetch(upstreamUrl, {
      method: "GET",
      headers: { 
        "Authorization": `Bearer ${auth.sbx_access_token}`, 
        "Accept": "application/json", 
        "Content-Type": "application/json",
        "Origin": "https://www.superbid.net",
        "Referer": "https://www.superbid.net/"
      },
    });

    if (response.status === 401) {
      throw Object.assign(new Error("Sessão na plataforma expirou."), { 
        errorCode: "SESSION_EXPIRED", 
        fallback_url: authUrl 
      });
    }

    if (!response.ok) {
      throw Object.assign(new Error(`Falha na API da Superbid (${response.status})`), { 
        errorCode: "UPSTREAM_ERROR", 
        fallback_url: originPath 
      });
    }
    
    const data = await response.json();
    const rawOffer = data.offers?.[0];

    if (!rawOffer) {
      throw Object.assign(new Error(`Oferta não encontrada (Lote: ${offerId}).`), { 
        errorCode: "OFFER_NOT_FOUND", 
        fallback_url: originPath 
      });
    }

    // -----------------------------------------------------------------------
    // STEP 2.1: CONSULTA COMPLEMENTAR DE EVENTO / LEILÃO
    // -----------------------------------------------------------------------
    let eventData: any = {};
    const auctionId = rawOffer.auction?.id;
    if (auctionId) {
      const eventUrl = `${eventBaseUrl}/events/v2/?portalId=[2,15]&locale=pt_BR&timeZoneId=America%2FSao_Paulo&filter=id:${auctionId}&pageSize=1`;
      
      const eventResponse = await fetch(eventUrl, {
        method: "GET",
        headers: { 
          "Authorization": `Bearer ${auth.sbx_access_token}`, 
          "Accept": "application/json", 
          "Content-Type": "application/json" 
        },
      });

      if (eventResponse.ok) {
        const eventJson = await eventResponse.json();
        eventData = eventJson.events?.[0] || {};
      }
    }

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

    // -----------------------------------------------------------------------
    // FASE 3: MONTAGEM DO CONTRATO DE RESPOSTA BFF
    // -----------------------------------------------------------------------
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
    debugLog(`[sbx-offer] Falha operacional: ${err.message}`);
    
    return {
      status: err.errorCode === "SESSION_EXPIRED" ? 401 : 500,
      data: {
        success: false,
        code: err.errorCode || "UNKNOWN_ERROR",
        message: err.message || "Erro interno no processamento da oferta.",
        fallback_url: err.fallback_url || "/"
      }
    };
  }
}));