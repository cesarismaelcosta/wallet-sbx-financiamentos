/**
 * @file _shared/client-ip.ts
 * @description IP real do usuário em chamadas internas (function → function).
 *
 * [F7/F22/F40]: quando `financial-gateway-gate` e `sbx-auth` chamam o
 * `orchestrator` por dentro, a borda da Supabase preenche `x-forwarded-for`
 * com o IP da PRÓPRIA edge function (AWS), e a visita era gravada com esse IP.
 * O IP real do usuário ia em `x-client-ip`, mas esse header sozinho não é
 * confiável (qualquer cliente pode enviá-lo — ver SBXW-17).
 *
 * Solução: a function chamadora envia o IP junto de uma assinatura HMAC
 * (`x-client-ip-sig`) com carimbo de tempo (`x-client-ip-ts`). Quem recebe só
 * aceita `x-client-ip` se a assinatura for válida e recente; sem assinatura,
 * vale a ordem normal dos headers de borda.
 *
 * Segredo: `JWT_SECRET` (já presente em todas as functions), com prefixo de
 * domínio próprio para não colidir com outros usos da mesma chave.
 */

const DOMAIN_PREFIX = "client-ip:v1";
const TOLERANCE_SECONDS = 60;

async function hmacHex(message: string): Promise<string | null> {
  const secret = Deno.env.get("JWT_SECRET");
  if (!secret) return null;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** IP do cliente numa requisição que chegou pela borda pública (navegador → function). */
export function getEdgeClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0] ||
    req.headers.get("x-real-ip") ||
    "0.0.0.0"
  ).trim();
}

/** Headers a anexar numa chamada interna para propagar o IP do usuário de forma verificável. */
export async function signedClientIpHeaders(ip: string): Promise<Record<string, string>> {
  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = await hmacHex(`${DOMAIN_PREFIX}|${ip}|${ts}`);
  if (!sig) return { "x-client-ip": ip };
  return { "x-client-ip": ip, "x-client-ip-ts": ts, "x-client-ip-sig": sig };
}

/** Retorna o `x-client-ip` somente se a assinatura for válida e recente; senão `null`. */
export async function verifySignedClientIp(req: Request): Promise<string | null> {
  const ip = req.headers.get("x-client-ip")?.trim();
  const ts = req.headers.get("x-client-ip-ts");
  const sig = req.headers.get("x-client-ip-sig");
  if (!ip || !ts || !sig) return null;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(ts)) > TOLERANCE_SECONDS) return null;

  const expected = await hmacHex(`${DOMAIN_PREFIX}|${ip}|${ts}`);
  if (!expected || !timingSafeEqual(expected, sig)) return null;
  return ip;
}
