
/**
 * @fileoverview EDGE GATEWAY DE ENTRADA (Híbrido: Form POST & AJAX)
 * @path supabase/functions/financial-gateway-gate/index.ts
 * 
 * =========================================================================
 * [ARQUITETURA BFF & CONTENT NEGOTIATION]
 * =========================================================================
 * 1. HÍBRIDO: Aceita JSON (AJAX) ou x-www-form-urlencoded (Form POST Nativo).
 * 2. AUTH: Troca o token da Superbid por um JWT nativo seguro (Set-Cookie).
 * 3. ORQUESTRAÇÃO: Consulta o 'orchestrator' internamente.
 * 4. REDIRECT: Se for Form POST, responde 302 direto para a Fandi (ou para tela de Erro).
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { create, getNumericDate, verify } from "https://deno.land/x/djwt@v2.8/mod.ts";
import { withSecurity } from "../_shared/server.ts";
import { captureInfrastructure } from "../_shared/infrastructure.ts";
import { debugLog } from "../_shared/logger.ts";
import { getSafeRedirectUrl } from "../_shared/security.ts";

const ENV_URLS = {
  production: { api: "https://api.s4bdigital.net", offer: "https://offer-query.superbid.net", event: "https://event-query.superbid.net" },
  staging: { api: "https://stgapi.s4bdigital.net", offer: "https://offer-query.stage.superbid.net", event: "https://event-query.stage.superbid.net" }
};

serve(withSecurity('financial-gateway-gate', async (req: Request) => {
  // CORS Preflight - O withSecurity já lida com o OPTIONS, mas salvamos o originPath
  const originPath = req.headers.get("origin") || req.headers.get("referer") || "/";

  // =====================================================================
  // 1. NEGOCIAÇÃO DE CONTEÚDO (Content Negotiation)
  // Identifica se a chamada veio via AJAX (JSON) ou Browser Form POST
  // =====================================================================
  const contentType = req.headers.get("content-type") || "";
  const accept = req.headers.get("accept") || "";
  const isAjax = contentType.includes("application/json") || accept.includes("application/json");
  
  let payload: any = {};
  
  try {
    if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      payload = Object.fromEntries(formData.entries());
    } else {
      payload = await req.json();
    }
  } catch (e) {
    return respondWithError(isAjax, 400, "BAD_REQUEST", "Payload inválido ou vazio.", payload?.return_uri || originPath);
  }

  const { auth_token, environment = "production", offer_id, product_id, return_uri = originPath, utm_source, utm_medium, utm_campaign } = payload;

  if (!auth_token) {
    return respondWithError(isAjax, 400, "BAD_REQUEST", "Credencial (auth_token) ausente.", return_uri);
  }

  const urls = ENV_URLS[environment as keyof typeof ENV_URLS] || ENV_URLS.production;

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!, 
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // =====================================================================
    // 2. DUAL-MODE AUTH (Token Bruto sbX vs JWT Interno)
    // =====================================================================
    let sbx_access_token = auth_token;
    const isJwt = auth_token.split('.').length === 3;
    let userId = "";
    let finalJwt = auth_token;
    const agora = new Date();
    const expiraEmSegundos = 14400; // 4 horas
    const nossaExpiracao = new Date(agora.getTime() + (expiraEmSegundos * 1000) - (15 * 60 * 1000));

    if (isJwt) {
      debugLog("JWT detectado. Validando localmente...");
      const jwtSecret = Deno.env.get("JWT_SECRET")!;
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
      const decoded = await verify(auth_token, key);
      
      const { data: sessionData, error: sessionError } = await supabaseAdmin
        .from('session_tokens')
        .select('sbx_access_token, user_id')
        .eq('session_token', decoded.jti)
        .gt('expires_at', agora.toISOString())
        .single();

      if (sessionError || !sessionData) throw new Error("SESSION_UPSTREAM_EXPIRED: JWT expirado no banco.");
      sbx_access_token = sessionData.sbx_access_token;
      userId = sessionData.user_id;
    }

    // =====================================================================
    // 3. EXTRAÇÃO DE DADOS UPSTREAM (Superbid API)
    // =====================================================================
    // Omiti os fetchs completos de userRes e offerRes para o snippet não ficar gigante,
    // Mas você copia exatamente o bloco de "HIDRATAÇÃO DE PERFIL" e "BUSCA DE OFERTA"
    // do seu sbx-loader atual aqui para dentro.
    // [...]
    
    // Simulação do payload mapeado (como estava no seu sbx-loader):
    const rehydratedPayload = {
      action: "CONSULT",
      environment,
      origin_url: return_uri,
      product_id: product_id || "",
      // entity: userProfile,
      // offer: offerPayload.offer,
      // seller: offerPayload.seller,
      // event: offerPayload.event,
      // manager: offerPayload.manager,
      interaction_context: { utm_source, utm_medium, utm_campaign, origin_url: return_uri }
    };

    // =====================================================================
    // 4. PERSISTÊNCIA DA SESSÃO E JWT SECRETO
    // =====================================================================
    if (!isJwt) {
        debugLog("Gerando nova sessão e JWT...");
        const newSessionToken = crypto.randomUUID();
        const infra = await captureInfrastructure(req);
        // userId extraído da Superbid API (userRes)
        userId = "extracted-user-id"; 
        
        await supabaseAdmin.from('session_tokens').insert({ 
            session_token: newSessionToken, user_id: userId, sbx_access_token, environment, 
            expires_at: nossaExpiracao.toISOString(), ip_address: infra.ip_address 
        });

        const jwtSecret = Deno.env.get("JWT_SECRET")!;
        const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(jwtSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
        finalJwt = await create({ alg: "HS256", typ: "JWT" }, { sub: userId, jti: newSessionToken, exp: getNumericDate(nossaExpiracao.getTime() / 1000) }, key);
    }

    // =====================================================================
    // 5. CHAMADA INTERNA PARA O ORQUESTRADOR
    // =====================================================================
    debugLog("Iniciando Orquestração de Rota...");
    const orchestratorResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/orchestrator`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            "x-session-token": finalJwt, // Passamos o JWT gerado
            "x-original-url": return_uri
        },
        body: JSON.stringify(rehydratedPayload),
    });

    const orchestratorData = await orchestratorResponse.json();
    if (!orchestratorResponse.ok) throw new Error(`ORCHESTRATOR_FAIL: ${orchestratorData.message}`);

    // =====================================================================
    // 6. O GRANDE FINAL (Redirecionamento vs JSON)
    // =====================================================================
    const targetUrl = orchestratorData.url; // A URL da Fandi + visit_id

    // Headers de Segurança: O Cookie injetado só pode ser lido pelo nosso domínio
    const responseHeaders = new Headers();
    responseHeaders.set("Set-Cookie", `session_token=${finalJwt}; Path=/; HttpOnly; Secure; SameSite=Lax`);
    responseHeaders.set("Access-Control-Allow-Origin", "*");

    if (isAjax) {
        responseHeaders.set("Content-Type", "application/json");
        return new Response(JSON.stringify({ success: true, redirect_url: targetUrl }), { status: 200, headers: responseHeaders });
    } else {
        responseHeaders.set("Location", targetUrl);
        return new Response(null, { status: 302, headers: responseHeaders }); // 302 O MÁGICO!
    }

} catch (err: any) {
    /**
     * =========================================================================
     * DISPATCHER DE ERROS SEGURO (BFF Error Mapper)
     * =========================================================================
     * Captura exceções não tratadas e falhas de negócio, converte mensagens
     * brutas em códigos de erro mapeados e prepara a devolução segura.
     */
    debugLog("🚨 [Edge Gateway] Erro interceptado:", err.message);
    
    // 1. HIGIENIZAÇÃO DE SEGURANÇA (Defesa em Profundidade)
    // Sanitiza a URL de retorno para garantir que um atacante não utilize um erro
    // forçado para engatilhar um redirecionamento 302 malicioso.
    const safeReturnUri = getSafeRedirectUrl(return_uri || originPath);
    
    let errorCode = "GENERIC_ERROR";
    let statusCode = 400;
    const msg = (err.message || "").toUpperCase();

    // =========================================================================
    // 2. O DETETIVE DE ERROS (Granularidade e Rastreabilidade)
    // =========================================================================
    // Inspeciona a string de erro (Heurística) para traduzir falhas de APIs
    // parceiras (Upstream) ou do Orquestrador em códigos padronizados para o Front-end.
    
    // A. FALHAS DE HANDSHAKE E UPSTREAM (Superbid / Sessão)
    if (msg.includes("UPSTREAM_USER_ERROR")) {
        errorCode = "SBX_LOADER_FAIL_USER";
        statusCode = 422; // Unprocessable Entity: Superbid rejeitou os dados do usuário.
    } else if (msg.includes("SESSION_UPSTREAM_EXPIRED")) {
        errorCode = "SESSION_EXPIRED"; // Mantém sintaxe para o React acionar o redirecionamento de Login
        statusCode = 401; // Unauthorized
    } else if (msg.includes("OFFER_NOT_FOUND")) {
        errorCode = "OFFER_NOT_FOUND"; // Oferta expirada, arrematada ou inexistente
        statusCode = 404; // Not Found
    } else if (msg.includes("UPSTREAM_OFFER_ERROR")) {
        errorCode = "SBX_LOADER_FAIL_OFFER";
        statusCode = 422; // Superbid indisponível ou rejeitou a consulta
    } else if (msg.includes("BAD_REQUEST")) {
        errorCode = "SBX_LOADER_FAIL_BAD_REQUEST";
    } else if (msg.includes("DB_INSERT_FAILURE")) {
        errorCode = "SBX_LOADER_FAIL_DATABASE";
        statusCode = 500; // Internal Server Error: Falha catastrófica no Supabase
    } 
    // B. FALHAS DE ORQUESTRAÇÃO E REGRAS DE NEGÓCIO (Orchestrator)
    else if (msg.includes("VALIDATION")) {
        errorCode = "ORCHESTRATOR_FAIL_VALIDATION";
        statusCode = 422; // Payload inválido segundo as regras PF/PJ ou canais
    } else if (msg.includes("TARGET_URL") || msg.includes("OBRIGATÓRIA")) {
        errorCode = "ORCHESTRATOR_FAIL_INVALID_TARGET_URL";
        statusCode = 422; // Roteamento cego (Origem não informou o destino base)
    } else if (msg.includes("CONFIGURAÇÃO") || msg.includes("DESTINO")) {
        errorCode = "ORCHESTRATOR_FAIL_CONFIG";
        statusCode = 422; // Falha na cascata de roteamento (Produto > Evento > Seller > Categoria)
    } else if (msg.includes("VISITA")) {
        errorCode = "ORCHESTRATOR_FAIL_VISIT_INVALID";
        statusCode = 422; // IDOR mitigado ou visita inexistente no banco
    } else if (msg.includes("OFFER")) {
        errorCode = "ORCHESTRATOR_FAIL_OFFER";
        statusCode = 422; // Cross-tampering mitigado ou oferta desconectada da jornada
    }

    // 3. RETORNO NEGOCIADO (Bifurcação de Resposta)
    return respondWithError(isAjax, statusCode, errorCode, err.message, safeReturnUri);
  }
}));

