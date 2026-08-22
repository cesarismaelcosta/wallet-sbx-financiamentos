/**
 * @fileoverview FINANCIAL GATEWAY - HUB DE INTEGRAÇÃO DE CRÉDITO
 * @path supabase/functions/financial-gateway/index.ts
 *
 * @version 2.1.0
 * @description Ponto central de orquestração entre o ecossistema sbX e parceiros financeiros (Fandi, Creditas).
 *
 * ============================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: ZERO-TRUST & HYDRATION
 * ============================================================================
 * [MUDANÇAS ARQUITETURAIS - THIN PAYLOADS]:
 * 1. {Payload Descarte}: O gateway não confia mais no request. Extrai apenas os IDs
 *    e as opções do usuário usando `pickThin`.
 * 2. {S2S Hydration}: Constrói o contexto da transação lendo dados seguros do
 *    Banco de Dados e da API Superbid (`hydrateVisitContext`).
 * 3. {Gatekeepers}: Os middlewares agora validam o "Trusted Payload" montado
 *    server-side, impossibilitando fraudes via API manipulada.
 *
 * [CORREÇÕES v2.1.0 — BLOQUEANTES DA REFATORAÇÃO]:
 * 4. {Config Rehydration}: `pickThin` descarta `rules`/`page_configs`/`consent_configs`
 *    que antes vinham do cliente. O gateway agora RECONSTRÓI essa config
 *    server-side via `resolveOrchestratorConfigs`, usando event/seller/product/
 *    subcategory/category da oferta confiável. Sem isso o motor de crédito
 *    rodaria sem regra de negócio.
 * 5. {Partner/Product Trust}: `partner_id` deixa de ser palavra final do cliente —
 *    a config resolvida tem precedência; o valor do payload é só sugestão.
 * 6. {Integrity Once}: a validação relacional roda UMA vez aqui, em `mode: "link"`
 *    (o vínculo `visit_offers` pode estar em voo no `waitUntil`), e marca
 *    `__integrity_validated` para o handler não repetir o roundtrip.
 * 7. {Raw Payload Thin}: `raw_client_payload` guarda o THIN sanitizado, não o
 *    corpo bruto — evita persistir PII/valores injetados pelo cliente.
 *
 * @author Cesar Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Importações do ecossistema local e de parceiros
import { processSimulation } from "./simulation-handler.ts";
import { validateRequest } from "../_shared/auth.ts";
import { withSecurity } from "../_shared/server.ts";
import { validateOfferAccess, validateSimulationIntegrity } from "../_shared/gateKeeper.ts";
import { debugLog } from "../_shared/logger.ts";

// 🔥 NOVA ARQUITETURA: Fonte Única da Verdade Server-Side
import { hydrateVisitContext, pickThin } from "../_shared/hydrate-data.ts";
import { resolveOrchestratorConfigs } from "../_shared/orchestrator-configs.ts";
import { sql } from "../_shared/db.ts";

serve(withSecurity('financial-gateway', async (req: Request) => {
  // Descoberta da Origem da Navegação (Usado para o Fallback de Erro)
  const originPath = req.headers.get("x-original-url") || "/";
  const authPath = req.headers.get("x-auth-fallback-url") || "/accounts/signin";

  // Escopo amplo para acesso nos Catchs em caso de erro fatal
  let payload: any = null;

  try {
    // =========================================================================
    // 1. SEGURANÇA BÁSICA: VALIDAÇÃO DE IDENTIDADE E TOKEN
    // =========================================================================
    let auth;

    try {
        auth = await validateRequest(req);
    } catch (err: any) {
        // [Failsafe Padronizado de Autorização]
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
    // 2. ROTA PRINCIPAL: THIN PAYLOAD & SERVER-SIDE HYDRATION
    // =========================================================================

    // Cliente Supabase Service Role necessário para validações que requerem Bypass de RLS
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false },
    });

    try {

      if (req.method !== "POST") {
        return { status: 405, data: { error: "Método HTTP não permitido." } };
      }

      const rawBody = await req.text();
      if (!rawBody) throw new Error("INVALID_PAYLOAD: Payload ausente na requisição POST.");

      // 🔥 [THIN PAYLOAD ENFORCEMENT]:
      // Joga fora sumariamente qualquer CPF, Valor ou Oferta que o Front-end mandou.
      // Fica apenas com IDs (visit, offer, etc) e inputs selecionados (Prazo, Entrada).
      let rawClientPayload: any;
      try {
        rawClientPayload = JSON.parse(rawBody);
      } catch {
        throw new Error("INVALID_PAYLOAD: Corpo da requisição não é um JSON válido.");
      }
      const thin = pickThin(rawClientPayload);

      if (!thin.visit_id || !thin.visit_update_id) {
        debugLog("🚨 [Gateway POST] Requisição recusada: visit_id e visit_update_id são estritamente obrigatórios.");
        throw new Error("PROFILE_UNAVAILABLE");
      }

      // 🔄 [SERVER-SIDE HYDRATION]:
      // Constrói a verdade da jornada batendo no Banco de Dados + API Superbid.
      // Simulação SEMPRE em modo "full": precisamos do valor real da oferta.
      debugLog(`🔄 [Gateway POST] Hidratando Jornada Server-Side para Visita: ${thin.visit_id}`);

      const ctx = await hydrateVisitContext({
        sql,
        visitId: thin.visit_id,
        visitUpdateId: thin.visit_update_id,
        offerId: thin.offer_id,
        userId: auth.user_id,
        environment: auth.environment as "staging" | "production",
        mode: "full",
      });

      // ⚙️ [CONFIG REHYDRATION]:
      // As regras de negócio NÃO vêm mais do cliente. Reconstruímos a config
      // ativa a partir dos identificadores confiáveis da oferta hidratada.
      const config = await resolveOrchestratorConfigs({
        supabase,
        eventId: ctx.trustedEvent?.event_id ?? null,
        sellerId: ctx.trustedSeller?.seller_id ?? null,
        productId: thin.product_id ?? null,
        subcategoryId: ctx.trustedOffer?.subcategory_id ?? null,
        categoryId: ctx.trustedOffer?.category_id ?? null,
        entityType: ctx.trustedEntity.entity_type,
      });

      // Precedência: config do banco > sugestão do cliente. Cliente não escolhe parceiro.
      const trustedPartnerId = config.partner_id ?? thin.partner_id ?? null;
      if (!trustedPartnerId) {
        debugLog("🚨 [Gateway POST] Nenhum parceiro resolvido para o contexto. Abortando.");
        throw new Error("BUSINESS_ERROR: Nenhum parceiro financeiro habilitado para esta oferta.");
      }

      // 🏗️ [REMONTAGEM SEGURA]:
      // Monta o payload gordo para os Parceiros (Fandi/Creditas) EXCLUSIVAMENTE com o dado Confiável.
      payload = {
        ...thin, // Traz intention, simulation_details (prazo, entrada) e IDs

        // Identidade e bem — 100% server-side
        entity: ctx.trustedEntity,
        offer: ctx.trustedOffer,
        seller: ctx.trustedSeller,
        event: ctx.trustedEvent,
        manager: ctx.trustedManager,

        // Roteamento e regras — 100% server-side
        partner_id: trustedPartnerId,
        product_id: thin.product_id ?? config.orchestrator_config_id ? thin.product_id ?? null : null,
        is_integrated: config.is_integrated,
        integration_method: config.integration_method,
        integration_details: config.integration_details,
        rules: config.rules,
        consent_configs: config.consent_configs,
        page_configs: config.page_configs,
        orchestrator_config_id: config.orchestrator_config_id,

        // Procedência, para auditoria forense
        hydration_source: ctx.source,
        config_matched_by: config.matched_by,

        // Snapshot sanitizado (THIN) do que o cliente realmente pediu.
        // ⚠️ SECURITY REVIEW: nunca persistir `rawBody` cru — carrega PII/valores injetados.
        raw_client_payload: thin,
      };

      // ---------------------------------------------------------------------
      // 3. GATEKEEPERS AUTÔNOMOS (Sem necessidade de I/O de rede)
      // ---------------------------------------------------------------------

      // 3.1: Valida Ownership da Visita e Disponibilidade da Oferta (IDOR Protection)
      debugLog("🚨 [Gateway POST] Validando ownership e regras da oferta (Gatekeeper)...");
      validateOfferAccess({
        trustedEntity: ctx.trustedEntity,
        trustedOffer: ctx.trustedOffer,
        sessionUserId: auth.user_id,
      });

      // 3.2: Escudo Anti-Fraude e Cross-Tampering.
      // mode "link": o vínculo em `visit_offers` pode ainda estar em voo no
      // `waitUntil` do Orchestrator — a oferta aqui veio do upstream, não do cliente.
      debugLog("🚨 [Gateway POST] Validando integridade relacional da simulação...");
      await validateSimulationIntegrity(
        supabase,
        thin.visit_id,
        {
          simulation_id: thin.simulation_id ?? null,
          entity_id: ctx.trustedEntity.entity_id,      // Server-Side Origin
          offer_id: ctx.trustedOffer?.offer_id ?? null // Server-Side Origin
        },
        "link",
      );

      // Marca para o motor não repetir o mesmo roundtrip (Defense in Depth sem custo duplo).
      payload.__integrity_validated = true;

      // ---------------------------------------------------------------------
      // 4. PROCESSAMENTO DE SIMULAÇÃO (Integração Fandi / Creditas)
      // ---------------------------------------------------------------------
      // Se chegou até aqui, o usuário é dono da visita, a oferta é real, e os dados são in-hackeáveis.

      // Determina o "step" do funil financeiro (Ex: Eligibility vs Execution)
      const step = thin.step === "CHECK_ELIGIBILITY" ? "CHECK_ELIGIBILITY" : "EXECUTE_SIMULATION";

      debugLog(`🚀 [Gateway POST] Repassando Payload Hidratado para o Motor de Simulação (Step: ${step} | Partner: ${trustedPartnerId})...`);
      const result = await processSimulation(req, payload, step);

      return {
        status: 200,
        data: result
      };

    } catch (err: any) {
      debugLog("[GATEWAY ERROR]:", err.message);

      let errorCode = "BUSINESS_ERROR";
      let userMessage = err.message;

      // REGRA DE OURO DE FALLBACK:
      // Se a jornada for abortada, enviamos o cliente de volta para o item de origem
      let finalFallback = payload?.origin_url || originPath || "/";

      if (err.message.includes("OFFER_NOT_AVAILABLE") || err.message.includes("OFFER_NOT_FOUND")) {
          userMessage = "Esta oferta não está mais disponível ou não foi encontrada para simulação.";
          errorCode = "OFFER_NOT_FOUND";
      } else if (err.message.includes("INVALID_RELATIONSHIP") || err.message.includes("FORBIDDEN_OFFER_ACCESS")) {
          userMessage = "Você não tem permissão para simular nesta oferta (Operação Bloqueada).";
          errorCode = "INVALID_RELATIONSHIP";
      } else if (err.message.includes("SESSION_EXPIRED")) {
          userMessage = "Sua sessão expirou. Por favor, faça login novamente.";
          errorCode = "SESSION_EXPIRED";
          finalFallback = authPath; // Única exceção: Manda para a porta de entrada (Login)
      } else if (err.message.includes("UPSTREAM_CONNECTION_ERROR")) {
          userMessage = "O serviço de ofertas está instável. Tente novamente em instantes.";
          errorCode = "UPSTREAM_CONNECTION_ERROR";
      } else if (err.message.includes("PROFILE_UNAVAILABLE")) {
          // Fallback específico de sessão fantasma (Thin Payload sem histórico)
          userMessage = "Não foi possível reconstruir sua jornada. Por favor, recarregue a página.";
          errorCode = "PROFILE_UNAVAILABLE";
          finalFallback = authPath;
      } else if (err.message.includes("FORBIDDEN") || err.message.includes("FORBIDDEN_ACCESS") || err.message.includes("INVALID_PAYLOAD")) {
          userMessage = "Inconsistência severa nos dados de segurança (Gatekeeper bloqueou a transação).";
          errorCode = "FORBIDDEN";
      }

      return {
        status: 400,
        data: {
          success: false,
          code: errorCode,
          message: userMessage,
          details: errorCode === "BUSINESS_ERROR" ? "Consulte os logs." : "Bloqueio de segurança (BFF/Gatekeeper).",
          fallback_url: finalFallback
        }
      };
    }
  } catch (fatalError: any) {
    // =========================================================================
    // O FAILSAFE ABSOLUTO (Crash da Function / Banco)
    // =========================================================================
    debugLog(`🚨 [CRASH FATAL INTERCEPTADO]: ${fatalError.message}`);

    return {
        status: 500,
        data: {
            success: false,
            code: "INTERNAL_SERVER_ERROR",
            message: "Ocorreu um erro interno inesperado no Gateway. Tente novamente.",
            fallback_url: payload?.origin_url || originPath || "/"
        }
    };
  }
}));
