/**
 * @fileoverview Interceptador Global de Borda (Middleware de Segurança & Gateway)
 * @module _shared/server
 *
 * ============================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * ============================================================================
 * O wrapper `withSecurity` atua como o ponto único de entrada (Perimeter Gateway)
 * para todas as Edge Functions do ecossistema de Financiamentos e Seguros.
 *
 * [RESPONSABILIDADES CRÍTICAS]:
 * 1. Resolução de Contrato: Consulta o `registry.ts` para aplicar regras de método,
 *    headers exigidos e restrições de origem (CORS).
 * 2. Handshake de Borda (Preflight): Responde automaticamente a requisições CORS `OPTIONS`.
 * 3. Blindagem de Perímetro (Zero-Trust): Valida de forma declarativa e centralizada
 *    se a rota exige autenticação por sessão de usuário (`requiresSession`), segredo
 *    estático server-to-server (`requiresSecret`) ou assinatura HMAC com janela de
 *    validade (`requiresHmac` — para chamadores que não guardam segredo em texto,
 *    como jobs do `pg_cron` calculando a assinatura via `pgcrypto`/Vault), bloqueando
 *    acessos anônimos (`401`) em qualquer um dos três casos.
 * 4. Retrocompatibilidade de Resposta: Aceita tanto instâncias nativas de `Response`
 *    quanto o padrão unificado de objetos `{ status, data, headers }`.
 * 5. Fail-Safe Global: Captura exceções não tratadas na regra de negócio, garantindo
 *    resposta JSON padronizada sem vazamento de stack trace.
 *
 * ============================================================================
 * [v2.0.0 — SESSÃO CENTRALIZADA (`authMode.type === 'session', enforcement: 'wrapper'`)]
 * ============================================================================
 * Pra rotas marcadas dessa forma no `registry.ts`, o wrapper agora chama
 * `validateRequest()` ELE MESMO, antes do handler rodar, via
 * `_shared/session-guard.ts` (`resolveSessionPerimeter`). Se a sessão for
 * válida, o handler recebe o resultado pronto em `ctx.auth` — não precisa
 * mais chamar `validateRequest` de novo. Se falhar (`SESSION_EXPIRED` ou
 * `UNAUTHORIZED`), o wrapper já devolve a resposta padrão (com handoff token
 * no caso de sessão expirada) e o handler nem chega a rodar.
 *
 * Pra rotas POST que precisam do corpo da requisição pra montar o handoff
 * token (`visit_id`/`visit_update_id`/`target_url` vindos do payload, não da
 * query string), o wrapper lê o corpo UMA VEZ (stream só permite uma leitura)
 * e repassa como `ctx.rawBody` — o handler usa esse valor em vez de chamar
 * `req.text()`/`req.json()` de novo.
 *
 * Handlers que NÃO usam sessão (ou que ainda estão com
 * `enforcement: 'manual'`, migração pendente) não são afetados: o `ctx`
 * continua sendo passado, mas fica com `auth`/`rawBody` ausentes, e o
 * handler simplesmente não declara o segundo parâmetro — chamar uma função
 * JS com um argumento a mais do que ela declara é inofensivo.
 */

import { FUNCTION_CONFIGS } from "./registry.ts";
import { getSafeCorsOrigin, getSafeRedirectUrl } from "./security.ts";
import { validateRequest, type AuthContext } from "./auth.ts";
import { verifyHmacSignature } from "./hmac.ts";
import { resolveSessionPerimeter } from "./session-guard.ts";

export interface StandardResponse {
  status: number;
  data?: any;
  error?: string;
  headers?: Record<string, string>;
}

/**
 * Contexto extra repassado ao handler quando o wrapper já fez algum trabalho
 * de borda por ele — hoje, só preenchido pra rotas com
 * `authMode.type === 'session'` e `enforcement: 'wrapper'`.
 */
export interface RequestContext {
  /** Presente quando a sessão já foi validada centralmente pelo wrapper. */
  auth?: AuthContext;
  /**
   * Corpo da requisição (POST) já lido pelo wrapper, quando aplicável.
   * Use este valor em vez de chamar `req.text()`/`req.json()` de novo — o
   * stream do `Request` só pode ser lido uma vez.
   */
  rawBody?: string;
}

