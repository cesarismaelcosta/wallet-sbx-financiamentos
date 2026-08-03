/**
 * @fileoverview EDGE GATEWAY DE ENTRADA (Autenticação Exclusiva SBX & Roteamento Stateless)
 * @path supabase/functions/financial-gateway-gate/index.ts
 *
 * ============================================================================
 * [ARQUITETURA BFF & CONTRATO DE ENTRADA]
 * ============================================================================
 * Atua como a porta de entrada (Front Door) unificada para o ecossistema.
 * Respeita estritamente a premissa de que a borda recebe obrigatoriamente o 
 * token bruto da Superbid (`sbx_access_token`) enviado por sistemas externos ou pelo Sandbox.
 * 
 * [FLUXO OPERACIONAL DA BORDA]:
 * 1. Entrada Exclusiva SBX: O `auth_token` recebido é tratado sempre como o token bruto/opaco 
 *    ou objeto OAuth da Superbid. 
 * 2. Validação Upstream: A borda valida o token diretamente no endpoint `/account/v2/user/me` 
 *    da Superbid para autenticar o usuário e extrair o seu ID.
 * 3. Emissão Stateless: Gera o nosso JWT interno assinado via `generateSessionToken` (que retorna 
 *    o objeto `SessionData`) e extrai `session_token` para injetar no cabeçalho `x-session-token` 
 *    do Orquestrador.
 * ============================================================================
 * @author César Ismael Pereira da Costa
 * @version 5.2.0 (Acesso correto à propriedade .session_token do objeto SessionData)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateSessionToken } from "../_shared/jwt.ts";
import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";
import { getSafeRedirectUrl, getSafeCorsOrigin } from "../_shared/security.ts";
import { BFFUserProfile, BFFOfferDetails } from "../_shared/types.ts";

const ENV_URLS = {
  production: {
    api: "https://api.s4bdigital.net",
    offer: "https://offer-query.superbid.net",
    event: "https://event-query.superbid.net",
  },
  staging: {
    api: "https://stgapi.s4bdigital.net",
    offer: "https://offer-query.stage.superbid.net",
    event: "https://event-query.stage.superbid.net",
  },
};

serve(
  withSecurity("financial-gateway-gate", async (req: Request) => {
    const originPath = req.headers.get("origin") || req.headers.get("referer") || "/";

    // =====================================================================
    // [TELEMETRIA] Inspeção de Entrada na Borda (Segura e Sanitizada)
    // =====================================================================
    debugLog("[GATEWAY-INSPECT] Requisição recebida (Exclusive SBX Gateway)", {
      method: req.method,
      url: req.url,
      contentType: req.headers.get("content-type"),
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
      return respondWithError(
        isAjax,
        400,
        "BAD_REQUEST",
        "Payload inválido ou vazio.",
        payload?.return_uri || originPath,
        req,
        payload || {},
      );
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
      target_url,
    } = payload;

    // =====================================================================
    // [STEP 2] RESOLUÇÃO DE CREDENCIAL SBX (Header Custom > Payload)
    // =====================================================================
    let inputToken = "";

    // 1. Prioridade Máxima: Header Customizado
    inputToken = req.headers.get("x-access-token") || "";

    // 2. Fallback: Payload Body (Exclusivo para <form method="POST"> do Sandbox/Sistemas Externos)
    if (!inputToken && payload?.auth_token) {
      inputToken = String(payload.auth_token).trim();
    }

    // 🔒 [SECURITY PATCH]: Purga o token do payload IMEDIATAMENTE após a extração
    // Impede o vazamento da credencial e a passagem indevida para o Orquestrador
    if (payload?.auth_token) {
      delete payload.auth_token;
    }

    if (!inputToken) {
      return respondWithError(
        isAjax,
        400,
        "BAD_REQUEST",
        "Credencial de acesso SBX ausente (Headers e Payload vazios).",
        return_uri,
        req,
        payload,
      );
    }

    try {
      const activeEnvironment = environment || "staging";
      const urls = ENV_URLS[activeEnvironment as keyof typeof ENV_URLS] || ENV_URLS.production;

      // =====================================================================
      // [STEP 3] PROCESSAMENTO EXCLUSIVO DO TOKEN BRUTO DA SUPERBID
      // =====================================================================
      let sbx_access_token = "";
      let finalJwt = "";

      let sanitizedInputToken = String(inputToken).trim();

      // Interceptação caso venha o objeto JSON completo do OAuth da Superbid
      if (sanitizedInputToken.startsWith("{") && sanitizedInputToken.endsWith("}")) {
        try {
          const parsedTokenJson = JSON.parse(sanitizedInputToken);
          if (parsedTokenJson.access_token) {
            sanitizedInputToken = parsedTokenJson.access_token;
            debugLog("[GATEWAY-AUTH] JSON do OAuth detectado. access_token extraído com sucesso.");
          }
        } catch (e) {
          debugLog("[GATEWAY-AUTH] Falha ao parsear JSON no auth_token, mantendo string original.", { error: String(e) });
        }
      }

      sbx_access_token = sanitizedInputToken;

      debugLog("[GATEWAY-AUTH] Validando token bruto da Superbid no endpoint /me...");

      // Validação upstream diretamente no endpoint de usuário da Superbid
      const userCheckRes = await fetch(`${urls.api}/account/v2/user/me`, {
        method: "GET",
        headers: { Authorization: `Bearer ${sbx_access_token}` },
      });

      if (userCheckRes.status === 401) {
        throw new Error("SESSION_EXPIRED: O token bruto da Superbid fornecido é inválido ou expirou na origem.");
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

      // Emite o nosso JWT interno stateless e extrai a string JWS de dentro do objeto SessionData retornado por jwt.ts
      const newTokenData = await generateSessionToken(userId, activeEnvironment, 21600);
      finalJwt = newTokenData.session_token;
      debugLog("[GATEWAY-AUTH] Token da Superbid validado no /me. Nosso JWT interno emitido com sucesso para o orquestrador.");

      // =====================================================================
      // [STEP 4] HIDRATAÇÃO DE PERFIL (BFF Mapping - Suporte PF / PJ)
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
        metadata: { processedAt: new Date().toISOString(), originIp: "proxy-stateless" },
      };

      try {
        const userRes = await fetch(`${urls.api}/account/v2/user/me`, {
          method: "GET",
          headers: { Authorization: `Bearer ${sbx_access_token}` },
        });

        if (userRes.ok) {
          const userData = await userRes.json();
          const account = userData.userAccounts?.[0];
          const mainAddress = account?.addresses?.[0];
          const isJuridica = account?.type === "J";
          const targetDocTypeName = isJuridica ? "cnpj" : "cpf";
          const rawDocument = account?.documents?.find((doc: any) => doc.typeName === targetDocTypeName)?.number || "";
          const cleanDocument = rawDocument.replace(/\D/g, "");

          const rawBirthDate = isJuridica ? account?.companyRepresentative?.dateOfBirth : account?.birthDate;
          const formattedBirthDate = rawBirthDate ? String(rawBirthDate).split("T")[0] : "";

          userProfile = {
            entity_id: userId,
            entity_type: account?.type || "F",
            name: account?.basicInfo?.fullName || "N/A",
            document: cleanDocument,
            document_rg: account?.documents?.find((doc: any) => doc.typeName === "rg")?.number || "",
            email: account?.basicInfo?.email?.address || "",
            phone: account?.phones?.find((p: any) => p.type === 3)?.fullPhoneNumber || "",
            birth_date: formattedBirthDate,
            gender: isJuridica ? account?.companyRepresentative?.gender || "M" : account?.gender === "M" ? "M" : "F",
            login: account?.credentials?.login || "",
            mothers_name: isJuridica ? account?.companyRepresentative?.mothersName || "" : account?.mothersName || "",
            address: mainAddress
              ? {
                  street: mainAddress.addressLine1 || "",
                  number: mainAddress.number || "",
                  complement: mainAddress.addressLine2 || "",
                  neighborhood: mainAddress.district || "",
                  city: mainAddress.city || "",
                  state: mainAddress.state || "",
                  zip_code: mainAddress.zipCode || "",
                  country: mainAddress.countryIsoKey || "BR",
                }
              : null,
            metadata: { processedAt: new Date().toISOString(), originIp: "proxy" },
          };
        }
      } catch (e) {
        debugLog("[GATEWAY-WARN] Falha ao hidratar perfil completo upstream, utilizando perfil base.", { error: String(e) });
      }

      // =====================================================================
      // [STEP 5] BUSCA E MAPEAMENTO DE OFERTA (Catálogo Upstream)
      // =====================================================================
      let offerPayload: BFFOfferDetails | null = null;

      if (offer_id) {
        const cleanOfferId = String(offer_id).replace(/[^0-9]/g, "");
        const offerUrl = `${urls.offer}/offers/?portalId=[2,15]&locale=pt_BR&timeZoneId=America/Sao_Paulo&searchType=opened&filter=id:[${cleanOfferId}]&pageNumber=1&pageSize=15&orderBy=price:desc&requestOrigin=marketplace&preOrderBy=orderByFirstOpenedOffersAndSecondHasPhoto`;

        const offerHeaders: Record<string, string> = {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: "https://www.superbid.net",
          Referer: "https://www.superbid.net/",
          Authorization: `Bearer ${sbx_access_token}`,
        };

        const offerRes = await fetch(offerUrl, {
          method: "GET",
          headers: offerHeaders,
        });

        if (offerRes.status === 401)
          throw new Error("SESSION_UPSTREAM_EXPIRED: Token Superbid expirado durante busca de ofertas.");
        if (!offerRes.ok) throw new Error(`UPSTREAM_OFFER_ERROR (${offerRes.status}):${await offerRes.text()}`);

        const offerData = await offerRes.json();
        const rawOffer = offerData.offers?.[0];

        if (!rawOffer) throw new Error("OFFER_NOT_FOUND: Oferta não localizada no catálogo.");

        const eventUrl = `${urls.event}/events/v2/?portalId=[2,15]&locale=pt_BR&timeZoneId=America\%2FSao_Paulo&filter=id:${rawOffer.auction?.id || ""}&pageSize=1`;
        const eventRes = await fetch(eventUrl, {
          method: "GET",
          headers: offerHeaders,
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
            manufacture_year: Number(getGroupProp("identificacao", "anofabricacao")) || 0,
            model_year: Number(getGroupProp("identificacao", "anomodelo")) || 0,
            fipe_code: getGroupProp("financiamento", "codigofipe") || "",
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
              country: rawOffer.product?.location?.country || "Brasil",
            },
            ...(vehicleData && { vehicle_details: vehicleData }),
            photos:
              rawOffer.product?.galleryJson?.map((p: any) => ({
                highlight: p.highlight || false,
                link: p.link,
                thumbnail: p.thumbnailUrl,
                file_name: p.originalFileName,
                type: p.type || "photo",
                content_type: p.contentType || "image/jpeg",
              })) || [],
          },
          manager: {
            manager_id: rawOffer.manager?.id || 0,
            manager_name: rawOffer.manager?.name || "N/A",
          },
          event: {
            event_id: String(rawOffer.auction?.id || ""),
            event_description:
              `${rawOffer.auction?.desc || ""}${rawOffer.auction?.desc && eventData.fullDescription ? " - " : ""}${eventData.fullDescription || ""}`.trim(),
            event_start_date: rawOffer.auction?.beginDate || "",
            event_end_date: rawOffer.auction?.endDate || "",
            modality_id: eventData.modalityId ?? null,
            status_id: eventData.statusId ?? null,
            event_short_description: rawOffer.auction?.desc || "",
            event_full_description: eventData.fullDescription || "",
            event_image_url: eventData.imageURL || "",
          },
          seller: {
            seller_id: String(rawOffer.seller?.id || ""),
            legal_name: rawOffer.seller?.name || "N/A",
            trade_name: rawOffer.seller?.company?.[0]?.fantasyName || "N/A",
            economic_group: rawOffer.seller?.company?.[0]?.fantasyName || "N/A",
          },
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
        interaction_context: { utm_source, utm_medium, utm_campaign, origin_url: return_uri },
      };

      debugLog("Iniciando Orquestração de Rota (Exclusive SBX Gateway)...");
      const loginFallbackUrl = `/accounts/signin?redirect_uri=${encodeURIComponent(return_uri)}`;

      const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "0.0.0.0";
      const clientUa = req.headers.get("user-agent") || "";

      // Envia o nosso JWT interno assinado no cabeçalho x-session-token extraído de newTokenData.session_token
      const orchestratorResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/orchestrator`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
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
        try {
          frontendOrigin = new URL(reqOrigin).origin;
        } catch (_) {}
      }
      if (!frontendOrigin && return_uri && (return_uri.startsWith("http://") || return_uri.startsWith("https://"))) {
        try {
          frontendOrigin = new URL(return_uri).origin;
        } catch (_) {}
      }
      if (!frontendOrigin) {
        frontendOrigin = Deno.env.get("FRONTEND_URL") || "";
      }

      if (targetUrl && targetUrl.startsWith("/") && frontendOrigin) {
        targetUrl = `${frontendOrigin}${targetUrl}`;
      }

      // =====================================================================
      // [STEP 7] SMART DELIVERY E SEGURANÇA FINAL (HttpOnly Cookie vs Storage)
      // =====================================================================
      const apiHost = new URL(Deno.env.get("SUPABASE_URL") || "").hostname;
      const frontendHost = frontendOrigin ? new URL(frontendOrigin).hostname : "";
      const eTLDplus1 = (h: string) => h.split(".").slice(-2).join(".");

      const isSameSite = frontendHost && apiHost ? eTLDplus1(frontendHost) === eTLDplus1(apiHost) : false;
      const safeTokenToReturn = isSameSite ? "" : finalJwt;

      const responseHeaders = new Headers();
      responseHeaders.set(
        "Access-Control-Allow-Origin",
        getSafeCorsOrigin(req.headers.get("origin") || req.headers.get("referer")),
      );

      if (isAjax) {
        responseHeaders.set("Content-Type", "application/json");
        responseHeaders.set("Set-Cookie", `session_token=${finalJwt}; Path=/; HttpOnly; Secure; SameSite=Lax`);

        return new Response(
          JSON.stringify({
            success: true,
            redirect_url: targetUrl,
            environment: activeEnvironment,
            ...(safeTokenToReturn ? { session_token: safeTokenToReturn } : {}),
          }),
          { status: 200, headers: responseHeaders },
        );
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
                    ${safeTokenToReturn ? `sessionStorage.setItem('session_token', '${safeTokenToReturn}');` : ""}
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

      if (msg.includes("UPSTREAM_USER_ERROR")) {
        errorCode = "SBX_LOADER_FAIL_USER";
        statusCode = 422;
      } else if (msg.includes("SESSION_UPSTREAM_EXPIRED") || msg.includes("SESSION_EXPIRED")) {
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
  }),
);

function respondWithError(
  isAjax: boolean,
  statusCode: number,
  code: string,
  message: string,
  safeReturnUri: string,
  req: Request,
  originalPayload: Record<string, any> = {},
): Response {
  const headers = new Headers();
  headers.set("Access-Control-Allow-Origin", "*");

  if (isAjax) {
    headers.set("Content-Type", "application/json");

    const extraData: Record<string, any> = {};
    if (originalPayload && typeof originalPayload === "object") {
      for (const [key, value] of Object.entries(originalPayload)) {
        if (key !== "auth_token" && value !== undefined && value !== null) {
          extraData[key] = value;
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: false,
        code,
        message,
        ...extraData,
      }),
      { status: statusCode, headers },
    );
  }

  let frontendOrigin = "";
  if (safeReturnUri && (safeReturnUri.startsWith("http://") || safeReturnUri.startsWith("https://"))) {
    try {
      frontendOrigin = new URL(safeReturnUri).origin;
    } catch (_) {}
  }

  if (!frontendOrigin) {
    const reqOrigin = req.headers.get("origin") || req.headers.get("referer");
    if (reqOrigin) {
      try {
        frontendOrigin = new URL(reqOrigin).origin;
      } catch (_) {}
    }
  }

  if (!frontendOrigin) {
    frontendOrigin = Deno.env.get("FRONTEND_URL") || "";
  }

  if (!frontendOrigin) {
    return new Response(
      JSON.stringify({ success: false, code: "CONFIG_ERROR", message: "Origem do front-end não identificada." }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const urlParams = new URLSearchParams({
    status: "error",
    code: code,
    message: message,
    return_uri: safeReturnUri,
  });

  if (originalPayload && typeof originalPayload === "object") {
    for (const [key, value] of Object.entries(originalPayload)) {
      if (key !== "auth_token" && value !== undefined && value !== null && !urlParams.has(key)) {
        urlParams.set(key, String(value));
      }
    }
  }

  const errorUrl = `${frontendOrigin}/financialGatewayGate?${urlParams.toString()}`;

  headers.set("Location", errorUrl);
  return new Response(null, { status: 302, headers });
}