/**
 * @fileoverview ORQUESTRADOR CENTRAL (Gateway de Roteamento Bilateral & Fast Path)
 * @path supabase/functions/orchestrator/index.ts
 * @version 3.1.0
 *
 * ============================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: ZERO-TRUST ROUTING & S2S BYPASS
 * ============================================================================
 *
 * [EVOLUÇÃO v3.1.0 - SIGNED STATE & S2S TRUST]:
 * 1. {Handoff Token / Signed State}: Emissão de token criptografado na interceptação 
 *    do erro 401 (SESSION_EXPIRED). Preserva `visit_id`, `visit_update_id` e 
 *    `target_url` para blindar o login contra manipulação manual de URL (Open Redirect).
 * 2. {S2S Bypass Validation}: O pipeline de POST agora intercepta e valida a 
 *    chancela `s2s_signed_entity` enviada de servidor para servidor pelo `sbx-auth`.
 *    Isso garante que a identidade PII repassada é confiável, eliminando falsos 
 *    positivos de `PROFILE_UNAVAILABLE` durante a hidratação da jornada.
 *
 * @author Cesar Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateRequest } from "../_shared/auth.ts";
import { captureInfrastructure } from "../_shared/infrastructure.ts";
import { sql } from "../_shared/db.ts";
import { withSecurity } from "../_shared/server.ts";
import { validateOfferAccess } from "../_shared/gateKeeper.ts";
import { hydrateVisitContext } from "../_shared/hydrate-data.ts";
import { resolveOrchestratorConfigs } from "../_shared/orchestrator-configs.ts";
import { persistVisitData } from "./persist-data.ts";
import { debugLog } from "../_shared/logger.ts";

// ✨ [INJEÇÃO ZERO-TRUST]: Ferramentas do Cartório Criptográfico S2S
import { signSigninParameters, verifyS2SEntity } from "../_shared/s2s.ts";

import type { OrchestratorPayload, ThinPayload } from "../_shared/types.ts";

/**
 * ============================================================================
 * HELPERS LOCAIS
 * ============================================================================
 */

const ACTIONS = ["VISIT", "CONSULT", "REDIRECT", "SIMULATE", "CONTACT"] as const;
type Action = (typeof ACTIONS)[number];

const NAVIGATION_ACTIONS: Action[] = ["VISIT", "REDIRECT", "CONTACT"];
const HOME_ROUTES = ["/", "/sbxpay"];

const normalizeRoute = (raw?: string | null) => {
  if (!raw) return "";
  try {
    return new URL(raw, "http://local").pathname.replace(/\/+$/, "") || "/";
  } catch {
    return (raw.split("?")[0] || "").replace(/\/+$/, "") || "/";
  }
};

function validateThinPayload(payload: ThinPayload): { action: Action } {
  const errors: string[] = [];
  const action = String(payload.action || "").toUpperCase() as Action;

  if (!ACTIONS.includes(action)) {
    errors.push(`action invalida ou ausente. Esperado um de: ${ACTIONS.join(", ")}.`);
  }

  if (!payload.interaction_context?.utm_source) errors.push("interaction_context.utm_source ausente.");
  if (!payload.interaction_context?.origin_url) errors.push("interaction_context.origin_url ausente.");
  if (!payload.origin_url) errors.push("origin_url ausente na raiz do payload. Obrigatorio para o roteamento.");

  if (NAVIGATION_ACTIONS.includes(action) && !payload.target_url) {
    errors.push(`target_url ausente. Obrigatoria para acoes do tipo ${action}.`);
  }

  if (payload.offer_id && !payload.visit_id && !NAVIGATION_ACTIONS.includes(action)) {
    errors.push("visit_id ausente para uma acao com contexto de oferta.");
  }

  if (errors.length > 0) throw new Error(`[sbX Validation Error]: ${errors.join(" | ")}`);
  return { action };
}

