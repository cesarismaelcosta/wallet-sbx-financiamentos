/**
 * @fileoverview Utilitário de Autenticação Compartilhado (Zero-Trust Gatekeeper)
 *
 * ARQUITETURA DE SEGURANÇA E CONTEXTO (BFF Contract):
 * Este módulo atua como o gatekeeper de segurança responsável por extrair,
 * validar e verificar o cookie HttpOnly ('session_token') enviado pelo navegador,
 * auditando a integridade do JWT de sessão e confirmando a validade da sessão
 * na tabela SSOT ('session_tokens') do Supabase.
 *
 * @author César Ismael Pereira da Costa
 * @version 3.0.0
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
  // -----------------------------------------------------------------------
  // FASE 1: EXTRAÇÃO DO COOKIE HTTPONLY DE SESSÃO
  // -----------------------------------------------------------------------
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.match(/session_token=([^;]+)/);

  if (!match || !match[1]) {
    throw new Error("UNAUTHORIZED: Cookie de sessão (session_token) não encontrado na requisição.");
  }

  const jwtToken = match[1];

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