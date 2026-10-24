/**
 * @fileoverview Cidades por UF (API pública do IBGE, sem chave)
 * @path src/services/ibge.ts
 *
 * GET https://servicodados.ibge.gov.br/api/v1/localidades/estados/{UF}/municipios
 * Lista guardada em memória por UF (uma chamada por estado na sessão).
 * Falha ou demora (> 6 s): rejeita, e a tela libera o campo para digitar.
 */

const IBGE_URL = "https://servicodados.ibge.gov.br/api/v1/localidades/estados";
const cache = new Map<string, Promise<string[]>>();

export function fetchCitiesByUf(uf: string): Promise<string[]> {
  const key = String(uf || "").toUpperCase();
  if (!/^[A-Z]{2}$/.test(key)) return Promise.resolve([]);
  const hit = cache.get(key);
  if (hit) return hit;

  const req = fetch(`${IBGE_URL}/${key}/municipios?orderBy=nome`, { signal: AbortSignal.timeout(6000) })
    .then((r) => {
      if (!r.ok) throw new Error(`IBGE ${r.status}`);
      return r.json();
    })
    .then((rows: { nome?: string }[]) => (Array.isArray(rows) ? rows.map((m) => String(m?.nome ?? "")).filter(Boolean) : []))
    .catch((err) => {
      cache.delete(key); // permite tentar de novo depois
      throw err;
    });
  cache.set(key, req);
  return req;
}

/** Comparação sem acento e sem diferenciar maiúsculas. */
export const normalizeCity = (s: string) =>
  String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
