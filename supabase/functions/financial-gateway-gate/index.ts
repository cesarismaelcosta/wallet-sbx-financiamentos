/**
 * @fileoverview EDGE GATEWAY DE ENTRADA (Autenticação Exclusiva SBX & Roteamento Stateless)
 * @path supabase/functions/financial-gateway-gate/index.ts
 * @version 6.1.0
 *
 * ============================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: ZERO-TRUST & STATELESS HANDOFF
 * ============================================================================
 * Atua como a porta de entrada (Front Door) unificada para o ecossistema.
 * Respeita estritamente a premissa de que a borda recebe obrigatoriamente o
 * token bruto da Superbid (`sbx_access_token`) enviado por sistemas externos ou pelo Sandbox.
 *
 * [EVOLUÇÃO v6.1.0 - OTIMIZAÇÃO EDGE & CORREÇÃO eTLD+1]:
 * 1. {Single Parse}: Eliminação de parse redundante do body para economizar CPU/RAM.
 * 2. {Apex Domain Resolution}: Novo algoritmo de `eTLD+1` para suportar TLDs duplos
 *    brasileiros (ex: .com.br, .net.br), garantindo o correto isolamento de SameSite cookies.
 *
 * [FLUXO OPERACIONAL DA BORDA]:
 * 1. Entrada Exclusiva SBX: O `auth_token` recebido é tratado sempre como o token bruto/opaco.
 * 2. Validação Upstream: Valida o token no `/account/v2/user/me` da Superbid.
 * 3. Hidratação PII: Monta o perfil do usuário e assina (S2S Bypass).
 * 4. Roteamento Rápido: Repassa o ID da oferta para o Orquestrador (que fará a busca condicional).
 * 5. Emissão Stateless: Handoff seguro via fragmento da URL (Zero-Trust).
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateSessionToken, generateExchangeToken, hashUserAgent } from "../_shared/jwt.ts";
import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";
import { getSafeRedirectUrl, getSafeCorsOrigin } from "../_shared/security.ts";
import { BFFUserProfile } from "../_shared/types.ts";
import { signS2SEntity } from "../_shared/s2s.ts";

const ENV_URLS = {
  production: {
    api: "https://api.s4bdigital.net",
  },
  staging: {
    api: "https://stgapi.s4bdigital.net",
  },
};

const originFromUrl = (candidate?: string): string => {
  if (!candidate || !/^https?:\/\//i.test(candidate)) return "";
  try {
    return new URL(candidate).origin;
  } catch (_) {
    return "";
  }
};

// ✨ [FIX 3]: Resolve o domínio principal considerando extensões duplas (.com.br, .net.br)
const getApexDomain = (hostname: string): string => {
  const parts = hostname.split(".");
  if (parts.length <= 2) return hostname;
  const secondToLast = parts[parts.length - 2];
  if (["com", "net", "org", "co", "gov", "edu", "mil", "jus"].includes(secondToLast)) {
    return parts.slice(-3).join(".");
  }
  return parts.slice(-2).join(".");
};

serve(
  withSecurity("financial-gateway-gate", async (req: Request) => {
    const originPath = req.headers.get("origin") || req.headers.get("referer") || "/";

    debugLog("[GATEWAY-INSPECT] Requisição recebida (Exclusive SBX Gateway)", {
      method: req.method,
      url: req.url,
      contentType: req.headers.get("content-type"),
    });

    // =====================================================================
    // [STEP 1] NEGOCIAÇÃO DE CONTEÚDO E SINGLE PARSE
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
        // ✨ [FIX 1]: Parse do JSON acontece uma vez só
        payload = await req.json();
      }
      
      if (payload) {
        debugLog("[GATEWAY-INSPECT] Payload parseado e sanitizado", {
          keys: Object.keys(payload).filter(k => k !== "auth_token") // Não loga o token bruto
        });
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
    let inputToken = req.headers.get("x-access-token") || "";

    if (!inputToken && payload?.auth_token) {
      inputToken = String(payload.auth_token).trim();
    }

    // 🔒 [SECURITY PATCH]: Purga o token do payload IMEDIATAMENTE
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

      if (sanitizedInputToken.startsWith("{") && sanitizedInputToken.endsWith("}")) {
        try {
          const parsedTokenJson = JSON.parse(sanitizedInputToken);
          if (parsedTokenJson.access_token) {
            sanitizedInputToken = parsedTokenJson.access_token;
            debugLog("[GATEWAY-AUTH] JSON do OAuth detectado. access_token extraído com sucesso.");
          }
        } catch (e) {
          debugLog("[GATEWAY-AUTH] Falha ao parsear JSON, mantendo string original.", { error: String(e) });
        }
      }

      sbx_access_token = sanitizedInputToken;
      debugLog("[GATEWAY-AUTH] Validando token bruto da Superbid no endpoint /me...");

      const userCheckRes = await fetch(`${urls.api}/account/v2/user/me`, {
        method: "GET",
        headers: { Authorization: `Bearer ${sbx_access_token}` },
      });

      if (userCheckRes.status === 401) {
        throw new Error("SESSION_EXPIRED: O token bruto da Superbid fornecido é inválido ou expirou na origem.");
      }
      if (!userCheckRes.ok) {
        throw new Error(`UPSTREAM_USER_ERROR (${userCheckRes.status}): Falha ao autenticar usuário na Superbid.`);
      }

      const upstreamUserData = await userCheckRes.json();
      const account = upstreamUserData.userAccounts?.[0];
      userId = String(account?.id || "");
      
      // Extraindo as variáveis do Fat Token Handoff direto do upstream
      const userName = account?.basicInfo?.fullName || "";
      const login = account?.credentials?.login || "";

      if (!userId) {
        throw new Error("USER_NOT_FOUND: Não foi possível identificar o ID do usuário através do login Superbid.");
      }

      // Assinatura com environment, userId, userName, login
      const newTokenData = await generateSessionToken(activeEnvironment, userId, userName, login);
      
      finalJwt = newTokenData.session_token;
      debugLog("[GATEWAY-AUTH] JWT interno emitido com sucesso para o orquestrador.");

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
        if (upstreamUserData) {
          const userData = upstreamUserData;
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
            name: account?.basicInfo?.fullName || "",
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
        debugLog("[GATEWAY-WARN] Falha ao hidratar perfil completo upstream, utilizando perfil base.", {
          error: String(e),
        });
      }

      // =====================================================================
      // [STEP 5] ORQUESTRAÇÃO DE ROTAS (Target Discovery & Direct Navigation)
      // =====================================================================
      const isDirectVisit = !!target_url;

      const s2sToken = await signS2SEntity(userProfile);

      const rehydratedPayload = {
        action: isDirectVisit ? "VISIT" : "CONSULT",
        target_url: target_url || "",
        timestamp: new Date().toISOString(),
        origin_url: return_uri,
        environment: activeEnvironment,
        s2s_signed_entity: s2sToken,
        offer_id: offer_id || null,
        product_id: product_id ? Number(product_id) : null,
        interaction_context: { utm_source, utm_medium, utm_campaign, origin_url: return_uri },
      };

      debugLog("Iniciando Orquestração de Rota (Exclusive SBX Gateway)...");
      const loginFallbackUrl = `/accounts/signin?redirect_uri=${encodeURIComponent(return_uri)}`;

      const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "0.0.0.0";
      const clientUa = req.headers.get("user-agent") || "";

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

      // ✨ [FIX 2]: Uso da originFromUrl global (removida a local redundante)
      let frontendOrigin =
        originFromUrl(orchestratorData.url) ||
        originFromUrl(target_url) ||
        originFromUrl(return_uri) ||
        "";

      frontendOrigin = getSafeCorsOrigin(frontendOrigin) || "";

      if (targetUrl && targetUrl.startsWith("/") && frontendOrigin) {
        targetUrl = `${frontendOrigin}${targetUrl}`;
      }

      // =====================================================================
      // [STEP 6] SMART DELIVERY (Handoff Stateless via Fragmento)
      // =====================================================================
      const apiHost = new URL(Deno.env.get("SUPABASE_URL") || "").hostname;
      const frontendHost = frontendOrigin ? new URL(frontendOrigin).hostname : "";
      
      // ✨ [FIX 3]: Usa o getApexDomain para resolver eTLD+1 seguro
      const isSameSite = frontendHost && apiHost ? getApexDomain(frontendHost) === getApexDomain(apiHost) : false;
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
      }

      if (!frontendOrigin) {
        throw new Error("BAD_REQUEST: Origem do aplicativo de destino não pôde ser resolvida para o handoff.");
      }

      const exchangeToken = await generateExchangeToken({
        environment: activeEnvironment as "staging" | "production",
        userId,
        userName: userProfile.name,
        login: userProfile.login,
        aud: frontendOrigin,
        uah: hashUserAgent(clientUa),
      });

      const handoffUrl =
        `${targetUrl}` +
        (targetUrl.includes("?") ? "&" : "?") +
        `#xt=${encodeURIComponent(exchangeToken)}`;

      responseHeaders.set("Location", handoffUrl);
      responseHeaders.set("Cache-Control", "no-store, no-cache, must-revalidate");
      return new Response(null, { status: 302, headers: responseHeaders });

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
  headers.set(
    "Access-Control-Allow-Origin",
    getSafeCorsOrigin(req.headers.get("origin") || req.headers.get("referer")),
  );

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
      JSON.stringify({ success: false, code, message, ...extraData }),
      { status: statusCode, headers },
    );
  }

  let frontendOrigin =
    originFromUrl(safeReturnUri) ||
    originFromUrl(req.headers.get("origin") || req.headers.get("referer") || "");

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