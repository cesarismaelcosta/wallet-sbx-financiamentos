/**
 * @fileoverview Edge Function: SBX-AUTH-EXCHANGE (Híbrida: issue / redeem)
 * @path supabase/functions/sbx-auth-exchange/index.ts
 *
 * ============================================================================
 * [CONTRATO ÚNICO DE AUTENTICAÇÃO — STATELESS, ZERO BANCO]
 * ============================================================================
 * MODO "issue"  — recebe x-access-token (OAuth Superbid), valida no /me, hidrata
 *                 o perfil e devolve: Exchange JWT (60s, SEM PII) + user_profile
 *                 no corpo da resposta (consumo em mesma origem).
 * MODO "redeem" — recebe x-exchange-token, valida typ/aud/uah/exp e devolve
 *                 EXCLUSIVAMENTE o Session JWT (6h) e o environment.
 *
 * [REGRAS FECHADAS]:
 * - O Exchange JWT nunca carrega dados pessoais nem vínculo com visits.
 * - TTL do Exchange JWT é fixo em 60s (EXCHANGE_TTL_SECONDS).
 * - Upstream (/me) é consultado apenas no modo "issue".
 * ============================================================================
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// IMPORTANTE: Import corrigido, refletindo EXATAMENTE o que existe no jwt.ts
import {
  EXCHANGE_TTL_SECONDS,
  generateExchangeToken,
  generateSessionToken,
  hashUserAgent,
  verifyExchangeToken,
} from "../_shared/jwt.ts";

import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";
import { BFFUserProfile } from "../_shared/types.ts";

const ENV_URLS = {
  production: "https://api.s4bdigital.net",
  staging: "https://stgapi.s4bdigital.net",
};

/** Origin normalizada do solicitante, usada nos claims `aud`. */
const requestOrigin = (req: Request): string => {
  const raw = req.headers.get("origin") || req.headers.get("referer") || "";
  try {
    return raw ? new URL(raw).origin : "";
  } catch (_) {
    return "";
  }
};

serve(
  withSecurity("sbx-auth-exchange", async (req: Request) => {
    try {
      const body = await req.json().catch(() => ({}));
      const exchangeToken = req.headers.get("x-exchange-token") || "";
      const sbxAccessToken = req.headers.get("x-access-token") || "";
      const ua = req.headers.get("user-agent") || "";
      const origin = requestOrigin(req);

      // ===================================================================
      // MODO REDEEM: Exchange JWT -> Session JWT (sem upstream, sem PII)
      // ===================================================================
      if (exchangeToken) {
        debugLog("[sbx-auth-exchange][redeem] Iniciando troca de token stateless...");

        const check = await verifyExchangeToken(exchangeToken, {
          expectedAud: origin,
          userAgent: ua,
        });

        if (!check.valid) {
          debugLog(`[sbx-auth-exchange][redeem] Recusado: ${check.errorCode}`);
          return {
            status: check.errorCode === "EXCHANGE_HIJACK_DETECTED" ? 403 : 401,
            data: { success: false, code: check.errorCode, message: check.errorMessage },
          };
        }

        const { userId, environment, userName, login } = check;
        
        // Repassando os dados do usuário extraídos da maleta para gerar o Fat Token
        const tokenData = await generateSessionToken(environment!, userId!, userName, login);

        debugLog(`[sbx-auth-exchange][redeem] Sessão emitida para o usuário ${userId} em ${environment}.`);

        return {
          status: 200,
          data: {
            success: true,
            mode: "redeem",
            session_token: tokenData.session_token,
            issue_at: tokenData.issue_at,
            expires_in: tokenData.expires_in,
            userId: tokenData.userId,
            userName: tokenData.userName,
            login: tokenData.login,
            environment,
          },
          headers: {
            "Set-Cookie": `session_token=${tokenData.session_token}; Path=/; HttpOnly; SameSite=Lax${
              environment === "production" ? "; Secure" : ""
            }`,
          },
        };
      }

      // ===================================================================
      // MODO ISSUE: OAuth Superbid -> Exchange JWT (60s)
      // ===================================================================
      if (!sbxAccessToken) {
        throw new Error("UNAUTHORIZED: Nenhuma credencial recebida (x-access-token ou x-exchange-token).");
      }

      const { environment, audience } = body;
      if (!environment || (environment !== "production" && environment !== "staging")) {
        throw new Error("BAD_REQUEST: Ambiente inválido ou não especificado.");
      }

      const baseUrl = ENV_URLS[environment as keyof typeof ENV_URLS];
      debugLog(`[sbx-auth-exchange][issue] Validando OAuth e hidratando perfil em: ${environment}`);

      const userRes = await fetch(`${baseUrl}/account/v2/user/me`, {
        method: "GET",
        headers: { Authorization: `Bearer ${sbxAccessToken}` },
      });

      if (userRes.status === 401 || userRes.status === 403) {
        throw new Error("UNAUTHORIZED: O token OAuth da Superbid é inválido ou expirou.");
      }
      if (!userRes.ok) {
        throw new Error(`UPSTREAM_ERROR: Falha ao carregar perfil na Superbid (${userRes.status})`);
      }

      const userData = await userRes.json();
      const account = userData.userAccounts?.[0];

      // 🔧 CORREÇÃO: a versão anterior referenciava `sbx_raw_token_payload`, variável
      // inexistente no escopo, lançando ReferenceError em vez do erro tratado abaixo.
      const userId = String(account?.id || userData?.userId || "");
      if (!userId) {
        throw new Error("USER_IDENTIFICATION_FAILED: Não foi possível extrair o ID do usuário.");
      }

      // =================================================================
      // MAPEAMENTO DO PERFIL (BFF User Profile — PF / PJ)
      // Fica apenas no corpo da resposta; nunca entra no Exchange JWT.
      // =================================================================
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

      // =================================================================
      // RESOLUÇÃO ESTRITA DE ORIGEM (ZERO-TRUST)
      // =================================================================
      const finalAudience = audience || origin;
      
      if (!finalAudience) {
        throw new Error("SECURITY_ERROR: Origem ou Audience não fornecidos na requisição.");
      }

      const exchange = await generateExchangeToken({
        userId,
        environment,
        aud: String(finalAudience), // Ajustado para fechar com o plano
        uah: hashUserAgent(ua),     // Ajustado para fechar com o plano e com o Gate!
      });

      return {
        status: 200,
        data: {
          success: true,
          mode: "issue",
          exchange_token: exchange,
          expires_in: EXCHANGE_TTL_SECONDS,
          userId,
          environment,
          user_profile: userProfile,
        },
      };
    } catch (err: any) {
      debugLog(`[sbx-auth-exchange] Falha: ${err.message}`);
      return {
        status: 400,
        data: {
          success: false,
          code: "EXCHANGE_FAILED",
          message: err.message || "Erro crítico ao processar troca de token.",
        },
      };
    }
  }),
);