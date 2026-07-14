import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

/**
 * Valida a sessão do usuário baseada no token opaco/JWT fornecido na requisição.
 * 
 * @param req - Objeto de requisição HTTP original.
 * @returns {Promise<any>} Dados da sessão encontrada no banco.
 * @throws {Error} Lança erros tipados via string (UNAUTHORIZED, SESSION_EXPIRED, INTERNAL_ERROR)
 * para facilitar o mapeamento de status HTTP e regras de fallback no Orchestrator.
 */
export async function validateRequest(req: Request) {
  // =========================================================================
  // 1. EXTRAÇÃO HÍBRIDA (Header -> Cookie)
  // Estratégia de fallback para garantir compatibilidade com diferentes
  // clientes (Mobile via header, Web via HttpOnly Cookie).
  // =========================================================================
  let token = req.headers.get("x-session-token");

  if (!token) {
    const cookieHeader = req.headers.get("Cookie");
    token = cookieHeader
      ?.split('; ')
      .find(row => row.startsWith('session_token='))
      ?.split('=')[1] || null;
  }

  if (!token) {
    // Flag estruturada para falha de identidade inicial (Usuário "pelado")
    throw new Error("UNAUTHORIZED: Token de sessão ausente nos headers e nos cookies.");
  }

  try {
    // =========================================================================
    // 2. VERIFICAÇÃO CRIPTOGRÁFICA (JWT)
    // Garante que o token foi emitido por nós e não sofreu adulteração.
    // =========================================================================
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) throw new Error("INTERNAL_ERROR: Configuração de segurança (JWT_SECRET) ausente.");

    const key = await crypto.subtle.importKey(
      "raw", 
      new TextEncoder().encode(jwtSecret), 
      { name: "HMAC", hash: "SHA-256" }, 
      false, 
      ["verify"]
    );

    const payload = await verify(token, key);
    const sessionId = payload.jti as string;

    console.log(`[DEBUG] JTI extraído do JWT: ${sessionId}`);

    // =========================================================================
    // 3. CONSULTA AO BANCO DE DADOS (Stateful Validation)
    // Valida se a sessão não foi revogada administrativamente ou via logout.
    // =========================================================================
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '', 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const now = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('session_tokens')
      .select('session_token, user_id, environment, expires_at')
      .eq('session_token', sessionId)
      .gt('expires_at', now)
      .single();

    if (error) {
      console.error("[DEBUG] Erro de consulta ao banco:", error);
      throw new Error("INTERNAL_ERROR: Falha ao buscar sessão no banco de dados.");
    }

    if (!data) {
      // Diferencia ausência de token de uma sessão morta pelo tempo
      console.warn(`[DEBUG] Nenhuma sessão ativa para o ID: ${sessionId}`);
      throw new Error("SESSION_EXPIRED: Sessão não encontrada ou expirada.");
    }

    return data;

  } catch (err: any) {
    console.error(`[DEBUG] Falha na validação de request: ${err.message}`);
    
    // Captura erros nativos da biblioteca de JWT (ex: adulteração, formato inválido)
    if (err.message.includes("signature") || err.message.includes("jwt")) {
       throw new Error("UNAUTHORIZED: Token inválido, corrompido ou malformado.");
    }
    
    // Propaga os erros que já foram envelopados com nossas flags customizadas
    if (
      err.message.includes("UNAUTHORIZED") || 
      err.message.includes("SESSION_EXPIRED") || 
      err.message.includes("INTERNAL_ERROR")
    ) {
       throw err; 
    }

    // Failsafe: Reduz o raio de explosão para qualquer erro não mapeado
    throw new Error(`UNAUTHORIZED: Erro de segurança estrutural - ${err.message}`);
  }
}