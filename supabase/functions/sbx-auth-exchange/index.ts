/**
 * @fileoverview Edge Function: Auth Exchange SBX (Stateless Federation & BFF User Profile)
 * 
 * ============================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * ============================================================================
 * Atua como proxy de federação e BFF de Usuário. Recebe o payload do OAuth da SBX,
 * valida a autenticidade upstream, formata o perfil completo do usuário e gera
 * o token JWT interno (stateless), devolvendo tudo em uma única requisição.
 * 
 * @module sbx-auth-exchange
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateSessionToken } from "../_shared/jwt.ts";
import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";

const ENV_URLS = {
  production: "https://api.s4bdigital.net",
  staging: "https://stgapi.s4bdigital.net"
};

serve(withSecurity('sbx-auth-exchange', async (req: Request) => {
  try {
    // 1. Extração do payload
    const body = await req.json();
    const { sbx_raw_token_payload, environment } = body;

    if (!sbx_raw_token_payload || !sbx_raw_token_payload.access_token) {
      throw new Error("AUTH_REQUIRED: Payload bruto do OAuth não fornecido.");
    }

    if (!environment || (environment !== 'production' && environment !== 'staging')) {
      throw new Error("BAD_REQUEST: Ambiente (environment) inválido.");
    }

    const sbx_access_token = sbx_raw_token_payload.access_token;
    const baseUrl = ENV_URLS[environment as keyof typeof ENV_URLS];

    // 2. Validação Upstream e Extração do Perfil
    const verifyResponse = await fetch(`${baseUrl}/account/v2/user/me`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${sbx_access_token}`,
        "Content-Type": "application/json"
      },
    });

    if (verifyResponse.status === 401) {
      throw new Error("SESSION_EXPIRED: O token real da Superbid é inválido ou expirou.");
    }
    if (!verifyResponse.ok) {
      throw new Error(`UPSTREAM_API_UNAVAILABLE (${verifyResponse.status})`);
    }

    const upstreamData = await verifyResponse.json();
    const account = upstreamData.userAccounts?.[0];
    const mainAddress = account?.addresses?.[0];
    const isJuridica = account?.type === "J";
    
    const userId = account?.id ? String(account.id) : "";
    if (!userId) throw new Error("USER_NOT_FOUND: Falha ao extrair identidade.");

    // 3. Formatação do Perfil BFF (Hidratação imediata)
    const targetDocTypeName = isJuridica ? "cnpj" : "cpf";
    const rawDocument = account?.documents?.find((doc: any) => doc.typeName === targetDocTypeName)?.number || "";
    const cleanDocument = rawDocument.replace(/\D/g, '');
    
    const rawBirthDate = isJuridica ? account?.companyRepresentative?.dateOfBirth : account?.birthDate;
    const formattedBirthDate = rawBirthDate ? String(rawBirthDate).split("T")[0] : "";

    const userProfile = {
      entity_id: userId,
      entity_type: account?.type,
      name: account?.basicInfo?.fullName || "N/A",
      document: cleanDocument,
      document_rg: account?.documents?.find((doc: any) => doc.typeName === "rg")?.number || "",
      email: account?.basicInfo?.email?.address || "",
      phone: account?.phones?.find((p: any) => p.type === 3)?.fullPhoneNumber || "",
      birth_date: formattedBirthDate,
      gender: isJuridica ? (account?.companyRepresentative?.gender || "M") : (account?.gender === "F" ? "F" : "M"),
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
        country: mainAddress.countryIsoKey || "BR",
      } : null,
    };

    // 4. Geração do nosso JWT Stateless (Limpo, apenas com os 4 campos acordados)
    const tokenData = await generateSessionToken(userId, 21600);

    // Injeção do Cookie HttpOnly por segurança adicional
    const isProd = environment === "production";
    const cookieHeader = `session_token=${tokenData.session_token}; Path=/; HttpOnly; SameSite=Lax${
      isProd ? "; Secure" : ""
    }`;

    // 5. Retorno Unificado (Token + Perfil)
    return { 
      status: 200, 
      data: {
        success: true,
        session_token: tokenData.session_token,
        issue_at: tokenData.issue_at,
        expires_in: tokenData.expires_in,
        userId: tokenData.userId,
        user_profile: userProfile
      },
      headers: { 'Set-Cookie': cookieHeader }
    };

  } catch (err: any) {
    debugLog("[sbx-auth-exchange] Exception:", err.message);
    const status = (err.message.includes("AUTH") || err.message.includes("EXPIRED")) ? 401 : 400;
    return { status, data: { success: false, message: err.message } };
  }
}));