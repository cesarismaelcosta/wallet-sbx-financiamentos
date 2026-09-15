/**
 * @fileoverview ORQUESTRADOR CENTRAL (Gateway de Roteamento Bilateral & Fast Path)
 * @path supabase/functions/orchestrator/index.ts
 * @version 3.1.2
 *
 * ============================================================================
 * PRINCÍPIOS DE ARQUITETURA E ROTEAMENTO
 * ============================================================================
 *
 * 1. {Autoridade de Estado e Identidade}: 
 *    O Orquestrador é a única Fonte da Verdade. Nenhum ID é "adivinhado" ou 
 *    deduzido no banco. O Orquestrador avalia o payload, resolve os IDs 
 *    (visit_id e visit_update_id) e decide a regra de negócio (isNewVisit / 
 *    isNewUpdate) antes de acionar a camada de persistência.
 *
 * 2. {Autocura Sem I/O (Sessão Fantasma)}: 
 *    Usa o cache de hidratação (`ctx.visitExists`) para identificar visitantes 
 *    tentando acessar a jornada com um ID antigo (já apagado do banco). Em ações
 *    de topo de funil, a jornada é reiniciada silenciosamente. Em conversão, bloqueia.
 * 
 * 3. {A Ação Dita a Regra}: 
 *    Ações de navegação (VISIT, CONSULT, CONTACT) geram NOVOS logs temporais (INSERT).
 *    Ações de conversão (SIMULATE, REDIRECT) EVOLUEM o log existente (UPDATE).
 *
 * 4. {Handoff Token / S2S Bypass}: 
 *    Uso de tokens JWT criptografados para preservação de contexto em redirects 
 *    de login (SESSION_EXPIRED) e chancelas para contornar bloqueios de PII 
 *    em comunicações Server-to-Server seguras.
 *
 * @author Cesar Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureInfrastructure } from "../_shared/infrastructure.ts";
import { sql } from "../_shared/db.ts";
import { withSecurity, type RequestContext } from "../_shared/server.ts";
import { validateOfferAccess } from "../_shared/gateKeeper.ts";
import { hydrateVisitContext, pickThin } from "../_shared/hydrate-data.ts";
import { resolveOrchestratorConfigs } from "../_shared/orchestrator-configs.ts";
import { persistVisitData, syncHydratedOffer } from "./persist-data.ts";
import { debugLog } from "../_shared/logger.ts";
import { getSafeRedirectUrl } from "../_shared/security.ts";

// ✨ [INJEÇÃO ZERO-TRUST]: Ferramentas do Cartório Criptográfico S2S
import { verifyS2SEntity } from "../_shared/s2s.ts";

import type { OrchestratorPayload, ThinPayload } from "../_shared/types.ts";

/**
 * ============================================================================
 * HELPERS LOCAIS
 * ============================================================================
 */

const ACTIONS = ["VISIT", "CONSULT", "REDIRECT", "SIMULATE", "CONTACT"] as const;
type Action = (typeof ACTIONS)[number];

const NAVIGATION_ACTIONS: Action[] = ["VISIT", "CONTACT"];
const HOME_ROUTES = ["/", "/sbxpay"];

const normalizeRoute = (raw?: string | null) => {
  if (!raw) return "";
  try {
    return new URL(raw, "http://local").pathname.replace(/\/+$/, "") || "/";
  } catch {
    return (raw.split("?")[0] || "").replace(/\/+$/, "") || "/";
  }
};

/**
 * Valida a consistência de navegação inicial.
 * Apenas instâncias Server-to-Server (S2S) podem passar parâmetros complexos 
 * sem uma visita âncora estabelecida.
 */
