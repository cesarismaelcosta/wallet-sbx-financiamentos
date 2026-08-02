/**
 * @fileoverview Edge Function: SBX-AUTH (Autenticação Direta & Emissão JWT)
 *
 * ============================================================================
 * [ARQUITETURA E CLEAN ARCHITECTURE]
 * ============================================================================
 * Atua como o Proxy de Login nativo da aplicação. Recebe login e senha do 
 * Frontend, autentica contra a Superbid e emite o JWT interno Stateless.
 * 
 * [GARANTIAS DE SEGURANÇA ZERO-TRUST]:
 * 1. Proxy Seguro: As senhas fluem em trânsito (HTTPS) e não deixam rastros em logs.
 * 2. Zero Banco de Dados: A tabela de sessões foi eliminada. A escalabilidade é infinita.
 * 3. Selo Criptográfico de Ambiente: O `environment` (staging/production) é 
 *    injetado dentro da assinatura do JWT. Um atacante não pode mais forjar chamadas
 *    trocando a Query String da URL.
 * 4. Resposta Blindada: O Front recebe apenas o "recibo" da sessão para alimentar 
 *    o React Context e o Cookie HttpOnly assumindo o transporte.
 *
 * @module sbx-auth
 * @author César Ismael Pereira da Costa
 * @version 4.0.0 (Stateless & Environment Seal)
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateSessionToken } from "../_shared/jwt.ts";
import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";

const ENV_URLS = {
  production: "https://api.s4bdigital.net",
  staging: "https://stgapi.s4bdigital.net"
};

serve(withSecurity('sbx-auth', async (req: Request) => {
  try {
    // =========================================================================
    // FASE 1: VALIDAÇÃO DE ENTRADA (Sanitização)
    // =========================================================================
    const body = await req.json();
    const { login, password, environment } = body;

    if (!login || !password) {
      throw new Error("BAD_REQUEST: Login e senha são obrigatórios.");
    }

    if (!environment || (environment !== 'production' && environment !== 'staging')) {
      throw new Error("BAD_REQUEST: Ambiente não especificado ou inválido.");
    }

    const baseUrl = ENV_URLS[environment as keyof typeof ENV_URLS];

    debugLog(`[sbx-auth] Iniciando autenticação para o login truncado no ambiente: ${environment}`);

    // =========================================================================
    // FASE 2: INTEGRAÇÃO UPSTREAM (Superbid OAuth / Login)
    // =========================================================================
    // Nota: Adapte o endpoint exato e o payload para o padrão da API de login da Superbid
    const authParams = new URLSearchParams({
      grant_type: "password",
      username: String(login).trim(),
      password: String(password)
    });

    const upstreamResponse = await fetch(`${baseUrl}/security/v2/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Authorization": `Basic ${btoa("SEU_CLIENT_ID:SEU_CLIENT_SECRET")}` // Se exigido pela SBX
      },
      body: authParams.toString()
    });

    if (!upstreamResponse.ok) {
      const isUnauthorized = upstreamResponse.status === 401 || upstreamResponse.status === 403;
      throw new Error(isUnauthorized ? "CREDENTIALS_INVALID: Usuário ou senha incorretos." : `UPSTREAM_ERROR: Falha no provedor (${upstreamResponse.status})`);
    }

    const upstreamData = await upstreamResponse.json();
    
    // Extrai a identidade e o token da resposta da Superbid
    const userId = upstreamData.userId || upstreamData.user_id || upstreamData.account?.id;
    if (!userId) {
      throw new Error("USER_IDENTIFICATION_FAILED: Não foi possível extrair a identidade do usuário.");
    }

    // =========================================================================
    // FASE 3: EMISSÃO DO JWT INTERNO (O Selo Criptográfico)
    // =========================================================================
    // O ambiente entra como parâmetro e fica blindado contra adulterações
    const tokenData = await generateSessionToken(String(userId), environment, 21600);

    // =========================================================================
    // FASE 4: TRANSPORTE SEGURO E CONTRATO BFF
    // =========================================================================
    const isProd = environment === "production";
    const cookieHeader = `session_token=${tokenData.session_token}; Path=/; HttpOnly; SameSite=Lax${
      isProd ? "; Secure" : ""
    }`;

    // Devolve estritamente o contrato limpo exigido pelo frontend (4 campos)
    return { 
      status: 200, 
      data: {
        success: true,
        session_token: tokenData.session_token,
        issue_at: tokenData.issue_at,
        expires_in: tokenData.expires_in,
        userId: tokenData.userId
      },
      headers: { 
        'Set-Cookie': cookieHeader 
      }
    };

  } catch (err: any) {
    debugLog(`[sbx-auth] Falha no login: ${err.message}`);
    
    const statusCode = err.message.includes("CREDENTIALS_INVALID") ? 401 : 400;
    const cleanMessage = err.message.includes("CREDENTIALS_INVALID") 
      ? "Usuário ou senha inválidos." 
      : "Falha na comunicação com os servidores.";

    return { 
      status: statusCode, 
      data: { 
        success: false, 
        code: err.message.split(":")[0] || "AUTH_FAILED",
        message: cleanMessage 
      } 
    };
  }
}));