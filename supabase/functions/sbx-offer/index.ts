/**
 * @fileoverview Edge Function: sbx-offer (Offer Details BFF)
 * * ARQUITETURA DE SEGURANÇA E CONTEXTO (Desacoplada):
 * 1. Identidade: Valida o JWT recebido no header `x-sbx-offer-token` e consulta a sessão ativa.
 * 2. Contexto: Extrai o `offer_id` diretamente dos parâmetros da URL (Query String), e não do token.
 * 3. Integração: Consulta o catálogo da Superbid passando o access token da sessão original.
 * 4. BFF (Backend For Frontend): Mapeia o payload bruto da Superbid para o contrato enxuto do Frontend.
 * * @version 2.1.0 (Com Tipagem Forte End-to-End Isolada)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

// ============================================================================
// IMPORTAÇÃO DE TIPOS COMPARTILHADOS
// Ajuste o caminho relativo conforme a distância da pasta 'supabase/functions/sbx-offer' 
// até a pasta 'src'. O Deno exige a extensão '.ts'.
// ============================================================================
import type { Offer, Manager, Event, Seller } from "../../../src/features/financial-hub/components/shared/types.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sbx-env, x-sbx-offer-token',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

serve(async (req) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // =========================================================================
    // 1. IDENTIDADE (Autenticação via JWT estático)
    // =========================================================================
    const offerToken = req.headers.get("x-sbx-offer-token");
    if (!offerToken) {
        throw new Error("AUTH_REQUIRED: x-sbx-offer-token ausente.");
    }

    const jwtSecret = Deno.env.get("JWT_SECRET")!;
    const key = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(jwtSecret), 
        { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    
    const payload = await verify(offerToken, key) as any;

    const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!, 
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const { data: session } = await supabaseAdmin
        .from('sbx_sessions')
        .select('sbx_access_token')
        .eq('session_token', payload.jti)
        .single();
        
    if (!session) {
        throw new Error("SESSION_INVALID: Sessão não encontrada ou expirada no banco de dados.");
    }

    // =========================================================================
    // 2. CONTEXTO DA OFERTA (Parâmetro dinâmico via URL)
    // =========================================================================
    const reqUrl = new URL(req.url);
    const offerId = reqUrl.searchParams.get("offer_id");

    if (!offerId) {
        throw new Error("MISSING_OFFER_ID: O parâmetro ?offer_id= é obrigatório na URL.");
    }

    // =========================================================================
    // 3. INTEGRAÇÃO UPSTREAM (Superbid API)
    // =========================================================================
    const env = req.headers.get("x-sbx-env") || "stage";
    const baseUrl = env === "production" ? "https://offer-query.superbid.net" : "https://offer-query.stage.superbid.net";
    
    const upstreamUrl = `${baseUrl}/offers/?portalId=[2,15]&locale=pt_BR&timeZoneId=America/Sao_Paulo&searchType=opened&filter=id:[${offerId}]&pageNumber=1&pageSize=15&orderBy=price:desc&requestOrigin=marketplace&preOrderBy=orderByFirstOpenedOffersAndSecondHasPhoto`;

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

    if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`UPSTREAM_ERROR (${response.status}): ${errBody}`);
    }

    const data = await response.json();
    const rawOffer = data.offers?.[0];

    if (!rawOffer) {
        throw new Error(`OFFER_NOT_FOUND_IN_UPSTREAM: Nenhuma oferta retornada para o ID ${offerId}.`);
    }

    // =========================================================================
    // 4. MAPEAMENTO DO PAYLOAD (BFF Contract com Type Safety)
    // =========================================================================
    
    // A mágica acontece aqui. O objeto é forçado a respeitar as interfaces exatas.
    const payloadResult: { offer: Offer; manager: Manager; event: Event; seller: Seller } = {
      offer: {
        offer_id: String(rawOffer.id),
        offer_description: rawOffer.offerDescription?.offerDescription || rawOffer.product?.shortDesc || "",
        offer_value: rawOffer.price || 0,
        category_id: rawOffer.product?.productType?.id || 0,
        category: rawOffer.product?.productType?.description || "",
        lot_number: rawOffer.lotNumber || "",
        offer_status: rawOffer.offerStatus || "",
        sale_status: rawOffer.saleStatus || "",
        end_date: rawOffer.endDate || ""
      },
      manager: {
        manager_id: rawOffer.manager?.id || 0,
        manager_name: rawOffer.manager?.name || "N/A"
      },
      event: {
        event_id: String(rawOffer.auction?.id || ""),
        event_description: rawOffer.auction?.desc || "",
        event_start_date: rawOffer.auction?.beginDate || "",
        event_end_date: rawOffer.auction?.endDate || ""
      },
      seller: {
        seller_id: String(rawOffer.seller?.id || ""),
        legal_name: rawOffer.seller?.name || "N/A",
        trade_name: rawOffer.seller?.company?.[0]?.fantasyName || "N/A",
        economic_group: rawOffer.seller?.company?.[0]?.fantasyName || "N/A"
      }
    };

    // =========================================================================
    // 5. RESPOSTA DE SUCESSO
    // =========================================================================
    return new Response(JSON.stringify(payloadResult), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" }, 
      status: 200 
    });

  } catch (err: any) {
    console.error("[SBX-OFFER] Erro Fatal:", err.message);
    
    let status = 500;
    if (err.message.includes("AUTH") || err.message.includes("SESSION")) status = 401;
    if (err.message.includes("MISSING")) status = 400;
    if (err.message.includes("UPSTREAM")) status = 502;

    return new Response(JSON.stringify({ error: err.message }), { status, headers: corsHeaders });
  }
});