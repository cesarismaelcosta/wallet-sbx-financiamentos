/**
 * @fileoverview Edge Function: sbx-auth (Proxy de Login, Emissão JWT Stateless & Hidratação de Perfil /me)
 * @path supabase/functions/sbx-auth/index.ts
 * @version 3.2.0
 *
 * ============================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: BFF ZERO-TRUST & S2S DELEGATION
 * ============================================================================
 * Esta função atua como um orquestrador de autenticação (Backend For Frontend).
 *
 * [EVOLUÇÃO v3.2.0 - SIGNED STATE & OMISSÃO SEGURA]:
 * 1. {Zero-Trust}: Lê o `handoff_token` criptografado (se existir) para garantir a integridade da jornada.
 *    Descarta qualquer tentativa do client de forçar rotas.
 * 2. {S2S Bypass}: Emite o `s2s_signed_entity` e bate no Orquestrador via POST.
 * 3. {Thin Payload}: Omissão estrita (não apenas envio de 'null') de `visit_id` 
 *    e `visit_update_id` para logins limpos, evitando bloqueios no Gatekeeper 
 *    e garantindo integridade das chaves estrangeiras no PostgreSQL.
 *
 * @author Cesar Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateSessionToken } from "../_shared/jwt.ts";
import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";
import { BFFUserProfile } from "../_shared/types.ts";

// ✨ IMPORT DO CARTÓRIO (Zero-Trust Navigation)
import { verifySigninParameters, signS2SEntity } from "../_shared/s2s.ts";

const ENV_URLS = {
  production: "https://api.s4bdigital.net",
  staging: "https://stgapi.s4bdigital.net",
};

const IDP_URLS = {
  production: "https://accounts.superbid.net",
  staging: "https://accounts.stage.superbid.net",
};

const SUPERBID_ERROR_MAP: Record<
  string,
  {
    expected_status: number;
    code: string;
    message: string;
    action: "show_inline_error" | "show_banner_error" | "redirect";
    redirect_path?: string;
  }
> = {
  invalid_grant: { expected_status: 400, code: "CREDENTIALS_INVALID", message: "Usuário ou senha inválidos", action: "show_inline_error" },
  invalid_request: { expected_status: 400, code: "CREDENTIALS_INVALID", message: "Usuário ou senha inválidos", action: "show_inline_error" },
  inactive_user: { expected_status: 400, code: "ACCOUNT_BLOCKED", message: "Este usuário encontra-se bloqueado no sistema. Por favor, entre em contato com nossa central de relacionamento", action: "show_banner_error" },
  email_not_validated: { expected_status: 400, code: "EMAIL_PENDING", message: "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada e clique no link para ativar sua conta.", action: "show_banner_error" },
  password_expired: { expected_status: 400, code: "PASSWORD_EXPIRED", message: "Sua senha expirou devido às políticas de segurança e precisa ser atualizada. Verifique seu e-mail.", action: "show_banner_error" },
  weak_password: { expected_status: 400, code: "WEAK_PASSWORD", message: "Sua senha atual não está de acordo com nossos padrões de segurança.", action: "redirect", redirect_path: "/forgot-password" },
  user_not_face_checked: { expected_status: 400, code: "FACECHECK_REQUIRED", message: "Identificamos que você ainda não realizou a biometria facial em seu cadastro. Vamos guiar você por essa jornada. ", action: "redirect", redirect_path: "/signin" },
  documents_disapproved: { expected_status: 400, code: "DOCS_UNDER_REVIEW", message: "Ainda estamos validando a sua documentação, aguarde mais algumas horas.", action: "show_banner_error" },
  documents_waiting_validation: { expected_status: 400, code: "DOCS_UNDER_REVIEW", message: "Ainda estamos validando a sua documentação, aguarde mais algumas horas.", action: "show_banner_error" },
  device_not_trusted: { expected_status: 403, code: "DEVICE_NOT_TRUSTED", message: "Dispositivo não autorizado. É necessário autorizá-lo através de biometria facial. Vamos te guiar por essa jornada.", action: "redirect", redirect_path: "/signin" },
  new_device_requires_facecheck: { expected_status: 403, code: "DEVICE_NOT_TRUSTED", message: "Novo dispositivo detectado. É necessário autorizá-lo através de biometria facial. Vamos te guiar por essa jornada.", action: "redirect", redirect_path: "/signin" },
  "400": { expected_status: 400, code: "BAD_REQUEST", message: "Ocorreu um erro ao processar sua requisição. Verifique os dados e tente novamente.", action: "show_banner_error" },
  "406": { expected_status: 406, code: "INVALID_QUERY", message: "Parâmetros de requisição inválidos ou bloqueados por segurança.", action: "show_banner_error" },
  "429": { expected_status: 429, code: "RATE_LIMIT", message: "Identificamos muitas tentativas de login, aguarde alguns minutos.", action: "show_banner_error" },
};

serve(
  withSecurity("sbx-auth", async (req: Request) => {
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || "0.0.0.0";
    const userAgent = req.headers.get("user-agent") || ""; 

    try {
      const body = await req.json();
      
      const { username, password, environment = "staging", handoff_token } = body;

      const sbxBaseUrl = ENV_URLS[environment as keyof typeof ENV_URLS];
      const idpBaseUrl = IDP_URLS[environment as keyof typeof IDP_URLS];

      if (!username || !password) {
        throw new Error(JSON.stringify({ code: "BAD_REQUEST", message: "Login e senha são obrigatórios.", action: "show_banner_error", status: 400 }));
      }

      if (!environment || (environment !== "production" && environment !== "staging")) {
        throw new Error(JSON.stringify({ code: "BAD_REQUEST", message: "Ambiente inválido ou não especificado.", action: "show_banner_error", status: 400 }));
      }

      debugLog(`[sbx-auth] Iniciando autenticação upstream para o usuário no ambiente: ${environment}`);

      // =======================================================================
      // FASE 1: DESCRIPTOGRAFIA DA INTENÇÃO (ZERO-TRUST)
      // =======================================================================
      let safeVisitId: string | null = null;
      let safeVisitUpdateId: string | null = null;
      let safeTargetUrl = "/sbxpay"; 
      let safeOriginUrl = "/accounts/signin";

      if (handoff_token) {
        try {
          const intent = await verifySigninParameters(handoff_token);
          safeVisitId = intent.visit_id || null;
          safeVisitUpdateId = intent.visit_update_id || null;
          safeTargetUrl = intent.target_url || "/sbxpay";
          safeOriginUrl = intent.origin_url || "/accounts/signin";
          debugLog(`[sbx-auth] Handoff Token validado. Restaurando jornada: ${safeVisitId}`);
        } catch (e) {
          debugLog(`[sbx-auth] Handoff Token invalido. Ancorando na Home.`);
        }
      }

      // =======================================================================
      // FASE 2: INTEGRAÇÃO UPSTREAM (Handshake OAuth2 Oficial)
      // =======================================================================
      const details = new URLSearchParams();
      details.append("username", String(username).trim());
      details.append("password", String(password));
      details.append("grant_type", "password");
      details.append("client_id", "dzqC3VodSoXukD45BQKg3NQU6-faststore");
      details.append("portalid", "2");

      const sbxLoginResponse = await fetch(`${sbxBaseUrl}/account/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Forwarded-For": clientIp,
        },
        body: details.toString(),
      });

      const rawResponse = await sbxLoginResponse.text();

      if (!sbxLoginResponse.ok) {
        debugLog("[sbx-auth] ERRO REAL DA SBX:", { status: sbxLoginResponse.status, body: rawResponse });

        let mapKey = String(sbxLoginResponse.status);
        try {
          const jsonError = JSON.parse(rawResponse);
          if (jsonError.error) {
            mapKey = jsonError.error;
          }
        } catch (e) { }

        const mappedError = SUPERBID_ERROR_MAP[mapKey];

        if (mappedError) {
          const absoluteRedirectPath = mappedError.redirect_path
            ? `${idpBaseUrl}${mappedError.redirect_path}`
            : undefined;

          throw new Error(JSON.stringify({
            code: mappedError.code,
            message: mappedError.message,
            action: mappedError.action,
            redirect_path: absoluteRedirectPath,
            status: mappedError.code === "CREDENTIALS_INVALID" ? 401 : mappedError.expected_status,
          }));
        }

        throw new Error(JSON.stringify({
          code: "PROVIDER_ERROR",
          message: `Falha no provedor (Erro/Status: ${mapKey})`,
          action: "show_banner_error",
          status: sbxLoginResponse.status,
        }));
      }

      // =======================================================================
      // FASE 3: HIDRATAÇÃO DO PERFIL (/me) - Fetch Nativo Estável
      // =======================================================================
      const sbxData = JSON.parse(rawResponse);
      const userId = String(sbxData.userId || "");
      const sbxAccessToken = sbxData.access_token;

      if (!userId || !sbxAccessToken) {
        throw new Error(JSON.stringify({ code: "USER_IDENTIFICATION_FAILED", message: "Não foi possível extrair a identidade ou o token upstream.", action: "show_banner_error", status: 400 }));
      }

      const userRes = await fetch(`${sbxBaseUrl}/account/v2/user/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${sbxAccessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!userRes.ok) {
        throw new Error(JSON.stringify({ code: "PROFILE_FETCH_FAILED", message: `Falha ao carregar perfil na Superbid (${userRes.status})`, action: "show_banner_error", status: userRes.status }));
      }

      const userData = await userRes.json();
      const account = userData.userAccounts?.[0];

      // =======================================================================
      // FASE 4: MAPEAMENTO E NORMALIZAÇÃO DO PERFIL
      // =======================================================================
      const isJuridica = account?.type === "J";
      const targetDocTypeName = isJuridica ? "cnpj" : "cpf";
      const rawDocument = account?.documents?.find((doc: any) => doc.typeName === targetDocTypeName)?.number || "";
      const cleanDocument = rawDocument.replace(/\D/g, "");
      const rawBirthDate = isJuridica ? account?.companyRepresentative?.dateOfBirth : account?.birthDate;
      const formattedBirthDate = rawBirthDate ? String(rawBirthDate).split("T")[0] : "";

      const userProfile: BFFUserProfile = {
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
        address: account?.addresses?.[0] ? {
          street: account.addresses[0].addressLine1 || "",
          number: account.addresses[0].number || "",
          complement: account.addresses[0].addressLine2 || "",
          neighborhood: account.addresses[0].district || "",
          city: account.addresses[0].city || "",
          state: account.addresses[0].state || "",
          zip_code: account.addresses[0].zipCode || "",
          country: account.addresses[0].countryIsoKey || "BR",
        } : null,
        metadata: { processedAt: new Date().toISOString(), originIp: "proxy-stateless" },
      };

      // =======================================================================
      // FASE 5: EMISSÃO DO JWT INTERNO STATELESS
      // =======================================================================
      const tokenData = await generateSessionToken(userId, environment);

      // =======================================================================
      // FASE 6: DELEGAÇÃO S2S / HANDOFF (Proteção contra criação de lixo)
      // =======================================================================
      debugLog("[sbx-auth] Assinando Entidade e verificando contexto de jornada...");

      const s2sToken = await signS2SEntity(userProfile);
      let finalRedirectUrl = safeTargetUrl;

      // ✨ REGRA DE OURO: Se o Handoff trouxe um visit_id válido, a jornada já existe.
      const isValidVisit = Boolean(safeVisitId);

      if (!isValidVisit) {
        // Acesso limpo / Login direto (Sem oferta prévia): Criamos a raiz no Orquestrador
        debugLog("[sbx-auth] Login limpo detectado. Orquestrando nova visita raiz...");
        
        const orchestratorPayload: Record<string, any> = {
          action: "VISIT",
          origin_url: safeOriginUrl,
          target_url: safeTargetUrl,
          environment: environment,
          s2s_signed_entity: s2sToken,
          interaction_context: { utm_source: "sbx-auth-login", origin_url: safeOriginUrl }
        };

        const orchestratorResponse = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/orchestrator`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
            "x-session-token": tokenData.session_token, 
            "x-original-url": safeOriginUrl,
            "x-client-ip": clientIp,
            "user-agent": userAgent
          },
          body: JSON.stringify(orchestratorPayload)
        });

        const orchestratorData = await orchestratorResponse.json();
        if (!orchestratorResponse.ok) {
          throw new Error(JSON.stringify({ code: "ORCHESTRATOR_FAIL", message: `Falha na orquestração - ${orchestratorData.message}`, action: "show_banner_error", status: orchestratorResponse.status }));
        }

        const orchPayload = orchestratorData.data || orchestratorData;
        safeVisitId = orchPayload.visit_id;
        safeVisitUpdateId = orchPayload.visit_update_id;
        finalRedirectUrl = orchPayload.url;
      } else {
        // Se tem Handoff válido, apenas preservamos a URL de destino e injetamos as âncoras
        debugLog("[sbx-auth] Handoff preservado. Ignorando criação de nova visita no login.");
        
        // Trata o target url preservando query strings existentes de forma limpa
        const [path, query = ""] = safeTargetUrl.split("?");
        const searchParams = new URLSearchParams(query);
        
        if (safeVisitId) searchParams.set("visit_id", safeVisitId);
        if (safeVisitUpdateId) searchParams.set("visit_update_id", safeVisitUpdateId);
        
        const queryString = searchParams.toString();
        finalRedirectUrl = queryString ? `${path}?${queryString}` : path;
      }

      // =======================================================================
      // FASE 7: TRANSPORTE SEGURO DO CONTRATO
      // =======================================================================
      const isProd = environment === "production";
      const cookieHeader = `session_token=${tokenData.session_token}; Path=/; HttpOnly; SameSite=Lax${isProd ? "; Secure" : ""}`;

      return {
        status: 200,
        data: {
          success: true,
          session_token: tokenData.session_token,
          issue_at: tokenData.issue_at,
          expires_in: tokenData.expires_in,
          userId: userId,
          environment: environment,
          user_profile: userProfile,
          initial_visit: {
            visit_id: safeVisitId,
            visit_update_id: safeVisitUpdateId,
            final_redirect_url: finalRedirectUrl 
          }
        },
        headers: {
          "Set-Cookie": cookieHeader,
        },
      };
    } catch (err: any) {
      debugLog(`[sbx-auth] Falha de Execução: ${err.message}`);

      let finalStatus = 400;
      let finalCode = "AUTH_FAILED";
      let finalMessage = err.message || "Erro crítico ao processar autenticação.";
      let finalAction = "show_banner_error";
      let finalRedirectPath = undefined;

      try {
        const parsedErr = JSON.parse(err.message);
        finalStatus = parsedErr.status || 400;
        finalCode = parsedErr.code || finalCode;
        finalMessage = parsedErr.message || finalMessage;
        finalAction = parsedErr.action || finalAction;
        finalRedirectPath = parsedErr.redirect_path || finalRedirectPath;
      } catch (e) {
      }

      return {
        status: finalStatus,
        data: {
          success: false,
          code: finalCode,
          message: finalMessage,
          action: finalAction,
          redirect_path: finalRedirectPath,
        },
      };
    }
  }),
);