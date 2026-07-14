/**
 * FINANCIAL GATEWAY - HUB DE INTEGRAÇÃO DE CRÉDITO
 * @version 1.0.0
 * @description Ponto central de orquestração entre o ecossistema Wallet sbX e parceiros financeiros (Fandi).
 * * --- ARQUITETURA DO FLUXO (A JORNADA DO CLIQUE) ---
 * 1. INGESTÃO: Recebe o payload estruturado do Sandbox/Front-end.
 * 2. PERSISTÊNCIA: Aciona o 'simulation_handler' para validar e gravar a intenção (Status: Enviada).
 * 3. INTEGRAÇÃO (HANDSHAKE FANDI):
 * - GUID: Identificação única da sessão.
 * - CONTEXTO: Recuperação de regras de negócio do PDV (CNPJ/Vendedor).
 * - SIMULAÇÃO REAL: Conversão da estimativa local em taxas bancárias reais.
 * - INCLUSÃO: Registro da proposta no pipeline do parceiro.
 * 4. WEBHOOK (CALLBACK): Canal passivo para atualização de status via 'fandi-service'.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { processSimulation } from "./simulation-handler.ts";

// Chave de controle para logs de depuração
const DEBUG_MODE = true;

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[FINANCIAL GATEWAY INDEX] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

/**
 * CONFIGURAÇÃO GLOBAL DE HEADERS
 * Centraliza as permissões de CORS e tipo de conteúdo para garantir consistência em todas as saídas.
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-original-url, x-session-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json",
};

serve(async (req) => {
  /**
   * 1. CORS HANDSHAKE
   * Essencial para permitir a comunicação Cross-Origin vinda do Sandbox e aplicações Web.
   * Adicionado 'Access-Control-Allow-Methods' para autorizar explicitamente o POST do front-end.
   */
  if (req.method === "OPTIONS") {

    return new Response("ok", {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-token",
      },
    });
  }

  /**
   * 2. ROTA PRINCIPAL (PROCESSAMENTO ATIVO)* Acionada pelo botão "SIMULAR FINANCIAMENTO" no front-end.
   */
  try {
    /**
     * @description Validação de Ingestão: Usando req.text() para
     * capturar payloads vazios sem derrubar o processo.
     */
    let payload;

    // Captura e valida o payload apenas se for uma requisição POST
    if (req.method === "POST") {
      const rawBody = await req.text();
      if (!rawBody) throw new Error("Payload ausente na requisição POST.");
      payload = JSON.parse(rawBody);

      // Extração e injeção do ID do Token
      const sessionToken = req.headers.get("x-session-token");
      if (sessionToken) {
        try {
          const sessionUserId = JSON.parse(atob(sessionToken.split('.')[1])).sub;
          if (payload.entity) {
            payload.entity.entity_id = String(sessionUserId);
          }
        } catch (e) {
          debugLog("Erro ao extrair ID do token - ignorando");
        }
      }

    } else {
      // Se cair aqui e não for OPTIONS (já tratado acima), o método não é suportado
      return new Response(JSON.stringify({ error: "Método não permitido" }), {
        status: 405,
        headers: corsHeaders,
      });
    }

    /**
     * CHAMADA DO HANDLER:
     * Com o payload validado, seguimos para a persistência e handshake Fandi.
     */
    const result = await processSimulation(req, payload);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: corsHeaders,
    });
  } catch (err: any) {
    console.error("[GATEWAY ERROR]:", err.message);
    return new Response(
      JSON.stringify({
        error: err.message,
        details: "Consulte os logs da função para análise de rastreabilidade.",
      }),
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }
});
