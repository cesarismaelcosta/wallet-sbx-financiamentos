import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

/**
 * Valida a sessão do usuário baseada no token opaco/JWT fornecido na requisição.
 * * @param req - Objeto de requisição HTTP original.
 * @returns {Promise<any>} Dados da sessão encontrada no banco.
 * @throws {Error} Lança erros tipados via string (UNAUTHORIZED, SESSION_EXPIRED, INTERNAL_ERROR)
 */
export async function validateRequest(req: Request) {
  // =========================================================================
  // 1. EXTRAÇÃO HÍBRIDA (Header -> Cookie)
  // =========================================================================
  let token = req.headers.get("x-session-token");

  if (!token) {
    const cookieHeader = req.headers.get("Cookie");
    token = cookieHeader
      ?.split('; ')
      .find(row => row.startsWith('session_token='))
      ?.split('=')[1] || null;
  }

  // Se o token não foi enviado na requisição
  if (!token) {
    throw new Error("UNAUTHORIZED: Token de sessão ausente nos headers e nos cookies.");
  }

  try {
    // =========================================================================
    // 2. VERIFICAÇÃO CRIPTOGRÁFICA (JWT)
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
    // Buscamos APENAS pelo ID, sem filtrar a data no SQL para podermos diferenciar
    // =========================================================================
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '', 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error } = await supabaseAdmin
      .from('session_tokens')
      .select('session_token, user_id, environment, expires_at')
      .eq('session_token', sessionId)
      .maybeSingle(); // Retorna null se não encontrar, sem estourar erro PGRST116

    if (error) {
      console.error("[DEBUG] Erro de consulta ao banco:", error);
      throw new Error("INTERNAL_ERROR: Falha ao buscar sessão no banco de dados.");
    }

    // Cenário A: O token não existe no banco (foi revogado/deletado ou é inválido)
    if (!data) {
      console.warn(`[DEBUG] Token inexistente no banco para o ID: ${sessionId}`);
      throw new Error("UNAUTHORIZED: Token de sessão inexistente ou revogado.");
    }

    // Cenário B: O token existe, mas vamos validar a expiração na aplicação
    const expiresAt = new Date(data.expires_at).getTime();
    const now = Date.now();

    if (now > expiresAt) {
      console.warn(`[DEBUG] Sessão expirada para o ID: ${sessionId} (Expirou em: ${data.expires_at})`);
      throw new Error("SESSION_EXPIRED: Sessão expirada.");
    }

    // Sessão totalmente válida e ativa
    return data;

  } catch (err: any) {
    console.error(`[DEBUG] Falha na validação de request: ${err.message}`);
    
    // Captura erros nativos da biblioteca de JWT (ex: assinatura inválida)
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

    // Failsafe: Reduz o raio de explosão
    throw new Error(`UNAUTHORIZED: Erro de segurança estrutural - ${err.message}`);
  }
}