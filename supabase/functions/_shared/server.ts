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
 *    se a rota exige segredo estático server-to-server (`requiresSecret`) ou
 *    assinatura HMAC com janela de validade (`requiresHmac` — para chamadores
 *    que não guardam segredo em texto, como jobs do `pg_cron` calculando a
 *    assinatura via `pgcrypto`/Vault), bloqueando acessos anônimos (`401`) em
 *    qualquer um dos dois casos. Sessão de usuário (`authMode.type === 'session'`)
 *    é tratada à parte, no PASSO 5.0 abaixo, via `session-guard.ts`.
 * 4. Retrocompatibilidade de Resposta: Aceita tanto instâncias nativas de `Response`
 *    quanto o padrão unificado de objetos `{ status, data, headers }`.
 * 5. Fail-Safe Global: Captura exceções não tratadas na regra de negócio, garantindo
 *    resposta JSON padronizada sem vazamento de stack trace.
 * 6. Rate Limiting (PASSO 4.5, abaixo): limite de requisições por (função, IP),
 *    opcional e declarado por rota no `registry.ts`, verificado via Postgres
 *    (`_shared/rate-limit.ts`). Fail-closed -- se a checagem falhar, a
 *    requisição é recusada com 503. Rodar ANTES da blindagem de perímetro (PASSO 5) é
 *    proposital: cobre até força-bruta contra rotas de autenticação (ex:
 *    `sbx-auth`), não só tráfego já autenticado.
 *
 *    Cuidado ao ler os números: o balde é por (função, IP), o que só
 *    discrimina por usuário quando quem chama é o navegador de uma pessoa
 *    real. Em rotas M2M -- disparadas por `pg_cron`, por outra Edge Function
 *    que não propaga IP, ou por um parceiro externo cujo servidor concentra
 *    chamadas de vários usuários (`log-access`, `notification-dispatcher`,
 *    `notification-gateway`, `financial-gateway-webhook`) -- todas as
 *    chamadas legítimas colam no MESMO balde, então esses 4 têm limites bem
 *    mais altos que o padrão de 10/min (rede de segurança contra bug/loop,
 *    não controle por pessoa). Ver o JSDoc de `rateLimit` em `registry.ts`
 *    para o detalhamento completo.
 *
 * ============================================================================
 * [v2.0.0 — SESSÃO CENTRALIZADA (`authMode.type === 'session', enforcement: 'wrapper'`)]
 * ============================================================================
 * Pra rotas marcadas dessa forma no `registry.ts`, o wrapper valida a sessão
 * ELE MESMO, antes do handler rodar, via `_shared/session-guard.ts`
 * (`resolveSessionPerimeter`). Se a sessão for válida, o handler recebe o
 * resultado pronto em `ctx.auth` — não precisa validar de novo. Se falhar
 * (`SESSION_EXPIRED` ou `UNAUTHORIZED`), o wrapper já devolve a resposta
 * padrão (com handoff token no caso de sessão expirada) e o handler nem chega
 * a rodar. O caminho legado `requiresSession`, que existia em paralelo a este,
 * foi removido: hoje existe UM único caminho de sessão.
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
import { SIGNIN_ROUTE } from "./app-routes.ts";
import { getSafeCorsOrigin, getSafeRedirectUrl } from "./security.ts";
import { type AuthContext } from "./auth.ts";
import { verifyHmacSignature } from "./hmac.ts";
import { resolveSessionPerimeter } from "./session-guard.ts";
import { debugLog } from "./logger.ts";
import { checkRateLimit } from "./rate-limit.ts";
import { verifySignedClientIp } from "./client-ip.ts";

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
 * (comparação constant-time feita na mão, sem depender de API específica de runtime):
 */
