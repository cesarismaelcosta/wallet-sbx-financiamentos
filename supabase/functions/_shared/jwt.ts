/**
 * @fileoverview Utilitário Central de Criptografia e Sessão (Stateless JWT)
 * @path supabase/functions/_shared/jwt.ts
 *
 * =========================================================================
 * [ARQUITETURA DE ESTADO ZERO (STATELESS) & SEGURANÇA]
 * =========================================================================
 * Este módulo é o coração da segurança da nova arquitetura sem banco de dados.
 * Ele substitui a tabela `session_tokens`, movendo a validação de acesso
 * e o roteamento de ambiente 100% para a memória através de criptografia (JWS).
 *
 * [GARANTIAS CRÍTICAS DE ENGENHARIA]:
 * 1. Blindagem de Ambiente (Cross-Environment Protection): O `environment`
 *    ("staging" ou "production") é lacrado dentro do Payload do JWT. Isso impede
 *    absolutamente que um cliente forje requisições alterando parâmetros na URL.
 * 2. Contrato Estrito de Saída: O frontend nunca vê os dados internos do payload.
 *    A interface `SessionData` garante que apenas os 4 atributos homologados
 *    (session_token, issue_at, expires_in, userId) trafeguem pela rede.
 * 3. Fail-Fast Validation: Qualquer adulteração de bit no token dispara
 *    rejeição criptográfica imediata antes de alocar recursos da Edge Function.
 *
 * @author César Ismael Pereira da Costa
 * @version 4.1.0 (Otimização para Arquitetura 100% Stateless + Handoff Exchange JWT)
 */

import { jwtVerify, SignJWT } from "https://deno.land/x/jose@v4.14.4/index.ts";
import { debugLog } from "./logger.ts";

/**
 * [CONTRATO FRONTEND]
 * Define a estrutura exata e restrita do objeto devolvido para a aplicação cliente.
 * Nenhuma propriedade adicional deve ser exposta nesta interface.
 */
export interface SessionData {
  session_token: string;
  issue_at: string;
  expires_in: number;
  userId: string;
}

/**
 * [CONTRATO BACKEND]
 * Padroniza o resultado da decodificação do JWT na memória da Edge Function.
 * Expõe as variáveis blindadas (como o environment) apenas para o uso interno da API.
 */
export interface SessionValidationResult {
  valid: boolean;
  data?: SessionData;
  /** Ambiente seguro extraído do selo criptográfico. Impossível de ser adulterado pelo Client. */
  environment?: "staging" | "production";
  errorMessage?: string;
  errorCode?: "JWT_INVALID_SIGNATURE" | "JWT_EXPIRED_SESSION" | "JWT_MALFORMED_TOKEN" | "JWT_UNKNOWN_ERROR";
}

/**
 * Recupera e codifica o segredo JWT a partir das variáveis de infraestrutura.
 * @throws {Error} Interrompe a execução (Fail-Safe) se a chave não for encontrada no ambiente.
 */
const getJwtSecret = (): Uint8Array => {
  const secret = Deno.env.get("JWT_SECRET");
  if (!secret) {
    throw new Error("[CRITICAL CONFIG ERROR]: A variável de ambiente JWT_SECRET está ausente.");
  }
  return new TextEncoder().encode(secret);
};

/**
 * @function generateSessionToken
 * @description Gera um Token de Sessão (JWS) aplicando o algoritmo HS256.
 * Lacra o ID do usuário e o ambiente original de login dentro da assinatura.
 *
 * @param {string} userId - Identificador único extraído com sucesso da Superbid.
 * @param {string} environment - O ambiente base da requisição ("production" | "staging").
 * @param {number} [expiresInSeconds=7200] - Tempo de vida do token (Padrão: 6 horas).
 * @returns {Promise<SessionData>} Objeto limpo restrito aos 4 campos públicos.
 */
