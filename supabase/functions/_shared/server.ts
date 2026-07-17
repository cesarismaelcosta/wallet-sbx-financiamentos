/**
 * ARQUIVO: server.ts
 * OBJETIVO: Interceptador Global (Wrapper). 
 * Ele envolve sua lógica de negócio, resolve o CORS, valida o método e devolve a resposta 
 * sem quebrar as Edge Functions que ainda usam "new Response(...)".
 */

import { FUNCTION_CONFIGS } from "./registry.ts";

export interface StandardResponse {
  status: number;
  data?: any;
  error?: string;
}

export const withSecurity = (
  functionName: string,
  handler: (req: Request) => Promise<Response | StandardResponse>
) => {
  return async (req: Request): Promise<Response> => {
    
    const config = FUNCTION_CONFIGS[functionName];

    if (!config) {
      console.error(`[WRAPPER FATAL ERROR]: Função '${functionName}' não mapeada no registry.ts`);
      return new Response(JSON.stringify({ error: "Configuração de segurança ausente" }), { status: 500 });
    }

    // 1. MONTAGEM DINÂMICA DE CORS
    // Junta os headers padrão (authorization, etc) com os headers exigidos pela função no registry
    const defaultHeaders = ["authorization", "x-client-info", "apikey", "content-type"];
    const allAllowedHeaders = [...new Set([...defaultHeaders, ...config.requiredHeaders])].join(", ");
    
    // O Wrapper verifica se a função pediu um origin restrito. 
    // Se não pediu, assume o "*" como default global.
    let allowedOrigin = config.origin || "*";

    if (allowedOrigin === 'self') {
        // Puxa a URL do projeto atual do ambiente do Deno
        const projectUrl = Deno.env.get('SUPABASE_URL');
        allowedOrigin = projectUrl || "*"; 
    }

    const corsHeaders = {
      "Access-Control-Allow-Origin": allowedOrigin,
      "Access-Control-Allow-Methods": [...config.methods, "OPTIONS"].join(", "),
      "Access-Control-Allow-Headers": allAllowedHeaders,
    };

    // 2. HANDSHAKE (PREFLIGHT) AUTOMÁTICO
    if (req.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    // 3. SEGURANÇA: BLOQUEIO DE MÉTODOS NÃO AUTORIZADOS
    if (!config.methods.includes(req.method)) {
      return new Response(JSON.stringify({ error: `Método ${req.method} não permitido.` }), { 
        status: 405, 
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 4. EXECUÇÃO DA SUA REGRA DE NEGÓCIO
    try {
      const result = await handler(req);

      // =========================================================================
      // MÁGICA DA RETROCOMPATIBILIDADE (Não quebra o seu código atual)
      // =========================================================================
      // Se a sua função (ex: sbx-offer) retornou um "new Response(...)", 
      // o wrapper apenas injeta o CORS nela e repassa para frente. Suas formatações
      // de erro customizadas (code, fallback_url) passam intactas.
      if (result instanceof Response) {
        Object.entries(corsHeaders).forEach(([k, v]) => result.headers.set(k, v));
        return result;
      }

      // =========================================================================
      // SUPORTE AO NOVO PADRÃO (Objetos Simples)
      // =========================================================================
      // Quando você refatorar no futuro para retornar apenas { status: 200, data: {...} }
      return new Response(JSON.stringify(result.data || { error: result.error }), {
        status: result.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (err: any) {
      // Este catch global só é acionado se a sua função "estourar" um erro não tratado
      // internamente. Como suas funções já têm blocos try/catch robustos, isso é uma camada de fail-safe.
      console.error(`[WRAPPER GLOBAL CATCH em ${functionName}]:`, err);
      return new Response(JSON.stringify({ 
        success: false, 
        code: "INTERNAL_SERVER_ERROR", 
        message: err.message || "Erro crítico de execução" 
      }), { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }
  };
};