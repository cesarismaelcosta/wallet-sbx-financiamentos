/**
 * @fileoverview INFRAESTRUTURA DE DADOS (sbX Core)
 * ============================================================================
 * Módulo de Telemetria e Captura de Ambiente.
 * ============================================================================
 * Centraliza a extração de metadados, geolocalização e identificação de 
 * dispositivo. Opera como uma "Fonte da Verdade" (Single Source of Truth) para
 * telemetria em todo o ecossistema sbX.
 * * [RESPONSABILIDADES]:
 * 1. Sanitização: Normaliza headers de requisição vindos de CDNs (Cloudflare/Vercel).
 * 2. Fingerprinting: Gera a assinatura básica para identificar o contexto da requisição.
 * 3. Resiliência: Implementa fallback de IP-API caso a CDN falhe na geolocalização.
 * * @author Cesar Ismael Pereira da Costa
 */

import type { OriginDetails } from "./types.ts";

/**
 * @function parseUserAgent
 * @description Extrai Sistema Operacional e Dispositivo básico do cabeçalho da requisição.
 * @param {string} ua - String do User-Agent enviada pelo navegador/cliente.
 * @returns {{ os: string, device: string }} - Objeto normalizado com SO e Tipo de Dispositivo.
 */
export function parseUserAgent(ua: string) {
  const os = ua.includes("Windows") ? "Windows"
    : ua.includes("Mac") ? "MacOS"
    : ua.includes("Android") ? "Android"
    : ua.includes("iPhone") ? "iOS"
    : "Linux/Other";
  
  const device = ua.includes("Mobi") ? "Mobile" : "Desktop";
  
  return { os, device };
}

/**
 * @function captureInfrastructure
 * @description Captura telemetria e geolocalização do lead com sistema de Fallback.
 * @description Opera como um motor de "Context Awareness", essencial para segurança 
 * de sessão e prevenção de Session Hijacking.
 * * @param {Request} req - Objeto de requisição HTTP original.
 * @returns {Promise<OriginDetails>} - Snapshot completo da infraestrutura do cliente.
 */
export async function captureInfrastructure(req: Request): Promise<OriginDetails> {
  const ua = req.headers.get("user-agent") || "";
  
  // Captura de IP: Tenta headers de proxy (CF/Vercel) antes do fallback
  const ip = req.headers.get("x-real-ip") || 
             req.headers.get("cf-connecting-ip") || 
             req.headers.get("x-forwarded-for")?.split(",")[0] || 
             "0.0.0.0";
  
  const { os, device } = parseUserAgent(ua);

  // Inicialização de Geo com metadados da CDN
  let geo = {
    country: req.headers.get("x-vercel-ip-country") || req.headers.get("cf-ipcountry"),
    state: req.headers.get("x-vercel-ip-country-region") || req.headers.get("cf-region"),
    city: req.headers.get("x-vercel-ip-city") || req.headers.get("cf-ipcity"),
  };

  // Fallback Agressivo de Geolocation via IP-API (caso CDN não proveja dados)
  if (!geo.country || geo.country === "XX" || !geo.city) {
    try {
      const queryIp = ip === "0.0.0.0" || ip === "127.0.0.1" ? "" : ip;
      const res = await fetch(`http://ip-api.com/json/${queryIp}?fields=countryCode,regionName,city`);
      const fallback = await res.json();

      geo = {
        country: fallback?.countryCode || geo.country || "N/A",
        state: fallback?.regionName || geo.state || "N/A",
        city: fallback?.city || geo.city || "N/A",
      };
    } catch (e) {
      console.warn("[sbX Infrastructure] Falha no fallback de Geo:", e.message);
    }
  }

  // Montagem do payload de telemetria
  return {
    ip_address: ip,
    country: geo.country || "N/A",
    state: geo.state || "N/A",
    city: geo.city || "N/A",
    user_agent: ua,
    device_type: device,
    operating_system: os,
    metadata: {
      timestamp: new Date().toISOString(),
      tls_version: req.headers.get("x-tls-version") || null,
    },
  } as OriginDetails;
}