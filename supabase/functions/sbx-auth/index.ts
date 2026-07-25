/**
 * @fileoverview Edge Function: Auth SBX (Login Proxy, JWT Signer & Cookie Issuer)
 *
 * ARQUITETURA DE SEGURANÇA E CONTEXTO:
 * Esta função atua como um proxy seguro de autenticação para a API da Superbid (SBX).
 * Ela oculta credenciais upstream, gera sessões persistentes no banco de dados e emite
 * um JWT assinado com claims de contexto (User ID, Session ID e Ambiente) via Cookie HttpOnly.
 *
 * RESPONSABILIDADES:
 * 1. Seleção Dinâmica de Ambiente ('staging' ou 'production').
 * 2. Requisição OAuth2 Upstream com credenciais protegidas no servidor.
 * 3. Gravação da Sessão Única (SSOT) no banco de dados (`session_tokens`).
 * 4. Assinatura do JWT Próprio (HMAC-SHA256) incluindo a claim `environment`.
 * 5. Emissão do Header `Set-Cookie` com flags `HttpOnly`, `SameSite` e `Secure`.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { captureInfrastructure } from "../_shared/infrastructure.ts";
import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";

const ENV_URLS = {
  production: "https://api.s4bdigital.net",
  staging: "https://stgapi.s4bdigital.net"
};

serve(withSecurity('sbx-auth', async (req) => {
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || '0.0.0.0';

  try {
    const { username, password, environment = 'staging' } = await req.json();

    // -----------------------------------------------------------------------
    // [INTEGRAÇÃO]: Handshake OAuth2 com a Superbid (Upstream)
    // -----------------------------------------------------------------------
    const sbxBaseUrl = ENV_URLS[environment as keyof typeof ENV_URLS];
    const details = new URLSearchParams();
    details.append("username", username);
    details.append("password", password);
    details.append("grant_type", "password");
    details.append("client_id", "dzqC3VodSoXukD45BQKg3NQU6-faststore");
    details.append("portalid", "2");

    const sbxLoginResponse = await fetch(`${sbxBaseUrl}/account/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Forwarded-For': clientIp },
      body: details.toString()
    });

    const rawResponse = await sbxLoginResponse.text();
    
    if (!sbxLoginResponse.ok) {
      debugLog("[sbx-auth] ERRO REAL DA SBX:", {
        status: sbxLoginResponse.status,
        body: rawResponse
      });
      throw new Error(`Credenciais inválidas ou erro na API: ${sbxLoginResponse.status}`);
    }

    const sbxData = JSON.parse(rawResponse);

    // -----------------------------------------------------------------------
    // [ESTADO]: Cálculo de Expiração e Geração de UUID da Sessão
    // -----------------------------------------------------------------------
    const agora = new Date();
    const expiraEmSegundos = sbxData.expires_in || 18000;
    const margemSegurancaMs = 15 * 60 * 1000; // Margem T-15m
    const nossaExpiracao = new Date(agora.getTime() + (expiraEmSegundos * 1000) - margemSegurancaMs);

    const sessionToken = crypto.randomUUID();

    // -----------------------------------------------------------------------
    // [PERSISTÊNCIA]: Gravação da Sessão (SSOT)
    // -----------------------------------------------------------------------
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '', 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const infra = await captureInfrastructure(req);

    const { data: sessionData, error: sessionError } = await supabaseAdmin
      .from('session_tokens')
      .insert({ 
        session_token: sessionToken, 
        user_id: sbxData.userId, 
        sbx_access_token: sbxData.access_token, 
        environment, 
        expires_at: nossaExpiracao.toISOString(),
        ip_address: infra.ip_address,
        country: infra.country,
        state: infra.state,
        city: infra.city,
        user_agent: infra.user_agent,
        device_type: infra.device_type,
        operating_system: infra.operating_system,
        origin_details: infra.metadata 
      })
      .select();

    if (sessionError || !sessionData) {
      throw new Error(`DATABASE_ERROR: Erro ao criar sessão -> ${sessionError?.message}`);
    }

    // -----------------------------------------------------------------------
    // [SECURITY]: Assinatura do JWT Próprio com Claim de Ambiente
    // -----------------------------------------------------------------------
    const jwtSecret = Deno.env.get("JWT_SECRET"); 
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );

    // Payload do JWT com claims padronizadas RFC 7519 + Custom Claims
    const jwt = await create(
      { alg: "HS256", typ: "JWT" },
      { 
        sub: sbxData.userId,           // Subject (ID do usuário)
        jti: sessionToken,             // JWT ID (ID único da sessão no DB)
        environment: environment,      // 👈 CLAIM CUSTOMIZADA: "staging" | "production"
        exp: getNumericDate(nossaExpiracao.getTime()) // Expiration Time
      },
      key
    );

    const isProd = Deno.env.get("ENVIRONMENT") === "production";
    const cookieHeader = `session_token=${jwt}; Path=/; HttpOnly; SameSite=Lax${
      isProd ? "; Domain=.superbid.net; Secure" : ""
    }`;

    // -----------------------------------------------------------------------
    // [OUTPUT]: Retorno HTTP com o Cookie HttpOnly e Dados de UI em Memória
    // -----------------------------------------------------------------------
    return new Response(JSON.stringify({
      success: true,
      session_token: jwt,
      user_id: sbxData.userId,
      environment: environment,       // Retorna no JSON apenas para confirmação do contexto de UI
      expires_at: Math.floor(nossaExpiracao.getTime() / 1000),
      server_now_ms: agora.getTime()
    }), { 
      status: 200, 
      headers: { 
        'Content-Type': 'application/json',
        'Set-Cookie': cookieHeader 
      } 
    });

  } catch (err: any) {
    console.error("[sbx-auth] Erro no fluxo de login:", err);
    return { status: 500, error: err.message };
  }
}));