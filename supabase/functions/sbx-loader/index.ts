/**
 * @fileoverview Edge Function: sbx-loader (Unified Gateway Initializer)
 * 
 * * =========================================================================
 * [ARQUITETURA DE GATEWAY UNIFICADO]
 * =========================================================================
 * Esta função atua como um Backend For Frontend (BFF) atômico, consolidando a 
 * validação de autenticação (Auth Exchange), a hidratação de perfil do usuário 
 * e os detalhes da oferta (via catálogo Superbid) em um único ciclo de request-response.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { captureInfrastructure } from "../_shared/infrastructure.ts";
import { BFFUserProfile, BFFOfferDetails } from "../_shared/types.ts";

const DEBUG_MODE = true;

const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[SBX-LOADER] ${message}`, data ? JSON.stringify(data) : "");
  }
};


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
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { sbx_access_token, environment, offer_id } = await req.json();

    if (!sbx_access_token || !environment) throw new Error("BAD_REQUEST: Credenciais ou ambiente ausentes.");
    const urls = ENV_URLS[environment as keyof typeof ENV_URLS];

    // =========================================================================
    // 1. VALIDAÇÃO UPSTREAM (Perfil do Usuário)
    // =========================================================================
    const userRes = await fetch(`${urls.api}/account/v2/user/me`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${sbx_access_token}` }
    });
    
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
    // 3. BUSCA E MAPEAMENTO DE OFERTA
    // =========================================================================
    let offerPayload: BFFOfferDetails | null = null;
    
    if (offer_id) {
       // Sanitiza o ID
       const cleanOfferId = String(offer_id).replace(/[^0-9]/g, '');
       debugLog(`Buscando oferta sanitizada: ${cleanOfferId}`);

       // [AQUI ESTAVA O ERRO 500]: Copiando a URL idêntica do sbx-offer que funciona
       const offerUrl = `${urls.offer}/offers/?portalId=[2,15]&locale=pt_BR&timeZoneId=America/Sao_Paulo&searchType=opened&filter=id:[${cleanOfferId}]&pageNumber=1&pageSize=15&orderBy=price:desc&requestOrigin=marketplace&preOrderBy=orderByFirstOpenedOffersAndSecondHasPhoto`;

       const offerRes = await fetch(offerUrl, {
         method: "GET",
         headers: { 
           "Authorization": `Bearer ${sbx_access_token}`,
           "Accept": "application/json",
           "Content-Type": "application/json",
           // Copiando os headers de segurança do sbx-offer
           "Origin": "https://www.superbid.net",
           "Referer": "https://www.superbid.net/"
         }
       });

       if (offerRes.status === 401) throw new Error("SESSION_UPSTREAM_EXPIRED: O token real da Superbid expirou.");
       if (!offerRes.ok) {
           const errText = await offerRes.text();
           throw new Error(`UPSTREAM_OFFER_ERROR (${offerRes.status}): ${errText}`);
       }
       
       const offerData = await offerRes.json();
       const rawOffer = offerData.offers?.[0];
       
       if (!rawOffer) throw new Error("OFFER_NOT_FOUND: Oferta solicitada não localizada.");

       // Clonando a lógica da URL de eventos também
       const eventUrl = `${urls.event}/events/v2/?portalId=[2,15]&locale=pt_BR&timeZoneId=America%2FSao_Paulo&filter=id:${rawOffer.auction?.id || ""}&pageSize=1`;

       const eventRes = await fetch(eventUrl, {
          method: "GET",
          headers: { 
            "Authorization": `Bearer ${sbx_access_token}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Origin": "https://www.superbid.net",
            "Referer": "https://www.superbid.net/"
          }
       });
       
       const eventData = eventRes.ok ? (await eventRes.json()).events?.[0] : {};

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
    // 4. PERSISTÊNCIA E SEGURANÇA
    // =========================================================================
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const sessionToken = crypto.randomUUID();
    const agora = new Date()
    const expiraEmSegundos = 14400; 
    const margemSegurancaMs = 15 * 60 * 1000;
    const nossaExpiracao = new Date(agora.getTime() + (expiraEmSegundos * 1000) - margemSegurancaMs)

    const infra = await captureInfrastructure(req);
    const { insertData: sessionData, insertError: insertError } = await supabaseAdmin
      .from('sbx_sessions')
      .insert({ 
        session_token: sessionToken, 
        user_id: userId, 
        sbx_access_token: sbx_access_token, 
        environment, 
        expires_at: nossaExpiracao.toISOString(),
        ip_address: infra.ip_address,
        country: infra.country,
        state: infra.state,
        city: infra.city,
        user_agent: infra.user_agent,
        device_type: infra.device_type,
        operating_system: infra.operating_system,
        origin_details: infra.metadata
      })
      .select();
      
    if (insertError) {
        debugLog("[CRITICAL] Falha catastrófica ao persistir sessão:", {
            error: insertError,
            context: { sessionToken, userId }
        });
        
        // Interrompe imediatamente. Não deixe a função prosseguir e retornar sucesso.
        throw new Error(`[sbx-loader] DB_INSERT_FAILURE: ${insertError.message}`);
    }

    const jwtSecret = Deno.env.get("JWT_SECRET")!;
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const jwt = await create({ alg: "HS256", typ: "JWT" }, { sub: userId, jti: sessionToken, exp: getNumericDate(nossaExpiracao.getTime() / 1000) }, key);

    return new Response(JSON.stringify({
      success: true,
      session_token: jwt,
      user_id: userId,
      expires_at: Math.floor(nossaExpiracao.getTime() / 1000),
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
    if (err.message.includes("SESSION_UPSTREAM_EXPIRED")) status = 401;
    else if (err.message.includes("BAD_REQUEST")) status = 400;
    else if (err.message.includes("OFFER_NOT_FOUND")) status = 404;
    else if (err.message.includes("UPSTREAM")) status = 502;

    return new Response(JSON.stringify({ success: false, message: err.message }), { status, headers: corsHeaders });
  }
});