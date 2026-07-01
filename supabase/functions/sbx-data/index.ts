import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * [SECURITY CONFIG]
 * Define os cabeçalhos de CORS necessários para permitir que o front-end (browser) 
 * consuma esta função cross-origin. Sem estes headers, o navegador bloqueia a requisição 
 * no 'preflight' por razões de segurança.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sbx-env',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

/**
 * Edge Function: sbx-data
 * Objetivo: Orquestrar, hidratar e auditar dados do usuário (Profile).
 * 
 * [RESPONSABILIDADES]:
 * 1. Proxy Seguro: Centraliza a comunicação com a API da Superbid, escondendo endpoints internos.
 * 2. Compliance: Passa o IP real do cliente para a API upstream (Auditoria).
 * 3. Hidratação: Formata o JSON complexo da API para um modelo otimizado para o front-end.
 * 4. Segurança: Gerencia a comunicação entre ambientes (Staging/Production).
 */
serve(async (req) => {
  // [COMPLIANCE]: Lida com o preflight do navegador.
  // O navegador consulta o servidor via OPTIONS antes da requisição real.
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // Identificação do cliente para logs de auditoria e prevenção a fraude
  const clientIp = req.headers.get("x-forwarded-for") || "unknown-ip";
  const authHeader = req.headers.get("Authorization");
  
  // Seleção dinâmica de ambiente baseada no header customizado (x-sbx-env)
  // Isso permite alternar entre STG e PROD sem deploys manuais.
  const env = req.headers.get("x-sbx-env") || "stage";
  const baseUrl = env === "production" ? "https://api.s4bdigital.net" : "https://stgapi.s4bdigital.net";

  console.log(`[AUDIT] Requisição recebida. IP: ${clientIp} | Ambiente: ${env}`);

  // Validação imediata: se não tem token, encerramos a conexão (401).
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Token ausente" }), { 
      status: 401, 
      headers: corsHeaders 
    });
  }

  try {
    // [INTEGRATION]: Chamada ao backend upstream da Superbid.
    // Passamos o IP real (X-Forwarded-For) para que a SBX possa auditar a origem da chamada.
    const response = await fetch(`${baseUrl}/account/v2/user/me`, {
      method: "GET",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
        "X-Forwarded-For": clientIp
      },
    });

    if (!response.ok) {
      console.error(`[ERROR] Falha na API upstream: ${response.status}`);
      return new Response(JSON.stringify({ error: "Erro ao consultar base" }), { 
        status: response.status,
        headers: corsHeaders 
      });
    }

    const data = await response.json();

    // [HIDRATAÇÃO]: Transformação de dados (Mapper).
    // Objetivo: Entregar ao front-end apenas o necessário. Reduz Payload e complexidade no cliente.
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
      
      // Novos campos: Login e Nome da Mãe
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

    // [RESPONSE]: Retorno do payload hidratado.
    // Garantimos a inclusão dos corsHeaders para evitar erros de bloqueio no browser.
    return new Response(JSON.stringify(enrichedData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    // [FAIL-SAFE]: Loga erro crítico no console do Supabase para monitoramento (CloudWatch/Logs).
    console.error("[CRITICAL] Erro inesperado na função sbx-data:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { 
      status: 500,
      headers: corsHeaders 
    });
  }
});