/**
 * Realiza uma comparação segura em tempo constante (constant-time) entre duas strings
 * para prevenir timing attacks em segredos e chaves de API.
 */
function safeCompare(actual: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const actualBuf = encoder.encode(actual);
  const expectedBuf = encoder.encode(expected);

  // O timingSafeEqual exige buffers de tamanhos estritamente iguais.
  // Se os tamanhos divergirem, comparamos a entrada com ela mesma para manter
  // o fluxo simétrico de tempo, retornando falso em seguida.
  if (actualBuf.byteLength !== expectedBuf.byteLength) {
    crypto.subtle.timingSafeEqual(actualBuf, actualBuf);
    return false;
  }

  return crypto.subtle.timingSafeEqual(actualBuf, expectedBuf);
}

/**
 * Envolve uma Edge Function com validações rigorosas de segurança, CORS e tratamento de erros.
 *
 * @param {string} functionName - Identificador da função correspondente no `registry.ts`.
 * @param {Function} handler - Lógica de negócio da Edge Function. O segundo parâmetro
 *   (`ctx`) é opcional — só é relevante pra rotas com sessão centralizada no wrapper.
 * @returns {Function} Handler compatível com o Deno `serve()`.
 */
export const withSecurity = (
  functionName: string,
  handler: (req: Request, ctx?: RequestContext) => Promise<Response | StandardResponse>
) => {
  return async (req: Request): Promise<Response> => {

    // -----------------------------------------------------------------------
    // [PASSO 1]: Recuperação e Validação do Contrato de Rota no Registry
    // -----------------------------------------------------------------------
    const config = FUNCTION_CONFIGS[functionName];

    if (!config) {
      console.error(`[WRAPPER FATAL ERROR]: Função '${functionName}' não mapeada no registry.ts`);
      return new Response(
        JSON.stringify({ error: "Configuração de segurança ausente no registro de borda." }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // -----------------------------------------------------------------------
    // [PASSO 2]: Montagem Dinâmica de Políticas CORS e Origem
    // -----------------------------------------------------------------------
    const defaultHeaders = ["authorization", "x-client-info", "apikey", "content-type", "x-session-token", "x-access-token", "x-exchange-token", "x-sbx-env"];
    const allAllowedHeaders = [...new Set([...defaultHeaders, ...config.requiredHeaders])].join(", ");

    const reqOrigin = req.headers.get("Origin") || req.headers.get("Referer") || "";
    let finalAllowedOrigin = "";

    if (config.origin === 'self') {
        const projectUrl = Deno.env.get('SUPABASE_URL');
        if (projectUrl) {
            try {
                const parsedProject = new URL(projectUrl);
                if (reqOrigin.startsWith(parsedProject.origin)) {
                    finalAllowedOrigin = parsedProject.origin;
                }
            } catch {
                finalAllowedOrigin = "";
            }
        }
    } else {
        finalAllowedOrigin = getSafeCorsOrigin(reqOrigin);
    }

    const corsHeaders = {
      "Access-Control-Allow-Origin": finalAllowedOrigin,
      "Vary": "Origin",
      "Access-Control-Allow-Methods": [...config.methods, "OPTIONS"].join(", "),
      "Access-Control-Allow-Headers": allAllowedHeaders,
      "Access-Control-Allow-Credentials": "true",
    };

    // -----------------------------------------------------------------------
    // [PASSO 3]: Tratamento Síncrono de Preflight (OPTIONS Handshake)
    // -----------------------------------------------------------------------
    if (req.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    // -----------------------------------------------------------------------
    // [PASSO 4]: Validação de Verbo HTTP (White-list declarada no Registry)
    // -----------------------------------------------------------------------
    if (!config.methods.includes(req.method)) {
      return new Response(
        JSON.stringify({ error: `Método HTTP ${req.method} não permitido para esta rota.` }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =======================================================================
    // [PASSO 5]: BLINDAGEM DE PERÍMETRO (Zero-Trust & Autenticação Declarativa)
    // =======================================================================
    let perimeterAuthorized = false;
    const perimeterErrorMsg = "Unauthorized: Acesso negado.";
    let sessionCtx: RequestContext | undefined;

    // 5.0. [v2.0.0] Sessão centralizada no wrapper (authMode.type === 'session', enforcement: 'wrapper')
    if (config.authMode?.type === "session" && config.authMode.enforcement === "wrapper") {
      const originPath = getSafeRedirectUrl(req.headers.get("x-original-url") || "/");
      const authPath = getSafeRedirectUrl(req.headers.get("x-auth-fallback-url") || "/accounts/signin");

      let rawBody: string | undefined;
      if (req.method === "POST") {
        try {
          rawBody = await req.text();
        } catch {
          rawBody = "";
        }
      }

      const result = await resolveSessionPerimeter(req, { originPath, authPath, rawBody });

      if (!result.ok) {
        return new Response(
          JSON.stringify(result.data),
          { status: result.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      sessionCtx = { auth: result.auth, rawBody };
      perimeterAuthorized = true;
    }

    // 5.A. Validação de Segredo Compartilhado (Server-to-Server / Cron / Dispatcher)
    if (config.requiresSecret && !perimeterAuthorized) {
      const secretHeader = req.headers.get("x-gateway-secret") || req.headers.get("authorization");
      const expectedSecret = Deno.env.get(config.requiresSecret);

      if (expectedSecret && secretHeader) {
        const cleanHeader = secretHeader.replace(/^Bearer\s+/i, "").trim();
        if (safeCompare(cleanHeader, expectedSecret.trim())) {
          perimeterAuthorized = true;
        }
      }
    }

    // 5.B. Validação de Sessão de Usuário via validateRequest (com try/catch robusto)
    // [Legado — pré-v2.0.0]: mantido por compatibilidade, mas hoje nenhuma função
    // seta `requiresSession: true` no registry (todas as rotas de sessão usam
    // `authMode.type === 'session'`, tratado no 5.0 acima quando `enforcement`
    // é `'wrapper'`, ou continuam com checagem manual dentro do próprio handler
    // quando `enforcement` é `'manual'`).
    if (config.requiresSession && !perimeterAuthorized) {
      try {
        const authContext = await validateRequest(req);
        if (authContext && authContext.session_token) {
          perimeterAuthorized = true;
        }
      } catch (authErr: any) {
        console.warn(`[Perimeter Auth Warning em ${functionName}]:`, authErr.message);
        perimeterAuthorized = false;
      }
    }

    // 5.C. Validação de assinatura HMAC (Cron / Server-to-Server sem sessão nem segredo em texto)
    if (config.requiresHmac && !perimeterAuthorized) {
      perimeterAuthorized = await verifyHmacSignature(req, config.requiresHmac);
    }

    // Se a função exige explicitamente autenticação (por sessão, segredo ou HMAC) e falhou em todas:
    if ((config.requiresSession || config.requiresSecret || config.requiresHmac) && !perimeterAuthorized) {
      return new Response(
        JSON.stringify({ error: perimeterErrorMsg }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // -----------------------------------------------------------------------
    // [PASSO 6]: Execução Isolada da Regra de Negócio
    // -----------------------------------------------------------------------
    try {
      console.log(`[withSecurity DEBUG] Iniciando handler: ${functionName}`);
      const result = await handler(req, sessionCtx);

      console.log(`[withSecurity DEBUG] Handler retornou. Tipo: ${typeof result}`);

      if (result instanceof Response) {
        console.log("[withSecurity DEBUG] Retorno é instância de Response nativa.");
        Object.entries(corsHeaders).forEach(([k, v]) => result.headers.set(k, v));
        return result;
      }

      console.log("[withSecurity DEBUG] Retorno é StandardResponse. status:", (result as any).status);

      // Checagem pré-serialização para ver se o objeto não está quebrado
      try {
        const payload = JSON.stringify((result as any).data || { error: (result as any).error });
        console.log("[withSecurity DEBUG] JSON.stringify do data funcionou. Tamanho:", payload.length);
      } catch (e) {
        console.error("[withSecurity DEBUG] ERRO NO JSON.STRINGIFY:", e);
      }

      return new Response(
        JSON.stringify((result as any).data || { error: (result as any).error }),
        {
          status: (result as any).status,
          headers: { ...corsHeaders, "Content-Type": "application/json", ...((result as any).headers || {}) }
        }
      );

    } catch (err: any) {
      console.error(`[withSecurity FATAL ERROR em ${functionName}]:`, err);
      return new Response(
        JSON.stringify({
          success: false,
          code: "INTERNAL_SERVER_ERROR",
          message: err.message || "Erro crítico no wrapper."
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );
    }
  };
};