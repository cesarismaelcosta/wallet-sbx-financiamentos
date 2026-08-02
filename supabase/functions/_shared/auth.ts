/**
 * @fileoverview Utilitário de Autenticação Compartilhado (Stateless Gatekeeper)
 *
 * ============================================================================
 * [ARQUITETURA DE SEGURANÇA E CONTEXTO]
 * ============================================================================
 * Gatekeeper responsável por extrair e validar a sessão de forma 100% em memória:
 * 1. Extração Híbrida: Lê o token enviado via Header (`x-session-token` ou `Authorization`), 
 *    ou via Cookie HttpOnly (`session_token`), garantindo compatibilidade total com 
 *    o ambiente de desenvolvimento (Lovable) e Produção.
 * 2. Validação Criptográfica Stateless: Verifica a assinatura do JWT localmente 
 *    via `jwt.ts`, eliminando completamente consultas à tabela SSOT (`session_tokens`).
 * 3. Selo de Ambiente Protegido: Retorna o `environment` blindado dentro do token, 
 *    impedindo adulterações por query params.
 *
 * @author César Ismael Pereira da Costa
 * @version 4.0.0 (Stateless & Hybrid Extraction)
 */

import { verifySessionToken } from "./jwt.ts";
import { debugLog } from "./logger.ts";

export interface AuthContext {
  session_token: string;
  user_id: string;
  environment: "staging" | "production";
}

export async function validateRequest(req: Request): Promise<AuthContext> {
  // -----------------------------------------------------------------------
  // FASE 1: EXTRAÇÃO HÍBRIDA DO TOKEN DE SESSÃO
  // Ordem de prioridade mantida do seu original:
  // 1. Header x-session-token (DEV/Lovable)
  // 2. Header Authorization Bearer
  // 3. Cookie HttpOnly session_token (PROD)
  // -----------------------------------------------------------------------
  let jwtToken = req.headers.get("x-session-token");

  if (!jwtToken) {
    const authHeader = req.headers.get("authorization");
    if (authHeader && authHeader.toLowerCase().startsWith("bearer ")) {
      jwtToken = authHeader.split(" ")[1];
    }
  }

  if (!jwtToken) {
    const cookieHeader = req.headers.get("cookie") || "";
    const match = cookieHeader.match(/session_token=([^;]+)/);
    if (match && match[1]) {
      jwtToken = match[1];
    }
  }

  if (!jwtToken) {
    debugLog("[Auth] Bloqueio: Nenhum token de sessão fornecido na requisição.");
    throw new Error("UNAUTHORIZED: Token de sessão não encontrado (Header x-session-token ou Cookie session_token ausentes).");
  }

  // -----------------------------------------------------------------------
  // FASE 2: VALIDAÇÃO CRIPTOGRÁFICA STATELESS (100% em Memória)
  // Substitui a ida ao Supabase por decodificação local segura via jose.
  // -----------------------------------------------------------------------
  const result = await verifySessionToken(jwtToken);

  if (!result.valid || !result.data) {
    debugLog(`[Auth] Bloqueio JWT: ${result.errorMessage} (${result.errorCode})`);
    throw new Error(`SESSION_EXPIRED: Assinatura do token de sessão é inválida ou expirou.`);
  }

  const safeEnv = result.environment === "production" ? "production" : "staging";

  return {
    session_token: result.data.session_token,
    user_id: result.data.userId,
    environment: safeEnv,
  };
}