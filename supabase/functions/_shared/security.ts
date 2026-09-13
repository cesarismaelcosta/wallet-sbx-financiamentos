/**
 * @fileoverview Utilitários de Segurança Compartilhados (Zero-Trust & CORS Engine)
 * @path supabase/functions/_shared/security.ts
 *
 * ARQUITETURA DE SEGURANÇA E OPSEC:
 * Centraliza funções críticas de segurança cibernética e controle de acesso HTTP para as Edge Functions.
 * Mitiga vulnerabilidades de Open Redirect (CWE-601) e CORS Spoofing (CWE-942), garantindo
 * conformidade com a especificação W3C CORS para chamadas autenticadas com Cookies HttpOnly (`credentials: "true"`).
 *
 * REGRAS DE COMPATIBILIDADE DE ORIGEM (CORS ALLOWLIST):
 * 1. Padrão de Credenciais (Credentials Spec): Quando `Access-Control-Allow-Credentials: true` é usado,
 *    o navegador REJEITA estritamente o header `Access-Control-Allow-Origin: *`. O servidor DEVE
 *    retornar a string exata da origem que realizou a chamada (`http://localhost:5173`, `https://id.lovable.app`, etc.).
 * 2. Suporte Nativo a Desenvolvimento Local: Libera qualquer variação de `localhost` ou `127.0.0.1` em qualquer porta.
 * 3. Suporte Nativo ao Ecossistema Lovable: Libera subdomínios de `lovable.app`, `lovableproject.com` e `lovable.dev`.
 * 4. Suporte Nativo à Produção Superbid/sbX: Libera domínios corporativos (`superbid.net`).
 *
 * IMPORTANTE: Não existe mais um modo "libera tudo" (wildcard "*"). Toda origem é validada
 * estritamente contra ALLOWED_DOMAIN_SUFFIXES abaixo. Quando a URL definitiva de produção
 * existir, adicione-a a essa lista (não reintroduza um wildcard).
 *
 * @author César Ismael Pereira da Costa
 * @version 4.0.0 (Remoção do modo wildcard "*"; allowlist estrita por sufixo de domínio)
 */

import { debugLog } from "../_shared/logger.ts";

/**
 * Lista de sufixos de domínios permitidos na Allowlist corporativa.
 * Qualquer origem cujo hostname termine com um desses sufixos será autorizada.
 * ÚNICA fonte de verdade de autorização de origem — não existe mais um modo
 * "libera tudo" por trás disso (ver histórico: `ALLOWED_DOMAINS = ["*"]` foi
 * removido por anular CORS e proteção de Open Redirect ao mesmo tempo).
 * `s4bdigital.net` e `fandi.com.br` foram removidos por serem legado/erro de
 * documentação — não correspondem a domínios em uso.
 */
const ALLOWED_DOMAIN_SUFFIXES = [
  // Ambiente Local / Desenvolvimento
  "localhost",
  "127.0.0.1",

  // Ecossistema Lovable (Previews, Sandboxes e Apps Publicados)
  "lovable.app",
  "lovableproject.com",
  "lovable.dev",

  // Ecossistema Corporativo Superbid / sbX
  "superbid.net",
];

/**
 * Helper interno que valida se o hostname extraído da origem pertence à Allowlist corporativa
 * ou aos padrões permitidos de desenvolvimento (Localhost e Lovable).
 *
 * @param {string} hostname - O hostname da requisição (ex: "localhost", "preview--app.lovable.app", "walletsbx.superbid.net")
 * @returns {boolean} True se a origem for autorizada.
 */
const isDomainAllowed = (hostname: string): boolean => {
  // Checa se o hostname bate exatamente com algum sufixo autorizador ou é subdomínio dele
  return ALLOWED_DOMAIN_SUFFIXES.some(suffix =>
    hostname === suffix || hostname.endsWith(`.${suffix}`)
  );
};

/**
 * @function getSafeCorsOrigin
 * @description Prevenção contra falsificação de origem (CORS Spoofing) e adequação ao spec de Cookies HttpOnly.
 *              Garante que requisições AJAX/Fetch de origens conhecidas (Localhost, Lovable, Superbid)
 *              tenham sua origem refletida exatamente como enviada pelo browser.
 *
 * @param {string | null} origin - O header 'Origin' (ou Referer) enviado pelo navegador.
 * @returns {string} A origem exata autorizada, ou string vazia se for rejeitada.
 */
export const getSafeCorsOrigin = (origin?: string | null): string => {
  // 1. Requisições sem header Origin (ex: cURL no terminal, Postman, chamadas Server-to-Server)
  if (!origin) return "";

  // 2. Bloqueio de origens "null" (geradas por iframes com sandbox restrito ou data URIs)
  if (origin === "null") return "";

  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname;

    // 3. Validação contra a Allowlist (Localhost, Lovable e Domínios Corporativos)
    if (isDomainAllowed(hostname)) {
      // Retorna o origin completo com protocolo e porta (ex: "http://localhost:5173" ou "https://my-app.lovable.app")
      // Isso satisfaz o requisito do browser quando Access-Control-Allow-Credentials = true
      return origin;
    }

    debugLog(`🚨 [Security] CORS Spoofing bloqueado na EDGE para a origem: ${origin}`);
    return "";
  } catch (e) {
    // Retorna vazio em caso de URLs malformadas enviadas no header Origin
    return "";
  }
};

/**
 * @function getSafeRedirectUrl
 * @description Prevenção ativa contra Open Redirect (CWE-601).
 *              Garante que redirecionamentos automáticos via HTTP 302 ou chamadas de callback
 *              não sejam sequestrados por agentes maliciosos para domínios externos não autorizados.
 *
 * @param {string | null} url - A URL de retorno fornecida no payload da requisição ou query params.
 * @returns {string} - A URL original (se confiável), ou o path relativo higienizado (se suspeito).
 */
export const getSafeRedirectUrl = (url?: string | null): string => {
  if (!url) return "/";

  try {
    // Se for uma URL absoluta (iniciada por http:// ou https://)
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const parsed = new URL(url);
      
      if (isDomainAllowed(parsed.hostname)) {
        return url;
      }
      
      debugLog(`🚨 [Security] Open Redirect bloqueado na EDGE para o hostname: ${parsed.hostname}`);
      // Sanitiza convertendo para rota relativa interna
      return parsed.pathname + parsed.search; 
    }
  } catch (e) {
    // Ignora TypeError lançado por URLs inválidas
  }
  
  // Se for uma rota relativa válida iniciada por "/" (ex: "/sbxpay" ou "/accounts/signin")
  if (url.startsWith('/') && !url.startsWith('//')) {
    return url;
  }
  
  // Fallback padrão de segurança
  return "/";
};