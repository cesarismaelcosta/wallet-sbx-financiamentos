import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

serve(async (req) => {
  // 1. Pega o nosso token que veio do front-end
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response("Token de sessão ausente", { status: 401 })
  
  const sessionToken = authHeader.replace('Bearer ', '')

  // 2. Busca no nosso cofre a chave real da SBX usando o nosso session_token
  const { data: session, error } = await supabaseAdmin
    .from('sbx_sessions')
    .select('sbx_access_token, expires_at')
    .eq('session_token', sessionToken)
    .single()

  if (error || !session) {
    return new Response("Sessão inválida ou expirada", { status: 401 })
  }

  // 3. Validação de segurança: nossa expiração já passou?
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    // Limpa a sessão expirada do banco
    await supabaseAdmin.from('sbx_sessions').delete().eq('session_token', sessionToken)
    return new Response("Sessão expirada. Por favor, faça login novamente.", { status: 401 })
  }

  // 4. Recebe a requisição do front-end (qual rota ele quer acessar na SBX?)
  const body = await req.json()
  const { endpoint, method, payload } = body // Ex: { endpoint: "/v1/leiloes", method: "GET" }

  // 5. Faz a chamada real para a SBX
  const sbxResponse = await fetch(`https://stgapi.s4bdigital.net${endpoint}`, {
    method: method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.sbx_access_token}`
    },
    body: payload ? JSON.stringify(payload) : undefined
  })

  // 6. Devolve o dado para o front-end
  const data = await sbxResponse.json()
  return new Response(JSON.stringify(data), {
    status: sbxResponse.status,
    headers: { 'Content-Type': 'application/json' }
  })
})