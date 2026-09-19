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

    // Resolução de ambiente e URL base a partir do contexto
    const env = auth?.environment || "staging";
    const offerBaseUrl = OFFER_BASE_URLS[env as keyof typeof OFFER_BASE_URLS] || OFFER_BASE_URLS.staging;

    // URL idêntica à requisição funcional do seu navegador
    const upstreamUrl = `${offerBaseUrl}/offerpanel/api/app-context?offerId=${offerId}&timeZoneId=America%2FSao_Paulo`;

    debugLog(`[sbx-offer] Buscando oferta ID: ${offerId} no ambiente seguro: ${env} -> ${upstreamUrl}`);  

const fetchOptions = {
      method: "GET",
      headers: {
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "User-Agent": req.headers.get("user-agent") ?? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Origin": "https://www.superbid.net",
        "Referer": "https://www.superbid.net/",
        "Sec-Ch-Ua": "\"Chromium\";v=\"122\", \"Not(A:Brand\";v=\"24\", \"Google Chrome\";v=\"122\"",
        "Sec-Ch-Ua-Mobile": "?0",
        "Sec-Ch-Ua-Platform": "\"Windows\"",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "cross-site"
      },
    };

    const response = await fetch(upstreamUrl, fetchOptions);

    if (!response.ok) {
      const errorText = await response.text();
      debugLog(`[sbx-offer] Resposta Upstream S4B (${response.status}): ${errorText}`);
      throw Object.assign(
        new Error(`Falha no Gateway S4B (${response.status})`), 
        { errorCode: "UPSTREAM_ERROR" }
      );
    }
    
    const rawData = await response.json();

    // Extração segura das raízes do app-context
    const lote = rawData.refreshResult?.lote;
    const leilao = rawData.leilao || {};

    if (!lote || !lote.ofertaId) {
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

    // Formatador de moeda para manter o campo price_formatted
    const formatCurrency = (val: number) => 
      new Intl.NumberFormat("pt-BR", { style: "currency", currency: leilao.currency || "BRL" }).format(val);

    const offerValue = lote.lanceAtualValor || lote.lanceInicialValor || 0;

    // =========================================================================
    // FASE 3: MONTAGEM DO CONTRATO DE RESPOSTA BFF
    // =========================================================================
    return {
      status: 200,
      data: {
        offer: {
          offer_id: String(lote.ofertaId),
          lot_number: Number(lote.loteNumero?.numLote || lote.loteNumero?.label || 1),
          offer_description: lote.descricao || `Lote ${lote.loteNumero?.label || ""}`,
          offer_detailed_description: lote.descricaoDetalhada || lote.descricao || "",
          offer_value: offerValue,
          price_formatted: formatCurrency(offerValue),
          system_metric: lote.sistemaMetrico || "un",
          category_id: lote.categoryId || 0,
          category: lote.categoryName || "",
          subcategory_id: lote.subCategoryId || "",
          subcategory: lote.subCategoryName || "",
          offer_status_available: !lote.fechado && !lote.retirado,
          offer_status_sold: lote.fechado && !lote.semLance,
          end_date: lote.endDateTime || lote.endDate || "",
          is_shopping: false, 
          offer_type_id: lote.offerType ?? null,
          location: {
            neighborhood: lote.bairro || "Não informado",
            city: lote.cidade || "Não informado",
            state: lote.uf || "Não informado",
            country: "Brasil"
          },
          ...(vehicleData && { vehicle_details: vehicleData }),
          photos: (lote.photos || []).map((p: any, idx: number) => ({
            highlight: idx === 0,
            link: p.url || p.link || p,
            thumbnail: p.thumbnailUrl || p.url || p,
            file_name: p.fileName || `foto_${idx + 1}.jpg`,
            type: "photo",
            content_type: "image/jpeg"
          }))
        },
        manager: {
          manager_id: 0,
          manager_name: "Superbid Marketplace"
        },
        event: {
          event_id: String(leilao.id || lote.auctionId || ""),
          event_description: leilao.nome || "",
          event_start_date: lote.beginDateTime || lote.startDate || "",
          event_end_date: lote.endDateTime || lote.endDate || "",
          modality_id: lote.lotAuctionTypeId ?? null,
          modality_desc: leilao.locale || "Leilão Oficial",
          status_id: lote.status ?? null
        },
        seller: {
          seller_id: String(leilao.comitenteId || ""),
          legal_name: leilao.nome || "Comitente",
          trade_name: leilao.nome || "Comitente",
          economic_group: leilao.nome || "Comitente"
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