function safeCompare(actual: string, expected: string): boolean {
  const encoder = new TextEncoder();
  const actualBuf = encoder.encode(actual);
  const expectedBuf = encoder.encode(expected);

  // Sempre iteramos até o tamanho do MAIOR dos dois buffers, sem early-return,
  // pra não vazar (via tempo de execução) nem o tamanho nem o conteúdo do segredo.
  const maxLength = Math.max(actualBuf.byteLength, expectedBuf.byteLength);
  let diff = actualBuf.byteLength ^ expectedBuf.byteLength;

  for (let i = 0; i < maxLength; i++) {
    const a = i < actualBuf.byteLength ? actualBuf[i] : 0;
    const b = i < expectedBuf.byteLength ? expectedBuf[i] : 0;
    diff |= a ^ b;
  }

  return diff === 0;
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
  handler: (req: Request, ctx?: RequestContext) => Promise<Response | StandardResponse>,
) => {
  return async (req: Request): Promise<Response> => {
    // -----------------------------------------------------------------------
    // [PASSO 1]: Recuperação e Validação do Contrato de Rota no Registry
    // -----------------------------------------------------------------------
    const config = FUNCTION_CONFIGS[functionName];

    if (!config) {
      console.error(`[WRAPPER FATAL ERROR]: Função '${functionName}' não mapeada no registry.ts`);
      return new Response(JSON.stringify({ error: "Configuração de segurança ausente no registro de borda." }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    // -----------------------------------------------------------------------
    // [PASSO 2]: Montagem Dinâmica de Políticas CORS e Origem
    // -----------------------------------------------------------------------
    const defaultHeaders = [
      "authorization",
      "x-client-info",
      "apikey",
      "content-type",
      "x-session-token",
      "x-access-token",
      "x-exchange-token",
      "x-sbx-env",
    ];
    const allAllowedHeaders = [...new Set([...defaultHeaders, ...config.requiredHeaders])].join(", ");

    const reqOrigin = req.headers.get("Origin") || req.headers.get("Referer") || "";
    let finalAllowedOrigin = "";

    if (config.origin === "self") {
      const projectUrl = Deno.env.get("SUPABASE_URL");
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
      Vary: "Origin",
      "Access-Control-Allow-Methods": [...config.methods, "OPTIONS"].join(", "),
      "Access-Control-Allow-Headers": allAllowedHeaders,
      "Access-Control-Allow-Credentials": "true",
      // 🛡️ [SBXW-18 FIX]: headers de hardening centralizados aqui porque todas
      // as respostas das 14 functions espalham (`...corsHeaders`) este objeto —
      // adicionar aqui cobre todas de uma vez, sem tocar em cada handler.
      // CSP restritiva: nenhuma resposta de API deveria executar/carregar nada;
      // 'none' em todas as diretivas relevantes.
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "no-referrer",
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
      return new Response(JSON.stringify({ error: `Método HTTP ${req.method} não permitido para esta rota.` }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -----------------------------------------------------------------------
    // [PASSO 4.5]: RATE LIMITING (opcional, declarado por função no Registry)
    // -----------------------------------------------------------------------
    // Roda ANTES da blindagem de perímetro (PASSO 5) de propósito: cobre até
    // tentativas de força-bruta contra rotas de autenticação (ex: sbx-auth),
    // não só tráfego já autenticado. Fail-closed (503) -- ver _shared/rate-limit.ts.
    //
    // O balde é por (função, IP) -- em rotas M2M (`log-access`,
    // `notification-dispatcher`, `notification-gateway`,
    // `financial-gateway-webhook`), chamadas legítimas de usuários
    // diferentes colam no MESMO balde, por isso essas 4 têm limites bem
    // mais altos que o padrão de 10/min (ver detalhamento no cabeçalho
    // deste arquivo e no JSDoc de `rateLimit` em `registry.ts`).
    if (config.rateLimit) {
      // [FIX 2026-10-01]: mesma regra de IP da auditoria (`infrastructure.ts`).
      // 1) IP ASSINADO (`client-ip.ts`): em chamada interna do
      //    `financial-gateway-gate`/`sbx-auth` para o `orchestrator`, conta pelo
      //    IP real do usuário -- antes essas chamadas caíam no `x-forwarded-for`
      //    (IP do servidor da própria function) e TODOS os usuários dividiam um
      //    único contador.
      // 2) cabeçalhos de borda (`cf-connecting-ip`, `x-forwarded-for`, `x-real-ip`).
      // O `x-client-ip` SEM assinatura válida não é mais aceito (forjável).
      const trustedClientIp = await verifySignedClientIp(req);
      const clientIp =
        trustedClientIp ||
        req.headers.get("cf-connecting-ip") ||
        req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
        req.headers.get("x-real-ip") ||
        "0.0.0.0";

      const allowed = await checkRateLimit(
        `${functionName}:${clientIp}`,
        config.rateLimit.maxRequests,
        config.rateLimit.windowSeconds,
      );

      // [FAIL-CLOSED]: checagem indisponível (banco fora/lento) -> recusa com 503.
      if (allowed === null) {
        return new Response(
          JSON.stringify({
            success: false,
            code: "SERVICE_UNAVAILABLE",
            message: "Serviço indisponível no momento. Tente novamente em alguns instantes.",
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!allowed) {
        return new Response(
          JSON.stringify({
            success: false,
            code: "RATE_LIMITED",
            message: "Muitas requisições. Tente novamente em alguns instantes.",
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // =======================================================================
    // [PASSO 5]: BLINDAGEM DE PERÍMETRO (Zero-Trust & Autenticação Declarativa)
    // =======================================================================
    let perimeterAuthorized = false;
    const perimeterErrorMsg = "Unauthorized: Acesso negado.";
    let sessionCtx: RequestContext | undefined;

    // 5.0.a Trilho de configuração: rota de sessão só existe pelo caminho central.
    // Se alguém registrar sessão com enforcement manual, recusamos por configuração
    // inválida em vez de deixar a rota subir sem nenhuma exigência de credencial.
    if (config.authMode?.type === "session" && (config.authMode as { enforcement?: string }).enforcement !== "wrapper") {
      console.error(`[withSecurity] Configuração inválida em ${functionName}: sessão exige enforcement 'wrapper'.`);
      return new Response(
        JSON.stringify({ success: false, code: "INVALID_ROUTE_CONFIG", message: "Configuração de rota inválida." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 5.0. [v2.0.0] Sessão centralizada no wrapper (authMode.type === 'session', enforcement: 'wrapper')
    if (config.authMode?.type === "session" && config.authMode.enforcement === "wrapper") {
      const originPath = getSafeRedirectUrl(req.headers.get("x-original-url") || "/");
      const authPath = getSafeRedirectUrl(req.headers.get("x-auth-fallback-url") || SIGNIN_ROUTE);

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
        return new Response(JSON.stringify(result.data), {
          status: result.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
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

    // 5.B. Validação de assinatura HMAC (Cron / Server-to-Server sem sessão nem segredo em texto)
    if (config.requiresHmac && !perimeterAuthorized) {
      perimeterAuthorized = await verifyHmacSignature(req, config.requiresHmac);
    }

    // Se a função exige explicitamente autenticação (por segredo ou HMAC) e falhou em todas:
    if ((config.requiresSecret || config.requiresHmac) && !perimeterAuthorized) {
      return new Response(JSON.stringify({ error: perimeterErrorMsg }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // -----------------------------------------------------------------------
    // [PASSO 6]: Execução Isolada da Regra de Negócio
    // -----------------------------------------------------------------------
    try {
      debugLog(`[withSecurity] Iniciando handler: ${functionName}`);
      const result = await handler(req, sessionCtx);

      if (result instanceof Response) {
        debugLog("[withSecurity] Retorno é instância de Response nativa.");
        Object.entries(corsHeaders).forEach(([k, v]) => result.headers.set(k, v));
        return result;
      }

      const std = result as StandardResponse;
      debugLog("[withSecurity] Retorno é StandardResponse. status:", std.status);

      // `data` pode ser legitimamente vazio (null, 0, ""), por isso testamos
      // presença explícita em vez de usar `||`, que trocaria o dado por erro.
      const body = std.data !== undefined && std.data !== null ? std.data : { error: std.error };

      return new Response(JSON.stringify(body), {
        status: std.status,
        headers: { ...corsHeaders, "Content-Type": "application/json", ...(std.headers || {}) },
      });
    } catch (err: any) {
      // 🛡️ [SBXW-19 FIX]: Este catch só é alcançado por exceção NÃO
      // controlada (bug real) — erro de negócio esperado já retorna via
      // StandardResponse.error acima, sem passar por aqui. Antes, `err.message`
      // (texto bruto da exceção do runtime) era devolvido direto ao cliente,
      // vazando biblioteca/caminho/estrutura interna. Agora: mensagem genérica
      // + ID de correlação para o cliente; detalhe completo só no log do
      // servidor, correlacionável pelo mesmo ID.
      const correlationId = crypto.randomUUID();
      console.error(`[withSecurity FATAL ERROR em ${functionName}] (correlationId=${correlationId}):`, err);
      return new Response(
        JSON.stringify({
          success: false,
          code: "INTERNAL_SERVER_ERROR",
          message: "Erro interno inesperado. Se precisar de suporte, informe o código de referência.",
          correlationId,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  };
};