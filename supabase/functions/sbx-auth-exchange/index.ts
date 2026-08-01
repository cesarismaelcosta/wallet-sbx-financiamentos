/**
 * @fileoverview Edge Function: Auth Exchange SBX (Federation Proxy & JWT Signer)
 * 
 * ============================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * ============================================================================
 * Atua como um proxy de federação (Token Exchange). Intercepta o payload bruto 
 * do OAuth da Superbid, valida o token upstream, provisiona a sessão segura 
 * no banco de dados e assina o JWT interno, delegando o ciclo de segurança 
 * ao Wrapper Core (`withSecurity`).
 * 
 * [FLUXO DE EXECUÇÃO]:
 * 1. Extração de Payload: Captura o objeto bruto do OAuth e isola o `access_token`.
 * 2. Validação Upstream: Consulta a API externa (`/account/v2/user/me`) para garantir integridade.
 * 3. Fail-Fast (401): Intercepta tokens expirados ou revogados de forma imediata.
 * 4. Persistência de Estado: Grava o payload integral em `session_tokens` junto com os metadados de infra.
 * 5. Assinatura de Borda: Emite o JWT HMAC-SHA256 e injeta o cookie seguro de federação (SSR Bridge).
 * 
 * @author César Ismael Pereira da Costa
 * @version 2.2.1 (Alinhamento rigoroso com o padrão corporativo de comentários e JSDoc)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { withSecurity } from "../_shared/server.ts";
import { captureInfrastructure } from "../_shared/infrastructure.ts";
import { debugLog } from "../_shared/logger.ts";

/**
 * Configuração de CORS para suporte a requisições cross-origin controladas.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Mapeamento centralizado de endpoints da API upstream por ambiente de execução.
 */
const ENV_URLS = {
  production: "https://api.s4bdigital.net",
  staging: "https://stgapi.s4bdigital.net"
};

/**
 * [ENTRYPOINT]: Orquestrador principal encapsulado pelo Wrapper de Segurança.
 */
