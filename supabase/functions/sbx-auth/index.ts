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
import { captureInfrastructure } from "../_shared/infrastructure.ts";
import { OriginDetails } from "../_shared/types.ts";

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

    // ... (Lógica de autenticação OAuth2 com a SBX)
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

    // CAPTURA O QUE A SUPERBID REALMENTE DISSE (Em formato de texto)
    const rawResponse = await sbxLoginResponse.text();
    
    if (!sbxLoginResponse.ok) {
      console.error("[sbx-auth] ERRO REAL DA SBX:", {
        status: sbxLoginResponse.status,
        body: rawResponse,
        sentBody: details.toString() // Vê exatamente o que enviamos
      });
      throw new Error(`Credenciais inválidas ou erro na API: ${sbxLoginResponse.status}`);
    }

    // CORREÇÃO CRÍTICA APLICADA: Transforma a string de texto de volta em um Objeto JSON válido
    // Sem isso, sbxData.userId e sbxData.access_token retornavam 'undefined' e quebravam o banco.
    const sbxData = JSON.parse(rawResponse);

    // Cálculo de expiração
    const agora = new Date()
    const expiraEmSegundos = sbxData.expires_in || 18000
    const margemSegurancaMs = 15 * 60 * 1000
    const nossaExpiracao = new Date(agora.getTime() + (expiraEmSegundos * 1000) - margemSegurancaMs)

    // Gera o UUID no Deno antes de qualquer coisa
    const sessionToken = crypto.randomUUID();

    // Gravação no Supabase
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '')
    const infra = await captureInfrastructure(req);

    const { data, error } = await supabaseAdmin
      .from('sbx_sessions')
      .insert({ 
        session_token: sessionToken, 
        user_id: sbxData.userId, 
        sbx_access_token: sbxData.access_token, 
        environment, 
        expires_at: nossaExpiracao.toISOString(),
        // Mapeamento dos novos campos
        ip_address: infra.ip_address,
        country: infra.country,
        state: infra.state,
        city: infra.city,
        user_agent: infra.user_agent,
        device_type: infra.device_type,
        operating_system: infra.operating_system,
        origin_details: infra.metadata // O JSONB recebe o restante dos metadados
      });

    // Diagnóstico detalhado de erro de banco (Garante visibilidade)
    if (error) {
      console.error("[ERRO REAL DO BANCO]:", JSON.stringify(error, null, 2));
      throw new Error(`Erro ao criar sessão: ${error.message}`);
    }

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
        jti: sessionToken, // O UUID original como referência interna
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

  } catch (err: any) {
    console.error("Erro:", err)
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})