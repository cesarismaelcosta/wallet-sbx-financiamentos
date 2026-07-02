/**
 * @fileoverview Edge Function: sbx-user (Validador)
 * * Valida o JWT Próprio enviado pelo front-end antes de acessar dados da Superbid.
 * * [RESPONSABILIDADES]:
 * 1. Segurança: Verifica a assinatura HMAC-SHA256 do token.
 * 2. Mapeamento: Extrai o 'jti' do JWT para buscar o UUID no banco (sbx_sessions).
 * 3. Integração: Hidrata dados da API upstream usando o token recuperado.
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
};

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
    
    // Decodifica e verifica a assinatura
    const payload = await verify(sessionToken, key);
    const sessionId = payload.jti as string; // O UUID original gravado no JWT

    // 2. [DATA]: Consulta ao Banco usando o JTI validado
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    
    const { data: session, error: sessionError } = await supabaseAdmin
      .from('sbx_sessions')
      .select('sbx_access_token, expires_at')
      .eq('session_token', sessionId)
      .single();

    if (sessionError || !session) throw new Error("Sessão inválida");

    // 3. [VALIDATION]: Validação de TTL
    if (new Date() > new Date(session.expires_at)) {
      throw new Error("Sessão expirada");
    }

    // 4. [INTEGRATION]: Chamada upstream
    const response = await fetch(`${baseUrl}/account/v2/user/me`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${session.sbx_access_token}`,
        "Content-Type": "application/json",
        "X-Forwarded-For": clientIp
      },
    });

    if (!response.ok) throw new Error("Falha na API upstream");
    const data = await response.json();

    // 5. [HIDRATAÇÃO]: Mapper (Mantendo sua estrutura original)
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

  } catch (err) {
    debugLog("[CRITICAL] Erro inesperado na função sbx-user:", err);
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 401, headers: corsHeaders 
    });
  }
});