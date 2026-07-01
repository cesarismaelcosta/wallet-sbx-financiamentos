import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Chave de controle para logs de depuração
const DEBUG_MODE = true;

/**
 * @function debugLog
 * @description Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[NOTIFICATION-GATEWAY] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

/**
 * [SECURITY CONFIG]
 * Define os cabeçalhos de CORS necessários para permitir que o front-end (browser) 
 * consuma esta função cross-origin.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // [CRITICAL FIX]: 'x-session-token' adicionado à lista de permissões do CORS
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sbx-env, x-session-token',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

/**
 * Edge Function: sbx-data
 * Objetivo: Orquestrar, hidratar e auditar dados do usuário (Profile).
 */
serve(async (req) => {
  // [COMPLIANCE]: Lida com o preflight do navegador.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const clientIp = req.headers.get("x-forwarded-for") || "unknown-ip";
  
  // [BUSINESS LOGIC]: Leitura do UUID de sessão pelo novo cabeçalho isolado.
  // O header 'Authorization' original agora carrega a chave anônima do Supabase.
  const sessionToken = req.headers.get("x-session-token");
  
  const env = req.headers.get("x-sbx-env") || "stage";
  const baseUrl = env === "production" ? "https://api.s4bdigital.net" : "https://stgapi.s4bdigital.net";

  debugLog(`[AUDIT] Requisição recebida. IP: ${clientIp} | Ambiente: ${env}`);

  if (!sessionToken) {
    return new Response(JSON.stringify({ error: "Token ausente" }), { 
      status: 401, 
      headers: corsHeaders 
    });
  }

  try {
    // [SECURITY]: Validação no Cofre (Cessão vs Tempo de Expiração)
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Removemos o replace("Bearer ", "") porque o front-end agora manda o UUID puro neste header.
    const cleanSessionToken = sessionToken.trim();

    const { data: session, error: sessionError } = await supabase
      .from('sbx_sessions')
      .select('sbx_access_token, expires_at')
      .eq('session_token', cleanSessionToken)
      .single();

    // [LOG 1]: Verificar o que veio do banco
    debugLog(`[DEBUG] Buscando token: ${cleanSessionToken}. Resultado:`, { session, sessionError });

    if (sessionError || !session) {
      debugLog(`[AUTH] Sessão não encontrada no cofre: ${cleanSessionToken}.`);
      return new Response(JSON.stringify({ error: "Sessão inválida" }), { status: 401, headers: corsHeaders });
    }

    // [LOG 2]: Verificar o tempo
    const agora = new Date();
    const expiraEm = new Date(session.expires_at);
    debugLog(`[DEBUG] Agora: ${agora.toISOString()} | Expira: ${expiraEm.toISOString()} | Expirado: ${agora > expiraEm}`);

    // Validação de TTL (Time To Live)
    if (new Date() > new Date(session.expires_at)) {
      debugLog("[AUTH] Sessão expirada. Redirecionando...");
      return new Response(JSON.stringify({ error: "SESSION_EXPIRED" }), { status: 401, headers: corsHeaders });
    }

    // [INTEGRATION]: Chamada ao backend upstream da Superbid usando o token REAL do cofre.
    const response = await fetch(`${baseUrl}/account/v2/user/me`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${session.sbx_access_token}`,
        "Content-Type": "application/json",
        "X-Forwarded-For": clientIp
      },
    });

    if (!response.ok) {
      debugLog(`[ERROR] Falha na API upstream: ${response.status}`);
      return new Response(JSON.stringify({ error: "Erro ao consultar base" }), { 
        status: response.status,
        headers: corsHeaders 
      });
    }

    const data = await response.json();

    // [HIDRATAÇÃO]: Transformação de dados (Mapper).
    const account = data.userAccounts?.[0];
    const mainAddress = account?.addresses?.[0]; 
    
    const enrichedData = {
      entity_id: String(account?.id),
      name: account?.basicInfo?.fullName || "N/A",
      document: account?.documents?.find((d: any) => d.typeName === "cpf")?.number || "",
      email: account?.basicInfo?.email?.address || "",
      phone: account?.phones?.find((p: any) => p.type === 3)?.fullPhoneNumber || "",
      birth_date: account?.birthDate?.split('T')[0] || "",
      gender: account?.gender === "M" ? "M" : "F",
      login: account?.credentials?.login || "",
      mothers_name: account?.mothersName || "",
      address: mainAddress ? {
        street: mainAddress.addressLine1 || "",
        number: mainAddress.number || "",
        complement: mainAddress.addressLine2 || "",
        neighborhood: mainAddress.district || "",
        city: mainAddress.city || "",
        state: mainAddress.state || "",
        zip_code: mainAddress.zipCode || "",
        country: mainAddress.countryIsoKey || "BR"
      } : null,
      metadata: {
        processedAt: new Date().toISOString(),
        originIp: clientIp
      }
    };

    return new Response(JSON.stringify(enrichedData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    debugLog("[CRITICAL] Erro inesperado na função sbx-data:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { 
      status: 500,
      headers: corsHeaders 
    });
  }
});