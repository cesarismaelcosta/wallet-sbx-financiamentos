/**
 * @fileoverview Edge Function: sbx-loader (Unified Gateway Initializer)
 * Consolida Auth Exchange, User Profile e Offer Details em uma única chamada atômica.
 * 
 * ARQUITETURA PARA RETORNO NA ENTRADA NO GATEWAY:
 * 1. [SECURITY]: Validação de token externo e criação de sessão interna.
 * 2. [HYDRO]: Mapeamento completo de dados (Perfil + Oferta + Evento + Seller).
 * 3. [RESILIENCE]: Dispatcher centralizado de erros semânticos (401, 404, 502).
 * 4. [SSR-COMPAT]: Injeção de Cookie HTTP-Only para persistência entre SSR e Client.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { captureInfrastructure } from "../_shared/infrastructure.ts";
import { BFFUserProfile, BFFOfferDetails } from "../_shared/types.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENV_URLS = {
  production: { api: "https://api.s4bdigital.net", offer: "https://offer-query.superbid.net", event: "https://event-query.superbid.net" },
  staging: { api: "https://stgapi.s4bdigital.net", offer: "https://offer-query.stage.superbid.net", event: "https://event-query.stage.superbid.net" }
};

serve(async (req) => {
  // Preflight CORS (Handshake obrigatório para browsers)
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Extração de parâmetros da requisição
    const { sbx_access_token, environment, offer_id } = await req.json();

    if (!sbx_access_token || !environment) throw new Error("BAD_REQUEST: Credenciais ou ambiente ausentes.");
    const urls = ENV_URLS[environment as keyof typeof ENV_URLS];

    // =========================================================================
    // 1. VALIDAÇÃO UPSTREAM (Autenticação na API de Origem)
    // =========================================================================
    const userRes = await fetch(`${urls.api}/account/v2/user/me`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${sbx_access_token}` }
    });

    // Se o token upstream expirou, forçamos o protocolo de amnésia no frontend (401)
    if (userRes.status === 401) throw new Error("SESSION_UPSTREAM_EXPIRED: O token real da Superbid expirou.");
    if (!userRes.ok) throw new Error(`UPSTREAM_USER_ERROR (${userRes.status}): Falha na API de Usuário.`);
    
    const userData = await userRes.json();
    const account = userData.userAccounts?.[0];
    const mainAddress = account?.addresses?.[0];
    const userId = String(account?.id);

    // =========================================================================
    // 2. HIDRATAÇÃO DE PERFIL (BFF Mapping)
    // =========================================================================
    const userProfile: BFFUserProfile = {
      entity_id: userId,
      name: account?.basicInfo?.fullName || "N/A",
      document: account?.documents?.find((d: any) => d.typeName === "cpf")?.number || "",
      email: account?.basicInfo?.email?.address || "",
      phone: account?.phones?.find((p: any) => p.type === 3)?.fullPhoneNumber || "",
      birth_date: account?.birthDate?.split('T')[0] || "",
      gender: account?.gender === "M" ? "M" : "F",
      login: account?.credentials?.login || "",
      mothers_name: account?.mothersName || "",
      address: mainAddress ? {
        street: mainAddress.addressLine1 || "",
        number: mainAddress.number || "",
        complement: mainAddress.addressLine2 || "",
        neighborhood: mainAddress.district || "",
        city: mainAddress.city || "",
        state: mainAddress.state || "",
        zip_code: mainAddress.zipCode || "",
        country: mainAddress.countryIsoKey || "BR"
      } : null,
      metadata: { processedAt: new Date().toISOString(), originIp: "proxy" }
    };

    // =========================================================================
    // 3. BUSCA E MAPEAMENTO DE OFERTA (Se offer_id presente)
    // =========================================================================
    let offerPayload: BFFOfferDetails | null = null;
    
    if (offer_id) {
       const offerRes = await fetch(`${urls.offer}/offers/?filter=id:[${offer_id}]`, {
         headers: { "Authorization": `Bearer ${sbx_access_token}` }
       });

       // Tratamento de erro de autenticação na oferta
       if (offerRes.status === 401) throw new Error("SESSION_UPSTREAM_EXPIRED: O token real da Superbid expirou.");
       if (!offerRes.ok) throw new Error(`UPSTREAM_OFFER_ERROR (${offerRes.status}): Erro na API de ofertas.`);
       
       const offerData = await offerRes.json();
       const rawOffer = offerData.offers?.[0];
       
       // Erro de Negócio: Oferta esperada mas não localizada
       if (!rawOffer) throw new Error("OFFER_NOT_FOUND: Oferta solicitada não localizada.");

       // Busca Evento relacionado via Auction ID
       const eventRes = await fetch(`${urls.event}/events/v2/?filter=id:${rawOffer.auction?.id || ""}&pageSize=1`, {
          headers: { "Authorization": `Bearer ${sbx_access_token}` }
       });
       const eventData = eventRes.ok ? (await eventRes.json()).events?.[0] : {};

       // Mapeamento completo do contrato de Oferta
       offerPayload = {
         offer: {
           offer_id: String(rawOffer.id),
           lot_number: rawOffer.lotNumber || 1,
           offer_description: rawOffer.product?.shortDesc || rawOffer.offerDescription?.offerDescription || "",
           offer_detailed_description: rawOffer.offerDescription?.offerDescription || "",
           offer_value: rawOffer.price || 0,
           category_id: rawOffer.product?.productType?.id || 0,
           category: rawOffer.product?.productType?.description || "",
           offer_status: rawOffer.offerStatus || "",
           sale_status: rawOffer.saleStatus || "",
           end_date: rawOffer.endDate || "",
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
       };
    }

    // =========================================================================
    // 4. PERSISTÊNCIA DE SESSÃO E JWT (Assinatura Atômica)
    // =========================================================================
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const sessionToken = crypto.randomUUID();
    const infra = await captureInfrastructure(req);
    const agora = new Date();
    const expiraEm = new Date(agora.getTime() + (14400 * 1000));

    await supabaseAdmin.from('sbx_sessions').insert({ 
        session_token: sessionToken, 
        user_id: userId, 
        sbx_access_token, 
        environment,
        expires_at: expiraEm.toISOString(), 
        ...infra 
    });

    const jwtSecret = Deno.env.get("JWT_SECRET")!;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const jwt = await create({ alg: "HS256", typ: "JWT" }, { sub: userId, jti: sessionToken, exp: getNumericDate(expiraEm.getTime() / 1000) }, key);

    // =========================================================================
    // 5. RETORNO CONSOLIDADO (Contrato Preservado)
    // =========================================================================
    return new Response(JSON.stringify({
      success: true,
      session_token: jwt,
      user_id: userId,
      expires_at: Math.floor(expiraEm.getTime() / 1000),
      server_now_ms: agora.getTime(),
      rehydration_payload: {
        user_profile: userProfile,
        offer_details: offerPayload
      }
    }), { 
        headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'Set-Cookie': `session_token=${jwt}; Path=/; HttpOnly; SameSite=Lax` 
        } 
    });

  } catch (err: any) {
    // =========================================================================
    // DISPATCHER DE ERROS SEMÂNTICOS
    // =========================================================================
    console.error("[sbx-loader] Erro capturado:", err.message);
    
    let status = 500;
    if (err.message.includes("SESSION_UPSTREAM_EXPIRED")) status = 401; // Dispara Protocolo de Amnésia
    else if (err.message.includes("BAD_REQUEST")) status = 400; // Requisição malformada
    else if (err.message.includes("OFFER_NOT_FOUND")) status = 404; // Oferta inexistente
    else if (err.message.includes("UPSTREAM")) status = 502; // Bad Gateway (Falha no parceiro)

    return new Response(JSON.stringify({ success: false, message: err.message }), { status, headers: corsHeaders });
  }
});