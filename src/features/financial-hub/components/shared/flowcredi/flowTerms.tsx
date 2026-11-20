/**
 * @fileoverview Termos oficiais da FlowCredi (Terms Acceptance API, GET /terms)
 * @path src/features/financial-hub/components/shared/flowcredi/flowTerms.tsx
 *
 * A FlowCredi publica o texto e a versão ativa de cada termo (termos_gerais,
 * politica_privacidade, autorizacao_scr) numa API pública, sem token. O endereço vem
 * da configuração do aceite (consent_configs[].links[].terms_url), então cada ambiente
 * (dev/homol = staging, produção = produção) mostra o texto do seu ambiente.
 *
 * - `loadFlowTerms(url)`: busca uma vez por endereço (cache em memória).
 * - `rememberShownVersion` / `shownTermsVersion`: guardam a versão exibida ao cliente,
 *   enviada junto com o aceite (a FlowCredi registra exatamente essa versão).
 * - `TermsMarkdown`: mostra o texto (Markdown simples) sem HTML cru.
 *
 * @author César Ismael Pereira da Costa
 * @author Claude
 */

import { Fragment, type ReactNode } from "react";

export interface FlowTerm {
  type: string;
  version: number;
  text: string;
  linkLabel?: string;
}

const cache = new Map<string, Promise<FlowTerm[]>>();
const shown = new Map<string, number>(); // consent_id -> versão exibida

/** Termos ativos publicados no endereço (cache por endereço; falha → tenta de novo na próxima). */
export function loadFlowTerms(url: string): Promise<FlowTerm[]> {
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

// -------------------------------------------------------------------------
// Markdown simples (títulos #, listas -, **negrito**), sem HTML cru
// -------------------------------------------------------------------------

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>,
  );
}

export function TermsMarkdown({ text }: { text: string }) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="space-y-3 text-[13px] leading-relaxed text-neutral-700 dark:text-neutral-300">
      {blocks.map((block, i) => {
        const lines = block.split("\n").filter((l) => l.trim());
        if (lines.length === 0) return null;
        const h = /^(#{1,6})\s+(.*)$/.exec(lines[0]);
        if (h && lines.length === 1) {
          const cls = h[1].length <= 1 ? "text-base" : h[1].length === 2 ? "text-[15px]" : "text-sm";
          return <p key={i} className={`${cls} font-semibold text-neutral-900 dark:text-neutral-100`}>{inline(h[2])}</p>;
        }
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc pl-5 space-y-1">
              {lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*]\s+/, ""))}</li>)}
            </ul>
          );
        }
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l.replace(/^#{1,6}\s+/, ""))}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
