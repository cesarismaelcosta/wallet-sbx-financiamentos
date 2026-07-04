/**
 * @fileoverview Edge Function: sbx-offer
 * @description Responsável por validar tokens de acesso e reidratar os dados da oferta 
 * a partir do microserviço upstream (offer-query). Atua como um adaptador de interface 
 * entre o padrão de resposta da Superbid e as interfaces tipadas do ecosistema sbX.
 * 
 * @version 1.5.2
 * @author Cesar Ismael Pereira da Costa
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { Offer, Manager, Event, Seller } from "../_shared/types.ts";

/** 
 * [CONSTANTS] Configurações de ambiente e segurança 
 */
const DEBUG_MODE = true;
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sbx-env, x-session-token, x-sbx-offer-token',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

/**
 * Logs estruturados para facilitar o rastreamento em produção.
 */
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) console.log(`[SBX-OFFER] ${message}`, data ? JSON.stringify(data) : "");
};

serve(async (req) => {
  // [HANDLE CORS] Pre-flight requests
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  // mesmo header do sbx-user
  // Se o sbx-user usa 'x-session-token', o ideal é usar o mesmo padrão ou 'x-sbx-offer-token'
  const offerToken = req.headers.get("x-sbx-offer-token"); 
  const env = req.headers.get("x-sbx-env") || "stage";
  const baseUrl = env === "production" ? "https://offer-query.superbid.net" : "https://offer-query.stage.superbid.net";

  if (!offerToken) {
    return new Response(JSON.stringify({ error: "OFFER_TOKEN_REQUIRED" }), { status: 401, headers: corsHeaders });
  }
  
  try {
    // [STEP 1] SECURITY: Autenticação do Token
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) throw new Error("INTERNAL_CONFIG_ERROR");

    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(jwtSecret), 
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    
    const payload = await verify(offerToken, key);
    const offerId = payload.offer_id as number;

    // [STEP 2] INTEGRATION: Chamada Upstream
    const queryUrl = `${baseUrl}/offers/?filter=id:${offerId}&locale=pt_BR&portalId=[2,15]`;
    
    const response = await fetch(queryUrl, {
      method: "GET",
      headers: { "Accept": "application/json", "Content-Type": "application/json" },
    });

    if (!response.ok) {
        return new Response(JSON.stringify({ error: "UPSTREAM_API_UNAVAILABLE" }), { status: 502, headers: corsHeaders });
    }
    
    const data = await response.json();
    const offer = data.offers?.[0];

    if (!offer) {
        return new Response(JSON.stringify({ error: "OFFER_NOT_FOUND" }), { status: 404, headers: corsHeaders });
    }

    // [STEP 3] MAPPING: Estruturação para os Tipos Compartilhados (sbX Contracts)
    
    // Mapeamento da Oferta
    const offerData: Offer = {
      offer_id: String(offer.id),
      offer_description: offer.offerDescription?.offerDescription || offer.product?.shortDesc || "",
      offer_value: offer.price || 0,
      category_id: offer.product?.productType?.id,
      category: offer.product?.productType?.description || "",
      // Campos estendidos via index signature
      lot_number: offer.lotNumber,
      offer_status: offer.offerStatus,
      sale_status: offer.saleStatus,
      end_date: offer.endDate
    };

    // Mapeamento do Gerenciador
    const managerData: Manager = {
      manager_id: offer.manager?.id,
      manager_name: offer.manager?.name || "N/A"
    };

    // Mapeamento do Evento
    const eventData: Event = {
      event_id: String(offer.auction?.id),
      event_description: offer.auction?.desc || "",
      event_start_date: offer.auction?.beginDate || "",
      event_end_date: offer.auction?.endDate || ""
    };

    // Mapeamento do Vendedor
    const sellerData: Seller = {
      seller_id: String(offer.seller?.id || ""),
      legal_name: offer.seller?.name || "N/A",
      trade_name: offer.seller?.company?.[0]?.fantasyName || "N/A",
      economic_group: offer.seller?.company?.[0]?.fantasyName || "N/A"
    };

    // [RESPONSE] Payload consolidado para o orquestrador
    return new Response(JSON.stringify({
      offer: offerData,
      manager: managerData,
      event: eventData,
      seller: sellerData
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (err: any) {
    debugLog("Fatal Exception in sbx-offer:", err.message);
    return new Response(JSON.stringify({ error: "INTERNAL_SERVER_ERROR" }), { 
      status: 500, headers: corsHeaders 
    });
  }
});