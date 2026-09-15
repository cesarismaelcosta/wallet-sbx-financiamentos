/**
 * @fileoverview INFRAESTRUTURA DE DADOS (sbX Core)
 * ============================================================================
 * Módulo de Telemetria e Captura de Ambiente.
 * ============================================================================
 * Centraliza a extração de metadados, geolocalização e identificação de 
 * dispositivo. Opera como uma "Fonte da Verdade" (Single Source of Truth) para
 * telemetria em todo o ecossistema sbX.
 * 
 * [RESPONSABILIDADES]:
 * 1. Sanitização: Normaliza headers de requisição vindos de CDNs, Proxies e Supabase Edge.
 * 2. Fingerprinting: Gera a assinatura básica para identificar o contexto da requisição.
 * 3. Resiliência: Implementa fallback de IP-API com tratamento estrito de IPs locais/loopback.
 * 
 * @author Cesar Ismael Pereira da Costa
 */

import type { OriginDetails } from "./types.ts";

// Timeout do fallback de geo (ip-api.com): teto de segurança para não travar a function
// inteira se o serviço externo ficar indisponível — mas alto o bastante pra confiarmos que
// só dispara em exceções raras, não no caminho normal (decisão: 2026-09-15, ver discussão).
const GEO_TIMEOUT_MS = 10_000;

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
 * 
 * @param {Request} req - Objeto de requisição HTTP original.
 * @returns {Promise<OriginDetails>} - Snapshot completo da infraestrutura do cliente.
 */
export async function captureInfrastructure(req: Request): Promise<OriginDetails> {
  const ua = req.headers.get("user-agent") || "";
  
  /**
   * IP:
   * O x-client-ip DEVE vir em primeiro lugar porque enviamos no financial-gateway-gate
   */
  const rawIp = req.headers.get("x-client-ip") || 
                req.headers.get("x-forwarded-for")?.split(",")[0] || 
                req.headers.get("cf-connecting-ip") || 
                req.headers.get("x-real-ip") || 
                "0.0.0.0";
  
  // Declaração e higienização da variável ip que estava faltando
  const ip = rawIp.trim();
  
  const { os, device } = parseUserAgent(ua);

  // Inicialização de Geo com metadados da CDN/Edge
  let geo = {
    country: req.headers.get("x-vercel-ip-country") || req.headers.get("cf-ipcountry"),
    state: req.headers.get("x-vercel-ip-country-region") || req.headers.get("cf-region"),
    city: req.headers.get("x-vercel-ip-city") || req.headers.get("cf-ipcity"),
  };

  // Identificação de IP local, loopback ou redes privadas de desenvolvimento
  const isLocalIp = ip === "0.0.0.0" || ip === "127.0.0.1" || ip.startsWith("192.168.") || ip.startsWith("10.");

  /**
   * =========================================================================
   * [CORREÇÃO CRÍTICA DE GEO-LOCALIZAÇÃO]
   * =========================================================================
   * ANTES: Se o IP fosse local, o código passava string vazia ("") para a API externa.
   * RESULTADO: A API externa rastreava o servidor de execução (Supabase Edge na AWS SP) 
   * e cravava "São Paulo" indevidamente para qualquer teste em localhost.
   * 
   * AGORA: Se for IP local/privado, o script ABORTA a chamada externa (`ip-api`), 
   * evitando poluir o banco com a localização do datacenter e mantendo o fallback 
   * limpo como "N/A" (ou dados fornecidos diretamente pela CDN, se houver).
   */
  if ((!geo.country || geo.country === "XX" || !geo.city) && !isLocalIp) {
    // 🛡️ [TIMEOUT]: telemetria não pode travar o fluxo crítico esperando um
    // serviço externo gratuito (ip-api.com) que não tem SLA. Mesmo padrão de
    // AbortController já usado no fetch upstream da Superbid (hydrate-data.ts).
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), GEO_TIMEOUT_MS);

    try {
      const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,countryCode,regionName,city`, {
        signal: controller.signal,
      });
      const fallback = await res.json();

      // Validação estrita: Só aceita o payload se a API retornar status de sucesso legítimo
      if (fallback?.status === "success" && fallback?.countryCode) {
        geo = {
          country: fallback.countryCode,
          state: fallback.regionName || "N/A",
          city: fallback.city || "N/A",
        };
      }
    } catch (e) {
      const reason = (e as any)?.name === "AbortError" ? "TIMEOUT" : "NETWORK";
      console.warn(`[sbX Infrastructure] Falha no fallback de Geo (${reason}):`, (e as any)?.message);
    } finally {
      clearTimeout(timer);
    }
  }

  // Montagem do payload de telemetria
  return {
    ip_address: ip,
    country: isLocalIp ? "LOCAL" : (geo.country || "N/A"),
    state: isLocalIp ? "Ambiente Local" : (geo.state || "N/A"),
    city: isLocalIp ? "Localhost" : (geo.city || "N/A"),
    user_agent: ua,
    device_type: device,
    operating_system: os,
    metadata: {
      timestamp: new Date().toISOString(),
      tls_version: req.headers.get("x-tls-version") || null,
    },
  } as OriginDetails;
}