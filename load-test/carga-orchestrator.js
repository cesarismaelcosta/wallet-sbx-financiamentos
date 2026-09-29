/**
 * Teste de carga do orchestrator (POST action=VISIT) com k6.
 *
 * Cada usuário virtual (VU) usa uma VISITA PRÓPRIA, lida de visitas.csv
 * (visitas já existentes do dono do token -- o orchestrator só aceita visita
 * com perfil gravado em visit_entities e exige entity_id = usuário do token).
 * Cada iteração = clique num produto: VISIT para /produtos/offer.
 *
 * Por quê: a 1ª versão usava o mesmo visit_id em todas as requisições e mediu
 * só a trava da linha em `UPDATE visits`. Criar visita nova pelo orchestrator
 * não dá (400 PROFILE_UNAVAILABLE): visita nova nasce no login (sbx-auth /
 * gate), que chama a Superbid -- e não queremos carga na Superbid.
 *
 * NÃO chama Fandi nem Superbid: só orchestrator + banco próprio.
 *
 * Pré-requisitos:
 *   1. k6 instalado:  winget install k6 --source winget
 *   2. visitas.csv (colunas visit_id,visit_update_id), gerado pelo SQL em
 *      visitas.sql, com pelo menos 50 linhas (1 por VU no pico).
 *   3. x-session-token do mesmo ambiente (DevTools -> Headers). Vale ~2h.
 *      Nunca versionar o token nem colar em chat.
 *   4. Rate limit: orchestrator aceita 10 req/min por IP (registry.ts).
 *      Para medir capacidade, subir o limite TEMPORARIAMENTE só no ambiente
 *      do teste e voltar depois. Sem isso, o esperado é 429 após a 10ª.
 *
 * Rodar (PowerShell, na pasta load-test):
 *   k6 run -e BASE_URL=https://<ref>.supabase.co -e ANON_KEY=<anon> -e SESSION_TOKEN=<token> carga-orchestrator.js
 *
 * Smoke test (confere o script com 3 requisições, sem estourar o rate limit):
 *   k6 run -e SMOKE=1 -e BASE_URL=... -e ANON_KEY=... -e SESSION_TOKEN=... carga-orchestrator.js
 *
 * Efeito colateral: cada iteração cria 1 visit_update na visita do VU.
 * Rode em homol/dev, nunca em produção.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { SharedArray } from "k6/data";

const BASE_URL = __ENV.BASE_URL || "https://ldzutiojmcawhwdhojlo.supabase.co";
const ENDPOINT = `${BASE_URL}/functions/v1/orchestrator`;
const ORIGIN = __ENV.APP_ORIGIN || "http://localhost:8080";
const ANON_KEY = __ENV.ANON_KEY;
const SESSION = __ENV.SESSION_TOKEN;

if (!ANON_KEY || !SESSION) {
  throw new Error("Informe ANON_KEY e SESSION_TOKEN (use o rodar.ps1).");
}

// visitas.csv: cabeçalho visit_id,visit_update_id
const VISITAS = new SharedArray("visitas", () =>
  open("./visitas.csv")
    .split(/\r?\n/)
    .slice(1)
    .map((l) => l.replace(/"/g, "").trim())
    .filter((l) => l)
    .map((l) => {
      const [visit_id, visit_update_id] = l.split(",");
      return { visit_id, visit_update_id };
    }),
);

export const options = __ENV.SMOKE
  ? { vus: 1, iterations: 3 }
  : {
      stages: [
        { duration: "1m", target: 5 },  // aquece
        { duration: "3m", target: 20 }, // carga normal
        { duration: "2m", target: 50 }, // pico
        { duration: "1m", target: 0 },  // desce
      ],
      thresholds: {
        http_req_failed: ["rate<0.01"],    // < 1% de erro
        http_req_duration: ["p(95)<8000"], // 95% < 8s (timeout do front)
      },
    };

export function setup() {
  if (VISITAS.length === 0) throw new Error("visitas.csv vazio.");
  if (!__ENV.SMOKE && VISITAS.length < 50) {
    console.warn(`Só ${VISITAS.length} visitas para até 50 VUs: algumas serão compartilhadas (disputa de trava).`);
  }
}

export default function () {
  const v = VISITAS[(__VU - 1) % VISITAS.length]; // 1 visita por VU
  const originalUrl = `/produtos?visit_id=${v.visit_id}&visit_update_id=${v.visit_update_id}`;
  const href = `${ORIGIN}${originalUrl}`;

  const res = http.post(
    ENDPOINT,
    JSON.stringify({
      action: "VISIT",
      target_url: "/produtos/offer",
      visit_id: v.visit_id,
      visit_update_id: v.visit_update_id,
      origin_url: href,
      interaction_context: {
        origin_url: href,
        utm_source: "produtos_direct",
        utm_medium: "referral",
        utm_campaign: "k6_load_test",
      },
    }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ANON_KEY}`,
        "x-session-token": SESSION,
        "x-original-url": originalUrl,
        "x-auth-fallback-url": `/accounts/signin?redirect_uri=${encodeURIComponent(originalUrl)}`,
      },
      timeout: "30s",
    },
  );

  check(res, {
    "status 200": (r) => r.status === 200,
    "sem 429 (rate limit)": (r) => r.status !== 429,
    "sem 5xx": (r) => r.status < 500,
    "retornou url": (r) => {
      try { return !!r.json("url"); } catch (_) { return false; }
    },
  });

  if (res.status !== 200) {
    console.warn(`status=${res.status} body=${String(res.body).slice(0, 200)}`);
  }
  sleep(1);
}
