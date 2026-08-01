/**
 * @fileoverview Edge Function: Auth SBX (Login Proxy, JWT Signer & Cookie Issuer)
 * @path supabase/functions/sbx-auth/index.ts
 * 
 * =========================================================================
 * [ARQUITETURA BFF & SEGURANÇA DE IDENTIDADE]
 * =========================================================================
 * Atua como o ponto de entrada oficial para autenticação de usuários via credenciais 
 * diretas (Username/Password), abstraindo a comunicação com o OAuth2 upstream da Superbid.
 * 
 * =========================================================================
 * [EXPLANATION: FORMATO DOS TOKENS E LÓGICA DE IDENTIFICAÇÃO]
 * =========================================================================
 * 1. Token Bruto da Superbid (Upstream):
 *    - Formato: String opaca / hexadecimal (Ex: "2a55e6a0f90cc3c7ffe44fbbc736053").
 *    - Natureza: Não possui pontos (.), logo falha no teste `split('.').length === 3`.
 *    - Propósito: Chave oficial de acesso às APIs externas da Superbid (/me, /offers).
 * 
 * 2. Nosso JWT Interno (Gerado no Step 4 abaixo):
 *    - Formato: Padrão RFC 7519 composto por 3 partes Base64URL separadas por pontos (.)
 *      Ex: `eyJhbGciOiJIUzI1Ni... [Header] . eyJzdWIiOiIxODQ3OTE5Ii... [Payload] . Assinatura_HMAC`
 *    - Natureza: Possui exatamente 3 partes, passando no teste `split('.').length === 3`.
 *    - Payload Interno:
 *      {
 *        "sub": "1847919",                                    // ID do usuário (userId)
 *        "jti": "d3b07384-d113-4p91-a832-511739c9f821",       // UUID correspondente ao session_token no banco
 *        "environment": "staging",                            // Contexto de ambiente
 *        "exp": 1785860000                                    // Timestamp de expiração
 *      }
 *    - Propósito: Crachá seguro emitido para o navegador (via Cookie HttpOnly ou Storage).
 *      A borda (financial-gateway-gate) o valida via HMAC-SHA256 e resgata o token 
 *      opaco da Superbid correspondente no cofre da tabela `session_tokens`.
 * =========================================================================
 * 
 * RESPONSABILIDADES:
 * 1. Roteamento Multi-Environment: Direciona o handshake para o ambiente correto 
 *    (`staging` ou `production`) com base na preferência fornecida.
 * 2. Proxy OAuth2 Seguro: Executa a troca de credenciais de forma isolada no servidor,
 *    impedindo a exposição de client IDs e tokens de acesso brutos no client-side.
 * 3. SSOT (Single Source of Truth): Persiste a sessão intermediária na tabela `session_tokens` 
 *    do Supabase associando o IP, metadados de infraestrutura e o token upstream.
 * 4. Assinatura Criptográfica (JWT): Gera um token interno próprio (HMAC-SHA256) com claims 
 *    customizadas (incluindo o contexto de `environment`) e TTL gerenciado.
 * 5. Smart Delivery de Sessão: Emite o token por meio de um Cookie HttpOnly seguro e 
 *    retorna os metadados estruturados para o ecossistema do front-end.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { captureInfrastructure } from "../_shared/infrastructure.ts";
import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";

/**
 * Mapeamento centralizado de URLs base da API de Contas da Superbid por ambiente
 */
const ENV_URLS = {
  production: "https://api.s4bdigital.net",
  staging: "https://stgapi.s4bdigital.net"
};

// =========================================================================
// HANDLER PRINCIPAL (Envelopado pelo Wrapper Central de Segurança)
// =========================================================================
serve(withSecurity('sbx-auth', async (req) => {
  // Captura o IP real do cliente com fallback seguro
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0] || '0.0.0.0';

  try {
    // Extrai as credenciais e o ambiente alvo do payload JSON enviado pelo Front
    const { username, password, environment = 'staging' } = await req.json();

    // -----------------------------------------------------------------------
    // [STEP 1] INTEGRAÇÃO UPSTREAM: Handshake OAuth2 com a Superbid
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
    
    // Tratamento de falha de autenticação upstream
    if (!sbxLoginResponse.ok) {
      debugLog("[sbx-auth] ERRO REAL DA SBX:", {
        status: sbxLoginResponse.status,
        body: rawResponse
      });
      throw new Error(`Credenciais inválidas ou erro na API: ${sbxLoginResponse.status}`);
    }

    const sbxData = JSON.parse(rawResponse);

    // -----------------------------------------------------------------------
    // [STEP 2] GESTÃO DE ESTADO: Cálculo de TTL e Geração de UUID
    // -----------------------------------------------------------------------
    const agora = new Date();
    const expiraEmSegundos = sbxData.expires_in || 18000;
    const margemSegurancaMs = 15 * 60 * 1000; // Margem de segurança preventiva (T-15m)
    const nossaExpiracao = new Date(agora.getTime() + (expiraEmSegundos * 1000) - margemSegurancaMs);

    const sessionToken = crypto.randomUUID();

    // -----------------------------------------------------------------------
    // [STEP 3] PERSISTÊNCIA (SSOT): Gravação da Sessão no Banco de Dados
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
        sbx_access_token: sbxData.access_token, // Salva o acess_token da sbX no cofre
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
    // [STEP 4] SEGURANÇA: Assinatura do JWT Interno (HMAC-SHA256)
    // -----------------------------------------------------------------------
    const jwtSecret = Deno.env.get("JWT_SECRET"); 
    if (!jwtSecret) throw new Error("INTERNAL_CONFIG_ERROR: JWT_SECRET não configurado.");

    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );

    // Constrói o token JWT contendo claims padronizadas e o contexto de ambiente
    const jwt = await create(
      { alg: "HS256", typ: "JWT" },
      { 
        sub: sbxData.userId,             // Subject (Identificador do usuário)
        jti: sessionToken,               // JWT ID (Vinculado ao registro da sessão no DB)
        environment: environment,        // Claim customizada para roteamento multi-stage
        exp: getNumericDate(nossaExpiracao.getTime() / 1000) // Timestamp de expiração
      },
      key
    );

    // Configuração estrita do Cookie HttpOnly para mitigação de ataques XSS
    const isProd = Deno.env.get("ENVIRONMENT") === "production";
    const cookieHeader = `session_token=${jwt}; Path=/; HttpOnly; SameSite=Lax${
      isProd ? "; Domain=.superbid.net; Secure" : ""
    }`;

    // -----------------------------------------------------------------------
    // [STEP 5] OUTPUT: Contrato Padronizado para o Wrapper de Segurança
    // -----------------------------------------------------------------------
    return {
      status: 200,
      data: {
        success: true,
        session_token: jwt,
        user_id: sbxData.userId,
        environment: environment,
        expires_at: Math.floor(nossaExpiracao.getTime() / 1000),
        server_now_ms: agora.getTime()
      },
      headers: {
        'Set-Cookie': cookieHeader
      }
    };

  } catch (err: any) {
    debugLog("[sbx-auth] Erro no fluxo de login:", err);
    
    // Retorno padronizado de erro em conformidade com o ecossistema BFF
    return { 
      status: 500, 
      data: { 
        success: false, 
        message: err.message 
      } 
    };
  }
}));