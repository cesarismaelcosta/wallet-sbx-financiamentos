/**
 * FINANCIAL GATEWAY - HUB DE INTEGRAÇÃO DE CRÉDITO
 * @version 1.0.0
 * @description Ponto central de orquestração entre o ecossistema Wallet sbX e parceiros financeiros (Fandi).
 * * --- ARQUITETURA DO FLUXO (A JORNADA DO CLIQUE) ---
 * 1. INGESTÃO: Recebe o payload estruturado do sbXPAY/Front-end.
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
import { withSecurity } from "../_shared/server.ts";

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
import { debugLog } from "../_shared/logger.ts";

serve(withSecurity('financial-gateway', async (req: Request) => {
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

      return {
          status: statusCode,
          data: { 
              success: false,
              code: finalCode,
              message: userMessage,
              fallback_url: fallbackUrl 
          }
      };
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
      return {
        status: 405,
        data: { error: "Método não permitido" }
      };
    }

    // Processa simulação
    const result = await processSimulation(req, payload);

    return {
      status: 200,
      data: result
    };
    
  } catch (err: any) {
    debugLog("[GATEWAY ERROR]:", err.message);
    
    // Tratamento de Erro de Negócio (ex: CNPJ inválido, banco recusou)
    // Retorna fallbackUrl como originPath para o Orchestrator não ejetar o usuário da tela
    return {
      status: 400,
      data: {
        success: false,
        code: "BUSINESS_ERROR",
        message: err.message,
        details: "Consulte os logs da função para análise de rastreabilidade.",
        fallback_url: originPath 
      }
    };
  }
}));