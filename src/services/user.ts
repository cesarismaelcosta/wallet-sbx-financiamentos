/**
 * @fileoverview Edge Function: User Profile Validator
 * * Valida a integridade da sessão do usuário via JWT Próprio.
 * * [RESPONSABILIDADES]:
 * 1. Gateway Bypass: Valida o JWT recebido via 'x-session-token' antes de acessar dados.
 * 2. Integridade: Verifica assinatura para garantir que a sessão não foi adulterada.
 * 3. Sincronia de Banco: Extrai o 'jti' (UUID de sessão) do payload para consulta no Supabase.
 * 4. Segurança: Retorna headers CORS mesmo em falhas (401), prevenindo bloqueios do Browser.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verify } from "https://deno.land/x/djwt@v2.8/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-session-token, x-sbx-env',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const sessionToken = req.headers.get("x-session-token");
  
  // [GUARD]: Ejeção imediata caso o token esteja ausente
  if (!sessionToken) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 401, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }

  try {
    // 1. [SECURITY]: Validação de Assinatura JWT
    const jwtSecret = Deno.env.get("JWT_SECRET");
    const key = await crypto.subtle.importKey(
      "raw", new TextEncoder().encode(jwtSecret), 
      { name: "HMAC", hash: "SHA-256" }, false, ["verify"]
    );
    
    // Decodifica e verifica a assinatura (se o token for inválido, cai no catch)
    const payload = await verify(sessionToken, key);
    const sessionId = payload.jti as string; // O UUID original que gravamos no JWT

    // 2. [DATA]: Consulta ao Banco usando o sessionId (JTI) validado
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    
    const { data, error } = await supabaseAdmin
      .from('sbx_sessions')
      .select('*')
      .eq('session_token', sessionId)
      .single();

    if (error || !data) throw new Error("Invalid session");

    // 3. [RESPONSE]: Retorno hidratado
    return new Response(JSON.stringify({
      entity_id: data.user_id,
      status: "authenticated",
      metadata: { processedAt: new Date().toISOString() }
    }), { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });

  } catch (err) {
    // [ERROR HANDLING]: Fallback de segurança com CORS (prevenindo bloqueio do browser)
    return new Response(JSON.stringify({ error: "Unauthorized" }), { 
      status: 401, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    });
  }
});