/**
 * @fileoverview Edge Function: Auth SBX (Login Proxy)
 * 
 * Esta função atua como um proxy seguro para o login na API da Superbid (SBX).
 * Ela gerencia:
 * 1. A seleção dinâmica de ambiente ('staging' ou 'production').
 * 2. A requisição OAuth2 usando client_id e portalid ocultos no servidor.
 * 3. O cálculo dinâmico da expiração do token (com margem de segurança de 15 min).
 * 4. A gravação segura da sessão no banco de dados, retornando apenas um 
 *    session_token (UUID) e o user_id para o front-end.
 * 
 * --------------------------------------------------------------------------------
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

// =========================================================================
// CONFIGURAÇÕES GERAIS E CORS
// =========================================================================
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ENV_URLS = {
  production: "https://api.s4bdigital.net",
  staging: "https://stgapi.s4bdigital.net"
}

// =========================================================================
// FUNÇÃO PRINCIPAL: Handler
// =========================================================================
serve(async (req) => {
  // ---------------------------------------------------------------------------
  // TRATAMENTO PREFLIGHT (CORS para o Browser)
  // ---------------------------------------------------------------------------
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ---------------------------------------------------------------------------
    // EXTRAÇÃO E VALIDAÇÃO DE PAYLOAD
    // ---------------------------------------------------------------------------
    const { username, password, environment = 'staging' } = await req.json()

    // Proteção rigorosa do escopo de ambiente (Fail Fast)
    if (environment !== 'staging' && environment !== 'production') {
      return new Response(JSON.stringify({ error: "Invalid environment. Use 'staging' or 'production'." }), { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // ---------------------------------------------------------------------------
    // COMUNICAÇÃO COM A SUPERBID (OAuth2)
    // ---------------------------------------------------------------------------
    const sbxBaseUrl = ENV_URLS[environment as keyof typeof ENV_URLS]
    
    // Normaliza a payload para x-www-form-urlencoded
    const details = new URLSearchParams()
    details.append("username", username)
    details.append("password", password)
    details.append("grant_type", "password")
    details.append("client_id", "dzqC3VodSoXukD45BQKg3NQU6-faststore")
    details.append("portalid", "2")

    const sbxLoginResponse = await fetch(`${sbxBaseUrl}/account/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: details.toString()
    })

    if (!sbxLoginResponse.ok) {
      return new Response(JSON.stringify({ error: "Credenciais inválidas na SBX" }), { 
        status: 401, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    const sbxData = await sbxLoginResponse.json()

    // ---------------------------------------------------------------------------
    // CÁLCULO DE EXPIRAÇÃO DINÂMICA
    // ---------------------------------------------------------------------------
    const agora = new Date()
    const expiraEmSegundos = sbxData.expires_in || 18000 // Fallback de 5 horas (18000s)
    const margemSegurancaMs = 15 * 60 * 1000             // Margem de 15 minutos em ms
    
    // Matemática: (Agora) + (Vida útil do Token da SBX) - (Nossa margem de segurança)
    const nossaExpiracao = new Date(agora.getTime() + (expiraEmSegundos * 1000) - margemSegurancaMs)

    // ---------------------------------------------------------------------------
    // GRAVAÇÃO DA SESSÃO NO COFRE (Supabase)
    // ---------------------------------------------------------------------------
    // Inicializa o admin client internamente para usar as variáveis de ambiente
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data, error } = await supabaseAdmin
      .from('sbx_sessions')
      .insert({
        user_id: sbxData.userId, 
        sbx_access_token: sbxData.access_token,
        environment: environment,
        expires_at: nossaExpiracao.toISOString()
      })
      .select('session_token')
      .single()

    if (error) {
      console.error("Erro crítico na gravação do banco:", error)
      return new Response(JSON.stringify({ error: "Erro interno ao criar sessão" }), { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      })
    }

    // ---------------------------------------------------------------------------
    // RESPOSTA DE SUCESSO AO FRONT-END
    // ---------------------------------------------------------------------------
    return new Response(JSON.stringify({
      session_token: data.session_token,
      user_id: sbxData.userId
    }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })

  } catch (err) {
    // ---------------------------------------------------------------------------
    // FALLBACK DE ERROS CRÍTICOS
    // ---------------------------------------------------------------------------
    console.error("Exceção não tratada na Edge Function:", err)
    return new Response(JSON.stringify({ error: "Falha de rede ou servidor interno" }), { 
      status: 500, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    })
  }
})