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
 *    se a rota exige autenticação por sessão de usuário (`requiresSession`) ou 
 *    segredo server-to-server (`requiresSecret`), bloqueando acessos anônimos (`401`).
 * 4. Retrocompatibilidade de Resposta: Aceita tanto instâncias nativas de `Response` 
 *    quanto o padrão unificado de objetos `{ status, data }`.
 * 5. Fail-Safe Global: Captura exceções não tratadas na regra de negócio, garantindo
 *    resposta JSON padronizada sem vazamento de stack trace.
 */

import { FUNCTION_CONFIGS } from "./registry.ts";
import { getSafeCorsOrigin } from "./security.ts";
import { validateRequest } from "./auth.ts";

export interface StandardResponse {
  status: number;
  data?: any;
  error?: string;
}

/**
 * Envolve uma Edge Function com validações rigorosas de segurança, CORS e tratamento de erros.
 * 
 * @param {string} functionName - Identificador da função correspondente no `registry.ts`.
 * @param {Function} handler - Lógica de negócio da Edge Function.
 * @returns {Function} Handler compatível com o Deno `serve()`.
 */
export const withSecurity = (
  functionName: string,
  handler: (req: Request) => Promise<Response | StandardResponse>
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
    const defaultHeaders = ["authorization", "x-client-info", "apikey", "content-type", "x-session-token"];
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

    // 5.A. Validação de Segredo Compartilhado (Server-to-Server / Cron / Dispatcher)
    if (config.requiresSecret) {
      const secretHeader = req.headers.get("x-gateway-secret") || req.headers.get("authorization");
      const expectedSecret = Deno.env.get(config.requiresSecret);
      
      if (expectedSecret && secretHeader) {
        const cleanHeader = secretHeader.replace(/^Bearer\s+/i, "").trim();
        if (cleanHeader === expectedSecret.trim()) {
          perimeterAuthorized = true;
        }
      }
    }

    // 5.B. Validação de Sessão de Usuário via validateRequest (com try/catch robusto)
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

    // Se a função exige explicitamente autenticação (por sessão ou segredo) e falhou em ambas:
    if ((config.requiresSession || config.requiresSecret) && !perimeterAuthorized) {
      return new Response(
        JSON.stringify({ error: perimeterErrorMsg }), 
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // -----------------------------------------------------------------------
    // [PASSO 6]: Execução Isolada da Regra de Negócio
    // -----------------------------------------------------------------------
    try {
      const result = await handler(req);

      if (result instanceof Response) {
        Object.entries(corsHeaders).forEach(([k, v]) => result.headers.set(k, v));
        return result;
      }

      return new Response(
        JSON.stringify(result.data || { error: result.error }), 
        {
          status: result.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        }
      );

    } catch (err: any) {
      console.error(`[WRAPPER GLOBAL CATCH em ${functionName}]:`, err);
      return new Response(
        JSON.stringify({ 
          success: false, 
          code: "INTERNAL_SERVER_ERROR", 
          message: err.message || "Erro crítico de execução na camada de borda." 
        }), 
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }
  };
};