export async function generateSessionToken(
  userId: string,
  environment: string,
  expiresInSeconds: number = 7200,
): Promise<SessionData> {
  // [PLANO 1a]: O payload interno sela a identidade, o ambiente e a tipagem.
  // Qualquer tentativa de mudar o environment no Client invalidará a assinatura.
  const internalPayload = {
    typ: "session",
    userId,
    environment,
  };

  const session_token = await new SignJWT(internalPayload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${expiresInSeconds}s`)
    .sign(getJwtSecret());

  return {
    session_token,
    issue_at: new Date().toISOString(),
    expires_in: expiresInSeconds,
    userId,
  };
}

/**
 * @function verifySessionToken
 * @description Valida a assinatura de um token fornecido pelo cliente inteiramente em memória.
 * Se autêntico, extrai e disponibiliza o ambiente seguro para roteamento no Gatekeeper.
 *
 * @param {string} token - A string JWT bruta enviada pelo frontend (Cookie ou Header).
 * @returns {Promise<SessionValidationResult>} Status da validação e dados internos protegidos.
 */
export async function verifySessionToken(token: string): Promise<SessionValidationResult> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret());

    // [PLANO 1b]: Compatibilidade: tokens legados não têm `typ` e continuam aceitos como sessão.
    // Rejeita bloqueando sumariamente se um token de transporte for usado como sessão.
    if (payload.typ && payload.typ !== "session") {
      return {
        valid: false,
        errorCode: "JWT_MALFORMED_TOKEN",
        errorMessage: "Token de transporte não pode ser usado como sessão.",
      };
    }

    // DEBUG: Vamos ver o que o JWT diz sobre a vida dele
    const now = Math.floor(Date.now() / 1000);
    debugLog(
      `[DEBUG] Token Verificado | exp: ${payload.exp} | agora: ${now} | expira em: ${Number(payload.exp) - now}s`,
    );

    // Assegura a tipagem estrita do ambiente extraído da memória criptografada
    const safeEnv = payload.environment === "production" ? "production" : "staging";

    return {
      valid: true,
      data: {
        session_token: token,
        issue_at: payload.iat ? new Date(Number(payload.iat) * 1000).toISOString() : new Date().toISOString(),
        expires_in: 7200,
        userId: String(payload.userId || ""),
      },
      environment: safeEnv,
    };
  } catch (err: any) {
    const errMessage = (err.message || "").toLowerCase();

    let errorCode: SessionValidationResult["errorCode"] = "JWT_UNKNOWN_ERROR";

    // Tradução semântica de erros da biblioteca "jose" para contratos do nosso BFF
    if (errMessage.includes("exp")) {
      errorCode = "JWT_EXPIRED_SESSION";
    } else if (errMessage.includes("signature") || errMessage.includes("sig")) {
      errorCode = "JWT_INVALID_SIGNATURE";
    } else {
      errorCode = "JWT_MALFORMED_TOKEN";
    }

    return {
      valid: false,
      errorMessage: err.message || "Assinatura de token de sessão inválida ou expirada.",
      errorCode,
    };
  }
}

// =========================================================================
// [PLANO 1c]: [EXCHANGE TOKEN]: JWT efêmero de transporte — TTL fixo, ZERO PII
// =========================================================================

/** Tempo de vida imutável do Exchange Token (Handoff Stateless) */
export const EXCHANGE_TTL_SECONDS = 60;

/**
 * Claims permitidos no Exchange JWT. Contrato fechado:
 * nenhum dado pessoal (nome, documento, e-mail) e nenhum vínculo com visits.
 */
export interface ExchangeClaims {
  /** OBRIGATÓRIO: Força a tipagem do token para evitar uso cruzado */
  typ: "exchange";
  /** Identificador sistêmico do usuário (sem PII) */
  userId: string;
  /** Ambiente (staging ou production) */
  environment: "staging" | "production";
  /** Audience: Domínio rigoroso de quem pode consumir o token */
  aud: string;
  /** User Agent Hash: Blindagem contra roubo/interceptação do token */
  uah: string;
}

/**
 * Gera um Exchange JWT de transporte de curto prazo com claims estritos.
 */
export async function generateExchangeToken({
  userId,
  environment,
  aud,
  uah,
}: {
  userId: string;
  environment: "staging" | "production";
  aud: string;
  uah: string;
}): Promise<string> {
  const payload: ExchangeClaims = {
    typ: "exchange",
    userId,
    environment,
    aud,
    uah,
  };

  // Emite com a validade exata da constante exportada
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${EXCHANGE_TTL_SECONDS}s`)
    .sign(getJwtSecret());
}

/**
 * Hash canônico do User-Agent. ÚNICA fonte da verdade — qualquer divergência
 * entre emissor e resgatador gera 403 em massa.
 */
export function hashUserAgent(ua: string): string {
  if (!ua) return "anonymous";
  const tokens = ua.match(/[a-zA-Z]{3,}/g) || [];
  return Array.from(new Set(tokens)).join("-");
}

export interface ExchangeValidationResult {
  valid: boolean;
  userId?: string;
  environment?: "staging" | "production";
  errorCode?: "EXCHANGE_INVALID_SIGNATURE" | "EXCHANGE_INVALID_TYPE" | "EXCHANGE_HIJACK_DETECTED" | "EXCHANGE_EXPIRED";
  errorMessage?: string;
}

/**
 * Valida o Exchange JWT: assinatura, exp, typ, aud (origem do app) e uah (dispositivo).
 * Sempre usa getJwtSecret() — mesma chave da emissão, sem fallback.
 */
export async function verifyExchangeToken(
  token: string,
  { expectedAud, userAgent }: { expectedAud: string; userAgent: string },
): Promise<ExchangeValidationResult> {
  let payload: any;
  try {
    const verified = await jwtVerify(token, getJwtSecret());
    payload = verified.payload;
  } catch (err: any) {
    const errMessage = (err.message || "").toLowerCase();
    
    // Distingue se o erro foi por token expirado ou falha de assinatura/malformado
    const isExpired = errMessage.includes("exp") || errMessage.includes("expired");

    return {
      valid: false,
      errorCode: isExpired ? "EXCHANGE_EXPIRED" : "EXCHANGE_INVALID_SIGNATURE",
      errorMessage: err?.message || (isExpired ? "Token de transição expirado." : "Token de transição inválido."),
    };
  }

  if (payload.typ !== "exchange") {
    return {
      valid: false,
      errorCode: "EXCHANGE_INVALID_TYPE",
      errorMessage: "Apenas tokens Exchange são permitidos neste endpoint.",
    };
  }

  if (payload.aud !== expectedAud || payload.uah !== hashUserAgent(userAgent)) {
    return {
      valid: false,
      errorCode: "EXCHANGE_HIJACK_DETECTED",
      errorMessage: "O token de transição foi capturado de outra origem ou dispositivo.",
    };
  }

  return {
    valid: true,
    userId: String(payload.userId || ""),
    environment: payload.environment === "production" ? "production" : "staging",
  };
}