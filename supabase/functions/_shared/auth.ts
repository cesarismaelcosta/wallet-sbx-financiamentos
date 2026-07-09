/**
 * @fileoverview Middleware de Autenticação Centralizado (Security Core)
 * @path supabase/functions/_shared/auth.ts
 * * =========================================================================
 * PROTOCOLO DE SEGURANÇA (Zero-Trust Identity)
 * =========================================================================
 * Esta camada atua como o validador soberano de identidade do ecossistema.
 * * [RESPONSABILIDADES]:
 * 1. Verificação Criptográfica: Valida se o JWT foi assinado pelo nosso segredo (HMAC-SHA256).
 * 2. Validação Temporal: Verifica automaticamente se o token expirou (claim 'exp').
 * 3. Sanitização de Identidade: Extrai o 'sub' (User ID) e 'jti' (Session ID) de forma segura.
 * * [USO]:
 * Deve ser importado no topo de cada Edge Function que exige autenticação.
 */

import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

/**
 * @interface AuthResult
 * @description Contrato de identidade retornado após validação bem-sucedida.
 */
interface AuthResult {
  userId: string;
  sessionId: string;
}

/**
 * @function validateRequest
 * @description Valida o header 'x-session-token' da requisição.
 * * @param {Request} req - A requisição HTTP original.
 * @returns {Promise<AuthResult>} - Dados de identidade extraídos do token.
 * @throws {Error} - Lança exceções padrão ('AUTH_REQUIRED' ou 'AUTH_INVALID') 
 * para serem tratadas pelas funções chamadoras.
 */
export async function validateRequest(req: Request): Promise<AuthResult> {
  // 1. Extração do Token
  const token = req.headers.get("x-session-token");
  if (!token) {
    throw new Error("AUTH_REQUIRED: Cabeçalho x-session-token ausente.");
  }

  // 2. Recuperação da Chave de Segurança
  const jwtSecret = Deno.env.get("JWT_SECRET");
  if (!jwtSecret) {
    console.error("[SECURITY CRITICAL]: JWT_SECRET não configurado no ambiente.");
    throw new Error("INTERNAL_CONFIG_ERROR");
  }

  try {
    // 3. Importação da Chave para verificação criptográfica
    const key = await crypto.subtle.importKey(
      "raw", 
      new TextEncoder().encode(jwtSecret),
      { name: "HMAC", hash: "SHA-256" }, 
      false, 
      ["verify"]
    );

    // 4. Verificação de Assinatura e Expiração
    // O método verify falha automaticamente se a assinatura for inválida ou o token expirado.
    const payload = await verify(token, key);

    return {
      userId: payload.sub as string,
      sessionId: payload.jti as string,
    };
  } catch (err) {
    console.error("[SECURITY WARNING]: Tentativa de acesso com token inválido/expirado.");
    throw new Error("AUTH_INVALID: Token de sessão inválido ou assinatura não confiavel.");
  }
}