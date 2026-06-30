import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

/**
 * Edge Function: sbx-data
 * Objetivo: Orquestrar, hidratar e auditar dados do usuário (Profile).
 * Responsável por garantir compliance (via IP) e reduzir a carga do front-end.
 */
serve(async (req) => {
  // 1. Captura de Identificação para Compliance
  // O X-Forwarded-For é essencial para identificar a origem real da requisição (Prevenção à Fraude).
  const clientIp = req.headers.get("x-forwarded-for") || "unknown-ip";
  const authHeader = req.headers.get("Authorization");
  
  // Define o ambiente baseado no header customizado (ou fallback para stage)
  const env = req.headers.get("x-sbx-env") || "stage";
  const baseUrl = env === "production" ? "https://api.s4bdigital.net" : "https://stgapi.s4bdigital.net";

  console.log(`[AUDIT] Requisição recebida. IP: ${clientIp} | Ambiente: ${env}`);

  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Token ausente" }), { status: 401 });
  }

  try {
    // 2. Busca na API da Superbid (Upstream)
    const response = await fetch(`${baseUrl}/account/v2/user/me`, {
      method: "GET",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/json",
        // Passamos o IP para a API de destino se necessário para logs de auditoria da SBX
        "X-Forwarded-For": clientIp
      },
    });

    if (!response.ok) {
      console.error(`[ERROR] Falha na API upstream: ${response.status}`);
      return new Response(JSON.stringify({ error: "Erro ao consultar base" }), { status: response.status });
    }

    const data = await response.json();

    // 3. Hidratação dos dados (Lógica centralizada)
    // Isso evita que o front-end precise conhecer a estrutura complexa do JSON da API
    const account = data.userAccounts?.[0];
    
    const enrichedData = {
      entity_id: String(account?.id),
      name: account?.basicInfo?.fullName || "N/A",
      cpf: account?.documents?.find((d: any) => d.typeName === "cpf")?.number || "",
      email: account?.basicInfo?.email?.address || "",
      phone: account?.phones?.find((p: any) => p.type === 3)?.fullPhoneNumber || "",
      birth_date: account?.birthDate?.split('T')[0] || "",
      // Adicionamos meta-informações de auditoria
      metadata: {
        processedAt: new Date().toISOString(),
        originIp: clientIp
      }
    };

    // 4. Retorno Limpo e Seguro
    return new Response(JSON.stringify(enrichedData), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("[CRITICAL] Erro inesperado na função sbx-data:", error);
    return new Response(JSON.stringify({ error: "Internal Server Error" }), { status: 500 });
  }
});