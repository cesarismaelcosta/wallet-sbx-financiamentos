/**
 * @fileoverview Rota e Validador de Contrato: /accounts/signin
 * @module routes/accounts
 * @path src/routes/accounts/signin.tsx
 *
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-TRUST SEARCH VALIDATION & AUTH ROUTE
 * =========================================================================
 * @description Contrato tipado e sanitizador de query parameters para o funil
 * de autenticação. Centraliza a validação em runtime contra injeção de parâmetros,
 * mitigando riscos de Open Redirect e garantindo whitelisting estrito de estados.
 *
 * [MECÂNICA ARQUITETURAL V3 - GOVERNANÇA DE CONTRATO & SEGURANÇA]:
 * 1. {Open Redirect Shield}: Valida se `redirect_uri` é um caminho relativo
 *    estrito (iniciado por `/` simples, bloqueando `//` e URLs absolutas maliciosas).
 * 2. {Const-Assertion Whitelist}: Decompõe enums de erro e ambiente via `as const`,
 *    eliminando asserções duplas (`as string as Type`) e garantindo inferência exata.
 * 3. {Zero-Trust Runtime Gate}: Descarta silenciosamente qualquer parâmetro fora
 *    da especificação sem interromper o ciclo de vida da rota.
 * 4. {Signed Handoff Token Whitelist}: Preserva e sanitiza o `handoff_token` assinado
 *    fornecido pelo backend institucional para autenticação blindada.
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 * @version 9.3.0 (Zero-Trust Search Validator & Handoff Token Contract)
 */

import { createFileRoute } from "@tanstack/react-router";

// =========================================================================
// [CONTRATOS E INTERFACES TIPADAS]
// =========================================================================
export const ALLOWED_HANDOFF_ERRORS = ["not_found", "invalid", "network", "expired"] as const;
export type HandoffError = (typeof ALLOWED_HANDOFF_ERRORS)[number];

export const ALLOWED_ENVIRONMENTS = ["staging", "production"] as const;
export type SbxEnvironment = (typeof ALLOWED_ENVIRONMENTS)[number];

export interface SigninSearch {
  redirect_uri?: string;
  env?: SbxEnvironment;
  handoff_error?: HandoffError;
  handoff_token?: string;
}

// =========================================================================
// [HELPERS: SANITIZAÇÃO DEFENSIVA DE URL E STRINGS]
// =========================================================================
function sanitizeRedirectUri(uri: unknown): string | undefined {
  if (typeof uri !== "string") return undefined;
  // Permite apenas caminhos relativos seguros (/path) e barra protocol-relative (//evil.com)
  if (uri.startsWith("/") && !uri.startsWith("//")) {
    return uri;
  }
  return undefined;
}

function sanitizeToken(token: unknown): string | undefined {
  if (typeof token !== "string" || !token.trim()) return undefined;
  return token.trim();
}

// =========================================================================
// [REGISTRO DA ROTA TANSTACK ROUTER]
// =========================================================================
export const Route = createFileRoute("/accounts/signin")({
  validateSearch: (search: Record<string, unknown>): SigninSearch => {
    const rawError = search.handoff_error as string;
    const handoff_error = ALLOWED_HANDOFF_ERRORS.includes(rawError as HandoffError)
      ? (rawError as HandoffError)
      : undefined;

    const rawEnv = search.env as string;
    const env = ALLOWED_ENVIRONMENTS.includes(rawEnv as SbxEnvironment)
      ? (rawEnv as SbxEnvironment)
      : undefined;

    return {
      redirect_uri: sanitizeRedirectUri(search.redirect_uri),
      env,
      handoff_error,
      handoff_token: sanitizeToken(search.handoff_token),
    };
  },
});