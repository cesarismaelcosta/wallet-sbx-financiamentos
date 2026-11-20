/**
 * @fileoverview Ponte de entrada de parceiros (ex.: botão "Simular financiamento" da Superbid)
 * @path src/routes/gate.ts
 *
 * O parceiro posta o formulário em `<app>/gate` e nunca vê o endereço do Supabase.
 * Quem chama o `financial-gateway-gate` é o NAVEGADOR do usuário (fetch, modo AJAX),
 * então o Supabase enxerga o IP real — sem chave compartilhada e sem repasse no servidor.
 *
 * Fluxo (tudo na mesma aba):
 * 1. POST /gate (servidor): lê o formulário e devolve uma página mínima que guarda os
 *    campos no sessionStorage da aba (chave de uso único) e troca para GET /gate.
 *    Resposta sem cache e sem log; o token nunca vai para a URL.
 * 2. GET /gate (navegador): lê e apaga a chave, chama o `financial-gateway-gate`
 *    (mesmo contrato do "Debug (Fetch)" do Sandbox), grava a sessão e abre a jornada.
 *    Em erro, abre `/financialGatewayGate`, que volta para o `return_uri` (ex.: a oferta).
 *
 * Arquivo .ts (sem JSX): a tela de espera é o mesmo skeleton da jornada (AuthGateSkeleton),
 * montado com createElement, para a troca /gate -> jornada não ser percebida.
 *
 * @author César Ismael Pereira da Costa
 * @author Claude
 */

import { createElement, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { setSessionToken, setSbxEnvironmentPreference } from "@/services/session";
import { AuthGateSkeleton } from "@/features/financial-hub/components/layout/FinancialHubLayout";
import { PARTNER_ORIGIN_DOMAINS } from "@/config/routes";

const HANDOFF_KEY = "gate_handoff";
const GATE_FIELDS = [
  "environment",
  "auth_token",
  "offer_id",
  "product_id",
  "return_uri",
  "utm_source",
  "utm_medium",
  "utm_campaign",
] as const;

type Handoff = Partial<Record<(typeof GATE_FIELDS)[number], string>>;

/** Resposta do financial-gateway-gate no modo AJAX. */
type GateAjaxResponse = {
  success?: boolean;
  redirect_url?: string;
  environment?: "staging" | "production";
  session_token?: string;
  code?: string;
};

// =========================================================================
// [1] SERVIDOR: POST /gate -> página mínima que entrega os campos à própria aba
// =========================================================================

function handoffPage(data: Handoff): Response {
  // JSON embutido sem "<" literal (evita fechar o <script>)
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c");

  const html =
    '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
    '<meta name="robots" content="noindex"><title>Wallet sbX</title></head><body style="margin:0;background:#fff">' +
    `<script>try{sessionStorage.setItem(${JSON.stringify(HANDOFF_KEY)},${JSON.stringify(json)});}catch(e){}` +
    'location.replace("/gate");</script></body></html>';

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex",
      "X-Frame-Options": "DENY", // não pode ser aberta dentro de iframe (clickjacking)
    },
  });
}

/**
 * Só aceita POST vindo do próprio app (o domínio em que a ponte roda) ou de um
 * parceiro de PARTNER_ORIGIN_DOMAINS (src/config/routes.ts). O navegador não deixa
 * um site falsificar o `Origin`; sem ele (ou "null"), o pedido é recusado.
 * Fecha o "login forçado": outro site postar aqui com um token de terceiro.
 */
function isAllowedOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin === "null") return false;
  try {
    const from = new URL(origin);
    if (from.origin === new URL(request.url).origin) return true;
    if (from.protocol !== "https:") return false;
    return PARTNER_ORIGIN_DOMAINS.some((d) => from.hostname === d || from.hostname.endsWith(`.${d}`));
  } catch (_) {
    return false;
  }
}

async function handlePost(request: Request): Promise<Response> {
  if (!isAllowedOrigin(request)) {
    // Recusa sem usar o corpo (o token não é lido) e leva para a tela de erro do app
    return new Response(null, {
      status: 303,
      headers: {
        Location: "/financialGatewayGate?status=error&code=GATE_ORIGIN_NOT_ALLOWED",
        "Cache-Control": "no-store",
      },
    });
  }

  const data: Handoff = {};
  try {
    const form = await request.formData();
    for (const field of GATE_FIELDS) {
      const value = form.get(field);
      if (typeof value === "string" && value) data[field] = value;
    }
  } catch (_) {
    // corpo inválido: segue sem dados e a página cai na tela de erro
  }
  return handoffPage(data);
}

// =========================================================================
// [2] NAVEGADOR: GET /gate -> chama o gate, grava a sessão e abre a jornada
// =========================================================================

function readHandoff(): Handoff | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    sessionStorage.removeItem(HANDOFF_KEY); // uso único
    return raw ? (JSON.parse(raw) as Handoff) : null;
  } catch (_) {
    return null;
  }
}

function errorUrl(code: string, handoff: Handoff | null): string {
  const params = new URLSearchParams({ status: "error", code });
  if (handoff?.return_uri) params.set("return_uri", handoff.return_uri);
  if (handoff?.offer_id) params.set("offer_id", handoff.offer_id);
  if (handoff?.product_id) params.set("product_id", handoff.product_id);
  return `/financialGatewayGate?${params.toString()}`;
}

async function runHandoff(): Promise<void> {
  const handoff = readHandoff();
  if (!handoff?.auth_token) {
    window.location.replace(errorUrl("GATE_HANDOFF_MISSING", handoff));
    return;
  }

  const { auth_token, ...body } = handoff;
  const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || "";

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/financial-gateway-gate`, {
      method: "POST",
      credentials: "include", // mesmo domínio no futuro: a sessão vem por cookie
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-access-token": auth_token,
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as GateAjaxResponse;

    if (res.ok && data.success && data.redirect_url) {
      if (data.session_token) setSessionToken(data.session_token);
      if (data.environment) setSbxEnvironmentPreference(data.environment);
      window.location.replace(data.redirect_url);
      return;
    }
    window.location.replace(errorUrl(data.code || "GENERIC_ERROR", handoff));
  } catch (_) {
    window.location.replace(errorUrl("GENERIC_ERROR", handoff));
  }
}

// O StrictMode do React roda o efeito duas vezes em dev; a chave é de uso único.
let handoffStarted = false;

function GateBridge() {
  useEffect(() => {
    if (handoffStarted) return;
    handoffStarted = true;
    void runHandoff();
  }, []);

  // Mesmo skeleton que a jornada exibe enquanto carrega: a troca não é percebida
  return createElement(AuthGateSkeleton);
}

export const Route = createFileRoute("/gate")({
  server: {
    handlers: {
      POST: ({ request }) => handlePost(request),
    },
  },
  component: GateBridge,
});
