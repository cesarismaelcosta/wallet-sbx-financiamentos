/**
 * @fileoverview Edge Function: Auth Exchange SBX (Federation Proxy & JWT Signer)
 * * ARQUITETURA DE SEGURANÇA E CONTEXTO:
 * Esta função atua como um proxy de federação (Token Exchange).
 * Ela recebe um token externo (Superbid), valida no upstream (como o sbx-user),
 * e se for válido, gera a sessão interna e assina o JWT (como o sbx-auth).
 * * * [RESPONSABILIDADES]:
 * 1. Validação Upstream: Bate no /account/v2/user/me para garantir que o token externo é quente.
 * 2. Prevenção: Intercepta tokens parceiros expirados (401) e nega a troca.
 * 3. Sessão Intermediária: Grava na tabela `sbx_sessions` para controle de estado.
 * 4. Assinatura Local: Gera o JWT HMAC-SHA256 para o frontend consumir de forma segura.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { captureInfrastructure } from "../_shared/infrastructure.ts";
import { OriginDetails } from "../_shared/types.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENV_URLS = {
  production: "https://api.s4bdigital.net",
  staging: "https://stgapi.s4bdigital.net"
};

serve(async (req) => {
  // =========================================================================
  // 1. HANDSHAKE (OPTIONS) - Preflight CORS
  // =========================================================================
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Lendo 'sbx_access_token' e 'environment' do JSON recebido do front-end
    const { sbx_access_token, environment} = await req.json();

    // Validando a presença do token sbx_access_token
    if (!sbx_access_token) {
      throw new Error("[sbx-auth-exchange] AUTH_REQUIRED: Token externo (sbx_access_token) não fornecido.");
    }

    // Validação estrita do Ambiente (Fail-fast)
    if (!environment || (environment !== 'production' && environment !== 'staging')) {
      throw new Error("[sbx-auth-exchange] BAD_REQUEST: Ambiente (environment) não fornecido ou inválido. Exigido: 'production' ou 'staging'.");
    }
    
    const baseUrl = ENV_URLS[environment as keyof typeof ENV_URLS];

    // =========================================================================
    // 2. INTEGRAÇÃO: VALIDAÇÃO UPSTREAM (Superbid API - Baseado no sbx-user)
    // =========================================================================
    const verifyResponse = await fetch(`${baseUrl}/account/v2/user/me`, {
      method: "GET",
      headers: {
        // AJUSTE 3: Passando o token para a API Upstream
        "Authorization": `Bearer ${sbx_access_token}`,
        "Content-Type": "application/json"
      },
    });

    // Interceptação de Token do Parceiro Expirado / Revogado
    if (verifyResponse.status === 401) {
      throw new Error("[sbx-auth-exchange] SESSION_UPSTREAM_EXPIRED: O token real da Superbid é inválido ou expirou.");
    }
    
    // Tratamento de indisponibilidade da API externa
    if (!verifyResponse.ok) {
      throw new Error(`[sbx-auth-exchange] UPSTREAM_API_UNAVAILABLE (${verifyResponse.status})`);
    }

    const upstreamData = await verifyResponse.json();
    const account = upstreamData.userAccounts?.[0];
    const userId = String(account?.id);

    if (!userId || userId === "undefined") {
      throw new Error("[sbx-auth-exchange] USER_NOT_FOUND: Falha ao extrair identidade do upstream.");
    }

    // =========================================================================
    // 3. ESTADO: CÁLCULO DE TTL E GRAVAÇÃO (Baseado no sbx-auth)
    // =========================================================================
    const agora = new Date();
    // 4 horas de TTL padrão para a sessão trocada
    const expiraEmSegundos = 14400; 
    const margemSegurancaMs = 15 * 60 * 1000;
    const nossaExpiracao = new Date(agora.getTime() + (expiraEmSegundos * 1000) - margemSegurancaMs);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '', 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Gera o UUID no Deno antes de qualquer coisa
    const sessionToken = crypto.randomUUID();

    // Busca informações de infraestrutura do request (IP, User-Agent, etc.)
    const infra = await captureInfrastructure(req);

    // Salva a sessão no Supabase com os detalhes do usuário e metadados de infraestrutura
    const { data: sessionData, error: sessionError } = await supabaseAdmin
      .from('sbx_sessions')
      .insert({ 
        session_token: sessionToken, 
        user_id: userId, 
        sbx_access_token: sbx_access_token, 
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
      })
      .select();

    if (sessionError) {
      throw new Error(`[sbx-auth] DATABASE_ERROR: Erro ao criar sessão -> ${sessionError?.message}`);
    }

    if (!sessionData) {
      throw new Error("DATABASE_ERROR: Sessão criada mas nenhum dado foi retornado.");
    }

    // =========================================================================
    // 4. SEGURANÇA: ASSINATURA DO JWT PRÓPRIO (Baseado no sbx-auth)
    // =========================================================================
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) throw new Error("[sbx-auth-exchange] INTERNAL_CONFIG_ERROR: JWT_SECRET não configurado.");

    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );

    const jwt = await create(
      { alg: "HS256", typ: "JWT" },
      { 
        sub: userId, 
        jti: sessionToken, // UUID original como referência interna
        exp: getNumericDate(nossaExpiracao.getTime() / 1000) 
      },
      key
    );

    // =========================================================================
    // 5. RETORNO PARA O FRONTEND
    // =========================================================================
    return new Response(JSON.stringify({
      success: true,
      session_token: jwt, 
      user_id: userId,
      expires_at: Math.floor(nossaExpiracao.getTime() / 1000),
      server_now_ms: agora.getTime()
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (err: any) {
    console.error("[sbx-auth-exchange] Fatal Exception:", err.message);
    
    let status = 500;
    if (err.message.includes("AUTH") || err.message.includes("SESSION") || err.message.includes("EXPIRED")) {
      status = 401;
    } else if (err.message.includes("UPSTREAM_API_UNAVAILABLE")) {
      status = 502;
    }

    const errorResponse = status === 401 ? err.message : "INTERNAL_SERVER_ERROR";

  return new Response(JSON.stringify({ 
    success: false, 
    message: err.message 
    }), { 
      status: status, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});