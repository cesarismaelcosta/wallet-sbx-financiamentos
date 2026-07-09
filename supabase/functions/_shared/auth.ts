import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

/**
 * Valida a sessão do usuário baseada no token JWT fornecido no header.
 * * Fluxo de execução:
 * 1. Extração: Obtém o 'x-session-token' do header.
 * 2. Verificação: Valida a assinatura do JWT usando o segredo de ambiente.
 * 3. Identificação: Extrai o 'jti' (UUID da sessão) do payload.
 * 4. Persistência: Consulta o Supabase para garantir que a sessão ainda existe no banco.
 * * @param req - Objeto de requisição HTTP original.
 * @returns {Promise<any>} Dados da sessão encontrada no banco.
 * @throws {Error} Se o token for inválido, ausente ou se a sessão não existir.
 */
export async function validateRequest(req: Request) {
  // 1. Extração do token do header
  const token = req.headers.get("x-session-token");
  if (!token) {
    throw new Error("Token de sessão ausente nos headers.");
  }

  try {
    // 2. Preparação da chave para verificação do JWT
    const jwtSecret = Deno.env.get("JWT_SECRET");
    if (!jwtSecret) throw new Error("Configuração de segurança (JWT_SECRET) ausente.");

    const key = await crypto.subtle.importKey(
      "raw", 
      new TextEncoder().encode(jwtSecret), 
      { name: "HMAC", hash: "SHA-256" }, 
      false, 
      ["verify"]
    );

    // 3. Verificação e decodificação do payload
    // AQUI ESTAVA O ERRO: Sem as chaves { }, recebemos o objeto direto.
    const payload = await verify(token, key);
    const sessionId = payload.jti as string; // Agora 'jti' existe!

    console.log(`[DEBUG] JTI extraído do JWT: ${sessionId}`);

    // 4. Consulta ao banco de dados (A fonte da verdade)
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '', 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data, error } = await supabaseAdmin
      .from('sbx_sessions')
      .select('*')
      .eq('session_token', sessionId)
      .single();

    // 5. Tratamento de erros de banco de dados
    if (error) {
      console.error("[DEBUG] Erro de consulta ao banco:", error);
      throw new Error("Falha ao buscar sessão no banco de dados.");
    }

    if (!data) {
      console.warn(`[DEBUG] Nenhuma sessão encontrada para o ID: ${sessionId}`);
      throw new Error("Sessão não encontrada ou expirada.");
    }

    // Retorno bem-sucedido
    return data;

  } catch (err: any) {
    console.error(`[DEBUG] Falha na validação de request: ${err.message}`);
    // Repassa o erro para ser tratado pela rota que chama esta função
    throw new Error(`Não autorizado: ${err.message}`);
  }
}