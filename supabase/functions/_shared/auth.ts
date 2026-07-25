/**
 * @fileoverview Utilitário de Middleware: Validação Própria de Requisições HTTP (Zero-Trust)
 *
 * ARQUITETURA E FLUXO DE SEGURANÇA:
 * Executa a verificação em 2 fatores (Criptográfica + Stateful DB) das chamadas direcionadas
 * às Edge Functions. Suporta múltiplos meios de transporte de token e valida o isolamento de ambientes.
 *
 * PRINCIPAIS RESPONSABILIDADES:
 * 1. Extração Híbrida de Tokens: Lê a sessão do header `x-session-token`, do padrão `Authorization: Bearer` 
 *    ou do Cookie `HttpOnly` (`session_token=...`), nesta exata ordem de precedência.
 * 2. Validação Criptográfica (JWT): Assinatura HMAC-SHA256 validada com o `JWT_SECRET`. Extrai o `jti` (UUID da sessão)
 *    e a claim customizada `environment` ("staging" | "production").
 * 3. Validação do Estado no Banco (SSOT): Consulta a tabela `session_tokens` no Supabase via Service Role Key
 *    para checar revogações manuais ou expiração absoluta.
 * 4. Validação Cruzada de Ambiente: Impede que um token gerado em Staging seja aceito no banco se for diferente.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

/**
 * Interface que define o retorno estruturado da sessão validada.
 */
export interface ValidatedSession {
  session_token: string;
  user_id: string;
  sbx_access_token: string;
  environment: "staging" | "production";
  expires_at: string;
}

/**
 * Valida a sessão do usuário baseada no token JWT fornecido na requisição.
 * 
 * @param req - Objeto de requisição HTTP original
 * @returns {Promise<ValidatedSession>} Dados da sessão autenticada
 * @throws {Error} Lança erros tipados via string (UNAUTHORIZED, SESSION_EXPIRED, INTERNAL_ERROR)
 */
export async function validateRequest(req: Request): Promise<ValidatedSession> {
  // =========================================================================
  // 1. EXTRAÇÃO HÍBRIDA (x-session-token -> Bearer -> Cookie HttpOnly)
  // =========================================================================
  let token = req.headers.get("x-session-token") || req.headers.get("Authorization")?.replace("Bearer ", "");

  if (!token) {
    const cookieHeader = req.headers.get("Cookie");
    token = cookieHeader
      ?.split('; ')
      .find(row => row.startsWith('session_token='))
      ?.split('=')[1] || null;
  }

  if (!token) {
    throw new Error("UNAUTHORIZED: Token de sessão ausente nos headers e nos cookies.");
  }

  try {
    // =========================================================================
    // 2. VERIFICAÇÃO CRIPTOGRÁFICA DO JWT & EXTRAÇÃO DAS CLAIMS
    // =========================================================================
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) {
      throw new Error("INTERNAL_ERROR: Configuração de segurança (JWT_SECRET) ausente.");
    }

    const key = await crypto.subtle.importKey(
      "raw", 
      new TextEncoder().encode(jwtSecret), 
      { name: "HMAC", hash: "SHA-256" }, 
      false, 
      ["verify"]
    );

    // O djwt valida a assinatura e a claim 'exp' automaticamente
    const payload = await verify(token, key);
    
    const sessionId = payload.jti as string;
    const jwtEnvironment = payload.environment as "staging" | "production";

    console.log(`[DEBUG] JWT Validado -> JTI: ${sessionId} | Environment: ${jwtEnvironment}`);

    // =========================================================================
    // 3. CONSULTA AO BANCO DE DADOS (Stateful DB Validation)
    // =========================================================================
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '', 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error } = await supabaseAdmin
      .from('session_tokens')
      .select('session_token, user_id, sbx_access_token, environment, expires_at')
      .eq('session_token', sessionId)
      .maybeSingle();

    if (error) {
      console.error("[DEBUG] Erro de consulta ao banco:", error);
      throw new Error("INTERNAL_ERROR: Falha ao buscar sessão no banco de dados.");
    }

    // Cenário A: Token revogado ou inexistente na tabela
    if (!data) {
      console.warn(`[DEBUG] Token inexistente no banco para o ID: ${sessionId}`);
      throw new Error("UNAUTHORIZED: Token de sessão inexistente ou revogado.");
    }

    // Cenário B: Divergência entre o ambiente do JWT e do Banco (Cross-Environment Guard)
    if (jwtEnvironment && data.environment !== jwtEnvironment) {
      console.error(`[SECURITY] Divergência de Ambiente -> JWT: ${jwtEnvironment} | DB: ${data.environment}`);
      throw new Error("UNAUTHORIZED: Token utilizado em ambiente incompatível.");
    }

    // Cenário C: Expiração no banco de dados
    const expiresAt = new Date(data.expires_at).getTime();
    const now = Date.now();

    if (now > expiresAt) {
      console.warn(`[DEBUG] Sessão expirada para o ID: ${sessionId} (Expirou em: ${data.expires_at})`);
      throw new Error("SESSION_EXPIRED: Sessão expirada.");
    }

    // =========================================================================
    // 4. RETORNO ENRIQUECIDO
    // =========================================================================
    return {
      session_token: data.session_token,
      user_id: data.user_id,
      sbx_access_token: data.sbx_access_token,
      environment: data.environment,
      expires_at: data.expires_at
    };

  } catch (err: any) {
    console.error(`[DEBUG] Falha na validação de request: ${err.message}`);
    
    // Tratamento de expiração nativa da biblioteca djwt
    if (err.message.includes("expired")) {
      throw new Error("SESSION_EXPIRED: Token JWT expirado.");
    }

    // Tratamento de assinatura inválida ou estrutura corrompida
    if (err.message.includes("signature") || err.message.includes("jwt")) {
      throw new Error("UNAUTHORIZED: Token inválido, corrompido ou malformado.");
    }
    
    // Propaga erros já envelopados com flags conhecidas
    if (
      err.message.includes("UNAUTHORIZED") || 
      err.message.includes("SESSION_EXPIRED") || 
      err.message.includes("INTERNAL_ERROR")
    ) {
      throw err; 
    }

    // Failsafe genérico
    throw new Error(`UNAUTHORIZED: Erro de segurança estrutural - ${err.message}`);
  }
}