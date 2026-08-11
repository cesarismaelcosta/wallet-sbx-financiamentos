/**
 * @fileoverview Edge Function: SBX-OFFER-QUERY (BFF - Stateless com Debug Exaustivo e Normalização)
 * @path supabase/functions/sbx-offer-query/index.ts
 *
 * ============================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE - DOCUMENTAÇÃO DE NEGÓCIO]
 * ============================================================================
 * BFF (Backend for Frontend) responsável por traduzir a intenção do usuário 
 * (Produto + Ordenação + Categoria) para a taxonomia complexa da API da Superbid.
 * 
 * DIRETRIZES DE ENGENHARIA E PRODUTO APLICADAS:
 * 
 * 1. REGRA DE OURO DO FINANCIAMENTO: 
 *    Para blindar nosso BFF contra inconsistências de roteamento da Superbid 
 *    (urlSeo vs categoryId), nós SEMPRE forçamos a busca utilizando o parâmetro 
 *    de filtro raiz (`product.subCategory.category.description`). Isso unifica 
 *    o comportamento para Carros, Caminhões, Máquinas e Imóveis.
 * 
 * 2. REGRA DO CARTÃO DE CRÉDITO:
 *    Mapeado como uma condição comercial. Ele zera a `keyword` e injeta a 
 *    flag booleana direta no parâmetro `filter` 
 *    (`commercialCondition.allowsCreditCard:true`).
 * 
 * 3. FALLBACK DE ORDENAÇÃO:
 *    Focado em conversão. Se o front-end não enviar ordem, o sistema assume 
 *    "encerramento_proximo" (endDate:asc) para gerar senso de urgência.
 * 
 * 4. NORMALIZAÇÃO DE PAYLOAD (Contrato Oficial):
 *    Transforma a resposta de listagem da API (array de ofertas) para o contrato 
 *    padrão de "Detalhe de Oferta" (sbx-offer), garantindo que a UI consuma 
 *    exatamente os mesmos campos, independente da origem.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { validateRequest } from "../_shared/auth.ts";
import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";

const OFFER_BASE_URLS = {
  production: "https://offer-query.superbid.net",
  staging: "https://offer-query.stage.superbid.net"
};

const PRODUCT_MAP: Record<number, string> = {
  1: "Fin. Imobiliário",
  2: "Fin. Carros",
  3: "Fin. Máquinas Agrícolas",
  4: "Fin. Máquinas Amarelas",
  5: "Fin. Caminhões",
  6: "Home Equity",
  7: "Car Equity",
  8: "Cartão de Crédito",
  9: "Seguro Auto",
  10: "Seguro Residencial"
};

const SORT_MAP: Record<string, string> = {
  "encerramento_proximo": "endDate:asc",
  "numero_lote": "lotNumber:asc;subLotNumber:asc",
  "relevancia": "score:desc",
  "maior_valor": "price:desc",
  "menor_valor": "price:asc",
  "mais_visitados": "visits:desc"
};

serve(withSecurity('sbx-offer-query', async (req: Request) => {
  
  debugLog(`[DEBUG] 🚀 Requisição recebida na Edge Function sbx-offer-query`);

  // =========================================================================
  // FASE 1: GATEKEEPER DE BORDA (Validação Stateless do JWT & Headers)
  // =========================================================================
  const incomingHeaders = {
    auth: req.headers.get("authorization") ? "Presente" : "Ausente",
    sessionToken: req.headers.get("x-session-token") ? "Presente" : "Ausente",
    originalUrl: req.headers.get("x-original-url"),
    fallbackUrl: req.headers.get("x-auth-fallback-url"),
  };
  debugLog(`[DEBUG] 📥 Headers recebidos: ${JSON.stringify(incomingHeaders)}`);

  let auth;
  try {
    auth = await validateRequest(req);
    debugLog(`[DEBUG] ✅ Autenticação validada com sucesso. Ambiente: ${auth?.environment || 'staging'}`);
  } catch (err: any) {
    const authUrl = req.headers.get("x-auth-fallback-url") || "/accounts/signin";
    debugLog(`[DEBUG] ❌ Falha de autenticação na borda: ${err.message}`);
    return new Response(JSON.stringify({
      success: false, 
      code: "UNAUTHORIZED", 
      message: "Sessão inválida ou expirada. Por favor, faça login novamente.", 
      fallback_url: authUrl 
    }), { status: 401, headers: { 'Content-Type': 'application/json' } });
  }

  // =========================================================================
  // FASE 2: PARSE DO REQUEST & APLICAÇÃO DE FALLBACKS (PRODUTO)
  // =========================================================================
  try {
    const bodyText = await req.text();
    debugLog(`[DEBUG] 📦 Raw Body recebido: ${bodyText}`);
    
    const body = bodyText ? JSON.parse(bodyText) : {};
    
    const { 
      productId, 
      pageNumber = 1, 
      pageSize = 30, 
      sort = "encerramento_proximo",
      categoryFilter = null 
    } = body;

    debugLog(`[DEBUG] 🔍 Parâmetros extraídos -> productId: ${productId}, sort: ${sort}, page: ${pageNumber}, size: ${pageSize}, categoryFilter: ${categoryFilter}`);

    if (!productId) {
      throw Object.assign(new Error("O parâmetro 'productId' é obrigatório."), { errorCode: "MISSING_PARAM" });
    }

    const productName = PRODUCT_MAP[Number(productId)];
    if (!productName) {
      throw Object.assign(new Error(`Produto ID ${productId} não reconhecido.`), { errorCode: "INVALID_PRODUCT" });
    }

    const orderBy = SORT_MAP[sort] || "endDate:asc";

    debugLog(`[sbx-offer-query] Iniciando busca: [Produto: ${productName}] [Sort: ${orderBy}] [Página: ${pageNumber}]`);

    // =========================================================================
    // FASE 3: ROTEAMENTO INTELIGENTE E TAXONOMIA
    // =========================================================================
    let keyword = ""; 
    let filter = "";

    switch (productName) {
      case "Fin. Carros":
        keyword = "financiamentosuperbidpay";
        filter = "product.subCategory.category.description:carros";
        break;
      case "Fin. Caminhões":
        keyword = "financiamentosuperbidpay";
        filter = "product.subCategory.category.description:caminhoes";
        break;
      case "Fin. Máquinas Agrícolas":
        keyword = "financiamentosuperbidpay";
        filter = "product.subCategory.category.description:maquinas_agricolas"; 
        break;
      case "Fin. Máquinas Amarelas":
        keyword = "financiamentosuperbidpay";
        filter = "product.subCategory.category.description:maquinas_pesadas"; 
        break;
      case "Fin. Imobiliário":
        keyword = "financiamentosuperbidpay";
        filter = "product.subCategory.category.description:imoveis"; 
        break;
      case "Cartão de Crédito":
        keyword = ""; 
        filter = "commercialCondition.allowsCreditCard:true"; 
        break;
      case "Home Equity":
      case "Car Equity":
      case "Seguro Auto":
      case "Seguro Residencial":
        throw Object.assign(
            new Error(`O produto '${productName}' não possui listagem de ofertas em catálogo.`), 
            { errorCode: "UNSUPPORTED_CATALOG_PRODUCT" }
        );
      default:
        throw Object.assign(new Error(`Regra de filtro não mapeada para: ${productName}`), { errorCode: "UNMAPPED_PRODUCT_RULE" });
    }

    debugLog(`[DEBUG] ⚙️ Rota definida -> Produto: ${productName} | Keyword: '${keyword}' | Filter: '${filter}' | OrderBy: '${orderBy}' | CategoryId: '${categoryFilter || 'N/A'}'`);

    // =========================================================================
    // FASE 4: MONTAGEM DA REQUISIÇÃO UPSTREAM (Endpoint Dinâmico)
    // =========================================================================
    const env = auth.environment || "staging";
    const offerBaseUrl = OFFER_BASE_URLS[env] || OFFER_BASE_URLS.staging;
    
    const queryParams = new URLSearchParams();
    queryParams.append("portalId", "[2,15]");
    queryParams.append("locale", "pt_BR");
    queryParams.append("timeZoneId", "America/Sao_Paulo");
    queryParams.append("searchType", "opened");
    queryParams.append("preOrderBy", "orderByFirstOpenedOffersAndSecondHasPhoto");
    queryParams.append("requestOrigin", "marketplace");

    if (keyword) queryParams.append("keyword", keyword);
    if (filter) queryParams.append("filter", filter);
    
    // Se o usuário clicou em uma categoria, usamos o endpoint SEO com urlSeo.
    // Caso contrário, usamos a raiz /offers/ para evitar o erro 500.
    let endpoint = "/offers/";
    if (categoryFilter) {
      endpoint = "/seo/offers/";
      queryParams.append("urlSeo", `https://www.superbid.net/categorias/${categoryFilter}`);
    }
    
    queryParams.append("orderBy", orderBy);
    queryParams.append("pageNumber", pageNumber.toString());
    queryParams.append("pageSize", pageSize.toString());

    const superbidUrl = `${offerBaseUrl}${endpoint}?${queryParams.toString()}`;
    debugLog(`[DEBUG] 🌐 URL gerada para chamada Upstream: ${superbidUrl}`);
    
    const fetchOptions = {
      method: "GET",
      headers: { 
        "Accept": "application/json", 
        "Origin": "https://www.superbid.net",
        "Referer": "https://www.superbid.net/"
      },
    };

    debugLog(`[sbx-offer-query] Executando chamada Upstream: ${superbidUrl}`);
    const upstreamResponse = await fetch(superbidUrl, fetchOptions);
    debugLog(`[DEBUG] 📡 Status da resposta Upstream: ${upstreamResponse.status} ${upstreamResponse.statusText}`);

    if (!upstreamResponse.ok) {
      const errorBodyText = await upstreamResponse.text();
      debugLog(`[DEBUG] ❌ Erro Retornado pelo Upstream: ${errorBodyText}`);
      throw Object.assign(new Error(`Falha no Upstream (Superbid API): Status ${upstreamResponse.status}`), { errorCode: "UPSTREAM_ERROR" });
    }
    
    const upstreamData = await upstreamResponse.json();
    const rawOffers = upstreamData.offers || upstreamData.template?.groups || [];
    const totalCount = upstreamData.total || upstreamData.totalElements || rawOffers.length;
    
    debugLog(`[DEBUG] ✨ Sucesso Upstream! Total elements: ${totalCount} | Ofertas retornadas: ${rawOffers.length}`);

    // =========================================================================
    // FASE 5: NORMALIZAÇÃO DE DADOS (Payload Otimizado para Performance)
    // =========================================================================
    const normalizedOffers = rawOffers.map((rawOffer: any) => {
      const productTypeId = rawOffer.product?.productType?.id;
      const isVehicleCategory = [10, 11].includes(productTypeId);
      let vehicleData: any | undefined;

      // Extração de dados de veículos (mantido)
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

      // Extração de referência do eventData (base para descrições, imagens e status)
      const eventData = rawOffer.auction || {};

      return {
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
      };
    });

    // =========================================================================
    // FASE 6: CONTRATO DE RESPOSTA BFF (Normalizado e limpo)
    // =========================================================================
    return new Response(JSON.stringify({
      success: true,
      total: totalCount,
      metadata: { 
        total_elements: totalCount, 
        page_number: pageNumber, 
        page_size: pageSize 
      },
      offers: normalizedOffers
    }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });

  } catch (err: any) {
    debugLog(`[DEBUG] 💥 ERRO OPERACIONAL: ${err.message} | Code: ${err.errorCode || 'UNKNOWN'}`);
    const statusCode = ["MISSING_PARAM", "INVALID_PRODUCT", "UNSUPPORTED_CATALOG_PRODUCT"].includes(err.errorCode) ? 400 : 500;
    
    return new Response(JSON.stringify({ 
      success: false, 
      code: err.errorCode || "UNKNOWN_ERROR", 
      message: err.message || "Erro interno ao processar a busca de ofertas." 
    }), { 
      status: statusCode, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
}));