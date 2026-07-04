/**
 * @fileoverview Edge Function: sbx-offer (Offer Access Gatekeeper)
 * * * ARQUITETURA DE SEGURANÇA:
 * Esta função atua como o validador de acesso do ecossistema sbX para ofertas.
 * Ela não confia no cliente. Ela valida o JWT, consulta o estado da sessão 
 * no banco (sbx_sessions) e, somente após a validação bem-sucedida, performa 
 * o proxy para a API Upstream (offer-query).
 * * * [RESPONSABILIDADES]:
 * 1. Segurança: Verifica a assinatura HMAC-SHA256 e o TTL do JWT.
 * 2. Integridade: Mapeia o 'jti' do JWT para buscar o UUID no banco.
 * 3. Orquestração: Hidrata dados da oferta usando o token recuperado.
 * * @author Cesar Ismael Pereira da Costa
 * @version 1.5.2
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { Offer, Manager, Event, Seller } from "../_shared/types.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sbx-env, x-session-token, x-sbx-offer-token',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

serve(async (req) => {
  // =========================================================================
  // 1. HANDSHAKE (OPTIONS)
  // =========================================================================
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const offerToken = req.headers.get("x-sbx-offer-token");
  const env = req.headers.get("x-sbx-env") || "stage";
  const baseUrl = env === "production" ? "https://offer-query.superbid.net" : "https://offer-query.stage.superbid.net";

  if (!offerToken) {
    return new Response(JSON.stringify({ error: "OFFER_TOKEN_REQUIRED" }), { status: 401, headers: corsHeaders });
  }

  try {
    // =========================================================================
    // 2. SEGURANÇA: VALIDAÇÃO DO JWT E SESSÃO
    // =========================================================================
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) throw new Error("INTERNAL_CONFIG_ERROR");

    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(jwtSecret), 
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    
    const payload = await verify(offerToken, key);
    
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sbx_sessions')
      .select('sbx_access_token, expires_at')
      .eq('session_token', payload.jti)
      .single();

    if (sessionError || !session) return new Response(JSON.stringify({ error: "SESSION_INVALID" }), { status: 401, headers: corsHeaders });

    if (new Date() > new Date(session.expires_at)) {
      return new Response(JSON.stringify({ error: "SESSION_EXPIRED" }), { status: 401, headers: corsHeaders });
    }

    // =========================================================================
    // 3. INTEGRAÇÃO: CHAMADA UPSTREAM
    // =========================================================================
    const queryUrl = `${baseUrl}/offers/?filter=id:${payload.offer_id}&locale=pt_BR&portalId=[2,15]`;
    
    const response = await fetch(queryUrl, {
      method: "GET",
      headers: { 
        "Authorization": `Bearer ${session.sbx_access_token}`,
        "Accept": "application/json", 
        "Content-Type": "application/json" 
      },
    });

    if (!response.ok) {
        return new Response(JSON.stringify({ error: "UPSTREAM_API_UNAVAILABLE" }), { status: 502, headers: corsHeaders });
    }
    
    const data = await response.json();
    const offer = data.offers?.[0];

    if (!offer) {
        return new Response(JSON.stringify({ error: "OFFER_NOT_FOUND" }), { status: 404, headers: corsHeaders });
    }

    // =========================================================================
    // 4. MAPPING: ESTRUTURAÇÃO PARA TIPOS COMPARTILHADOS (sbX Contracts)
    // =========================================================================
    const enrichedData = {
      offer: {
        offer_id: String(offer.id),
        offer_description: offer.offerDescription?.offerDescription || offer.product?.shortDesc || "",
        offer_value: offer.price || 0,
        category_id: offer.product?.productType?.id,
        category: offer.product?.productType?.description || "",
        lot_number: offer.lotNumber,
        offer_status: offer.offerStatus,
        sale_status: offer.saleStatus,
        end_date: offer.endDate
      },
      manager: { manager_id: offer.manager?.id, manager_name: offer.manager?.name || "N/A" },
      event: {
        event_id: String(offer.auction?.id),
        event_description: offer.auction?.desc || "",
        event_start_date: offer.auction?.beginDate || "",
        event_end_date: offer.auction?.endDate || ""
      },
      seller: {
        seller_id: String(offer.seller?.id || ""),
        legal_name: offer.seller?.name || "N/A",
        trade_name: offer.seller?.company?.[0]?.fantasyName || "N/A",
        economic_group: offer.seller?.company?.[0]?.fantasyName || "N/A"
      }
    };

    return new Response(JSON.stringify(enrichedData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (err: any) {
    const status = err.message.includes("Token") ? 401 : 500;
    return new Response(JSON.stringify({ error: "INTERNAL_SERVER_ERROR" }), { 
      status, headers: corsHeaders 
    });
  }
});