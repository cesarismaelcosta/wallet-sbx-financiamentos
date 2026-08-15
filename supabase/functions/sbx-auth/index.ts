/**
 * @fileoverview Edge Function: sbx-auth (Proxy de Login, Emissão JWT Stateless & Hidratação de Perfil /me)
 * @path supabase/functions/sbx-auth/index.ts
 *
 * ============================================================================
 * [ARQUITETURA BFF (Backend For Frontend) & STATELESS]
 * ============================================================================
 * Esta função atua como um orquestrador de autenticação (Backend For Frontend).
 * Ela centraliza a complexidade do handshake OAuth2 com a Superbid, consome o 
 * perfil completo (/me) upstream, e emite o nosso JWT interno (embutindo o sbx_access_token).
 * 
 * [GARANTIAS DE ARQUITETURA]:
 * 1. Zero Banco de Dados (Stateless): O token carrega tudo que o Client precisa.
 * 2. Prevenção de Cascatas (Zero N+1): O perfil (/me) já vai mastigado no payload do login.
 * 3. Centralização de Regras (Smart Backend, Dumb Frontend): O React não toma 
 *    decisões de negócio; ele apenas executa as 'actions' (redirecionar, mostrar 
 *    erro no input ou mostrar no topo) ditadas por este serviço baseadas no 
 *    dicionário oficial de erros da Superbid.
 * ============================================================================
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateSessionToken } from "../_shared/jwt.ts";
import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";
import { BFFUserProfile } from "../_shared/types.ts";

const ENV_URLS = {
  production: "https://api.s4bdigital.net",
  staging: "https://stgapi.s4bdigital.net",
};

// =========================================================================
// [ROTEAMENTO DE SEGURANÇA]: Identity Provider (IdP)
// =========================================================================
// Domínios base para onde o usuário será enviado caso precise resolver 
// pendências de biometria (facecheck) ou dispositivo não confiável.
const IDP_URLS = {
  production: "https://accounts.superbid.net",
  staging: "https://accounts.stage.superbid.net"
};

// =========================================================================
// [MAPA ÚNICO DE ERROS]: Dicionário Oficial da Documentação Superbid
// =========================================================================
// Agrupa as regras de negócio (chaves do JSON) e falhas de infraestrutura 
// (códigos HTTP) em um único dicionário para facilitar a manutenção.
const SUPERBID_ERROR_MAP: Record<
  string,
  {
    expected_status: number; // O status HTTP exato que a Superbid cospe
    code: string;
    message: string;
    action: "show_inline_error" | "show_banner_error" | "redirect";
    redirect_path?: string;
  }
> = {
  // -----------------------------------------------------------------------
  // ERROS HTTP 400 (Regras de Negócio no JSON)
  // -----------------------------------------------------------------------
  "invalid_grant": {
    expected_status: 400,
    code: "CREDENTIALS_INVALID",
    message: "Usuário ou senha inválidos",
    action: "show_inline_error"
  },
  "invalid_request": {
    expected_status: 400,
    code: "CREDENTIALS_INVALID",
    message: "Usuário ou senha inválidos",
    action: "show_inline_error"
  },
  "inactive_user": {
    expected_status: 400,
    code: "ACCOUNT_BLOCKED",
    message: "Este usuário encontra-se bloqueado no sistema. Por favor, entre em contato com nossa central de relacionamento",
    action: "show_banner_error"
  },
  "email_not_validated": {
    expected_status: 400,
    code: "EMAIL_PENDING",
    message: "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada e clique no link para ativar sua conta.",
    action: "show_banner_error"
  },
  "password_expired": {
    expected_status: 400,
    code: "PASSWORD_EXPIRED",
    message: "Sua senha expirou devido às políticas de segurança e precisa ser atualizada. Verifique seu e-mail.",
    action: "show_banner_error"
  },
  "weak_password": {
    expected_status: 400,
    code: "WEAK_PASSWORD",
    message: "Sua senha atual não está de acordo com nossos padrões de segurança.",
    action: "redirect",
    redirect_path: "/forgot-password"
  },
  "user_not_face_checked": {
    expected_status: 400,
    code: "FACECHECK_REQUIRED",
    message: "Identificamos que você ainda não realizou a biometria facial em seu cadastro. Vamos guiar você por essa jornada. ",
    action: "redirect",
    redirect_path: "/signin"
  },
  "documents_disapproved": {
    expected_status: 400,
    code: "DOCS_UNDER_REVIEW",
    message: "Ainda estamos validando a sua documentação, aguarde mais algumas horas.",
    action: "show_banner_error"
  },
  "documents_waiting_validation": {
    expected_status: 400,
    code: "DOCS_UNDER_REVIEW",
    message: "Ainda estamos validando a sua documentação, aguarde mais algumas horas.",
    action: "show_banner_error"
  },

  // -----------------------------------------------------------------------
  // ERROS HTTP 403 (Dispositivo e Biometria no JSON)
  // -----------------------------------------------------------------------
  "device_not_trusted": {
    expected_status: 403,
    code: "DEVICE_NOT_TRUSTED",
    message: "Dispositivo não autorizado. É necessário autorizá-lo através de biometria facial. Vamos te guiar por essa jornada.",
    action: "redirect",
    redirect_path: "/signin"
  },
  "new_device_requires_facecheck": {
    expected_status: 403,
    code: "DEVICE_NOT_TRUSTED",
    message: "Novo dispositivo detectado. É necessário autorizá-lo através de biometria facial. Vamos te guiar por essa jornada.",
    action: "redirect",
    redirect_path: "/signin"
  },

  // -----------------------------------------------------------------------
  // ERROS DE INFRAESTRUTURA / FALLBACK (A Chave é o próprio Status HTTP)
  // -----------------------------------------------------------------------
  "400": {
    expected_status: 400,
    code: "BAD_REQUEST",
    message: "Ocorreu um erro ao processar sua requisição. Verifique os dados e tente novamente.",
    action: "show_banner_error"
  },
  "406": {
    expected_status: 406,
    code: "INVALID_QUERY",
    message: "Parâmetros de requisição inválidos ou bloqueados por segurança.",
    action: "show_banner_error"
  },
  "429": {
    expected_status: 429,
    code: "RATE_LIMIT",
    message: "Identificamos muitas tentativas de login, aguarde alguns minutos.",
    action: "show_banner_error"
  }
};

serve(
  withSecurity("sbx-auth", async (req: Request) => {
    // Captura o IP do client original para repassar ao WAF da Superbid e evitar 
    // que o Edge Server do Supabase seja marcado como atacante.
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || "0.0.0.0";

    try {
      const body = await req.json();
      const { username, password, environment = "staging" } = body;

      // Resolução segura de URLs baseadas no ambiente
      const sbxBaseUrl = ENV_URLS[environment as keyof typeof ENV_URLS];
      const idpBaseUrl = IDP_URLS[environment as keyof typeof IDP_URLS];

      // -----------------------------------------------------------------------
      // FASE 1: VALIDAÇÃO PREVENTIVA DE ENTRADA
      // Evita sobrecarregar a rede upstream se os dados básicos não estiverem presentes
      // -----------------------------------------------------------------------
      if (!username || !password) {
        throw new Error(JSON.stringify({ 
          code: "BAD_REQUEST", 
          message: "Login e senha são obrigatórios.", 
          action: "show_banner_error",
          status: 400 
        }));
      }

      if (!environment || (environment !== "production" && environment !== "staging")) {
        throw new Error(JSON.stringify({ 
          code: "BAD_REQUEST", 
          message: "Ambiente inválido ou não especificado.", 
          action: "show_banner_error",
          status: 400 
        }));
      }

      debugLog(`[sbx-auth] Iniciando autenticação upstream para o usuário no ambiente: ${environment}`);

      // -----------------------------------------------------------------------
      // FASE 2: INTEGRAÇÃO UPSTREAM (Handshake OAuth2 Oficial)
      // -----------------------------------------------------------------------
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

      // =======================================================================
      // [ROTEADOR INTELIGENTE DE ERROS]: Tratamento Dinâmico
      // =======================================================================
      if (!sbxLoginResponse.ok) {
        debugLog("[sbx-auth] ERRO REAL DA SBX:", { status: sbxLoginResponse.status, body: rawResponse });

        // Por padrão, a chave que vamos buscar no mapa é o próprio Status HTTP em string
        let mapKey = String(sbxLoginResponse.status); 

        // Se houver JSON, ele tenta pegar o erro da regra de negócio para substituir a chave HTTP
        try {
          const jsonError = JSON.parse(rawResponse);
          if (jsonError.error) {
            mapKey = jsonError.error;
          }
        } catch (e) {
          // Ignora caso a resposta seja um HTML do Cloudflare ou resposta vazia
        }

        const mappedError = SUPERBID_ERROR_MAP[mapKey];
        
        if (mappedError) {
          // [ARQUITETURA BFF]: O Backend constrói a URL absoluta para o Frontend não ter que adivinhar
          const absoluteRedirectPath = mappedError.redirect_path 
            ? `${idpBaseUrl}${mappedError.redirect_path}` 
            : undefined;

          throw new Error(JSON.stringify({ 
            code: mappedError.code, 
            message: mappedError.message,
            action: mappedError.action,
            redirect_path: absoluteRedirectPath,
            status: mappedError.code === "CREDENTIALS_INVALID" ? 401 : mappedError.expected_status 
          }));
        }

        // Fallback genérico extremo caso a API crie um código novo não mapeado
        throw new Error(JSON.stringify({ 
          code: "PROVIDER_ERROR", 
          message: `Falha no provedor (Erro/Status: ${mapKey})`, 
          action: "show_banner_error",
          status: sbxLoginResponse.status 
        }));
      }

      // -----------------------------------------------------------------------
      // FASE 3: HIDRATAÇÃO DO PERFIL (/me)
      // -----------------------------------------------------------------------
      const sbxData = JSON.parse(rawResponse);
      const userId = String(sbxData.userId || "");
      const sbxAccessToken = sbxData.access_token;

      if (!userId || !sbxAccessToken) {
        throw new Error(JSON.stringify({ 
          code: "USER_IDENTIFICATION_FAILED", 
          message: "Não foi possível extrair a identidade ou o token upstream.", 
          action: "show_banner_error",
          status: 400 
        }));
      }

      const userRes = await fetch(`${sbxBaseUrl}/account/v2/user/me`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${sbxAccessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!userRes.ok) {
        throw new Error(JSON.stringify({ 
          code: "PROFILE_FETCH_FAILED", 
          message: `Falha ao carregar perfil na Superbid (${userRes.status})`, 
          action: "show_banner_error",
          status: userRes.status 
        }));
      }

      const userData = await userRes.json();
      const account = userData.userAccounts?.[0];

      // -----------------------------------------------------------------------
      // FASE 4: MAPEAMENTO E NORMALIZAÇÃO DO PERFIL (BFF User Profile)
      // -----------------------------------------------------------------------
      const isJuridica = account?.type === "J";
      const targetDocTypeName = isJuridica ? "cnpj" : "cpf";
      
      // Limpeza robusta (remove pontuação e assegura type safety)
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
        address: account?.addresses?.[0]
          ? {
              street: account.addresses[0].addressLine1 || "",
              number: account.addresses[0].number || "",
              complement: account.addresses[0].addressLine2 || "",
              neighborhood: account.addresses[0].district || "",
              city: account.addresses[0].city || "",
              state: account.addresses[0].state || "",
              zip_code: account.addresses[0].zipCode || "",
              country: account.addresses[0].countryIsoKey || "BR",
            }
          : null,
        metadata: { processedAt: new Date().toISOString(), originIp: "proxy-stateless" },
      };

      // -----------------------------------------------------------------------
      // FASE 5: EMISSÃO DO JWT INTERNO STATELESS
      // -----------------------------------------------------------------------
      const tokenData = await generateSessionToken(
        userId,
        environment
      );

      // -----------------------------------------------------------------------
      // FASE 6: TRANSPORTE SEGURO DO CONTRATO
      // -----------------------------------------------------------------------
      const isProd = environment === "production";
      const cookieHeader = `session_token=${tokenData.session_token}; Path=/; HttpOnly; SameSite=Lax${
        isProd ? "; Secure" : ""
      }`;

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
        },
        headers: {
          "Set-Cookie": cookieHeader,
        },
      };

    } catch (err: any) {
      debugLog(`[sbx-auth] Falha de Execução: ${err.message}`);

      // =======================================================================
      // [CATCH FINAL]: Desembrulhador de Contrato JSON
      // =======================================================================
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
        // Fallback de segurança se falhar o parse do erro interno
      }

      return {
        status: finalStatus,
        data: {
          success: false,
          code: finalCode,
          message: finalMessage,
          action: finalAction,
          redirect_path: finalRedirectPath
        },
      };
    }
  }),
);