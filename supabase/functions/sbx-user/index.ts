/**
 * @fileoverview Edge Function: sbx-user (Security Gatekeeper)
 * * * ARQUITETURA DE SEGURANÇA:
 * Esta função atua como o validador de identidade do ecossistema sbX.
 * Ela não confia no cliente. Ela valida o JWT, consulta o estado da sessão 
 * no banco (sbx_sessions) e, somente após a validação bem-sucedida, performa 
 * o proxy para a API Upstream (Superbid).
 * * * [RESPONSABILIDADES]:
 * 1. Segurança: Verifica a assinatura HMAC-SHA256 e o TTL do JWT.
 * 2. Integridade: Mapeia o 'jti' do JWT para buscar o UUID no banco.
 * 3. Orquestração: Hidrata dados da API upstream usando o token recuperado.
 * * @author Cesar Ismael Pereira da Costa
 * @version 1.0.0
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

/**
 * CONFIGURAÇÃO DE DEBUG
 * Mantido como 'true' para operação e troubleshooting.
 */
const DEBUG_MODE = true;

/**
 * @function debugLog
 * @description Centraliza o log de depuração do fluxo de autenticação.
 */
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[SBX-USER] ${message}`, data ? JSON.stringify(data) : "");
  }
};

/**
 * CONFIGURAÇÃO DE CORS
 * Permite a comunicação segura entre o domínio do front-end e a Edge Function.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sbx-env, x-session-token',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

serve(async (req) => {
  // =========================================================================
  // 1. HANDSHAKE (OPTIONS)
  // =========================================================================
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const sessionToken = req.headers.get("x-session-token");
  const env = req.headers.get("x-sbx-env") || "stage";
  const baseUrl = env === "production" ? "https://api.s4bdigital.net" : "https://stgapi.s4bdigital.net";

  // Validação de presença do token
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: "AUTH_REQUIRED" }), { status: 401, headers: corsHeaders });
  }

  try {
    // =========================================================================
    // 2. SEGURANÇA: VALIDAÇÃO DO JWT
    // =========================================================================
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) throw new Error("INTERNAL_CONFIG_ERROR");

    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(jwtSecret), 
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    
    // O verify valida assinatura e expiration claim (exp) automaticamente
    const payload = await verify(sessionToken, key);
    const sessionId = payload.jti as string; 

    // =========================================================================
    // 3. ESTADO: CONSULTA DE SESSÃO NO BANCO
    // =========================================================================
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sbx_sessions')
      .select('sbx_access_token, expires_at')
      .eq('session_token', sessionId)
      .single();

    if (sessionError || !session) return new Response(JSON.stringify({ error: "SESSION_INVALID" }), { status: 401, headers: corsHeaders });

    // Validação de TTL da sessão
    if (new Date() > new Date(session.expires_at)) {
      return new Response(JSON.stringify({ error: "SESSION_EXPIRED" }), { status: 401, headers: corsHeaders });
    }

    // =========================================================================
    // 4. INTEGRAÇÃO: CHAMADA UPSTREAM
    // =========================================================================
    const response = await fetch(`${baseUrl}/account/v2/user/me`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${session.sbx_access_token}`,
        "Content-Type": "application/json"
      },
    });

    // Tratamento de Erros Granular:
    // 401 = Token da Superbid expirou (Auth Fail)
    // !ok  = API indisponível (Bad Gateway)
    if (response.status === 401) {
        return new Response(JSON.stringify({ error: "UPSTREAM_AUTH_FAILED" }), { status: 401, headers: corsHeaders });
    }
    if (!response.ok) {
        return new Response(JSON.stringify({ error: "UPSTREAM_API_UNAVAILABLE" }), { status: 502, headers: corsHeaders });
    }
    
    // =========================================================================
    // 5. HIDRATAÇÃO: MAPEAMENTO E CONTRATO BFF
    // =========================================================================
    const data = await response.json();
    const account = data.userAccounts?.[0];
    const mainAddress = account?.addresses?.[0];
    
    const enrichedData = {
      entity_id: String(account?.id),
      name: account?.basicInfo?.fullName || "N/A",
      document: account?.documents?.find((d: any) => d.typeName === "cpf")?.number || "",
      email: account?.basicInfo?.email?.address || "",
      phone: account?.phones?.find((p: any) => p.type === 3)?.fullPhoneNumber || "",
      birth_date: account?.birthDate?.split('T')[0] || "",
      gender: account?.gender === "M" ? "M" : "F",
      login: account?.credentials?.login || "",
      mothers_name: account?.mothersName || "",
      address: mainAddress ? {
        street: mainAddress.addressLine1 || "",
        number: mainAddress.number || "",
        complement: mainAddress.addressLine2 || "",
        neighborhood: mainAddress.district || "",
        city: mainAddress.city || "",
        state: mainAddress.state || "",
        zip_code: mainAddress.zipCode || "",
        country: mainAddress.countryIsoKey || "BR"
      } : null
    };

    return new Response(JSON.stringify(enrichedData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (err: any) {
    debugLog("Fatal Exception in sbx-user:", err.message);
    
    // Estratégia de erro: 401 para problemas de token, 500 para falhas sistêmicas
    const status = err.message.includes("Token") ? 401 : 500;
    return new Response(JSON.stringify({ error: "INTERNAL_SERVER_ERROR" }), { 
      status, headers: corsHeaders 
    });
  }
});