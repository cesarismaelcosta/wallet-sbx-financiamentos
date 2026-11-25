/**
 * @fileoverview Remove segredos (chaves, tokens, senhas, URLs assinadas) de objetos antes de gravar ou logar
 * @path supabase/functions/_shared/strip-secrets.ts
 *
 * `stripSecrets(valor)` devolve uma CÓPIA do valor, em qualquer nível, com o conteúdo dos campos de
 * segredo trocado por "[OCULTO]". Todo o resto (dados do pedido, do cliente, da resposta do parceiro)
 * fica igual: o objetivo é poder investigar erro sem expor credencial.
 *
 * Uso obrigatório (AGENTS.md):
 *  - toda gravação de `raw_payload` (simulations, visit_updates, simulation_consents, notification_outbox);
 *  - o `debugLog` (`_shared/logger.ts`) usa a mesma lista.
 *
 * O nome do campo é comparado sem diferenciar maiúsculas, `_` e `-` (ex.: `chaveAcesso`, `x-api-key`,
 * `access_token`). Para incluir um campo, acrescente em SECRET_KEYS (já normalizado).
 */

/** Campos de segredo, normalizados (minúsculo, só letras e números). */
export const SECRET_KEYS = new Set([
  "chaveacesso",        // FANDI_API_KEY no corpo enviado à Fandi
  "urlcallback",        // URL de retorno assinada (vale como credencial por 5 min)
  "apikey", "xapikey",
  "authorization",
  "token", "accesstoken", "refreshtoken", "authtoken", "sessiontoken", "handofftoken", "idtoken",
  "exchangetoken", "sbxaccesstoken", "tokenacesso",
  "s2ssignedentity",
  "password", "senha",
  "secret", "clientsecret", "webhooksecret",
  "signature",
  "privatekey",
]);

/** Texto que substitui o valor de um campo de segredo. */
export const SECRET_MASK = "[OCULTO]";

/** Nome do campo normalizado para comparar com SECRET_KEYS. */
export const normalizeKey = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, "");

/** true se o nome do campo é de segredo. */
export const isSecretKey = (key: string): boolean => SECRET_KEYS.has(normalizeKey(key));

const MAX_DEPTH = 30;

/** Cópia do valor sem os segredos (campos de SECRET_KEYS viram "[OCULTO]"). */
export function stripSecrets<T>(value: T): T {
  const walk = (v: unknown, depth: number): unknown => {
    if (v === null || typeof v !== "object") return v;
    if (depth >= MAX_DEPTH) return SECRET_MASK; // estrutura patológica: não arrisca
    if (v instanceof Date) return v;
    if (Array.isArray(v)) return v.map((item) => walk(item, depth + 1));
    // Erro (ex.: falha de rede): grava só nome e mensagem
    if (v instanceof Error) return { name: v.name, message: v.message };
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(v as Record<string, unknown>)) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      out[key] = isSecretKey(key) && val !== null && val !== undefined && val !== "" ? SECRET_MASK : walk(val, depth + 1);
    }
    return out;
  };
  return walk(value, 0) as T;
}
