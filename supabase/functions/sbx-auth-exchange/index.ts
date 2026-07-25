/**
 * @fileoverview Edge Function: Auth Exchange SBX (Federation Proxy, JWT Signer & Cookie Issuer)
 *
 * ARQUITETURA E CLEAN ARCHITECTURE:
 * Atua como um Gateway de Federação de Identidade (Token Exchange). Esta função recebe um token
 * de acesso externo oriundo do ecossistema Superbid (`sbx_access_token`), valida a autenticidade
 * e vivacidade da sessão no upstream (`/account/v2/user/me`), registra a sessão interna na tabela
 * de auditoria (`session_tokens`) e emite o JWT Próprio via Cookie `HttpOnly`.
 *
 * PRINCIPAIS RESPONSABILIDADES & FLUXO DE SEGURANÇA:
 * 1. Validação de Entrada & Fail-Fast: Exige `sbx_access_token` e valida se `environment` é 'production' ou 'staging'.
 * 2. Validação Upstream (Superbid API): Bate no endpoint `/account/v2/user/me` da Superbid usando o token informado.
 *    Se o servidor upstream retornar HTTP 401, a troca de tokens é negada imediatamente.
 * 3. SSOT & Auditoria de Infraestrutura: Captura metadados do cliente (IP, Geo, Device, User-Agent) via `captureInfrastructure`
 *    e grava a sessão única (`session_token`) na tabela `session_tokens` do Supabase.
 * 4. Assinatura do JWT Próprio com Contexto: Gera um JWT HMAC-SHA256 assinado com `JWT_SECRET` contendo as claims:
 *    - `sub`: ID único do usuário na Superbid.
 *    - `jti`: UUID da sessão gerado para controle na tabela `session_tokens`.
 *    - `environment`: Claim customizada ("staging" | "production") para validação Zero-DB em microsserviços.
 *    - `exp`: Timestamp de expiração com margem de segurança de 15 minutos (T-15m).
 * 5. Emissão de Cookie HttpOnly: Define o header `Set-Cookie` com flags `HttpOnly`, `SameSite=Lax` e `Secure`,
 *    garantindo compartilhamento seguro entre subdomínios da Superbid (`.superbid.net`).
 *
 * @author César Ismael Pereira da Costa
 * @version 2.2.0 (Injeção de Claim de Ambiente, HttpOnly Cookie Native Response e Standard Docs)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

// Importações de infraestrutura e utilitários compartilhados
import { withSecurity } from "../_shared/server.ts";
import { captureInfrastructure } from "../_shared/infrastructure.ts";
import { debugLog } from "../_shared/logger.ts";

/**
 * Mapeamento centralizado de URLs base da API da Superbid por ambiente
 */
const ENV_URLS = {
  production: "https://api.s4bdigital.net",
  staging: "https://stgapi.s4bdigital.net"
};

