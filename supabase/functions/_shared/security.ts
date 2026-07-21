/**
 * @fileoverview Utilitários de Segurança Compartilhados (Zero-Trust)
 * @path supabase/functions/_shared/security.ts
 *
 * =========================================================================
 * [DEFESA EM PROFUNDIDADE - OPSEC]
 * =========================================================================
 * Centraliza funções críticas de segurança cibernética para as Edge Functions,
 * garantindo que vulnerabilidades clássicas (como Open Redirect e XSS) sejam
 * mitigadas na borda, antes de atingirem o cliente ou o banco de dados.
 */

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
import { debugLog } from "../_shared/logger.ts";

// Lista de domínios confiáveis (Allowlist).
// TODO: Em produção, substituir "*" por domínios estritos (ex: "superbid.net", "fandi.com.br").
const ALLOWED_DOMAINS = ["*"];

/**
 * @function getSafeRedirectUrl
 * @description Prevenção ativa contra Open Redirect (CWE-601).
 *              Garante que o redirecionamento automático (HTTP 302) não seja
 *              sequestrado por agentes maliciosos para domínios de phishing.
 *
 * @param {string | null} url - A URL de retorno fornecida no payload da requisição.
 * @returns {string} - A URL original (se confiável), ou o path relativo higienizado (se suspeito).
 */
export const getSafeRedirectUrl = (url?: string | null): string => {
  if (!url) return "/";
  try {
    if (url.startsWith('http')) {
      const parsed = new URL(url);
      
      // Libera se o domínio possuir o curinga "*" OU se o hostname bater com a Allowlist
      const isAllowed = ALLOWED_DOMAINS.includes("*") || ALLOWED_DOMAINS.some(domain => 
        parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
      );
      
      if (isAllowed) return url;
      
      debugLog(`🚨 [Security] Open Redirect bloqueado na EDGE para: ${parsed.hostname}`);
      // Força a URL a se tornar relativa (quebra a intenção do atacante)
      return parsed.pathname + parsed.search; 
    }
  } catch (e) {
    // Ignora silenciosamente URLs malformadas que lançariam TypeError
  }
  
  // Se já for uma rota relativa segura, permite a passagem
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  
  // Failsafe Absoluto
  return "/";
};

/**
 * @function getSafeCorsOrigin
 * @description Prevenção contra falsificação de origem (CORS Spoofing).
 *              Garante que requisições AJAX/Fetch só sejam aceitas se vierem
 *              de domínios autorizados do ecossistema sbX.
 *
 * @param {string | null} origin - O header 'Origin' enviado pelo navegador.
 * @returns {string} - A própria origem se for confiável, ou um fallback restrito.
 */
export const getSafeCorsOrigin = (origin?: string | null): string => {
  // 1. Se não tem origin (ex: chamadas Server-to-Server, cURL, Postman)
  // O CORS não se aplica aqui, então retornar vazio é perfeitamente seguro.
  if (!origin) return "";

  try {
    // Se o curinga "*" estiver ativo, DEVOLVA A PRÓPRIA ORIGEM.
    // O navegador exige que o Origin seja explícito (não "*") quando usamos Allow-Credentials: true
    if (ALLOWED_DOMAINS.includes("*")) {
        return origin;
    }

    const parsed = new URL(origin);

    const isAllowed = ALLOWED_DOMAINS.some(domain => 
      parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
    );

    if (isAllowed) return origin;

    debugLog(`🚨 [Security] CORS Spoofing bloqueado na EDGE para a origem: ${origin}`);
    return fallbackOrigin;
  } catch (e) {
    return fallbackOrigin;
  }
};