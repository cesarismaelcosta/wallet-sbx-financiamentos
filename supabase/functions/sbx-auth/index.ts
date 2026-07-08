/**
 * @fileoverview Edge Function: Auth SBX (Login Proxy & JWT Signer)
 * * Esta função atua como um proxy seguro para o login na API da Superbid (SBX).
 * Ela gerencia:
 * 1. A seleção dinâmica de ambiente ('staging' ou 'production').
 * 2. A requisição OAuth2 usando client_id e portalid ocultos no servidor.
 * 3. O cálculo dinâmico da expiração do token (com margem de segurança de 15 min).
 * 4. A gravação segura da sessão no banco de dados.
 * 5. [NEW] A assinatura do JWT Próprio para Segurança Passiva do Front-end.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', 
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ENV_URLS = {
  production: "https://api.s4bdigital.net",
  staging: "https://stgapi.s4bdigital.net"
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || '0.0.0.0';

  try {
    const { username, password, environment = 'staging' } = await req.json()

    // ... (Lógica de autenticação OAuth2 com a SBX permanece inalterada)
    const sbxBaseUrl = ENV_URLS[environment as keyof typeof ENV_URLS]
    const details = new URLSearchParams()
    details.append("username", username)
    details.append("password", password)
    details.append("grant_type", "password")
    details.append("client_id", "dzqC3VodSoXukD45BQKg3NQU6-faststore")
    details.append("portalid", "2")

    const sbxLoginResponse = await fetch(`${sbxBaseUrl}/account/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': clientIp },
      body: details.toString()
    })

    if (!sbxLoginResponse.ok) throw new Error("Credenciais inválidas");
    const sbxData = await sbxLoginResponse.json()

    // Cálculo de expiração
    const agora = new Date()
    const expiraEmSegundos = sbxData.expires_in || 18000
    const margemSegurancaMs = 15 * 60 * 1000
    const nossaExpiracao = new Date(agora.getTime() + (expiraEmSegundos * 1000) - margemSegurancaMs)

    // Gravação no Supabase
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const { data, error } = await supabaseAdmin
      .from('sbx_sessions')
      .insert({ user_id: sbxData.userId, sbx_access_token: sbxData.access_token, environment, expires_at: nossaExpiracao.toISOString() })
      .select('session_token')
      .single()

    if (error) throw new Error("Erro ao criar sessão");

    // -----------------------------------------------------------------------
    // [SECURITY]: Assinatura do JWT Próprio
    // -----------------------------------------------------------------------
    const jwtSecret = Deno.env.get("JWT_SECRET"); // NECESSÁRIO CONFIGURAR NO SUPABASE
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );

    const jwt = await create(
      { alg: "HS256", typ: "JWT" },
      { 
        sub: sbxData.userId, 
        jti: data.session_token, // O UUID original como referência interna
        exp: getNumericDate(nossaExpiracao.getTime() / 1000) 
      },
      key
    );

    return new Response(JSON.stringify({
      success: true,
      session_token: jwt, // Agora entrega o JWT assinado, não o UUID cru
      sbx_access_token: sbxData.access_token, // TOKEN ORIGINAL DA SBX (Para API externa)
      user_id: sbxData.userId,
      expires_at: Math.floor(nossaExpiracao.getTime() / 1000),
      server_now_ms: agora.getTime()
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error("Erro:", err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})