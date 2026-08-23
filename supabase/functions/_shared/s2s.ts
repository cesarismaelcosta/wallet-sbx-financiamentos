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

// ============================================================================
// 🔐 FAIL-CLOSED NO BOOT: sem JWT_SECRET não existe cartório criptográfico.
// Um fallback literal tornaria todo o Signed State / S2S forjável por terceiros,
// portanto a função se recusa a inicializar (boot crash explícito e auditável).
// ============================================================================
const RAW_SECRET = Deno.env.get("JWT_SECRET");

if (!RAW_SECRET || RAW_SECRET.trim().length === 0) {
  throw new Error("MISSING_JWT_SECRET: defina o secret JWT_SECRET para habilitar a assinatura S2S/Signed State.");
}

if (RAW_SECRET.trim().length < 32) {
  // ⚠️ Não bloqueia o boot (evita indisponibilidade), mas registra entropia insuficiente.
  debugLog("⚠️ [S2S Crypto] JWT_SECRET com menos de 32 caracteres. Recomenda-se rotacionar para 256 bits.");
}


const S2S_SECRET = new TextEncoder().encode(RAW_SECRET);


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
 * @description Contrato mínimo confiável da entidade chancelada entre Edge Functions.
 * Campos extras são preservados, mas o shape essencial é obrigatório na validação.
 */
export interface S2SEntity {
  entity_id: string;
  entity_type: string;
  name?: string;
  document?: string;
  email?: string;
  phone?: string;
  [key: string]: unknown;
}

/**
 * @description Valida o shape essencial de um perfil antes de tratá-lo como PII confiável.
 * @throws {Error} INVALID_S2S_ENTITY quando o payload não respeita o contrato.
 */
function assertS2SEntity(value: unknown): S2SEntity {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("INVALID_S2S_ENTITY");
  }

  const candidate = value as Record<string, unknown>;
  const entityId = candidate["entity_id"];
  const entityType = candidate["entity_type"];

  if (typeof entityId !== "string" || entityId.trim().length === 0) {
    throw new Error("INVALID_S2S_ENTITY");
  }

  if (typeof entityType !== "string" || entityType.trim().length === 0) {
    throw new Error("INVALID_S2S_ENTITY");
  }

  return candidate as S2SEntity;
}

/**
 * @description Assina a entidade (BFFUserProfile) para bypass interno seguro.
 * @param {S2SEntity} entityData - Objeto de perfil obtido da API Superbid pelo sbx-auth.
 * @returns {Promise<string>} Token JWT para tráfego entre Edge Functions.
 */
export async function signS2SEntity(entityData: S2SEntity | Record<string, unknown>): Promise<string> {
  // 🛡️ Falha cedo: nunca chancelamos um perfil fora de contrato.
  const safeEntity = assertS2SEntity(entityData);

  return await new SignJWT({ data: safeEntity })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1m") // TTL micro: Trânsito interno S2S é quase instantâneo
    .sign(S2S_SECRET);
}

/**
 * @description Valida a chancela do backend vizinho e permite o uso da PII mastigada.
 * @param {string} token - O s2s_signed_entity trafegado no POST interno.
 * @throws {Error} INVALID_S2S_ENTITY caso a assinatura ou o shape do perfil falhem.
 */
export async function verifyS2SEntity(token: string): Promise<S2SEntity> {
  try {
    const { payload } = await jwtVerify(token, S2S_SECRET);
    // 🛡️ Assinatura válida não basta: o shape do perfil também é validado.
    return assertS2SEntity(payload.data);


  } catch (error) {
    debugLog("🚨 [S2S Crypto] Assinatura da entidade S2S inválida. Bypass recusado.");
    throw new Error("INVALID_S2S_ENTITY");
  }
}
