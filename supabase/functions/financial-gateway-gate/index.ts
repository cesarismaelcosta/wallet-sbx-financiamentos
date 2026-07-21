/**
 * @fileoverview EDGE GATEWAY DE ENTRADA (Híbrido: Form POST & AJAX)
 * @path supabase/functions/financial-gateway-gate/index.ts
 * 
 * =========================================================================
 * [ARQUITETURA BFF & CONTENT NEGOTIATION]
 * =========================================================================
 * 1. HÍBRIDO: Aceita JSON (AJAX) ou x-www-form-urlencoded (Form POST Nativo).
 * 2. AUTH: Troca o token da Superbid por um JWT nativo seguro (Set-Cookie).
 * 3. ORQUESTRAÇÃO & HIDRATAÇÃO: Busca dados na Superbid e consulta o 'orchestrator'.
 * 4. REDIRECT: Se for Form POST, responde 302 direto para a Fandi (ou tela de Erro).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { create, getNumericDate, verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { withSecurity } from "../_shared/server.ts";
import { captureInfrastructure } from "../_shared/infrastructure.ts";
import { debugLog } from "../_shared/logger.ts";
import { getSafeRedirectUrl, getSafeCorsOrigin } from "../_shared/security.ts";
import { BFFUserProfile, BFFOfferDetails } from "../_shared/types.ts";

const ENV_URLS = {
  production: { api: "https://api.s4bdigital.net", offer: "https://offer-query.superbid.net", event: "https://event-query.superbid.net" },
  staging: { api: "https://stgapi.s4bdigital.net", offer: "https://offer-query.stage.superbid.net", event: "https://event-query.stage.superbid.net" }
};

serve(withSecurity('financial-gateway-gate', async (req: Request) => {
  const originPath = req.headers.get("origin") || req.headers.get("referer") || "/";

  // =====================================================================
  // 1. NEGOCIAÇÃO DE CONTEÚDO (Content Negotiation)
  // =====================================================================
  const contentType = req.headers.get("content-type") || "";
  const accept = req.headers.get("accept") || "";
  const isAjax = contentType.includes("application/json") || accept.includes("application/json");
  
  let payload: any = {};
  
  try {
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      payload = Object.fromEntries(formData.entries());
    } else {
      payload = await req.json();
    }
  } catch (e) {
    return respondWithError(isAjax, 400, "BAD_REQUEST", "Payload inválido ou vazio.", payload?.return_uri || originPath);
  }

  const { auth_token, environment = "production", offer_id, product_id, return_uri = originPath, utm_source, utm_medium, utm_campaign } = payload;

  if (!auth_token) {
    return respondWithError(isAjax, 400, "BAD_REQUEST", "Credencial (auth_token) ausente.", return_uri);
  }

  const urls = ENV_URLS[environment as keyof typeof ENV_URLS] || ENV_URLS.production;

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!, 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // =====================================================================
    // 2. DUAL-MODE AUTH (Token Bruto vs JWT Interno)
    // =====================================================================
    let sbx_access_token = auth_token;
    const isJwt = auth_token.split('.').length === 3;
    let userId = "";
    let finalJwt = auth_token;
    const agora = new Date();
    const expiraEmSegundos = 14400; // 4 horas
    const nossaExpiracao = new Date(agora.getTime() + (expiraEmSegundos * 1000) - (15 * 60 * 1000));

    if (isJwt) {
      debugLog("JWT detectado. Validando localmente...");
      const jwtSecret = Deno.env.get("JWT_SECRET")!;
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
      const decoded = await verify(auth_token, key);
      
      const { data: sessionData, error: sessionError } = await supabaseAdmin
        .from('session_tokens')
        .select('sbx_access_token, user_id')
        .eq('session_token', decoded.jti)
        .gt('expires_at', agora.toISOString())
        .single();

      if (sessionError || !sessionData) throw new Error("SESSION_UPSTREAM_EXPIRED: JWT expirado no banco.");
      sbx_access_token = sessionData.sbx_access_token;
      userId = sessionData.user_id;
    }

    // =====================================================================
    // 3. EXTRAÇÃO DE DADOS UPSTREAM (Superbid API - User /me)
    // =====================================================================
    const userRes = await fetch(`${urls.api}/account/v2/user/me`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${sbx_access_token}` }
    });
    
    if (!userRes.ok) {
        const errorBody = await userRes.text();
        if (userRes.status === 401) throw new Error("SESSION_UPSTREAM_EXPIRED: O token real da Superbid expirou na origem.");
        throw new Error(`UPSTREAM_USER_ERROR (${userRes.status}): ${errorBody}`);
    }
    
    const userData = await userRes.json();
    const account = userData.userAccounts?.[0];
    const mainAddress = account?.addresses?.[0];
    userId = String(account?.id);

    // =====================================================================
    // 4. HIDRATAÇÃO DE PERFIL (BFF Mapping)
    // =====================================================================
    const userProfile: BFFUserProfile = {
      entity_id: userId,
      name: account?.basicInfo?.fullName || "N/A",
      document: account?.documents?.find((doc: any) => doc.typeName === "cpf")?.number || "",
      document_rg: account?.documents?.find((doc: any) => doc.typeName === 'rg')?.number || "",
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

    // =====================================================================
    // 5. BUSCA E MAPEAMENTO DE OFERTA
    // =====================================================================
    let offerPayload: BFFOfferDetails | null = null;
    
    if (offer_id) {
       const cleanOfferId = String(offer_id).replace(/[^0-9]/g, '');
       const offerUrl = `${urls.offer}/offers/?portalId=[2,15]&locale=pt_BR&timeZoneId=America/Sao_Paulo&searchType=opened&filter=id:[${cleanOfferId}]&pageNumber=1&pageSize=15&orderBy=price:desc&requestOrigin=marketplace&preOrderBy=orderByFirstOpenedOffersAndSecondHasPhoto`;

       const offerRes = await fetch(offerUrl, {
          method: "GET",
          headers: { 
            "Authorization": `Bearer ${sbx_access_token}`,
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Origin": "https://www.superbid.net",
            "Referer": "https://www.superbid.net/"
          }
       });

       if (offerRes.status === 401) throw new Error("SESSION_UPSTREAM_EXPIRED: Token Superbid expirado durante busca de ofertas.");
       if (!offerRes.ok) throw new Error(`UPSTREAM_OFFER_ERROR (${offerRes.status}): ${await offerRes.text()}`);
       
       const offerData = await offerRes.json();
       const rawOffer = offerData.offers?.[0];
       
       if (!rawOffer) throw new Error("OFFER_NOT_FOUND: Oferta não localizada no catálogo.");

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
       
       const productTypeId = rawOffer.product?.productType?.id;
       const isVehicleCategory = [10, 11].includes(productTypeId);
       let vehicleData: any = undefined;

       if (isVehicleCategory) {
           const groups = rawOffer.product?.template?.groups || [];
           const getGroupProp = (groupId: string, propId: string) => 
               groups.find((g: any) => g.id === groupId)?.properties.find((p: any) => p.id === propId)?.value;
           
           vehicleData = {
               manufacture_year: Number(getGroupProp('identificacao', 'anofabricacao')) || 0,
               model_year: Number(getGroupProp('identificacao', 'anomodelo')) || 0,
               fipe_code: getGroupProp('financiamento', 'codigofipe') || "",
           };
       }

       offerPayload = {
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
       };
    }

    // =====================================================================
    // 6. PERSISTÊNCIA DA SESSÃO E JWT
    // =====================================================================
    if (!isJwt) {
        debugLog("Gerando nova sessão e JWT...");
        const newSessionToken = crypto.randomUUID();
        const infra = await captureInfrastructure(req);
        
        await supabaseAdmin.from('session_tokens').insert({ 
            session_token: newSessionToken, user_id: userId, sbx_access_token, environment, 
            expires_at: nossaExpiracao.toISOString(), ip_address: infra.ip_address, origin_details: infra.metadata 
        });

        const jwtSecret = Deno.env.get("JWT_SECRET")!;
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        finalJwt = await create({ alg: "HS256", typ: "JWT" }, { sub: userId, jti: newSessionToken, exp: getNumericDate(nossaExpiracao.getTime() / 1000) }, key);
    }

    // =====================================================================
    // 7. MONTAGEM DO PAYLOAD E CHAMADA AO ORQUESTRADOR
    // =====================================================================
    const rehydratedPayload = {
      action: "CONSULT",
      timestamp: new Date().toISOString(),
      origin_url: return_uri,
      environment,
      entity: userProfile,
      product_id: product_id || "",
      offer: offerPayload?.offer || {},
      seller: offerPayload?.seller || {},
      event: offerPayload?.event || {},
      manager: offerPayload?.manager || {},
      interaction_context: { utm_source, utm_medium, utm_campaign, origin_url: return_uri }
    };

    debugLog("Iniciando Orquestração de Rota...");
    const loginFallbackUrl = `/accounts/signin?redirect_uri=${encodeURIComponent(return_uri)}`;

    const orchestratorResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/orchestrator`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            "x-session-token": finalJwt, 
            "x-original-url": return_uri,
            "x-auth-fallback-url": loginFallbackUrl
        },
        body: JSON.stringify(rehydratedPayload),
    });

    const orchestratorData = await orchestratorResponse.json();
    if (!orchestratorResponse.ok) throw new Error(`ORCHESTRATOR_FAIL: ${orchestratorData.message}`);

    const targetUrl = orchestratorData.url;

    const responseHeaders = new Headers();
    responseHeaders.set("Set-Cookie", `session_token=${finalJwt}; Path=/; HttpOnly; Secure; SameSite=Lax`);
    // Permite apenas URLs definidas em security.ts
    responseHeaders.set("Access-Control-Allow-Origin", getSafeCorsOrigin(req.headers.get("origin") || req.headers.get("referer")))

    if (isAjax) {
        responseHeaders.set("Content-Type", "application/json");
        return new Response(JSON.stringify({ success: true, redirect_url: targetUrl }), { status: 200, headers: responseHeaders });
    } else {
        responseHeaders.set("Location", targetUrl);
        return new Response(null, { status: 302, headers: responseHeaders });
    }

} catch (err: any) {
    debugLog("🚨 [Edge Gateway] Erro interceptado:", err.message);
    
    const safeReturnUri = getSafeRedirectUrl(return_uri || originPath);
    let errorCode = "GENERIC_ERROR";
    let statusCode = 400;
    const msg = (err.message || "").toUpperCase();

    if (msg.includes("UPSTREAM_USER_ERROR")) {
        errorCode = "SBX_LOADER_FAIL_USER";
        statusCode = 422;
    } else if (msg.includes("SESSION_UPSTREAM_EXPIRED")) {
        errorCode = "SESSION_EXPIRED";
        statusCode = 401;
    } else if (msg.includes("OFFER_NOT_FOUND")) {
        errorCode = "OFFER_NOT_FOUND";
        statusCode = 404;
    } else if (msg.includes("UPSTREAM_OFFER_ERROR")) {
        errorCode = "SBX_LOADER_FAIL_OFFER";
        statusCode = 422;
    } else if (msg.includes("BAD_REQUEST")) {
        errorCode = "SBX_LOADER_FAIL_BAD_REQUEST";
    } else if (msg.includes("DB_INSERT_FAILURE")) {
        errorCode = "SBX_LOADER_FAIL_DATABASE";
        statusCode = 500;
    } else if (msg.includes("VALIDATION")) {
        errorCode = "ORCHESTRATOR_FAIL_VALIDATION";
        statusCode = 422;
    } else if (msg.includes("TARGET_URL") || msg.includes("OBRIGATÓRIA")) {
        errorCode = "ORCHESTRATOR_FAIL_INVALID_TARGET_URL";
        statusCode = 422;
    } else if (msg.includes("CONFIGURAÇÃO") || msg.includes("DESTINO")) {
        errorCode = "ORCHESTRATOR_FAIL_CONFIG";
        statusCode = 422;
    } else if (msg.includes("VISITA")) {
        errorCode = "ORCHESTRATOR_FAIL_VISIT_INVALID";
        statusCode = 422;
    } else if (msg.includes("OFFER")) {
        errorCode = "ORCHESTRATOR_FAIL_OFFER";
        statusCode = 422;
    }

    return respondWithError(isAjax, statusCode, errorCode, err.message, safeReturnUri, req);
  }
}));

/**
 * @fileoverview Utilitário de Resposta de Erro para Borda (Edge Gateway)
 * @description Padroniza o despacho de erros suportando Content Negotiation 
 * (AJAX/JSON vs. Navegação Nativa/Redirecionamento HTTP 302).
 */

