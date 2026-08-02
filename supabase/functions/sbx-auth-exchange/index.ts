/**
 * @fileoverview Edge Function: SBX-AUTH-EXCHANGE (OAuth Exchange & Perfil Unificado)
 * @path supabase/functions/sbx-auth-exchange/index.ts
 *
 * ============================================================================
 * [ARQUITETURA STATELESS & UNIFICAÇÃO DE PERFIL]
 * ============================================================================
 * Recebe o payload do OAuth bruto da Superbid obtido no login do Sandbox/Front,
 * valida o token no upstream, extrai e hidrata o perfil completo do usuário (/me),
 * emite o nosso JWT interno Stateless e retorna tudo de uma só vez.
 * 
 * [GARANTIAS]:
 * - Zero Banco de Dados (Sem tabela session_tokens).
 * - Zero chamadas subsequentes para /sbx-user (O perfil vai no payload de login).
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

serve(withSecurity('sbx-auth-exchange', async (req: Request) => {
  try {
    const body = await req.json();
    const { environment, sbx_raw_token_payload } = body;

    if (!environment || (environment !== 'production' && environment !== 'staging')) {
      throw new Error("BAD_REQUEST: Ambiente inválido ou não especificado.");
    }

    if (!sbx_raw_token_payload || !sbx_raw_token_payload.access_token) {
      throw new Error("BAD_REQUEST: Payload OAuth da Superbid ausente ou sem access_token.");
    }

    const sbxAccessToken = sbx_raw_token_payload.access_token;
    const baseUrl = ENV_URLS[environment as keyof typeof ENV_URLS];

    debugLog(`[sbx-auth-exchange] Validando token OAuth e buscando perfil no ambiente: ${environment}`);

    // =========================================================================
    // FASE 1: VALIDAÇÃO E HIDRATAÇÃO DO PERFIL DIRETO NA SUPERBID (/me)
    // =========================================================================
    const userRes = await fetch(`${baseUrl}/account/v2/user/me`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${sbxAccessToken}` }
    });

    if (userRes.status === 401 || userRes.status === 403) {
      throw new Error("UNAUTHORIZED: O token OAuth da Superbid é inválido ou expirou.");
    }

    if (!userRes.ok) {
      throw new Error(`UPSTREAM_ERROR: Falha ao carregar perfil na Superbid (${userRes.status})`);
    }

    const userData = await userRes.json();
    const account = userData.userAccounts?.[0];
    const userId = String(account?.id || sbx_raw_token_payload.userId || "");

    if (!userId) {
      throw new Error("USER_IDENTIFICATION_FAILED: Não foi possível extrair o ID do usuário.");
    }

    // =========================================================================
    // FASE 2: MAPEAMENTO DO PERFIL (BFF User Profile - PF / PJ)
    // =========================================================================
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

    // =========================================================================
    // FASE 3: EMISSÃO DO JWT INTERNO STATELESS (Selando o Ambiente)
    // =========================================================================
    const tokenData = await generateSessionToken(userId, environment, 21600);

    // =========================================================================
    // FASE 4: TRANSPORTE SEGURO E CONTRATO UNIFICADO
    // =========================================================================
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
        userId: tokenData.userId,
        user_profile: userProfile // <-- O perfil vai mastigado de bandeja no login!
      },
      headers: {
        'Set-Cookie': cookieHeader
      }
    };

  } catch (err: any) {
    debugLog(`[sbx-auth-exchange] Falha: ${err.message}`);
    return {
      status: 400,
      data: {
        success: false,
        code: "EXCHANGE_FAILED",
        message: err.message || "Erro crítico ao processar troca de token."
      }
    };
  }
}));