/**
 * FINANCIAL GATEWAY - HUB DE INTEGRAÇÃO DE CRÉDITO
 * @version 1.1.0
 * @description Ponto central de orquestração entre o ecossistema Wallet sbX e parceiros financeiros (Fandi).
 * 
 * ============================================================================
 * ARQUITETURA DO FLUXO (A JORNADA DO CLIQUE)
 * ============================================================================
 * 1. INGESTÃO: Recebe o payload estruturado do sbXPAY/Front-end.
 * 2. GATEKEEPER (NOVO): Valida IDOR (propriedade da visita) e disponibilidade da Oferta (Upstream).
 * 3. PERSISTÊNCIA: Aciona o 'simulation_handler' para validar e gravar a intenção (Status: Enviada).
 * 4. INTEGRAÇÃO (HANDSHAKE FANDI):
 *    - GUID: Identificação única da sessão.
 *    - CONTEXTO: Recuperação de regras de negócio do PDV.
 *    - SIMULAÇÃO REAL: Conversão da estimativa local em taxas bancárias.
 *    - INCLUSÃO: Registro da proposta no pipeline do parceiro.
 * 5. WEBHOOK: Canal passivo para atualização de status via 'fandi-service'.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processSimulation } from "./simulation-handler.ts";
import { validateRequest } from "../_shared/auth.ts";
import { withSecurity } from "../_shared/server.ts";
import { validateVisitOwnership, validateOfferIntegrity } from "../_shared/gatekeeper.ts";
import { debugLog } from "../_shared/logger.ts";

serve(withSecurity('financial-gateway', async (req: Request) => {
  // Descoberta da Origem
  const originPath = req.headers.get("x-original-url") || "/";
  const authPath = req.headers.get("x-auth-fallback-url");

  try { 

    // =========================================================================
    // 1. SEGURANÇA BÁSICA: VALIDAÇÃO DE IDENTIDADE E TOKEN
    // =========================================================================
    let auth;
    try {
        auth = await validateRequest(req);
    } catch (err: any) {
        const parts = err.message.split(':');
        const errorCode = parts[0].trim();

        let userMessage = "Falha de autenticação. Por favor, faça login novamente.";
        let finalCode = "UNAUTHORIZED";
        let fallbackUrl = authPath;
        let statusCode = 401;

        switch (errorCode) {
            case "SESSION_EXPIRED":
                userMessage = "Sua sessão expirou. Por favor, faça login novamente.";
                finalCode = "SESSION_EXPIRED";
                break;
            case "FORBIDDEN":
                userMessage = "Você não tem permissão para acessar este recurso.";
                finalCode = "FORBIDDEN";
                fallbackUrl = originPath; 
                statusCode = 403;
                break;
            case "INTERNAL_ERROR":
                userMessage = "Ocorreu um erro interno ao validar sua sessão.";
                finalCode = "INTERNAL_ERROR";
                fallbackUrl = originPath; 
                statusCode = 500;
                break;
        }

        return {
            status: statusCode,
            data: { success: false, code: finalCode, message: userMessage, fallback_url: fallbackUrl }
        };
    }

    // =========================================================================
    // 2. ROTA PRINCIPAL E GATEKEEPER DE NEGÓCIO
    // =========================================================================
    
    // Cliente Supabase necessário para o Gatekeeper operar
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    try {

      payload.offer.offer_id = "1111111";

      let payload;

      if (req.method === "POST") {
        const rawBody = await req.text();
        if (!rawBody) throw new Error("Payload ausente na requisição POST.");
        payload = JSON.parse(rawBody);

        // Injeção mantida por redundância, mas a segurança real
        // agora é provida pelo Gatekeeper logo abaixo.
        if (payload.entity && auth.user_id) {
          payload.entity.entity_id = String(auth.user_id);
        }
      } else {
        return { status: 405, data: { error: "Método HTTP não permitido." } };
      }

      // ---------------------------------------------------------------------
      // 3. GATEKEEPER (Zero-Trust)
      // Impede chamadas para parceiros financeiros se o contexto for inválido.
      // ---------------------------------------------------------------------
      const targetVisitId = payload.visit_id || null;
      const targetEntityId = payload.entity?.entity_id || null;
      
      debugLog("🚨 [Gateway POST] Gatekeeper: Validando ownership:", targetVisitId);
      await validateVisitOwnership(supabase, auth, targetVisitId, targetEntityId);

      const offerId = payload.offer?.offer_id;
      if (offerId) {
          debugLog("🚨 [Gateway POST] Gatekeeper: Validando integridade da oferta:", offerId);
          await validateOfferIntegrity(supabase, auth, targetVisitId, offerId);
      } else {
          debugLog("⚠️ [Gateway AVISO] Simulação solicitada sem offer_id.");
      }

      // ---------------------------------------------------------------------
      // 4. PROCESSAMENTO DE SIMULAÇÃO (Integração Fandi)
      // ---------------------------------------------------------------------
      // Se chegou até aqui, o usuário é dono da visita e a oferta é real.
      const result = await processSimulation(req, payload);

      return {
        status: 200,
        data: result
      };
      
    } catch (err: any) {
      debugLog("[GATEWAY ERROR]:", err.message);
      
      let errorCode = "BUSINESS_ERROR";
      let userMessage = err.message;
      
      // A LÓGICA CORRETA DAS DUAS VARIÁVEIS:
      let finalFallback = payload.origin_url || originPath || "/"; // Padrão é voltar para inicio da visita

      if (err.message.includes("OFFER_NOT_FOUND")) {
          userMessage = "Esta oferta não está mais disponível ou não foi encontrada para simulação.";
          errorCode = "OFFER_NOT_FOUND";
      } else if (err.message.includes("INVALID_RELATIONSHIP")) {
          userMessage = "Você não tem permissão para simular nesta oferta.";
          errorCode = "INVALID_RELATIONSHIP";
      } else if (err.message.includes("SESSION_EXPIRED")) {
          userMessage = "Sua sessão expirou. Por favor, faça login novamente.";
          errorCode = "SESSION_EXPIRED";
          finalFallback = authPath; // LOGIN FALLBACK
      } else if (err.message.includes("UPSTREAM_CONNECTION_ERROR")) {
          userMessage = "O serviço de consulta da oferta está instável. Tente novamente.";
          errorCode = "UPSTREAM_CONNECTION_ERROR";
          finalFallback: originPath;  // volta para origem da chamada
      } else if (err.message.includes("FORBIDDEN_ACCESS") || err.message.includes("INVALID_PAYLOAD")) {
          userMessage = "Inconsistência nos dados de segurança.";
          errorCode = "FORBIDDEN";
          finalFallback: originPath; // volta para origem da chamada
      }

      return {
        status: 400,
        data: {
          success: false,
          code: errorCode,
          message: userMessage,
          details: errorCode === "BUSINESS_ERROR" ? "Consulte os logs." : "Bloqueio de segurança (Gatekeeper).",
          fallback_url: finalFallback // <--- FALLBACK ESCOLHIDO
        }
      };
    }
  } catch (fatalError: any) {
    // O FAILSAFE ABSOLUTO
    // Se qualquer coisa quebrar (syntax error, banco fora do ar, null pointer),
    // cai aqui ANTES de vazar para o withSecurity.
    
    debugLog(`🚨 [CRASH FATAL INTERCEPTADO]: ${fatalError.message}`);
    
    return {
        status: 500,
        data: {
            success: false,
            code: "INTERNAL_SERVER_ERROR",
            message: "Ocorreu um erro interno inesperado. Tente novamente.",
            fallback_url: payload.origin_url || originPath || "/"; // Faz jornada voltar para a origem da visita ou se não existir origem da chamada.
        }
    };
  } 
}));