/**
 * Formata e despacha uma resposta de erro, garantindo que o redirecionamento 
 * aponte estritamente para o Front-end e nunca para o domínio do Supabase.
 * 
 * @param {boolean} isAjax - Indica se a requisição originou-se de uma chamada AJAX/JSON.
 * @param {number} statusCode - Código de status HTTP para a resposta (ex: 400, 401, 422).
 * @param {string} code - Identificador semântico do erro (ex: SESSION_EXPIRED).
 * @param {string} message - Mensagem descritiva detalhada do erro.
 * @param {string} safeReturnUri - URI sanitizada de retorno enviada pelo cliente.
 * @returns {Response} Objeto Response configurado com JSON ou Header Location (302).
 */
function respondWithError(
    isAjax: boolean, 
    statusCode: number, 
    code: string, 
    message: string, 
    safeReturnUri: string,
    req: Request
): Response {
    const headers = new Headers();
    headers.set("Access-Control-Allow-Origin", "*");

    if (isAjax) {
        headers.set("Content-Type", "application/json");
        return new Response(
            JSON.stringify({ success: false, code, message }), 
            { status: statusCode, headers }
        );
    } 

    const encodedMsg = encodeURIComponent(message);
    const encodedUri = encodeURIComponent(safeReturnUri);
    
    let frontendOrigin = "";
    if (safeReturnUri && (safeReturnUri.startsWith("http://") || safeReturnUri.startsWith("https://"))) {
        try { frontendOrigin = new URL(safeReturnUri).origin; } catch (_) {}
    }

    if (!frontendOrigin) {
        const reqOrigin = req.headers.get("origin") || req.headers.get("referer");
        if (reqOrigin) {
            try { frontendOrigin = new URL(reqOrigin).origin; } catch (_) {}
        }
    }

    if (!frontendOrigin) {
        return new Response(
            JSON.stringify({ success: false, code: "CONFIG_ERROR", message: "Origem do front-end não identificada." }), 
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }

    const errorUrl = `${frontendOrigin}/financialGatewayGate?status=error&code=${code}&message=${encodedMsg}&return_uri=${encodedUri}`;
    
    headers.set("Location", errorUrl);
    return new Response(null, { status: 302, headers });
}