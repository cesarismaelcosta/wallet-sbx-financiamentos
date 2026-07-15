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
import { validateRequest } from "../_shared/auth.ts"; // Validação centralizada de segurança

// Chave de controle para logs de depuração
const DEBUG_MODE = true;

/**
 * FUNÇÃO DE LOG PADRONIZADA
 */
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[FINANCIAL GATEWAY INDEX] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

/**
 * CONFIGURAÇÃO GLOBAL DE HEADERS
 * Contém x-original-url liberado para evitar bloqueios de CORS no Preflight
 */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-original-url, x-session-token, x-auth-fallback-url",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json",
};

serve(async (req) => {
  // =========================================================================
  // 1. CORS HANDSHAKE (PREFLIGHT)
  // =========================================================================
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      status: 200,
      headers: corsHeaders,
    });
  }

  // Descoberta da Origem (Usada nos tratamentos de erro abaixo)
  const originPath = req.headers.get("x-original-url") || "/";
  const authUrl = req.headers.get("x-auth-fallback-url");

  // =========================================================================
  // 2. SEGURANÇA: VALIDAÇÃO DE IDENTIDADE E TOKEN
  // =========================================================================
  let auth;
  try {
      auth = await validateRequest(req);
  } catch (err: any) {
      // EXTRAÇÃO DO CÓDIGO DO ERRO
      const parts = err.message.split(':');
      const errorCode = parts[0].trim();

      let userMessage = "Falha de autenticação. Por favor, faça login novamente.";
      let finalCode = "UNAUTHORIZED";
      let fallbackUrl = authUrl;
      let statusCode = 401;

      // CLASSIFICAÇÃO EXATA E PROTEÇÃO DE NAVEGAÇÃO
      switch (errorCode) {
          case "SESSION_EXPIRED":
              userMessage = "Sua sessão expirou. Por favor, faça login novamente.";
              finalCode = "SESSION_EXPIRED";
              // Mantém o fallback apontando para a página de login
              break;
          case "FORBIDDEN":
              userMessage = "Você não tem permissão para acessar este recurso.";
              finalCode = "FORBIDDEN";
              fallbackUrl = originPath; // Mantém o usuário na tela em que está
              statusCode = 403;
              break;
          case "INTERNAL_ERROR":
              userMessage = "Ocorreu um erro interno ao validar sua sessão.";
              finalCode = "INTERNAL_ERROR";
              fallbackUrl = originPath; // Mantém o usuário na tela em que está
              statusCode = 500;
              break;
      }

      return new Response(JSON.stringify({ 
          success: false,
          code: finalCode,
          message: userMessage,
          fallback_url: fallbackUrl 
      }), { 
          status: statusCode, 
          headers: corsHeaders 
      });
  }

  // =========================================================================
  // 3. ROTA PRINCIPAL (PROCESSAMENTO ATIVO DA SIMULAÇÃO)
  // =========================================================================
  try {
    let payload;

    if (req.method === "POST") {
      const rawBody = await req.text();
      if (!rawBody) throw new Error("Payload ausente na requisição POST.");
      payload = JSON.parse(rawBody);

      // Injeção Segura: Usa o user_id real do banco, impossível de ser falsificado
      if (payload.entity && auth.user_id) {
        payload.entity.entity_id = String(auth.user_id);
      }

    } else {
      return new Response(JSON.stringify({ error: "Método não permitido" }), {
        status: 405,
        headers: corsHeaders,
      });
    }

    // Aciona a regra de negócio da Fandi
    const result = await processSimulation(req, payload);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: corsHeaders,
    });
    
  } catch (err: any) {
    console.error("[GATEWAY ERROR]:", err.message);
    
    // Tratamento de Erro de Negócio (ex: CNPJ inválido, banco recusou)
    // Retorna fallbackUrl como originPath para o Orchestrator não ejetar o usuário da tela
    return new Response(
      JSON.stringify({
        success: false,
        code: "BUSINESS_ERROR",
        message: err.message,
        details: "Consulte os logs da função para análise de rastreabilidade.",
        fallback_url: originPath 
      }),
      {
        status: 400,
        headers: corsHeaders,
      },
    );
  }
});