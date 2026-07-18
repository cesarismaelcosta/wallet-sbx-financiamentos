/**
 * @fileoverview Edge Function: Auth SBX (Login Proxy & JWT Signer)
 * 
 * ARQUITETURA DE SEGURANÇA E CONTEXTO:
 * Esta função atua como um proxy seguro para o login na API da Superbid (SBX).
 * Ela gerencia o ciclo completo de autenticação e delega o controle de CORS 
 * para o Wrapper Central (withSecurity).
 * 
 * RESPONSABILIDADES:
 * 1. Seleção dinâmica de ambiente ('staging' ou 'production').
 * 2. Requisição OAuth2 com credenciais (client_id/portalid) ocultas no servidor.
 * 3. Cálculo de TTL (Time To Live) da sessão com margem de segurança (15 min).
 * 4. Gravação da sessão no banco de dados (session_tokens) com metadados de infra.
 * 5. Assinatura HMAC-SHA256 do JWT Próprio para Segurança Passiva.
 * 6. Injeção dinâmica de Cookie (HttpOnly) via retorno nativo (Retrocompatibilidade).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { captureInfrastructure } from "../_shared/infrastructure.ts";
import { OriginDetails } from "../_shared/types.ts";

// [INFRAESTRUTURA]: Importação do motor central de segurança e CORS
import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
import { debugLog } from "../_shared/logger.ts";

const ENV_URLS = {
  production: "https://api.s4bdigital.net",
  staging: "https://stgapi.s4bdigital.net"
};

// [ENTRYPOINT]: Envelopamento da regra de negócio com o Wrapper de Infraestrutura
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
        body: rawResponse,
        sentBody: details.toString() 
      });
      throw new Error(`Credenciais inválidas ou erro na API: ${sbxLoginResponse.status}`);
    }

    const sbxData = JSON.parse(rawResponse);
    debugLog("DEBUG [sbx-auth] - Resposta da API:", JSON.stringify(sbxData, null, 2));

    // -----------------------------------------------------------------------
    // [ESTADO]: Cálculo de Expiração e Geração de UUID Primário
    // -----------------------------------------------------------------------
    const agora = new Date();
    const expiraEmSegundos = sbxData.expires_in || 18000;
    const margemSegurancaMs = 15 * 60 * 1000;
    const nossaExpiracao = new Date(agora.getTime() + (expiraEmSegundos * 1000) - margemSegurancaMs);

    const sessionToken = crypto.randomUUID();

    // -----------------------------------------------------------------------
    // [PERSISTÊNCIA]: Gravação da Sessão (SSOT)
    // -----------------------------------------------------------------------
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
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

    if (sessionError) {
      throw new Error(`[sbx-auth] DATABASE_ERROR: Erro ao criar sessão -> ${sessionError?.message}`);
    }

    if (!sessionData) {
      throw new Error("DATABASE_ERROR: Sessão criada mas nenhum dado foi retornado.");
    }

    // -----------------------------------------------------------------------
    // [SECURITY]: Assinatura do JWT Próprio e Injeção de Cookie
    // -----------------------------------------------------------------------
    const jwtSecret = Deno.env.get("JWT_SECRET"); 
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );

    const jwt = await create(
      { alg: "HS256", typ: "JWT" },
      { 
        sub: sbxData.userId, 
        jti: sessionToken, 
        exp: getNumericDate(nossaExpiracao.getTime() / 1000) 
      },
      key
    );

    const isProd = Deno.env.get("ENVIRONMENT") === "production";
    const cookieHeader = `session_token=${jwt}; Path=/; HttpOnly; SameSite=Lax${
      isProd ? "; Domain=.seudominio.com.br; Secure" : ""
    }`;

    // [OUTPUT SUCESSO]: Utilização de Response Nativo para preservar a mecânica do Set-Cookie.
    // O Wrapper interceptará este objeto e acoplará os headers de CORS dinâmicos.
    return new Response(JSON.stringify({
      success: true,
      session_token: jwt, 
      user_id: sbxData.userId,
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
    console.error("Erro:", err);
    // [OUTPUT ERRO]: Delegação para o StandardResponse do Wrapper.
    // Produzirá o formato exato: {"error": "mensagem do catch"} mantendo o front-end intacto.
    return { status: 500, error: err.message };
  }
}));