/**
 * @function respondWithError
 * @description Negociação de Conteúdo (Content Negotiation) para tratativas de erro.
 *              - Cenário AJAX: Devolve um JSON estruturado para o parceiro ler e reagir nativamente.
 *              - Cenário Form POST: Devolve um HTTP 302 forçando o navegador a carregar
 *                a rota "Thin Client" do React para exibir a UI de falha padronizada.
 * 
 * @param {boolean} isAjax - Flag indicando se a requisição originou de um fetch/axios.
 * @param {number} statusCode - Código HTTP apropriado ao contexto da falha (4xx, 5xx).
 * @param {string} code - Código de erro granular para injeção no DataDog/Sentry e UI Logic.
 * @param {string} message - Mensagem original e legível da exceção para debug.
 * @param {string} safeReturnUri - URL higienizada para vinculação ao botão de "Voltar" na UI.
 * @returns {Response} - A resposta HTTP configurada com os Headers definitivos.
 */
function respondWithError(
    isAjax: boolean, 
    statusCode: number, 
    code: string, 
    message: string, 
    safeReturnUri: string
): Response {
    const headers = new Headers();
    // Libera o acesso para front-ends parceiros consumirem via navegador
    headers.set("Access-Control-Allow-Origin", "*");

    if (isAjax) {
        // MODO API: Entrega o controle da Experiência do Usuário (UX) ao parceiro.
        headers.set("Content-Type", "application/json");
        const payload = JSON.stringify({ success: false, code, message });
        return new Response(payload, { status: statusCode, headers });
    } else {
        // MODO GATEWAY: Nós assumimos o controle da UX através de SSR / Redirect.
        // Serializa as informações de erro nos Query Params da nossa rota React de Fallback.
        const encodedMsg = encodeURIComponent(message);
        const encodedUri = encodeURIComponent(safeReturnUri);
        const errorUrl = `/financialGatewayGateway?status=error&code=${code}&message=${encodedMsg}&return_uri=${encodedUri}`;
        
        headers.set("Location", errorUrl);
        // Utiliza 302 (Found) garantindo que o navegador realize o pulo sem fazer cache do erro.
        return new Response(null, { status: 302, headers });
    }
}