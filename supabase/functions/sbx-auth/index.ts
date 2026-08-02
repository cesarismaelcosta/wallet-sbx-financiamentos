/**
 * @fileoverview Edge Function: sbx-auth (Proxy de Login, Emissão JWT Stateless & Hidratação de Perfil /me)
 * @path supabase/functions/sbx-auth/index.ts
 *
 * ============================================================================
 * [ARQUITETURA STATELESS & UNIFICAÇÃO DE PERFIL]
 * ============================================================================
 * Autentica contra o OAuth2 da Superbid, consome o perfil completo (/me) upstream,
 * emite o nosso JWT interno Stateless (embutindo o sbx_access_token para o sbx-user)
 * e retorna o contrato idêntico ao sbx-auth-exchange de uma só vez.
 * 
 * [GARANTIAS]:
 * - Zero Banco de Dados (Stateless total).
 * - Zero chamadas subsequentes para /sbx-user no login (O perfil vai mastigado).
 * ============================================================================
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateSessionToken } from "../_shared/jwt.ts";
import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";
import { BFFUserProfile } from "../_shared/types.ts";

const ENV_URLS = {
  production: "https://api.s4bdigital.net",
  staging: "https://stgapi.s4bdigital.net"
};

serve(withSecurity('sbx-auth', async (req: Request) => {
  const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || "0.0.0.0";

  try {
    const body = await req.json();
    const { username, password, environment = "staging" } = body;

    // -----------------------------------------------------------------------
    // FASE 1: VALIDAÇÃO DE ENTRADA
    // -----------------------------------------------------------------------
    if (!username || !password) {
      throw new Error("BAD_REQUEST: Login e senha são obrigatórios.");
    }

    if (!environment || (environment !== 'production' && environment !== 'staging')) {
      throw new Error("BAD_REQUEST: Ambiente inválido ou não especificado.");
    }

    const sbxBaseUrl = ENV_URLS[environment as keyof typeof ENV_URLS];

    debugLog(`[sbx-auth] Iniciando autenticação upstream para o usuário no ambiente: ${environment}`);

    // -----------------------------------------------------------------------
    // FASE 2: INTEGRAÇÃO UPSTREAM (Handshake OAuth2 Oficial da Superbid)
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
        "X-Forwarded-For": clientIp 
      },
      body: details.toString(),
    });

    const rawResponse = await sbxLoginResponse.text();

    if (!sbxLoginResponse.ok) {
      debugLog("[sbx-auth] ERRO REAL DA SBX:", {
        status: sbxLoginResponse.status,
        body: rawResponse,
      });
      const isUnauthorized = sbxLoginResponse.status === 401 || sbxLoginResponse.status === 403;
      throw new Error(isUnauthorized ? "CREDENTIALS_INVALID: Usuário ou senha incorretos." : `UPSTREAM_ERROR: Falha no provedor (${sbxLoginResponse.status})`);
    }

    const sbxData = JSON.parse(rawResponse);
    const userId = String(sbxData.userId || "");
    const sbxAccessToken = sbxData.access_token;

    if (!userId || !sbxAccessToken) {
      throw new Error("USER_IDENTIFICATION_FAILED: Não foi possível extrair a identidade ou o token upstream.");
    }

    // -----------------------------------------------------------------------
    // FASE 3: HIDRATAÇÃO DO PERFIL DIRETO NA SUPERBID (/me)
    // -----------------------------------------------------------------------
    const userRes = await fetch(`${sbxBaseUrl}/account/v2/user/me`, {
      method: "GET",
      headers: { 
        "Authorization": `Bearer ${sbxAccessToken}`,
        "Content-Type": "application/json"
      }
    });

    if (!userRes.ok) {
      throw new Error(`UPSTREAM_ERROR: Falha ao carregar perfil na Superbid (${userRes.status})`);
    }

    const userData = await userRes.json();
    const account = userData.userAccounts?.[0];

    // -----------------------------------------------------------------------
    // FASE 4: MAPEAMENTO DO PERFIL (BFF User Profile - PF / PJ)
    // -----------------------------------------------------------------------
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
      entity_type: account?.type || "F",
      name: account?.basicInfo?.fullName || "N/A",
      document: cleanDocument,
      document_rg: account?.documents?.find((doc: any) => doc.typeName === 'rg')?.number || "",
      email: account?.basicInfo?.email?.address || "",
      phone: account?.phones?.find((p: any) => p.type === 3)?.fullPhoneNumber || "",
      birth_date: formattedBirthDate,
      gender: isJuridica ? (account?.companyRepresentative?.gender || "M") : (account?.gender === "M" ? "M" : "F"),
      login: account?.credentials?.login || "",
      mothers_name: isJuridica ? (account?.companyRepresentative?.mothersName || "") : (account?.mothersName || ""),
      address: account?.addresses?.[0] ? {
        street: account.addresses[0].addressLine1 || "",
        number: account.addresses[0].number || "",
        complement: account.addresses[0].addressLine2 || "",
        neighborhood: account.addresses[0].district || "",
        city: account.addresses[0].city || "",
        state: account.addresses[0].state || "",
        zip_code: account.addresses[0].zipCode || "",
        country: account.addresses[0].countryIsoKey || "BR"
      } : null,
      metadata: { processedAt: new Date().toISOString(), originIp: "proxy-stateless" }
    };

    // -----------------------------------------------------------------------
    // FASE 5: EMISSÃO DO JWT INTERNO STATELESS (Com o token upstream embutido)
    // -----------------------------------------------------------------------
    const tokenData = await generateSessionToken(
      userId, 
      environment, 
      21600, 
      { sbx_access_token: sbxAccessToken } // Essencial para o sbx-user funcionar sem banco!
    );

    // -----------------------------------------------------------------------
    // FASE 6: TRANSPORTE SEGURO E CONTRATO UNIFICADO
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
        user_profile: userProfile // <-- Padrão exato do exchange unificado
      },
      headers: {
        'Set-Cookie': cookieHeader
      }
    };

  } catch (err: any) {
    debugLog(`[sbx-auth] Falha: ${err.message}`);
    
    const statusCode = err.message.includes("CREDENTIALS_INVALID") ? 401 : 400;
    const cleanMessage = err.message.includes("CREDENTIALS_INVALID") 
      ? "Usuário ou senha inválidos." 
      : (err.message || "Erro crítico ao processar autenticação.");

    return {
      status: statusCode,
      data: {
        success: false,
        code: err.message.split(":")[0] || "AUTH_FAILED",
        message: cleanMessage
      }
    };
  }
}));