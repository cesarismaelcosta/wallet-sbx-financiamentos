/**
 * @fileoverview Edge Function: sbx-data (Versão Integrada com Validação JWT)
 * * Objetivo: Orquestrar, hidratar e auditar dados do usuário (Profile).
 * * [SECURITY]: Valida assinatura do JWT Próprio antes da consulta no banco.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

const DEBUG_MODE = true;

const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[SBX-DATA] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sbx-env, x-session-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const sessionToken = req.headers.get("x-session-token");
  const env = req.headers.get("x-sbx-env") || "stage";
  const baseUrl = env === "production" ? "https://api.s4bdigital.net" : "https://stgapi.s4bdigital.net";
  const clientIp = req.headers.get("x-forwarded-for") || "unknown-ip";

  if (!sessionToken) {
    return new Response(JSON.stringify({ error: "Token ausente" }), { 
      status: 401, headers: corsHeaders 
    });
  }

  try {
    // 1. [SECURITY]: Validação de Assinatura JWT
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) throw new Error("JWT_SECRET não configurada");

    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(jwtSecret), 
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    
    // [VALIDATE]: Decodifica e verifica a assinatura. Se falhar, vai para o catch.
    const payload = await verify(sessionToken, key);
    const sessionId = payload.jti as string; // O UUID original que gravamos no JWT

    // 2. [DATA]: Consulta ao Banco usando o sessionId (JTI) validado
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: session, error: sessionError } = await supabase
      .from('sbx_sessions')
      .select('sbx_access_token, expires_at')
      .eq('session_token', sessionId) // Usamos o UUID extraído do JWT
      .single();

    debugLog(`[DEBUG] Buscando sessão via JTI: ${sessionId}. Resultado:`, { session, sessionError });

    if (sessionError || !session) {
      debugLog(`[AUTH] Sessão não encontrada no cofre.`);
      return new Response(JSON.stringify({ error: "Sessão inválida" }), { status: 401, headers: corsHeaders });
    }

    // 3. [VALIDATION]: Validação de TTL
    if (new Date() > new Date(session.expires_at)) {
      debugLog("[AUTH] Sessão expirada.");
      return new Response(JSON.stringify({ error: "SESSION_EXPIRED" }), { status: 401, headers: corsHeaders });
    }

    // 4. [INTEGRATION]: Chamada ao backend upstream da Superbid
    const response = await fetch(`${baseUrl}/account/v2/user/me`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${session.sbx_access_token}`,
        "Content-Type": "application/json",
        "X-Forwarded-For": clientIp
      },
    });

    if (!response.ok) {
      debugLog(`[ERROR] Falha na API upstream: ${response.status}`);
      return new Response(JSON.stringify({ error: "Erro ao consultar base" }), { 
        status: response.status,
        headers: corsHeaders 
      });
    }

    const data = await response.json();

    // 5. [HIDRATAÇÃO]: Mapper (Mantido conforme original)
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
      } : null,
      metadata: {
        processedAt: new Date().toISOString(),
        originIp: clientIp
      }
    };

    return new Response(JSON.stringify(enrichedData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    debugLog("[CRITICAL] Erro inesperado na função sbx-data:", error);
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 401,
      headers: corsHeaders 
    });
  }
});