function validateThinPayload(payload: ThinPayload, isS2S: boolean = false): { action: Action } {
  const errors: string[] = [];
  const action = String(payload.action || "").toUpperCase() as Action;

  if (!ACTIONS.includes(action)) {
    errors.push(`action invalida ou ausente. Esperado um de: ${ACTIONS.join(", ")}.`);
  }

  if (!payload.interaction_context?.utm_source) errors.push("interaction_context.utm_source ausente.");
  if (!payload.interaction_context?.origin_url) errors.push("interaction_context.origin_url ausente.");
  if (!payload.origin_url) errors.push("origin_url ausente na raiz do payload. Obrigatorio para roteamento.");

  if (NAVIGATION_ACTIONS.includes(action) && !payload.target_url) {
    errors.push(`target_url ausente. Obrigatoria para acoes do tipo ${action}.`);
  }

  // ✨ Bypass S2S: Servidores confiáveis podem iniciar consultas com oferta do zero
  if (payload.offer_id && !payload.visit_id && !NAVIGATION_ACTIONS.includes(action) && !isS2S) {
    errors.push("visit_id ausente para uma acao com contexto de oferta.");
  }

  if (errors.length > 0) throw new Error(`[sbX Validation Error]: ${errors.join(" | ")}`);
  return { action };
}

function toUiError(err: any, fallbacks: { origin: string; auth: string }, method: string) {
  let message = "Ocorreu um erro ao processar sua requisicao.";
  let code = "UNKNOWN_ERROR";
  
  // O padrão é ejetar pro "/" no GET (evita loop) e manter na origem no POST
  let fallback_url = method === "GET" ? "/" : fallbacks.origin;

  const raw = String(err?.message || "");

  if (raw.includes("OFFER_NOT_FOUND")) {
    message = "Esta oferta nao esta mais disponivel ou nao foi encontrada.";
    code = "OFFER_NOT_FOUND";
    // Usa o fallback padrão definido acima (GET = "/", POST = origin)
    
  } else if (raw.includes("INVALID_RELATIONSHIP")) {
    message = "Voce nao tem permissao para acessar esta oferta ou visita.";
    code = "INVALID_RELATIONSHIP";
    // Usa o fallback padrão definido acima (GET = "/", POST = origin)
    
  } else if (raw.includes("SESSION_EXPIRED")) {
    message = "Sua sessao expirou. Por favor, faca login novamente.";
    code = "SESSION_EXPIRED";
    // SOBRESCREVE a regra de ouro: Sempre joga pro Login, independente se for GET ou POST
    fallback_url = fallbacks.auth; 
    
  } else if (raw.includes("PROFILE_UNAVAILABLE")) {
    message = "Perfil não identificado ou sessão anônima em rota protegida.";
    code = "PROFILE_UNAVAILABLE";
    // SOBRESCREVE a regra de ouro: Sempre joga pro Login
    fallback_url = fallbacks.auth;
    
  } else if (raw.includes("UPSTREAM_CONNECTION_ERROR")) {
    message = "Estamos com instabilidade no servico de ofertas. Tente novamente em instantes.";
    code = "UPSTREAM_CONNECTION_ERROR";
    // Usa o fallback padrão
    
  } else if (raw.includes("FORBIDDEN") || raw.includes("INVALID_PAYLOAD")) {
    message = "Inconsistencia nos dados de seguranca (Bloqueio).";
    code = "FORBIDDEN";
    // Usa o fallback padrão (ejetando pra raiz no GET por segurança)
    
  } else if (raw) {
    message = raw;
  }

  const uiError = new Error(message);
  (uiError as any).errorCode = code;
  (uiError as any).fallback_url = fallback_url;
  return uiError;
}

