/**
 * @fileoverview Termos oficiais de parceiros (API pública de termos, GET /terms)
 * @path src/features/financial-hub/components/shared/partner-terms.ts
 *
 * O parceiro publica o texto e a versão ativa de cada termo numa API pública. O endereço vem
 * da configuração do aceite (consent_configs[].links[] com type "terms" e terms_url) e o tipo
 * do termo de consent_configs[].terms_type — cada ambiente mostra o texto do seu ambiente.
 *
 * - `loadPartnerTerms(url)`: busca uma vez por endereço (cache em memória).
 * - `rememberShownVersion` / `shownTermsVersion`: guardam a versão exibida ao cliente,
 *   enviada junto com o aceite (o parceiro registra exatamente essa versão).
 *
 * @author César Ismael Pereira da Costa
 * @author Claude
 */

export interface PartnerTerm {
  type: string;
  version: number;
  text: string;
  linkLabel?: string;
}

const cache = new Map<string, Promise<PartnerTerm[]>>();
const shown = new Map<string, number>(); // consent_id -> versão exibida

/** Termos ativos publicados no endereço (cache por endereço; falha → tenta de novo na próxima). */
export function loadPartnerTerms(url: string): Promise<PartnerTerm[]> {
  let p = cache.get(url);
  if (!p) {
    p = fetch(url, { headers: { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((body) => {
        const items: unknown[] = Array.isArray(body?.items) ? body.items : Array.isArray(body) ? body : [];
        return items
          .map((i) => i as Record<string, unknown>)
          .filter((i) => String(i.status ?? i.activeStatusKey ?? "active").toLowerCase() === "active")
          .map((i) => ({ type: String(i.type ?? ""), version: Number(i.version), text: String(i.text ?? ""), linkLabel: i.linkLabel ? String(i.linkLabel) : undefined }))
          .filter((t) => t.type && Number.isInteger(t.version) && t.version > 0);
      })
      .catch((err) => {
        cache.delete(url);
        throw err;
      });
    cache.set(url, p);
  }
  return p;
}

export const rememberShownVersion = (consentId: string, version: number) => shown.set(consentId, version);

/** Versão do termo exibida para o aceite (undefined = não carregou; a FlowCredi usa a ativa). */
export const shownTermsVersion = (consentId: string) => shown.get(consentId);
