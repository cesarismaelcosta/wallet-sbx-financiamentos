/**
 * @fileoverview EDGE GATEWAY DE ENTRADA (Autenticação Híbrida & Roteamento)
 * @path supabase/functions/financial-gateway-gate/index.ts
 * 
 * =========================================================================
 * [ARQUITETURA BFF & NEGOCIAÇÃO DE CONTEÚDO]
 * =========================================================================
 * Este endpoint atua como a porta de entrada (Front Door) para usuários vindos de 
 * sistemas legados (via Form POST) ou do próprio SPA (via chamadas AJAX/JSON).
 * 
 * =========================================================================
 * [LÓGICA HÍBRIDA DE AUTENTICAÇÃO VIA 'auth_token']
 * =========================================================================
 * O gateway recebe o parâmetro `auth_token` e identifica o seu formato de forma inteligente:
 * 
 * 1. Nosso JWT Interno (Padrão RFC 7519):
 *    - Característica: Possui exatamente 3 partes separadas por pontos (`split('.').length === 3`).
 *    - Comportamento: A borda valida a assinatura HMAC-SHA256, lê o claim `jti`, vai até a 
 *      tabela `session_tokens` e resgata de forma transparente o token bruto da Superbid.
 * 
 * 2. Token Bruto da Superbid (`sbx_access_token` opaco):
 *    - Característica: String sem pontos (Ex: "2a55e6a0f90cc3c7ffe44fbbc736053").
 *    - Comportamento: A borda valida o token no endpoint upstream `/account/v2/user/me`, 
 *      grava o par no banco de dados (`session_tokens`) e emite um novo JWT interno seguro.
 * =========================================================================
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
  // [TELEMETRIA] Inspeção de Entrada na Borda (Segura e Sanitizada)
  // =====================================================================
  debugLog("[GATEWAY-INSPECT] Requisição recebida", {
    method: req.method,
    url: req.url,
    contentType: req.headers.get("content-type")
  });
  
  try {
    const cloned = req.clone();
    const jsonBody = await cloned.json();
    if (jsonBody) {
      debugLog("[GATEWAY-INSPECT] Payload sanitizado", jsonBody);
    }
  } catch (e) {
    debugLog("[GATEWAY-INSPECT] Payload não é JSON (ignorado na inspeção de borda)", { error: String(e) });
  }
  
  // =====================================================================
  // [STEP 1] NEGOCIAÇÃO DE CONTEÚDO (Content Negotiation)
  // =====================================================================
  const contentType = req.headers.get("content-type") || "";
  const accept = req.headers.get("accept") || "";
  const isAjax = contentType.includes("application/json") || accept.includes("application/json");
 
  let payload: any = {};
  let userId = "";

  try {
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      payload = Object.fromEntries(formData.entries());
    } else {
      payload = await req.json();
    }
  } catch (e) {
    return respondWithError(isAjax, 400, "BAD_REQUEST", "Payload inválido ou vazio.", payload?.return_uri || originPath, req, payload || {});
  }

  // Extração inicial dos parâmetros enviados no payload
  let { 
    environment, 
    auth_token, 
    offer_id, 
    product_id, 
    return_uri, 
    utm_source, 
    utm_medium, 
    utm_campaign,
    target_url 
  } = payload;

  // =====================================================================
  // [STEP 2] RESOLUÇÃO HÍBRIDA: Payload (auth_token) vs Cookie HttpOnly
  // =====================================================================
  let inputToken = auth_token;

  if (!inputToken) {
      const cookieHeader = req.headers.get("cookie") || "";
      const cookieMatch = cookieHeader.match(/session_token=([^;]+)/);
      if (cookieMatch) {
          inputToken = cookieMatch[1];
      }
  }

  if (!inputToken) {
    return respondWithError(isAjax, 400, "BAD_REQUEST", "Credencial (auth_token) ausente no payload e nos cookies.", return_uri, req, payload);
  }

  try {
    const urls = ENV_URLS[environment as keyof typeof ENV_URLS] || ENV_URLS.production;
    
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!, 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // =====================================================================
    // [STEP 3] DUAL-MODE HÍBRIDO (Sanitização, Identificação e Resolução)
    // =====================================================================
    // Descrição: Realiza a higienização inteligente do token recebido na borda,
    // identificando se o payload de entrada é o JSON completo de resposta do OAuth2
    // da Superbid (extraindo o 'access_token' de dentro), uma string opaca bruta
    // ou um JWT interno (RFC 7519) para consulta no cofre de sessões.
    // =====================================================================
    let sbx_access_token = "";
    let finalJwt = "";
    
    // [SANITIZAÇÃO DE ENTRADA]: Normaliza a string recebida no parâmetro auth_token
    let sanitizedInputToken = String(inputToken).trim();

    // [INTERCEPÇÃO DE PAYLOAD OAUTH]: Verifica se o cliente passou o objeto JSON cru retornado pela API da Superbid
    if (sanitizedInputToken.startsWith('{') && sanitizedInputToken.endsWith('}')) {
        try {
            const parsedTokenJson = JSON.parse(sanitizedInputToken);
            if (parsedTokenJson.access_token) {
                sanitizedInputToken = parsedTokenJson.access_token;
                debugLog("[GATEWAY-AUTH] JSON do OAuth detectado e parseado com sucesso. access_token extraído com segurança.");
            }
        } catch (e) {
            debugLog("[GATEWAY-AUTH] Falha ao parsear JSON no auth_token, mantendo string original como fallback.", { error: String(e) });
        }
    }

    // [VALIDAÇÃO ESTRUTURAL]: Diferencia nosso JWT interno (3 partes por pontos) do token opaco/bruto da Superbid
    const isJwt = sanitizedInputToken.split('.').length === 3;
    const agora = new Date();
    const expiraEmSegundos = 14400; // 4 horas de validade padrão para o JWT interno emitido
    const nossaExpiracao = new Date(agora.getTime() + (expiraEmSegundos * 1000) - (15 * 60 * 1000));
    const jwtSecret = Deno.env.get("JWT_SECRET")!;

    if (isJwt) {
        // -----------------------------------------------------------------
        // [CASO A]: O token recebido é o nosso JWT Interno padrão
        // -----------------------------------------------------------------
        // Comportamento: Valida a assinatura HMAC-SHA256, extrai o claim 'jti' 
        // e resgata o token real da Superbid armazenado de forma segura no cofre (DB).
        // -----------------------------------------------------------------
        debugLog("[GATEWAY-AUTH] JWT interno detectado no auth_token. Validando claims criptográficas e consultando cofre...");
        
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
        const decoded = await verify(sanitizedInputToken, key);
        
        const { data: sessionData, error: sessionError } = await supabaseAdmin
          .from('session_tokens')
          .select('sbx_access_token, user_id')
          .eq('session_token', decoded.jti)
          .gt('expires_at', agora.toISOString())
          .single();

        if (sessionError || !sessionData) {
            throw new Error("SESSION_UPSTREAM_EXPIRED: Sessão interna expirada ou não localizada no banco de dados.");
        }
        
        // Atribui o token real da Superbid recuperado do cofre e mantém o JWT atual
        sbx_access_token = sessionData.sbx_access_token;
        userId = sessionData.user_id;
        finalJwt = sanitizedInputToken;

    } else {
        // -----------------------------------------------------------------
        // [CASO B]: O token recebido é o Token Bruto / Opaco da Superbid
        // -----------------------------------------------------------------
        // Comportamento: Valida o token diretamente no endpoint upstream /account/v2/user/me,
        // persiste o par na tabela de sessões e emite um novo JWT interno vinculado.
        // -----------------------------------------------------------------
        debugLog("[GATEWAY-AUTH] Token bruto/opaco da Superbid detectado no auth_token. Validando no /me e registrando cofre...");
        
        // Atribui o token higienizado para uso direto nas requisições upstream
        sbx_access_token = sanitizedInputToken;

        // Validação de autenticidade no endpoint de usuário da Superbid
        const userCheckRes = await fetch(`${urls.api}/account/v2/user/me`, {
            method: "GET",
            headers: { "Authorization": `Bearer ${sbx_access_token}` }
        });

        if (userCheckRes.status === 401) {
            throw new Error("SESSION_UPSTREAM_EXPIRED: O token bruto da Superbid fornecido é inválido ou expirou na origem.");
        }
        if (!userCheckRes.ok) {
            throw new Error(`UPSTREAM_USER_ERROR (${userCheckRes.status}): Falha ao validar token sbx no gateway upstream.`);
        }

        const upstreamUserData = await userCheckRes.json();
        const account = upstreamUserData.userAccounts?.[0];
        userId = String(account?.id || "");

        if (!userId) {
            throw new Error("USER_NOT_FOUND: Não foi possível identificar o ID do usuário através do token sbx validado.");
        }

        // Geração de nova chave de sessão interna e captura de metadados de infraestrutura
        const newSessionToken = crypto.randomUUID();
        const infra = await captureInfrastructure(req);
        
        const { error: insertError } = await supabaseAdmin.from('session_tokens').insert({ 
            session_token: newSessionToken, 
            user_id: userId, 
            sbx_access_token: sbx_access_token, 
            environment, 
            expires_at: nossaExpiracao.toISOString(), 
            ip_address: infra.ip_address, 
            origin_details: infra.metadata 
        });

        if (insertError) {
            throw new Error(`DB_INSERT_FAILURE: Erro crítico ao persistir sessão sbx no cofre -> ${insertError.message}`);
        }

        // Assinatura e emissão de um novo JWT interno seguro atrelado ao jti gerado
        const signKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        finalJwt = await create(
            { alg: "HS256", typ: "JWT" }, 
            { sub: userId, jti: newSessionToken, exp: getNumericDate(nossaExpiracao.getTime() / 1000) }, 
            signKey
        );
    }

    // =====================================================================
    // [STEP 4] EXTRAÇÃO DE DADOS UPSTREAM (Superbid API - User /me)
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
    // [STEP 5] HIDRATAÇÃO DE PERFIL (BFF Mapping - Suporte PF / PJ)
    // =====================================================================
    const isJuridica = account?.type === "J";
    const targetDocTypeName = isJuridica ? "cnpj" : "cpf";
    const rawDocument = account?.documents?.find((doc: any) => doc.typeName === targetDocTypeName)?.number || "";
    const cleanDocument = rawDocument.replace(/\D/g, '');

    const rawBirthDate = isJuridica 
      ? account?.companyRepresentative?.dateOfBirth 
      : account?.birthDate;
    const formattedBirthDate = rawBirthDate ? String(rawBirthDate).split('T')[0] : "";

    const userProfile: BFFUserProfile = {
      entity_id: userId,
      entity_type: account?.type,
      name: account?.basicInfo?.fullName || "N/A",
      document: cleanDocument,
      document_rg: account?.documents?.find((doc: any) => doc.typeName === 'rg')?.number || "",
      email: account?.basicInfo?.email?.address || "",
      phone: account?.phones?.find((p: any) => p.type === 3)?.fullPhoneNumber || "",
      birth_date: formattedBirthDate,
      gender: isJuridica ? (account?.companyRepresentative?.gender || "M") : (account?.gender === "M" ? "M" : "F"),
      login: account?.credentials?.login || "",
      mothers_name: isJuridica ? (account?.companyRepresentative?.mothersName || "") : (account?.mothersName || ""),
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
    // [STEP 6] BUSCA E MAPEAMENTO DE OFERTA
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
    // [STEP 8] ORQUESTRAÇÃO DE ROTAS (Target Discovery & Direct Navigation)
    // =====================================================================
    const isDirectVisit = !!target_url;

    const rehydratedPayload = {
        action: isDirectVisit ? "VISIT" : "CONSULT",
        target_url: target_url || "",
        timestamp: new Date().toISOString(),
        origin_url: return_uri,
        environment,
        entity: userProfile,
        product_id: product_id ? Number(product_id) : null,
        offer: offerPayload?.offer || {},
        seller: offerPayload?.seller || {},
        event: offerPayload?.event || {},
        manager: offerPayload?.manager || {},
        interaction_context: { utm_source, utm_medium, utm_campaign, origin_url: return_uri }
    };

    debugLog("Iniciando Orquestração de Rota...");
    const loginFallbackUrl = `/accounts/signin?redirect_uri=${encodeURIComponent(return_uri)}`;

    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || 
                     req.headers.get("x-real-ip") || "0.0.0.0";
    const clientUa = req.headers.get("user-agent") || "";

    const orchestratorResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/orchestrator`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            "x-session-token": finalJwt, 
            "x-original-url": return_uri,
            "x-auth-fallback-url": loginFallbackUrl,
            "user-agent": clientUa,
            "x-client-ip": clientIp.trim(),
        },
        body: JSON.stringify(rehydratedPayload),
    });

    const orchestratorData = await orchestratorResponse.json();
    if (!orchestratorResponse.ok) throw new Error(`ORCHESTRATOR_FAIL: ${orchestratorData.message}`);

    let targetUrl = orchestratorData.url;

    let frontendOrigin = "";
    const reqOrigin = req.headers.get("origin") || req.headers.get("referer");
    if (reqOrigin) {
        try { frontendOrigin = new URL(reqOrigin).origin; } catch (_) {}
    }
    if (!frontendOrigin && return_uri && (return_uri.startsWith("http://") || return_uri.startsWith("https://"))) {
        try { frontendOrigin = new URL(return_uri).origin; } catch (_) {}
    }
    if (!frontendOrigin) {
        frontendOrigin = Deno.env.get("FRONTEND_URL") || ""; 
    }

    if (targetUrl && targetUrl.startsWith('/') && frontendOrigin) {
        targetUrl = `${frontendOrigin}${targetUrl}`;
    }

    // =====================================================================
    // [STEP 9] SMART DELIVERY E SEGURANÇA FINAL (HttpOnly vs Storage)
    // =====================================================================
    const apiHost = new URL(Deno.env.get('SUPABASE_URL') || '').hostname;
    const frontendHost = frontendOrigin ? new URL(frontendOrigin).hostname : "";
    const eTLDplus1 = (h: string) => h.split('.').slice(-2).join('.');
    
    const isSameSite = (frontendHost && apiHost) ? eTLDplus1(frontendHost) === eTLDplus1(apiHost) : false;
    const safeTokenToReturn = isSameSite ? "" : finalJwt;

    const responseHeaders = new Headers();
    responseHeaders.set("Access-Control-Allow-Origin", getSafeCorsOrigin(req.headers.get("origin") || req.headers.get("referer")));

    if (isAjax) {
        responseHeaders.set("Content-Type", "application/json");
        responseHeaders.set("Set-Cookie", `session_token=${finalJwt}; Path=/; HttpOnly; Secure; SameSite=Lax`);
        
        return new Response(JSON.stringify({ 
            success: true, 
            redirect_url: targetUrl,
            environment: environment,
            ...(safeTokenToReturn ? { session_token: safeTokenToReturn } : {})
        }), { status: 200, headers: responseHeaders });
    } else {
        responseHeaders.set("Content-Type", "text/html; charset=utf-8");
        responseHeaders.set("Set-Cookie", `session_token=${finalJwt}; Path=/; HttpOnly; Secure; SameSite=Lax`);
        
        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Autenticando...</title>
        </head>
        <body>
            <script>
                try {
                    ${safeTokenToReturn ? `sessionStorage.setItem('session_token', '${safeTokenToReturn}');` : ''}
                    sessionStorage.setItem('sbx_env_pref', '${environment}');
                } catch (e) {}
                
                window.location.replace('${targetUrl}');
            </script>
        </body>
        </html>
        `;
        
        return new Response(html, { status: 200, headers: responseHeaders });
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

    payload.entity_id = userId || null;
    return respondWithError(isAjax, statusCode, errorCode, err.message, safeReturnUri, req, payload);
  }
}));

function respondWithError(
    isAjax: boolean, 
    statusCode: number, 
    code: string, 
    message: string, 
    safeReturnUri: string,
    req: Request,
    originalPayload: Record<string, any> = {}
): Response {
    const headers = new Headers();
    headers.set("Access-Control-Allow-Origin", "*");

    if (isAjax) {
        headers.set("Content-Type", "application/json");
        
        const extraData: Record<string, any> = {};
        if (originalPayload && typeof originalPayload === 'object') {
            for (const [key, value] of Object.entries(originalPayload)) {
                if (key !== 'auth_token' && value !== undefined && value !== null) {
                    extraData[key] = value;
                }
            }
        }

        return new Response(
            JSON.stringify({ 
                success: false, 
                code, 
                message, 
                ...extraData 
            }), 
            { status: statusCode, headers }
        );
    }

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
        frontendOrigin = Deno.env.get("FRONTEND_URL") || "";
    }

    if (!frontendOrigin) {
        return new Response(
            JSON.stringify({ success: false, code: "CONFIG_ERROR", message: "Origem do front-end não identificada." }), 
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }

    const urlParams = new URLSearchParams({
        status: "error",
        code: code,
        message: message,
        return_uri: safeReturnUri,
    });

    if (originalPayload && typeof originalPayload === 'object') {
        for (const [key, value] of Object.entries(originalPayload)) {
            if (key !== 'auth_token' && value !== undefined && value !== null && !urlParams.has(key)) {
                urlParams.set(key, String(value));
            }
        }
    }

    const errorUrl = `${frontendOrigin}/financialGatewayGate?${urlParams.toString()}`;
    
    headers.set("Location", errorUrl);
    return new Response(null, { status: 302, headers });
}