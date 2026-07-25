/**
 * @fileoverview Utilitário de Autenticação Compartilhado (Zero-Trust Gatekeeper)
 *
 * ARQUITETURA DE SEGURANÇA E CONTEXTO (BFF Contract):
 * Este módulo atua como o gatekeeper de segurança responsável por extrair,
 * validar e verificar a sessão de forma híbrida:
 * - Em DEV / Lovable: Lê o token enviado via Header (`x-session-token`).
 * - Em Produção: Lê o token enviado via Cookie HttpOnly (`session_token`).
 * Audita a integridade do JWT e confirma a validade na SSOT (`session_tokens`).
 *
 * @author César Ismael Pereira da Costa
 * @version 3.1.0 (Hybrid Ready)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

export interface ValidatedSession {
  session_token: string;
  user_id: string;
  sbx_access_token: string;
  environment: "staging" | "production";
  expires_at: string;
}

export async function validateRequest(req: Request): Promise<ValidatedSession> {

  console.log("DEBUG HEADERS RECEBIDOS:", {
    "x-session-token": req.headers.get("x-session-token"),
    "cookie": req.headers.get("cookie")
  });
  
  // -----------------------------------------------------------------------
  // FASE 1: EXTRAÇÃO HÍBRIDA DO TOKEN DE SESSÃO
  // Ordem de prioridade: 1. Header (DEV/Lovable), 2. Cookie HttpOnly (PROD)
  // -----------------------------------------------------------------------
  let jwtToken = req.headers.get("x-session-token");

  if (!jwtToken) {
    const cookieHeader = req.headers.get("cookie") || "";
    const match = cookieHeader.match(/session_token=([^;]+)/);
    if (match && match[1]) {
      jwtToken = match[1];
    }
  }

  if (!jwtToken) {
    throw new Error("UNAUTHORIZED: Token de sessão não encontrado (Header x-session-token ou Cookie session_token ausentes).");
  }

  // -----------------------------------------------------------------------
  // FASE 2: VALIDAÇÃO CRIPTOGRÁFICA DO JWT DE SESSÃO
  // -----------------------------------------------------------------------
  const jwtSecret = Deno.env.get("JWT_SECRET");
  if (!jwtSecret) {
    throw new Error("INTERNAL_ERROR: JWT_SECRET não configurado no ambiente do Supabase.");
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(jwtSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  let payload: any;
  try {
    payload = await verify(jwtToken, key);
  } catch {
    throw new Error("SESSION_EXPIRED: Assinatura do token de sessão é inválida ou expirou.");
  }

  const sessionId = payload.jti;
  if (!sessionId) {
    throw new Error("UNAUTHORIZED: Payload do token de sessão malformado.");
  }

  // -----------------------------------------------------------------------
  // FASE 3: VALIDAÇÃO DA SESSÃO NA TABELA SSOT (session_tokens)
  // -----------------------------------------------------------------------
  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const { data: session, error } = await supabaseAdmin
    .from("session_tokens")
    .select("session_token, user_id, sbx_access_token, environment, expires_at")
    .eq("session_token", sessionId)
    .single();

  if (error || !session) {
    throw new Error("SESSION_EXPIRED: Sessão revogada ou inexistente no banco de dados.");
  }

  if (new Date(session.expires_at) < new Date()) {
    throw new Error("SESSION_EXPIRED: Sessão expirada.");
  }

  return {
    session_token: session.session_token,
    user_id: session.user_id,
    sbx_access_token: session.sbx_access_token,
    environment: session.environment,
    expires_at: session.expires_at,
  };
}