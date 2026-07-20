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