// ✨ FIX: Prevenção de Injeção em Logs - Chaves criptográficas NUNCA podem ser 
// persistidas no banco na coluna raw_payload.
const SECRET_KEYS = new Set([
  "auth_token",
  "session_token",
  "access_token",
  "refresh_token",
  "password",
  "s2s_signed_entity",
  "handoff_token",
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
  withSecurity("orchestrator", async (req: Request, secCtx?: RequestContext) => {
    const globalFallbackUrl = getSafeRedirectUrl(req.headers.get("x-original-url") || "/");

    try {
      const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
        auth: { persistSession: false },
      });

      const originPath = getSafeRedirectUrl(req.headers.get("x-original-url") || "/");
      const authPath = getSafeRedirectUrl(req.headers.get("x-auth-fallback-url") || "/");
      const fallbacks = { origin: originPath, auth: authPath };

      // [v2.0.0]: sessão já validada centralmente pelo wrapper (registry.ts:
      // authMode.type === 'session', enforcement: 'wrapper') via
      // `_shared/session-guard.ts` — `secCtx.auth` chega pronto aqui.
      // SESSION_EXPIRED/UNAUTHORIZED (com handoff token) são tratados lá; o
      // handler nem chega a rodar se a sessão for inválida. A checagem
      // manual (`validateRequest` + montagem de handoff token na mão) que
      // existia aqui foi removida — incluindo a extração de visit_id/
      // visit_update_id da query da própria API no caminho GET, que hoje é
      // feita de forma genérica em `session-guard.ts` (extensão v2.0.1,
      // adicionada especificamente pra cobrir esse caso do orchestrator).
      //
      // [NOTA]: o parâmetro do wrapper foi nomeado `secCtx` (não `ctx`) de
      // propósito — este arquivo já usa `ctx` como nome local pro contexto
      // hidratado da visita (`hydrateVisitContext`, mais abaixo).
      const auth = secCtx?.auth;

      const sessionUserId = auth?.user_id || (auth as any)?.userId || (auth as any)?.sub || (auth as any)?.payload?.sub || null;

      // =====================================================================
      // PIPELINE DE LEITURA (GET): Hidratação do Front-End
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

          // 1. Hidratação única (traz entidade, oferta, product_id e dados da visita)
          const ctx = await hydrateVisitContext({
            sql,
            visitId,
            visitUpdateId,
            userId: sessionUserId,
            environment: auth.environment as "staging" | "production",
            mode: isHomeRoute ? "light" : "full",
          });

          if (!ctx.visitExists) throw new Error("Visita nao encontrada ou expirada no banco de dados.");

          // ✨ [ZERO-TRUST OLAP SYNC]: Delega a sincronização de mutações no Upstream (Superbid)
          // para a camada de persistência de forma assíncrona para não onerar o TTI do Front-End.
          if (!isHomeRoute && ctx.trustedOffer && visitId && visitUpdateId) {
            const syncPromise = syncHydratedOffer(
              sql, 
              visitId, 
              visitUpdateId, 
              ctx.trustedOffer,
              ctx.trustedEvent,
              ctx.trustedManager,
              ctx.trustedSeller
            );
            
            const rt = (globalThis as any).EdgeRuntime;
            if (rt && typeof rt.waitUntil === "function") {
              rt.waitUntil(syncPromise);
            } else {
              await syncPromise;
            }
          }

          if (!isHomeRoute && ctx.trustedOffer) {
            debugLog("[GET] Validando integridade da jornada Upstream (Oferta)...");
            validateOfferAccess({
              trustedEntity: ctx.trustedEntity,
              trustedOffer: ctx.trustedOffer,
              sessionUserId: sessionUserId,
            });
          }

          // 2. Resolução de configs usando o product_id retornado na hidratação
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

          const offerValue = ctx.trustedOffer?.offer_value ? parseFloat(String(ctx.trustedOffer.offer_value)) : null;
          const minDown = config.rules?.min_down_payment_percentage ?? null;

          // 3. Montagem rápida do payload, aproveitando inteiramente o contexto cacheado
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
            entity: ctx.trustedEntity
              ? {
                  ...ctx.trustedEntity.entity_details,
                  entity_id: ctx.trustedEntity.entity_id,
                  entity_type: ctx.trustedEntity.entity_type,
                  name: ctx.trustedEntity.name,
                  document: ctx.trustedEntity.document,
                  phone: ctx.trustedEntity.phone,
                  email: ctx.trustedEntity.email,
                  birth_date: ctx.trustedEntity.birth_date,
                  gender: ctx.trustedEntity.gender,
                }
              : {},
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
          const uiError = toUiError(error, fallbacks, req.method);
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
          // [v2.0.0]: corpo já lido uma vez pelo wrapper (necessário pra montar o
          // handoff token em caso de sessão expirada) e repassado em
          // `secCtx.rawBody` — não podemos ler `req.text()` de novo aqui
          // (stream já consumido).
          const rawPayload = JSON.parse(secCtx?.rawBody || "{}");
          
          // 🔒 ZERO-TRUST: 1º allowlist (descarta chaves fora do contrato),
          // 2º normalização (undefined -> null) e remoção de segredos.
          const thin: ThinPayload = sanitizePayload(pickThin(rawPayload));

          thin.interaction_context = thin.interaction_context || {};

          // ✨ INJEÇÃO: Passa a flag indicando se é uma requisição S2S confiável
          const isS2S = Boolean(rawPayload.s2s_signed_entity);
          const { action } = validateThinPayload(thin, isS2S);

          thin.action = action;

          const infraPromise = captureInfrastructure(req); // roda em paralelo com hydrateVisitContext e o resto do pipeline abaixo

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

          // A LOGICA ORIGINAL RESTAURADA: Se tem Entidade S2S assinada, o ID do auth é ignorado. 
          // Caso contrário, DEVE repassar o sessionUserId que foi pego lá no começo do script!
          const userIdForHydrate = validatedS2SEntity ? null : sessionUserId;

          debugLog("[POST STEP 2] Chamando hydrateVisitContext...");
          const ctx = await hydrateVisitContext({
            sql,
            ...(targetVisitId && { visitId: targetVisitId }),
            ...(thin.visit_update_id && { visitUpdateId: thin.visit_update_id }),
            offerId: targetOfferId,
            userId: userIdForHydrate, // Aqui estava o erro! Restaurado o seu ID.
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
            entity: ctx.trustedEntity
              ? {
                  ...ctx.trustedEntity.entity_details,
                  entity_id: ctx.trustedEntity.entity_id,
                  entity_type: ctx.trustedEntity.entity_type,
                  name: ctx.trustedEntity.name,
                  document: ctx.trustedEntity.document,
                  phone: ctx.trustedEntity.phone,
                  email: ctx.trustedEntity.email,
                  birth_date: ctx.trustedEntity.birth_date,
                  gender: ctx.trustedEntity.gender,
                }
              : {},
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

          // Valida e SANEIA a URL de destino (Fast Path usa target_url simples, conversão usa Orquestrador)
          if (NAVIGATION_ACTIONS.includes(action)) {
            if (!payload.target_url) {
              throw new Error(`Para acoes de '${action}', a target_url e obrigatoria no payload.`);
            }
            // 🛡️ [SEGURANÇA]: Bloqueia Open Redirect (CWE-601) — um target_url absoluto
            // fora da allowlist corporativa (ALLOWED_DOMAIN_SUFFIXES) é reduzido a
            // path relativo aqui, na origem, antes de virar finalUrl/orchestratorData.url.
            payload.target_url = getSafeRedirectUrl(payload.target_url);
          } else {
            // SIMULATE, CONSULT e REDIRECT necessitam resolver configurações complexas
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
              throw new Error("Nenhuma configuracao de destino ativa encontrada para esta acao.");
            }

            // Injeta configurações de compliance e roteamento profundo do parceiro
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
            debugLog("[POST STEP 4] Configs resolvidas ID para conversão:", orchestratorConfigId);
          }

          // =====================================================================
          // [POST STEP 5] RESOLUÇÃO ESTRITA DE IDs E AÇÃO (CONTRATO)
          // =====================================================================
          const targetAction = payload.action;
          let finalVisitId = payload.visit_id || null;
          let isNewVisit = false;

          // 🛡️ AUTOCURA: Proteção contra Sessão Fantasma
          // Se o Front enviar um ID de visita que não existe mais no banco (Sessão Expirada):
          if (finalVisitId && ctx.visitExists === false) {
            if (targetAction === 'VISIT' || targetAction === 'CONSULT') {
              debugLog(`[Orquestrador] Sessão ${finalVisitId} fantasma/expirada. Reiniciando jornada.`);
              finalVisitId = null; // Força a recriação limpa da sessão
            } else {
              // Tentativa de conversão (SIMULATE/REDIRECT) requer histórico vivo. 
              // Se a sessão expirou, bloqueia e roteia pro login ou reinício.
              throw new Error("SESSION_EXPIRED"); 
            }
          }

          if (!finalVisitId) {
            finalVisitId = crypto.randomUUID();
            isNewVisit = true;
          }
          
          let finalUpdateId: string;
          let isNewUpdate: boolean;

          // A Ação é a única autoridade que decide entre Criar Log (INSERT) e Evoluir (UPDATE)
          switch (targetAction) {
            case 'VISIT':
            case 'CONSULT':
            case 'CONTACT':
              // Ações de navegação (Topo de funil): Geram sempre um novo marco temporal
              finalUpdateId = crypto.randomUUID();
              isNewUpdate = true;
              break;

            case 'SIMULATE':
            case 'REDIRECT':
              // Ações de conversão (Fundo de funil): Evoluem OBRIGATORIAMENTE o estado atual
              if (!payload.visit_update_id) {
                // Trava de Segurança estourada antes de abrir transação no banco.
                throw new Error(`[FATAL] Ação '${targetAction}' exige um 'visit_update_id' explícito no payload.`);
              }
              finalUpdateId = payload.visit_update_id;
              isNewUpdate = false; 
              break;

            default:
              throw new Error(`[FATAL] Ação não suportada pelo Orquestrador: ${targetAction}`);
          }

          // Atualiza o payload com a Fonte da Verdade definitiva
          payload.visit_id = finalVisitId;
          payload.visit_update_id = finalUpdateId;
          const simulationId = payload.simulation_id || null;
          
          // ✨ A SUA REGRA DE OURO: Só manda persistir a entidade se a requisição
          // explícita de handoff S2S estiver presente neste exato ciclo.
          const hasSignedEntity = Boolean(validatedS2SEntity);

          // Montagem Final da URL de Destino (Injeção via Query String)
          const targetUrlStr = payload?.target_url || "/";
          const [cleanPath, queryStr] = targetUrlStr.split("?");
          const queryParams = new URLSearchParams(queryStr || "");
          
          queryParams.set("visit_id", finalVisitId);
          queryParams.set("visit_update_id", finalUpdateId);
          if (simulationId) queryParams.set("simulation_id", simulationId);
          
          const finalUrl = `${cleanPath}?${queryParams.toString()}`;

          // =====================================================================
          // [POST STEP 6] PERSISTÊNCIA (Fast Path ou Síncrona)
          // =====================================================================
          debugLog("[POST STEP 6] Chamando Camada de Persistência...");
          
          // 🚀 [PERFORMANCE]: `infra` só é resolvida aqui dentro — se a persistência for
          // backgrounded (navegação), a chamada de geo-localização nunca chega a ser
          // esperada pelo usuário; se for síncrona, ela já rodou em paralelo com toda a
          // hidratação/resolução de config acima, então o `await` abaixo tende a ser imediato.
          const buildPersistPromise = async () => {
            const infra = await infraPromise;
            return persistVisitData(
              sql, targetAction, finalVisitId, finalUpdateId, isNewVisit, isNewUpdate,
              hasSignedEntity, payload, infra, categoryId ?? undefined,
              payload.origin_url, payload.target_url, orchestratorConfigId
            );
          };

          const isNavigationAction = NAVIGATION_ACTIONS.includes(targetAction) && !isNewVisit;
          const rt = (globalThis as any).EdgeRuntime;

          if (isNavigationAction && rt && typeof rt.waitUntil === "function") {
            rt.waitUntil(
              buildPersistPromise().catch((err: any) => console.error("[Background Persist Error]:", err?.message || err))
            );
          } else {
            await buildPersistPromise();
          }

          debugLog("[POST FINAL] Retornando objeto de roteamento pro front-end...");
          return {
            status: 200,
            data: {
              action: "REDIRECT",
              url: finalUrl,
              visit_id: finalVisitId,
              visit_update_id: finalUpdateId,
              simulation_id: simulationId,
              partner_id: payload.partner_id ?? null,
              state: payload, // Cache do front-end é atualizado com as âncoras definitivas
            },
          };

        } catch (error: any) {
          debugLog(`[Orquestrador POST Error REAL]: ${error?.message}`, error);

          // ✨ Aplica o formatador de erros visuais (toUiError) 
          // para padronizar as respostas de falha no POST, igual já fazemos no GET.
          const uiError = toUiError(error, fallbacks, req.method);

          return {
            status: 400,
            data: {
              success: false,
              code: (uiError as any).errorCode,
              message: uiError.message,
              // Mantém o fallback que o erro possa ter injetado, ou usa o do toUiError
              fallback_url: (error as any).fallback_url || (uiError as any).fallback_url || originPath,
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