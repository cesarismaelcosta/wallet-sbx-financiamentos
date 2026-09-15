/**
 * @fileoverview Guarda de Perímetro de Sessão (SESSION_EXPIRED/UNAUTHORIZED Canônico)
 * @path supabase/functions/_shared/session-guard.ts
 *
 * ============================================================================
 * [ARQUITETURA & MOTIVAÇÃO]
 * ============================================================================
 * `SESSION_EXPIRED` e `UNAUTHORIZED` não são erros de negócio de uma rota
 * específica — são propriedades do token de sessão em si (`_shared/jwt.ts` /
 * `_shared/auth.ts`). `validateRequest()` só é capaz de lançar essas duas
 * causas, sempre pelo mesmo motivo, não importa qual Edge Function a chamou.
 *
 * Antes deste módulo, até 5 arquivos (`financial-gateway`, `orchestrator`,
 * `sbx-offer`, `sbx-offer-query`, `orchestrator-configs`) reimplementavam essa
 * mesma lógica de handoff token na mão — já divergente entre si (checagem via
 * `.split(':')` vs `.includes()`, extração só de GET vs GET+POST) — e uma
 * sexta (`sbx-event`) nem tinha a lógica, ficando sem handoff token nenhum.
 * Este módulo é a fonte única dessa lógica, usada por `_shared/server.ts`.
 *
 * [NOTA SOBRE `FORBIDDEN`/`INTERNAL_ERROR`]: as versões antigas tinham
 * branches pra esses dois códigos dentro do catch de `validateRequest`.
 * Confirmado por leitura de `_shared/auth.ts`: essa função só lança
 * `UNAUTHORIZED: ...` ou `SESSION_EXPIRED: ...` — nunca `FORBIDDEN` nem
 * `INTERNAL_ERROR`. Esses branches eram código morto (erros reais de
 * permissão, como `FORBIDDEN_ACCESS`/`FORBIDDEN_OFFER_ACCESS`, vêm de
 * `_shared/gatekeeper.ts`/`_shared/hydrate-data.ts`, em pontos totalmente
 * diferentes do código de cada rota) e por isso não foram trazidos pra cá.
 *
 * @author Cesar Ismael Pereira da Costa
 * @author Gemini Pro
 * @version 1.0.0
 */

import { validateRequest, type AuthContext } from "./auth.ts";
import { signSigninParameters } from "./s2s.ts";
import { debugLog } from "./logger.ts";

export type SessionGuardResult =
  | { ok: true; auth: AuthContext }
  | {
      ok: false;
      status: number;
      data: {
        success: false;
        code: "SESSION_EXPIRED" | "UNAUTHORIZED";
        message: string;
        fallback_url: string;
      };
    };

/**
 * @description Valida a sessão da requisição e, em caso de falha, monta a
 * resposta canônica de borda — incluindo o handoff token (Signed State) no
 * caso de `SESSION_EXPIRED`, pra devolver o usuário exatamente de onde saiu
 * depois de logar de novo.
 *
 * @param {Request} req - Requisição original.
 * @param {object} opts
 * @param {string} opts.originPath - Já sanitizado via `getSafeRedirectUrl`
 *   (header `x-original-url`), usado como fallback de `target_url`/`origin_url`.
 * @param {string} opts.authPath - Já sanitizado via `getSafeRedirectUrl`
 *   (header `x-auth-fallback-url`), base da URL de login.
 * @param {string} [opts.rawBody] - Corpo da requisição já lido pelo wrapper
 *   (necessário só quando `req.method === "POST"` e a rota carrega
 *   `visit_id`/`visit_update_id`/`target_url` no corpo, não na query string).
 */
