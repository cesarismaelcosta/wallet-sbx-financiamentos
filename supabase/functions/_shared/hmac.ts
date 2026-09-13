/**
 * @fileoverview Verificação de Assinatura HMAC (Server-to-Server sem Segredo em Texto)
 * @module _shared/hmac
 *
 * ============================================================================
 * [ARQUITETURA & MOTIVAÇÃO]
 * ============================================================================
 * Usado para autenticar chamadores que não têm sessão de usuário nem podem
 * carregar um segredo fixo em texto puro no lugar de origem da chamada
 * (ex: um job do `pg_cron`, cujo comando SQL fica visível para qualquer um
 * com acesso ao SQL Editor via `select * from cron.job`).
 *
 * Em vez de transmitir o segredo em si, o chamador calcula uma assinatura
 * HMAC-SHA256 sobre um carimbo de tempo (`timestamp`), usando o segredo como
 * chave de cálculo — o segredo nunca trafega. A função recalcula a mesma
 * assinatura e compara em tempo constante, e rejeita carimbos de tempo fora
 * da janela de validade (proteção contra replay).
 *
 * No lado do chamador (SQL/`pg_cron`), a mesma assinatura é calculada com
 * `pgcrypto`'s `hmac()`, usando o segredo lido do Supabase Vault — nunca
 * escrito em texto puro no comando do job.
 *
 * @author Cesar Ismael Pereira da Costa
 * @version 1.0.0
 */

/**
 * @function verifyHmacSignature
 * @description Valida os headers `x-timestamp` e `x-signature` de uma requisição
 * contra o segredo indicado por `secretEnvVar`, dentro de uma janela de validade.
 *
 * @param {Request} req - Requisição recebida pela Edge Function.
 * @param {string} secretEnvVar - Nome da variável de ambiente com o segredo HMAC.
 * @param {number} [toleranceSeconds=30] - Janela máxima de aceitação do timestamp,
 *   em segundos, para mitigar ataques de replay.
 * @returns {Promise<boolean>} `true` se a assinatura for válida e dentro da janela.
 */
export async function verifyHmacSignature(
  req: Request,
  secretEnvVar: string,
  toleranceSeconds = 30,
): Promise<boolean> {
  const timestamp = req.headers.get("x-timestamp");
  const signature = req.headers.get("x-signature");
  const secret = Deno.env.get(secretEnvVar);

  if (!timestamp || !signature || !secret) return false;

  // Janela de validade: rejeita timestamps velhos ou "do futuro" (clock drift suspeito)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > toleranceSeconds) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuffer = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(timestamp));
  const expectedHex = Array.from(new Uint8Array(sigBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Comparação em tempo constante (mesmo padrão do safeCompare em server.ts)
  if (expectedHex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedHex.length; i++) {
    diff |= expectedHex.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return diff === 0;
}