// =========================================================================
// [ENTRYPOINT]: Processamento envelopado pelo Wrapper Central de Segurança
// =========================================================================
serve(withSecurity('sbx-auth-exchange', async (req: Request) => {

  try {
    // -----------------------------------------------------------------------
    // STEP 1: PARSING DA REQUISIÇÃO & VALIDAÇÃO ESTRITA DE ENTRADA
    // -----------------------------------------------------------------------
    const { sbx_access_token, environment } = await req.json();

    // Validação de presença do token de parceiro externo
    if (!sbx_access_token) {
      throw new Error("[sbx-auth-exchange] AUTH_REQUIRED: Token externo (sbx_access_token) não fornecido.");
    }

    // Validação do parâmetro de ambiente para prevenção de chamadas ambíguas
    if (!environment || (environment !== 'production' && environment !== 'staging')) {
      throw new Error("[sbx-auth-exchange] BAD_REQUEST: Ambiente (environment) não fornecido ou inválido. Exigido: 'production' ou 'staging'.");
    }
    
    const baseUrl = ENV_URLS[environment as keyof typeof ENV_URLS];

    // -----------------------------------------------------------------------
    // STEP 2: INTEGRAÇÃO & VALIDAÇÃO UPSTREAM (Superbid API)
    // Executa handshake com a API da Superbid para garantir token ativo
    // -----------------------------------------------------------------------
    debugLog("[sbx-auth-exchange] Validando token upstream em:", `${baseUrl}/account/v2/user/me`);

    const verifyResponse = await fetch(`${baseUrl}/account/v2/user/me`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${sbx_access_token}`,
        "Content-Type": "application/json"
      },
    });

    // Interceptação de token revogado, adulterado ou expirado na Superbid
    if (verifyResponse.status === 401) {
      throw new Error("[sbx-auth-exchange] SESSION_UPSTREAM_EXPIRED: O token real da Superbid é inválido ou expirou.");
    }
    
    // Tratamento para indisponibilidade temporária ou erros no servidor da Superbid
    if (!verifyResponse.ok) {
      throw new Error(`[sbx-auth-exchange] UPSTREAM_API_UNAVAILABLE (${verifyResponse.status})`);
    }

    const upstreamData = await verifyResponse.json();
    const account = upstreamData.userAccounts?.[0];
    const userId = String(account?.id);

    // Validação da extração de identidade do usuário
    if (!userId || userId === "undefined") {
      throw new Error("[sbx-auth-exchange] USER_NOT_FOUND: Falha ao extrair a identidade do usuário no upstream.");
    }

    // -----------------------------------------------------------------------
    // STEP 3: CÁLCULO DE TTL & REGISTRO DE SESSÃO NO BANCO DE DADOS (SSOT)
    // -----------------------------------------------------------------------
    const agora = new Date();
    const expiraEmSegundos = 14400; // 4 Horas de validade padrão
    const margemSegurancaMs = 15 * 60 * 1000; // Margem de expiração T-15m
    const nossaExpiracao = new Date(agora.getTime() + (expiraEmSegundos * 1000) - margemSegurancaMs);

    const sessionToken = crypto.randomUUID();

    // Inicialização do cliente Supabase Admin via Service Role
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '', 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Captura estritamente auditada da infraestrutura do cliente
    const infra = await captureInfrastructure(req);

    const { data: sessionData, error: sessionError } = await supabaseAdmin
      .from('session_tokens')
      .insert({ 
        session_token: sessionToken, 
        user_id: userId, 
        sbx_access_token: sbx_access_token, 
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
      throw new Error(`[sbx-auth-exchange] DATABASE_ERROR: Erro ao persistir sessão -> ${sessionError?.message}`);
    }

    // -----------------------------------------------------------------------
    // STEP 4: ASSINATURA DO JWT PRÓPRIO (Com Claim de Ambiente)
    // -----------------------------------------------------------------------
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) {
      throw new Error("[sbx-auth-exchange] INTERNAL_CONFIG_ERROR: JWT_SECRET não configurado no ambiente.");
    }

    const key = await crypto.subtle.importKey(
      "raw", 
      new TextEncoder().encode(jwtSecret), 
      { name: "HMAC", hash: "SHA-256" }, 
      false, 
      ["sign"]
    );

    // Geração do JWT assinado contendo a claim customizada 'environment'
    const jwt = await create(
      { alg: "HS256", typ: "JWT" },
      { 
        sub: userId,                                          // ID público do usuário
        jti: sessionToken,                                    // UUID da sessão no banco de dados
        environment: environment,                             // Claim de Ambiente ("staging" | "production")
        exp: getNumericDate(nossaExpiracao.getTime() / 1000)  // Data de expiração numérica
      },
      key
    );

    // -----------------------------------------------------------------------
    // STEP 5: MONTAGEM DO COOKIE HTTPONLY E RESPOSTA NATIVA
    // -----------------------------------------------------------------------
    const isProd = Deno.env.get("ENVIRONMENT") === "production";
    const cookieHeader = `session_token=${jwt}; Path=/; HttpOnly; SameSite=Lax${
      isProd ? "; Domain=.superbid.net; Secure" : ""
    }`;

    // Retorna a Response HTTP nativa para garantir a preservação do header Set-Cookie pelo Deno
    return new Response(JSON.stringify({
      success: true,
      session_token: jwt,
      user_id: userId,
      environment: environment,
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
    debugLog("[sbx-auth-exchange] Exceção capturada:", err.message);
    
    let status = 500;

    // Categorização dos erros para status HTTP semânticos
    if (
      err.message.includes("AUTH") || 
      err.message.includes("SESSION") || 
      err.message.includes("EXPIRED")
    ) {
      status = 401;
    } else if (err.message.includes("BAD_REQUEST")) {
      status = 400;
    } else if (err.message.includes("UPSTREAM_API_UNAVAILABLE")) {
      status = 502;
    }

    // Retorna o formato de erro estruturado
    return new Response(JSON.stringify({ 
      success: false, 
      error: err.message 
    }), {
      status: status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}));