serve(withSecurity('sbx-auth-exchange', async (req: Request) => {

  try {
    // =========================================================================
    // 1. CAPTURA E EXTRAÇÃO DA FONTE ÚNICA (OAuth Payload Safe)
    // =========================================================================
    let { sbx_raw_token_payload, environment } = await req.json();

    // Validação estrita: Garante a integridade e a presença do objeto OAuth obrigatório
    if (!sbx_raw_token_payload || !sbx_raw_token_payload.access_token) {
      throw new Error("[sbx-auth-exchange] AUTH_REQUIRED: Payload bruto do OAuth ou access_token não fornecido.");
    }

    // Extração defensiva do token de acesso contido no payload bruto
    let sbx_access_token = sbx_raw_token_payload.access_token;

    if (typeof sbx_access_token === 'string') {
        const trimmedToken = sbx_access_token.trim();
        if (trimmedToken.startsWith('{') && trimmedToken.endsWith('}')) {
            try {
                const parsedTokenJson = JSON.parse(trimmedToken);
                if (parsedTokenJson.access_token) {
                    sbx_access_token = parsedTokenJson.access_token;
                    debugLog("[sbx-auth-exchange] JSON do OAuth detectado e parseado com segurança.");
                }
            } catch (e) {
                debugLog("[sbx-auth-exchange] Falha ao parsear string interna, mantendo valor original.", { error: String(e) });
            }
        } else {
            sbx_access_token = trimmedToken;
        }
    }

    // Validação estrita de Ambiente (Fail-Fast Architecture)
    if (!environment || (environment !== 'production' && environment !== 'staging')) {
      throw new Error("[sbx-auth-exchange] BAD_REQUEST: Ambiente (environment) não fornecido ou inválido. Exigido: 'production' ou 'staging'.");
    }
    
    const baseUrl = ENV_URLS[environment as keyof typeof ENV_URLS];

    // =========================================================================
    // 2. INTEGRAÇÃO: VALIDAÇÃO UPSTREAM (Superbid API Gateway)
    // =========================================================================
    const verifyResponse = await fetch(`${baseUrl}/account/v2/user/me`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${sbx_access_token}`,
        "Content-Type": "application/json"
      },
    });

    // Tratamento de Interceptação: Sessão expirada ou credencial revogada no provedor
    if (verifyResponse.status === 401) {
      throw new Error("[sbx-auth-exchange] SESSION_UPSTREAM_EXPIRED: O token real da Superbid é inválido ou expirou.");
    }
    
    // Tratamento de indisponibilidade sistêmica da API externa
    if (!verifyResponse.ok) {
      throw new Error(`[sbx-auth-exchange] UPSTREAM_API_UNAVAILABLE (${verifyResponse.status})`);
    }
    
    const upstreamData = await verifyResponse.json();
    const account = upstreamData.userAccounts?.[0];
    
    // Extração resiliente de identidade suportando múltiplos níveis de aninhamento
    const userId = account?.id ? String(account.id) : (upstreamData?.userAccounts?.find((acc: any) => acc?.id)?.id ? String(upstreamData.userAccounts.find((acc: any) => acc?.id).id) : "");

    if (!userId) {
      throw new Error("[sbx-auth-exchange] USER_NOT_FOUND: Falha ao extrair identidade do upstream.");
    }

    // =========================================================================
    // 3. PERSISTÊNCIA: CÁLCULO DE TTL E GRAVAÇÃO DE ESTADO
    // =========================================================================
    const agora = new Date();
    const expiraEmSegundos = 14400; // 4 horas de vigência padrão
    const margemSegurancaMs = 15 * 60 * 1000; // 15 minutos de tolerância antecipada
    const nossaExpiracao = new Date(agora.getTime() + (expiraEmSegundos * 1000) - margemSegurancaMs);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '', 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const sessionToken = crypto.randomUUID();
    const infra = await captureInfrastructure(req);

    const { data: sessionData, error: sessionError } = await supabaseAdmin
      .from('session_tokens')
      .insert({ 
        session_token: sessionToken, 
        user_id: userId, 
        sbx_access_token: sbx_access_token, 
        sbx_raw_token_payload: JSON.parse(JSON.stringify(sbx_raw_token_payload)),
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

    // =========================================================================
    // 4. SEGURANÇA: ASSINATURA CRIPTOGRÁFICA DO JWT INTERNO
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
        jti: sessionToken, 
        exp: getNumericDate(nossaExpiracao.getTime() / 1000) 
      },
      key
    );

    const isProd = Deno.env.get("ENVIRONMENT") === "production";
    const cookieHeader = `session_token=${jwt}; Path=/; HttpOnly; SameSite=Lax${
      isProd ? "; Domain=.seudominio.com.br; Secure" : ""
    }`;

    // =========================================================================
    // 5. RESPOSTA: CONTRATO DE SAÍDA PARA O CLIENTE
    // =========================================================================
    return { 
      status: 200, 
      data: {
        success: true,
        session_token: jwt, 
        user_id: userId,
        expires_at: Math.floor(nossaExpiracao.getTime() / 1000),
        server_now_ms: agora.getTime()
      },
      headers: { 
        'Set-Cookie': cookieHeader 
      }
    };

  } catch (err: any) {
    debugLog("[sbx-auth-exchange] Fatal Exception:", err.message);
    
    let status = 500;

    // Classificação semântica de status HTTP baseada no contexto da falha
    if (
      err.message.includes("AUTH") || 
      err.message.includes("SESSION") || 
      err.message.includes("EXPIRED")
    ) {
      status = 401;
    } else if (err.message.includes("UPSTREAM_API_UNAVAILABLE")) {
      status = 502;
    }

    return { 
      status: status, 
      data: { 
        success: false, 
        message: err.message 
      } 
    };
  }
}));