function toUiError(err: any, fallbacks: { origin: string; auth: string }) {
  let message = "Ocorreu um erro ao processar sua requisicao.";
  let code = "UNKNOWN_ERROR";
  let fallback_url = fallbacks.origin;

  const raw = String(err?.message || "");

  if (raw.includes("OFFER_NOT_FOUND")) {
    message = "Esta oferta nao esta mais disponivel ou nao foi encontrada.";
    code = "OFFER_NOT_FOUND";
  } else if (raw.includes("INVALID_RELATIONSHIP")) {
    message = "Voce nao tem permissao para acessar esta oferta ou visita.";
    code = "INVALID_RELATIONSHIP";
  } else if (raw.includes("SESSION_EXPIRED")) {
    message = "Sua sessao expirou. Por favor, faca login novamente.";
    code = "SESSION_EXPIRED";
    fallback_url = fallbacks.auth;
  } else if (raw.includes("PROFILE_UNAVAILABLE")) {
    message = "Perfil não identificado ou sessão anônima em rota protegida.";
    code = "PROFILE_UNAVAILABLE";
    fallback_url = fallbacks.auth;
  } else if (raw.includes("UPSTREAM_CONNECTION_ERROR")) {
    message = "Estamos com instabilidade no servico de ofertas. Tente novamente em instantes.";
    code = "UPSTREAM_CONNECTION_ERROR";
  } else if (raw.includes("FORBIDDEN") || raw.includes("INVALID_PAYLOAD")) {
    message = "Inconsistencia nos dados de seguranca (Bloqueio).";
    code = "FORBIDDEN";
  } else if (raw) {
    message = raw;
  }

  const uiError = new Error(message);
  (uiError as any).errorCode = code;
  (uiError as any).fallback_url = fallback_url;
  return uiError;
}

// ✨ FIX: Chaves criptográficas não podem ir pro banco de dados em logs
const SECRET_KEYS = new Set([
  "auth_token", "session_token", "access_token", "refresh_token", 
  "password", "s2s_signed_entity", "handoff_token"
]);

const sanitizePayload = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== "object") return obj;
  if (Array.isArray(obj)) return obj.map(sanitizePayload);

  const sanitized: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    if (SECRET_KEYS.has(key.toLowerCase())) continue;
    const val = obj[key];
    sanitized[key] = val === undefined ? null : sanitizePayload(val);
  }
  return sanitized;
};

/**
 * ============================================================================
 * HANDLER PRINCIPAL (E/S BILATERAL)
 * ============================================================================
 */
