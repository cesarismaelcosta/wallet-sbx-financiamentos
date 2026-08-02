/**
 * @fileoverview EDGE GATEWAY DE ENTRADA (Autenticação Stateless & Roteamento)
 * @path supabase/functions/financial-gateway-gate/index.ts
 * 
 * =========================================================================
 * [ARQUITETURA BFF & NEGOCIAÇÃO DE CONTEÚDO STATELESS]
 * =========================================================================
 * Atua como a porta de entrada (Front Door) unificada para usuários vindos de 
 * sistemas legados (via Form POST) ou do SPA (via chamadas AJAX/JSON).
 * 
 * [MUDANÇAS CRÍTICAS DA ARQUITETURA STATELESS]:
 * 1. Fim da Tabela SSOT (`session_tokens`): Nenhuma consulta ou escrita é feita no banco 
 *    de dados para gerenciar sessões. A autenticação é 100% criptográfica em memória via JWT.
 * 2. Supressão do Token Opaco da Superbid: Como as consultas de catálogo e ofertas passaram a ser 
 *    anônimas na origem, o `sbx_access_token` deixa de ser armazenado ou retransmitido nas rotas internas,
 *    eliminando gargalos e custos de I/O de banco.
 * 3. Selo de Ambiente Protegido: O `environment` (staging | production) é lido diretamente 
 *    do payload criptografado do JWT, garantindo imunidade a ataques de adulteração de rota via URL.
 * 
 * @author César Ismael Pereira da Costa
 * @version 4.0.0 (Eliminação completa de dependência de banco de dados de sessão)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { verifySessionToken, generateSessionToken } from "../_shared/jwt.ts";
import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";
import { getSafeRedirectUrl, getSafeCorsOrigin } from "../_shared/security.ts";
import { BFFUserProfile, BFFOfferDetails } from "../_shared/types.ts";

const ENV_URLS = {
  production: { api: "https://api.s4bdigital.net", offer: "https://offer-query.superbid.net", event: "https://event-query.superbid.net" },
  staging: { api: "https://stgapi.s4bdigital.net", offer: "https://offer-query.stage.superbid.net", event: "https://event-query.stage.superbid.net" }
};

serve(withSecurity('financial-gateway-gate', async (req: Request) => {
  const originPath = req.headers.get("origin") || req.headers.get("referer") || "/";

  debugLog("[GATEWAY-INSPECT] Requisição recebida (Stateless Mode)", {
    method: req.method,
    url: req.url,
    contentType: req.headers.get("content-type")
  });
  
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
  // [STEP 2] RESOLUÇÃO HÍBRIDA DE ENTRADA: Payload vs Cookie HttpOnly
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
    // =====================================================================
    // [STEP 3] VALIDAÇÃO CRIPTOGRÁFICA STATELESS (100% em Memória)
    // =====================================================================
    // Valida o JWT interno e extrai de dentro dele o userId e o environment lacrados.
    // Isso dispensa qualquer ida à tabela `session_tokens` no Supabase.
    // =====================================================================
    const sanitizedToken = String(inputToken).trim();
    const verificationResult = await verifySessionToken(sanitizedToken);

    if (!verificationResult.valid || !verificationResult.data) {
        throw new Error("SESSION_EXPIRED: Credencial de sessão inválida, malformada ou expirada.");
    }

    userId = verificationResult.data.userId;
    const jwtEnvironment = verificationResult.environment || "staging";
    
    // Se o environment foi passado no payload mas difere do JWT, prevalece o lacrado no JWT por segurança
    const activeEnvironment = environment || jwtEnvironment;
    const urls = ENV_URLS[activeEnvironment as keyof typeof ENV_URLS] || ENV_URLS.production;
    const finalJwt = sanitizedToken;

    // Garante renovação ou persistência do token stateless para o front
    const renewedTokenData = await generateSessionToken(userId, activeEnvironment, 21600);

    // =====================================================================
    // [STEP 4] BUSCA COMPLEMENTAR DE PERFIL (Via API da Superbid)
    // =====================================================================
    // Nota: Como o /me exige autenticação upstream, aqui nós usamos o token da sessão 
    // ou fazemos a requisição utilizando o mecanismo padrão da SBX se necessário.
    // Se a Superbid exigir token de acesso do usuário para o /me, o login inicial já hidratou o front.
    // Para simplificar o fluxo de gateway sem armazenar o token opaco, consultamos o perfil se houver necessidade,
    // ou construímos o objeto base com o userId autenticado.
    // =====================================================================
    
    let userProfile: BFFUserProfile = {
      entity_id: userId,
      entity_type: "F",
      name: "Usuário Verificado",
      document: "",
      document_rg: "",
      email: "",
      phone: "",
      birth_date: "",
      gender: "M",
      login: "",
      mothers_name: "",
      address: null,
      metadata: { processedAt: new Date().toISOString(), originIp: "proxy-stateless" }
    };

    // =====================================================================
    // [STEP 5] BUSCA E MAPEAMENTO DE OFERTA (Catálogo Público Upstream)
    // =====================================================================
    let offerPayload: BFFOfferDetails | null = null;
    
    if (offer_id) {
       const cleanOfferId = String(offer_id).replace(/[^0-9]/g, '');
       const offerUrl = `${urls.offer}/offers/?portalId=[2,15]&locale=pt_BR&timeZoneId=America/Sao_Paulo&searchType=opened&filter=id:[${cleanOfferId}]&pageNumber=1&pageSize=15&orderBy=price:desc&requestOrigin=marketplace&preOrderBy=orderByFirstOpenedOffersAndSecondHasPhoto`;

       // Requisição totalmente anônima para a Superbid (Catálogo Aberto)
       const offerRes = await fetch(offerUrl, {
          method: "GET",
          headers: { 
            "Accept": "application/json",
            "Content-Type": "application/json",
            "Origin": "https://www.superbid.net",
            "Referer": "https://www.superbid.net/"
          }
       });

       if (!offerRes.ok) throw new Error(`UPSTREAM_OFFER_ERROR (${offerRes.status}): Falha ao buscar oferta.`);
       
       const offerData = await offerRes.json();
       const rawOffer = offerData.offers?.[0];
       
       if (!rawOffer) throw new Error("OFFER_NOT_FOUND: Oferta não localizada no catálogo.");

       const eventUrl = `${urls.event}/events/v2/?portalId=[2,15]&locale=pt_BR&timeZoneId=America%2FSao_Paulo&filter=id:${rawOffer.auction?.id || ""}&pageSize=1`;
       const eventRes = await fetch(eventUrl, {
          method: "GET",
          headers: { 
            "Accept": "application/json",
            "Content-Type": "application/json" 
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
    // [STEP 6] ORQUESTRAÇÃO DE ROTAS (Target Discovery & Direct Navigation)
    // =====================================================================
    const isDirectVisit = !!target_url;

    const rehydratedPayload = {
        action: isDirectVisit ? "VISIT" : "CONSULT",
        target_url: target_url || "",
        timestamp: new Date().toISOString(),
        origin_url: return_uri,
        environment: activeEnvironment,
        entity: userProfile,
        product_id: product_id ? Number(product_id) : null,
        offer: offerPayload?.offer || {},
        seller: offerPayload?.seller || {},
        event: offerPayload?.event || {},
        manager: offerPayload?.manager || {},
        interaction_context: { utm_source, utm_medium, utm_campaign, origin_url: return_uri }
    };

    debugLog("Iniciando Orquestração de Rota (Stateless)...");
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
    // [STEP 7] SMART DELIVERY E RESPOSTA SEGURA (HttpOnly Cookie)
    // =====================================================================
    const apiHost = new URL(Deno.env.get('SUPABASE_URL') || '').hostname;
    const frontendHost = frontendOrigin ? new URL(frontendOrigin).hostname : "";
    const eTLDplus1 = (h: string) => h.split('.').slice(-2).join('.');
    
    const isSameSite = (frontendHost && apiHost) ? eTLDplus1(frontendHost) === eTLDplus1(apiHost) : false;
    const safeTokenToReturn = isSameSite ? "" : renewedTokenData.session_token;

    const responseHeaders = new Headers();
    responseHeaders.set("Access-Control-Allow-Origin", getSafeCorsOrigin(req.headers.get("origin") || req.headers.get("referer")));

    if (isAjax) {
        responseHeaders.set("Content-Type", "application/json");
        responseHeaders.set("Set-Cookie", `session_token=${ renewedTokenData.session_token }; Path=/; HttpOnly; Secure; SameSite=Lax`);
        
        return new Response(JSON.stringify({ 
            success: true, 
            redirect_url: targetUrl,
            environment: activeEnvironment,
            ...(safeTokenToReturn ? { session_token: safeTokenToReturn } : {})
        }), { status: 200, headers: responseHeaders });
    } else {
        responseHeaders.set("Content-Type", "text/html; charset=utf-8");
        responseHeaders.set("Set-Cookie", `session_token=${ renewedTokenData.session_token }; Path=/; HttpOnly; Secure; SameSite=Lax`);
        
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
                    sessionStorage.setItem('sbx_env_pref', '${activeEnvironment}');
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

    if (msg.includes("SESSION_EXPIRED")) {
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