export async function resolveSessionPerimeter(
  req: Request,
  opts: { originPath: string; authPath: string; rawBody?: string },
): Promise<SessionGuardResult> {
  const { originPath, authPath, rawBody } = opts;

  try {
    const auth = await validateRequest(req);
    return { ok: true, auth };
  } catch (err: any) {
    const message = String(err?.message || "");

    if (!message.includes("SESSION_EXPIRED")) {
      // Único outro caso possível: UNAUTHORIZED (token ausente/assinatura inválida).
      return {
        ok: false,
        status: 401,
        data: {
          success: false,
          code: "UNAUTHORIZED",
          message: "Falha de autenticação. Por favor, faça login novamente.",
          fallback_url: authPath,
        },
      };
    }

    // ✨ [HANDOFF TOKEN / SIGNED STATE]: A sessão expirou. Lacramos o cofre.
    let intentVisitId: string | null = null;
    let intentUpdateId: string | null = null;
    let intentTargetUrl = originPath;

    if (req.method === "POST" && rawBody) {
      try {
        const thin = JSON.parse(rawBody);
        intentVisitId = thin.visit_id || null;
        intentUpdateId = thin.visit_update_id || thin.origin_visit_update_id || null;

        // [v2.0.1]: fallback pra chamadores (ex: sbx-offer-query) cujo
        // corpo POST nunca carrega visit_id/visit_update_id (payload de
        // negócio sem relação com a visita, ex: paginação/filtros) — só
        // entra aqui se o corpo não tiver NENHUM dos dois. Não muda em
        // nada o comportamento já validado em produção pro
        // financial-gateway, cujo corpo sempre carrega os dois.
        if (!intentVisitId && !intentUpdateId) {
          try {
            const [, originQuery = ""] = originPath.split("?");
            const originParams = new URLSearchParams(originQuery);
            intentVisitId = originParams.get("visit_id") || null;
            intentUpdateId = originParams.get("visit_update_id") || null;
          } catch (_e2) {
            // Segue sem os IDs — pior caso, o target_url cai no default.
          }
        }

        const rawOrigin = thin.origin_url || thin.target_url || originPath;
        const [path, query = ""] = String(rawOrigin).split("?");
        const qParams = new URLSearchParams(query);
        if (intentVisitId) qParams.set("visit_id", intentVisitId);
        if (intentUpdateId) qParams.set("visit_update_id", intentUpdateId);

        const queryStr = qParams.toString();
        intentTargetUrl = queryStr ? `${path}?${queryStr}` : path;
      } catch (_e) {
        // Corpo ilegível: segue com o fallback de originPath já default.
      }
    } else {
      try {
        const [path, query = ""] = originPath.split("?");
        const qParams = new URLSearchParams(query);
        intentVisitId = qParams.get("visit_id") || null;
        intentUpdateId = qParams.get("visit_update_id") || null;
        intentTargetUrl = originPath;

        // [v2.0.1]: fallback pra chamadores (ex: orchestrator) que mandam
        // visit_id/visit_update_id na query string da própria chamada à
        // API (req.url), não embutido no x-original-url — só entra aqui
        // se o originPath não tiver NENHUM dos dois. Não muda em nada o
        // comportamento já validado em produção pro sbx-event/sbx-offer/
        // orchestrator-configs, que sempre acham os dois no originPath.
        if (!intentVisitId && !intentUpdateId) {
          try {
            const apiParams = new URL(req.url).searchParams;
            const apiVisitId = apiParams.get("visit_id");
            const apiUpdateId = apiParams.get("visit_update_id");
            if (apiVisitId || apiUpdateId) {
              intentVisitId = apiVisitId;
              intentUpdateId = apiUpdateId;
              if (apiVisitId) qParams.set("visit_id", apiVisitId);
              if (apiUpdateId) qParams.set("visit_update_id", apiUpdateId);
              const queryStr = qParams.toString();
              intentTargetUrl = queryStr ? `${path}?${queryStr}` : path;
            }
          } catch (_e2) {
            // Segue com o originPath verbatim já default.
          }
        }
      } catch (_e) {}
    }

    let fallbackUrl: string;
    try {
      const handoffToken = await signSigninParameters({
        visit_id: intentVisitId,
        visit_update_id: intentUpdateId,
        target_url: intentTargetUrl,
        origin_url: originPath,
      });

      const cleanAuthPath = authPath.split("?")[0] || "/accounts/signin";
      fallbackUrl = `${cleanAuthPath}?handoff_token=${handoffToken}`;

      debugLog("[SessionGuard] Handoff Token emitido com sucesso.");
    } catch (jwtErr) {
      debugLog("[SessionGuard] Erro ao assinar Handoff Token. Roteando limpo.", jwtErr);
      fallbackUrl = authPath.split("?")[0] || "/accounts/signin";
    }

    return {
      ok: false,
      status: 401,
      data: {
        success: false,
        code: "SESSION_EXPIRED",
        message: "Sua sessão expirou. Por favor, faça login novamente.",
        fallback_url: fallbackUrl,
      },
    };
  }
}