serve(
  withSecurity("orchestrator", async (req: Request) => {
    const globalFallbackUrl = req.headers.get("x-original-url") || "/";

    try {
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
        auth: { persistSession: false },
      });

      const originPath = req.headers.get("x-original-url") || "/";
      const authPath = req.headers.get("x-auth-fallback-url") || "/";
      const fallbacks = { origin: originPath, auth: authPath };

      // Leitura direta do body sem clonar a stream para evitar travamento de I/O na borda
      let rawBodyText = "";
      if (req.method === "POST") {
        try { rawBodyText = await req.text(); } catch { rawBodyText = ""; }
      }

      let auth;
      try {
        auth = await validateRequest(req);
      } catch (err: any) {
        const raw = String(err?.message || "");
        let userMessage = "Falha de autenticacao. Por favor, faca login novamente.";
        let errorCode = "UNAUTHORIZED";
        let fallbackUrl = authPath;
        let statusCode = 401;

        // ✨ [HANDOFF TOKEN / SIGNED STATE]: A Sessão Expirou. Lacramos o cofre.
        if (raw.includes("SESSION_EXPIRED")) {
          userMessage = "Sua sessao expirou. Por favor, faca login novamente.";
          errorCode = "SESSION_EXPIRED";
          
          let intentVisitId = null;
          let intentUpdateId = null;
          let intentTargetUrl = originPath;

          // Extraímos as memórias da requisição interceptada
          if (req.method === "GET") {
            const url = new URL(req.url);
            intentVisitId = url.searchParams.get("visit_id");
            intentUpdateId = url.searchParams.get("visit_update_id");
          } else if (req.method === "POST" && rawBodyText) {
            try {
              const thin = JSON.parse(rawBodyText);
              intentVisitId = thin.visit_id || null;
              intentUpdateId = thin.visit_update_id || null;
              intentTargetUrl = thin.target_url || originPath;
            } catch (e) {}
          }

          try {
            // Assina matematicamente as intenções da UI
            const handoffToken = await signSigninParameters({
              visit_id: intentVisitId,
              visit_update_id: intentUpdateId,
              target_url: intentTargetUrl,
              origin_url: originPath
            });
            // O fallback agora está 100% blindado
            fallbackUrl = `/accounts/signin?handoff_token=${handoffToken}`;
            debugLog(`[Orquestrador] Sessao Expirada. Handoff Token emitido com sucesso.`);
          } catch(e) {
            debugLog(`[Orquestrador] Erro ao assinar Handoff Token. Roteando limpo.`);
            fallbackUrl = `/accounts/signin`;
          }

        } else if (raw.includes("FORBIDDEN")) {
          userMessage = "Voce nao tem permissao para acessar este recurso.";
          errorCode = "FORBIDDEN";
          fallbackUrl = originPath;
          statusCode = 403;
        } else if (raw.includes("INTERNAL_ERROR")) {
          userMessage = "Ocorreu um erro interno ao validar sua sessao.";
          errorCode = "INTERNAL_ERROR";
          fallbackUrl = originPath;
          statusCode = 500;
        }

        return {
          status: statusCode,
          data: { success: false, code: errorCode, message: userMessage, fallback_url: fallbackUrl },
        };
      }

      const sessionUserId = auth?.user_id || auth?.userId || auth?.sub || auth?.payload?.sub || null;

      // =====================================================================
      // PIPELINE DE LEITURA (GET): Hidratacao do Front-End
      // =====================================================================
      if (req.method === "GET") {
        try {
          const url = new URL(req.url);
          const visitId = url.searchParams.get("visit_id");
          const visitUpdateId = url.searchParams.get("visit_update_id");
          const simulationId = url.searchParams.get("simulation_id");

          if (!visitId) throw new Error("O parametro 'visit_id' e obrigatorio.");
          if (!visitUpdateId) throw new Error("O parametro 'visit_update_id' e obrigatorio.");

          const currentRoute = normalizeRoute(originPath);
          const isHomeRoute = currentRoute === "" || HOME_ROUTES.includes(currentRoute);

          // 1. Hidratação única (traz entidade, oferta, product_id e dados da visita de uma só vez)
          const ctx = await hydrateVisitContext({
            sql,
            visitId,
            visitUpdateId,
            userId: sessionUserId,
            environment: auth.environment as "staging" | "production",
            mode: isHomeRoute ? "light" : "full",
          });

          if (!ctx.visitExists) throw new Error("Visita nao encontrada ou expirada no banco de dados.");

          if (!isHomeRoute && ctx.trustedOffer) {
            debugLog("[GET] Validando integridade da jornada Upstream (Oferta)...");
            validateOfferAccess({
                trustedEntity: ctx.trustedEntity,
                trustedOffer: ctx.trustedOffer,
                sessionUserId: sessionUserId,
            });
          }

          // 2. Resolução de configs usando o product_id que já veio na hidratação
          const config = await resolveOrchestratorConfigs({
            supabase,
            eventId: ctx.trustedEvent?.event_id ?? null,
            sellerId: ctx.trustedSeller?.seller_id ?? null,
            productId: ctx.productId ?? undefined,
            subcategoryId: ctx.trustedOffer?.subcategory_id ?? null,
            categoryId: ctx.trustedOffer?.category_id ?? null,
            entityType: ctx.trustedEntity?.entity_type,
          });

          if (!config.orchestrator_config_id && !isHomeRoute) {
            throw new Error(
              "[resolveOrchestratorConfig]: Configuracoes nao localizadas para o perfil e contexto informados.",
            );
          }

          const offerValue = ctx.trustedOffer?.offer_value
            ? parseFloat(String(ctx.trustedOffer.offer_value))
            : null;
          const minDown = config.rules?.min_down_payment_percentage ?? null;

          // 3. Montagem do payload usando diretamente o ctx (Zero queries extras)
          const hydratedPayload = {
            visit_id: visitId,
            visit_update_id: visitUpdateId,
            simulation_id: simulationId || null,
            product_id: config.product_id ?? ctx.productId ?? null,
            partner_id: config.partner_id ?? null,
            origin_url: ctx.originUrl || "",
            target_url: ctx.targetUrl || "",
            interaction_context: {
              utm_source: ctx.utmSource || "",
              utm_medium: ctx.utmMedium || "",
              utm_campaign: ctx.utmCampaign || "",
              origin_url: ctx.originUrl || "",
            },
            entity: ctx.trustedEntity ? {
              ...ctx.trustedEntity.entity_details,
              entity_id: ctx.trustedEntity.entity_id,
              entity_type: ctx.trustedEntity.entity_type,
              name: ctx.trustedEntity.name,
              document: ctx.trustedEntity.document,
              phone: ctx.trustedEntity.phone,
              email: ctx.trustedEntity.email,
              birth_date: ctx.trustedEntity.birth_date,
              gender: ctx.trustedEntity.gender,
            } : {},
            manager: isHomeRoute ? {} : ctx.trustedManager || {},
            seller: isHomeRoute ? {} : ctx.trustedSeller || {},
            event: isHomeRoute ? {} : ctx.trustedEvent || {},
            offer: isHomeRoute ? {} : ctx.trustedOffer || {},
            rules: config.rules ?? null,
            consent_configs: config.consent_configs ?? null,
            page_configs: config.page_configs ?? null,
            page_faqs: config.page_faqs ?? null,
            is_integrated: config.is_integrated ?? null,
            integration_method: config.integration_method ?? null,
            integration_details: config.integration_details ?? null,
            hydration_source: ctx.source ?? null,
            config_matched_by: config.matched_by ?? null,
            orchestrator_config_id: config.orchestrator_config_id ?? null,
            simulation_details: isHomeRoute
                ? null
                : {
                    requested_value: offerValue,
                    installments: null,
                    down_payment_percentage: minDown,
                    down_payment_amount: offerValue && minDown ? offerValue * (minDown / 100) : null,
                  },
          };
          
          debugLog("Payload construído: ", hydratedPayload);
          return { status: 200, data: hydratedPayload };
        } catch (error: any) {
          const uiError = toUiError(error, fallbacks);
          debugLog(`[Orquestrador GET Error]: ${error?.message} -> ${(uiError as any).errorCode}`);

          return {
            status: 400,
            data: {
              success: false,
              code: (error as any).errorCode || (uiError as any).errorCode,
              message: uiError.message,
              fallback_url: (error as any).fallback_url || (uiError as any).fallback_url || "/",
            },
          };
        }
      }

      // =====================================================================
      // PIPELINE DE ESCRITA (POST): Orquestracao do Clique
      // =====================================================================
      if (req.method === "POST") {
        try {
          debugLog("[POST STEP 1] Iniciando parsing do body...");
          const rawPayload = JSON.parse(rawBodyText || "{}");
          const thin: ThinPayload = sanitizePayload(rawPayload);

          thin.interaction_context = thin.interaction_context || {};
          const { action } = validateThinPayload(thin);
          thin.action = action;

          const infra = await captureInfrastructure(req);

          const targetVisitId = thin.visit_id || null;
          const targetOfferId = thin.offer_id || null;

          // ✨ [S2S TRUST]: Validação de Entidade Assinada pelo sbx-auth
          let validatedS2SEntity = null;
          if (rawPayload.s2s_signed_entity) {
            try {
              validatedS2SEntity = await verifyS2SEntity(rawPayload.s2s_signed_entity);
              debugLog("[Orquestrador POST] Assinatura S2S validada. Bypass de PII habilitado.");
            } catch (e) {
              debugLog("[Orquestrador POST] Assinatura S2S invalida. Descartando entidade externa.");
            }
          }

          const userIdForHydrate = validatedS2SEntity ? null : sessionUserId;

          debugLog("[POST STEP 2] Chamando hydrateVisitContext...");
          const ctx = await hydrateVisitContext({
            sql,
            ...(targetVisitId && { visitId: targetVisitId }),
            ...(thin.visit_update_id && { visitUpdateId: thin.visit_update_id }),
            offerId: targetOfferId,
            userId: userIdForHydrate,
            trustedS2SEntity: validatedS2SEntity,
            environment: auth.environment as "staging" | "production",
            mode: NAVIGATION_ACTIONS.includes(action) && !targetOfferId ? "light" : "full",
          });
          debugLog("[POST STEP 2] Hydration concluída com sucesso.");

          if (ctx.trustedOffer) {
            try {
              debugLog(`[POST STEP 3] Validando ownership da oferta...`);
              validateOfferAccess({
                  trustedEntity: ctx.trustedEntity,
                  trustedOffer: ctx.trustedOffer,
                  sessionUserId: sessionUserId,
              });
              debugLog("[POST STEP 3] Ownership validado.");
            } catch (err: any) {
              debugLog("[Gatekeeper POST] Falha na validacao:", err?.message);
              throw toUiError(err, fallbacks);
            }
          }

          const payload: OrchestratorPayload = {
            ...thin,
            action,
            visit_id: targetVisitId,
            entity: ctx.trustedEntity ? {
              ...ctx.trustedEntity.entity_details,
              entity_id: ctx.trustedEntity.entity_id,
              entity_type: ctx.trustedEntity.entity_type,
              name: ctx.trustedEntity.name,
              document: ctx.trustedEntity.document,
              phone: ctx.trustedEntity.phone,
              email: ctx.trustedEntity.email,
              birth_date: ctx.trustedEntity.birth_date,
              gender: ctx.trustedEntity.gender,
            } : {},
            manager: ctx.trustedManager || {},
            seller: ctx.trustedSeller || {},
            event: ctx.trustedEvent || {},
            offer: ctx.trustedOffer || {},
            product_id: thin.product_id ?? null,
            raw_client_payload: thin,
            hydration_source: ctx.source ?? null,
          } as OrchestratorPayload;

          const categoryId = ctx.trustedOffer?.category_id ?? null;
          const subcategoryId = ctx.trustedOffer?.subcategory_id ?? null;

          let orchestratorConfigId: number | null = null;

          if (NAVIGATION_ACTIONS.includes(action)) {
            if (!payload.target_url) {
              throw new Error(`Para acoes de '${action}', a target_url e obrigatoria no payload.`);
            }
          } else {
            debugLog("[POST STEP 4] Resolvendo orchestrator configs...");
            const resolved = await resolveOrchestratorConfigs({
              supabase,
              eventId: ctx.trustedEvent?.event_id ?? null,
              sellerId: ctx.trustedSeller?.seller_id ?? null,
              productId: payload.product_id ?? undefined,
              subcategoryId: subcategoryId ?? null,
              categoryId: categoryId ?? null,
              entityType: ctx.trustedEntity?.entity_type,
            });

            if (!resolved.page_url) {
              throw new Error("Nenhuma configuracao de destino ativa encontrada para esta simulacao.");
            }

            payload.target_url = resolved.page_url;
            payload.is_integrated = resolved.is_integrated;
            payload.integration_method = resolved.integration_method;
            payload.integration_details = resolved.integration_details;
            if (resolved.partner_id !== null) payload.partner_id = resolved.partner_id;

            payload.rules = resolved.rules;
            payload.consent_configs = resolved.consent_configs;
            payload.page_configs = resolved.page_configs;
            payload.page_faqs = resolved.page_faqs;
            payload.config_matched_by = resolved.matched_by ?? null;

            orchestratorConfigId = resolved.orchestrator_config_id ?? null;
            payload.orchestrator_config_id = orchestratorConfigId;
            debugLog("[POST STEP 4] Configs resolvidas ID:", orchestratorConfigId);
          }

          const hasVisitAnchor = Boolean(payload.visit_id);
          const isNavigationAction = NAVIGATION_ACTIONS.includes(action) && hasVisitAnchor;
          const simulationId = payload.simulation_id || null;

          if (isNavigationAction) {
            debugLog("[POST STEP 5A] Executando fluxo Fast Path (Navigation Action)...");
            const effectiveVisitId = payload.visit_id || crypto.randomUUID();
            const generatedUpdateId = crypto.randomUUID();

            let finalUrl = `${payload.target_url}?visit_id=${effectiveVisitId}&visit_update_id=${generatedUpdateId}`;
            if (simulationId) finalUrl += `&simulation_id=${simulationId}`;

            const persistPromise = persistVisitData(
              sql, payload, infra, categoryId ?? undefined,
              payload.action, payload.origin_url, payload.target_url,
              payload.visit_id || null, orchestratorConfigId,
              effectiveVisitId, generatedUpdateId,
            );

            const rt = (globalThis as any).EdgeRuntime;
            if (rt && typeof rt.waitUntil === "function") {
              rt.waitUntil(
                persistPromise.catch((err: any) => console.error("[Background Persist Error]:", err?.message || err)),
              );
            } else {
              await persistPromise; 
            }

            debugLog("[POST STEP 5A] Fast Path concluído. Retornando resposta...");
            return {
              status: 200,
              data: {
                action: "REDIRECT",
                url: finalUrl,
                visit_id: effectiveVisitId,
                visit_update_id: generatedUpdateId,
                simulation_id: simulationId,
                partner_id: payload.partner_id ?? null,
              },
            };
          }

          debugLog("[POST STEP 5B] Executando persistência síncrona...");
          const { visitId, visitUpdateId } = await persistVisitData(
            sql,
            payload,
            infra,
            categoryId ?? undefined,
            payload.action,
            payload.origin_url,
            payload.target_url,
            payload.visit_id,
            orchestratorConfigId,
          );
          debugLog("[POST STEP 5B] Persistência síncrona finalizada:", { visitId, visitUpdateId });

          let finalUrl = `${payload.target_url}?visit_id=${visitId}&visit_update_id=${visitUpdateId}`;
          if (simulationId) finalUrl += `&simulation_id=${simulationId}`;

          debugLog("[POST STEP 6] Retornando objeto final de sucesso...");
          return {
            status: 200,
            data: {
              action: "REDIRECT",
              url: finalUrl,
              visit_id: visitId,
              visit_update_id: visitUpdateId,
              simulation_id: simulationId,
              partner_id: payload.partner_id ?? null,
            },
          };
        } catch (error: any) {
          debugLog(`[Orquestrador POST Error REAL]: ${error?.message}`, error);

          return {
            status: 400,
            data: {
              success: false,
              code: (error as any).errorCode || "UNKNOWN_ERROR",
              message: error?.message || "Erro ao processar a requisicao.",
              fallback_url: (error as any).fallback_url || originPath,
            },
          };
        }
      }

      return { status: 405, data: { error: "Metodo HTTP nao permitido." } };
    } catch (fatalError: any) {
      debugLog(`[CRASH FATAL INTERCEPTADO]: ${fatalError?.message}`);

      return {
        status: 500,
        data: {
          success: false,
          code: "INTERNAL_SERVER_ERROR",
          message: "Ocorreu um erro interno inesperado. Tente novamente.",
          fallback_url: globalFallbackUrl,
        },
      };
    }
  }),
);