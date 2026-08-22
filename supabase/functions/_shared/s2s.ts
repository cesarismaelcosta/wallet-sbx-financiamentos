/**
 * @fileoverview Cartório Criptográfico S2S (Server-to-Server) e Handoff de Estado
 * @path supabase/functions/_shared/s2s.ts
 *
 * ============================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: ZERO-TRUST SECURE STATE & S2S BYPASS
 * ============================================================================
 * Módulo centralizado de chancela e validação criptográfica (JWS) do ecossistema sbX.
 * Opera isolando o estado da sessão de possíveis manipulações no client-side.
 *
 * [PILARES DE SEGURANÇA E RESPONSABILIDADES]:
 * 1. {Signed Signin Parameters}: Ferramenta utilizada pelo Orquestrador (no erro 401)
 *    para assinar os parâmetros da URL de Signin (`visit_id`, `visit_update_id`, `target_url`).
 *    Blinda a "memória do carrinho" contra ataques de adulteração (Open Redirect e IDOR).
 * 2. {Signed S2S Entity}: Ferramenta utilizada pelo `sbx-auth` (BFF) após o login
 *    para chancelar o perfil do usuário recém-autenticado, permitindo que o 
 *    Orquestrador confie na PII sem a necessidade de revalidar a sessão no banco.
 *
 * @author Cesar Ismael Pereira da Costa
 * @author Gemini Pro
 * @version 1.0.0 (Zero-Trust Cryptographic Core)
 */

import { SignJWT, jwtVerify } from "https://deno.land/x/jose@v4.14.4/index.ts";
import { debugLog } from "./logger.ts";

// Chave primária de assinatura (Pode ser a mesma do JWT_SECRET geral ou dedicada)
const S2S_SECRET = new TextEncoder().encode(Deno.env.get("JWT_SECRET") || "sbx_fallback_secret_key");

/**
 * ============================================================================
 * 1. ASSINATURA DOS PARÂMETROS DO SIGNIN (Handoff / Signed State)
 * ============================================================================
 */

export interface SigninParameters {
  visit_id: string | null;
  visit_update_id: string | null;
  target_url: string;
  origin_url: string;
}

/**
 * @description Assina o estado de uma jornada interrompida (expiração).
 * @param {SigninParameters} data - Contexto a ser preservado na URL.
 * @returns {Promise<string>} Token JWT curto lacrando os parâmetros.
 */
export async function signSigninParameters(data: SigninParameters): Promise<string> {
  return await new SignJWT({ data })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("15m") // TTL curto (tempo hábil para o usuário refazer login)
    .sign(S2S_SECRET);
}

/**
 * @description Extrai e valida matematicamente a intenção criptografada da URL.
 * @param {string} token - Token JWT resgatado do client.
 * @throws {Error} INVALID_SIGNIN_PARAMETERS caso o token tenha expirado ou sido adulterado.
 */
export async function verifySigninParameters(token: string): Promise<SigninParameters> {
  try {
    const { payload } = await jwtVerify(token, S2S_SECRET);
    return payload.data as SigninParameters;
  } catch (error) {
    debugLog("🚨 [S2S Crypto] Parâmetros de signin expirados ou adulterados na fronteira.");
    throw new Error("INVALID_SIGNIN_PARAMETERS");
  }
}

/**
 * ============================================================================
 * 2. ASSINATURA DA IDENTIDADE (S2S Entity Pass)
 * ============================================================================
 */

/**
 * @description Assina a entidade (BFFUserProfile) para bypass interno seguro.
 * @param {any} entityData - Objeto de perfil obtido da API Superbid pelo sbx-auth.
 * @returns {Promise<string>} Token JWT para tráfego entre Edge Functions.
 */
export async function signS2SEntity(entityData: any): Promise<string> {
  return await new SignJWT({ data: entityData })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1m") // TTL micro: Trânsito interno S2S é quase instantâneo
    .sign(S2S_SECRET);
}

/**
 * @description Valida a chancela do backend vizinho e permite o uso da PII mastigada.
 * @param {string} token - O s2s_signed_entity trafegado no POST interno.
 * @throws {Error} INVALID_S2S_ENTITY caso a assinatura do outro microsserviço falhe.
 */
export async function verifyS2SEntity(token: string): Promise<any> {
  try {
    const { payload } = await jwtVerify(token, S2S_SECRET);
    return payload.data;
  } catch (error) {
    debugLog("🚨 [S2S Crypto] Assinatura da entidade S2S inválida. Bypass recusado.");
    throw new Error("INVALID_S2S_ENTITY");
  }
}