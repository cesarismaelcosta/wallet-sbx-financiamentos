/**
 * @fileoverview Camada de serviço do Orquestrador sbX (Zero-Trust).
 * @path src/features/financial-hub/core/hooks/useOrchestrator.ts
 *
 * ============================================================================
 * ARCHITECTURE SPECIFICATION: ZERO-TRUST + EVENTUAL CONSISTENCY
 * ============================================================================
 * - Active Tracking: registro de intenção estritamente via interação do usuário.
 * - URL as Truth: o cursor da jornada (visit_id + visit_update_id) vive na URL.
 * - Thin Payload: o Frontend envia apenas AÇÃO + IDs. Identidade sai do JWT e
 *   os dados financeiros são buscados pelo backend (S2S). Nenhum PII trafega
 *   a partir do browser.
 * - Race Condition Shield: como a borda responde de forma assíncrona
 *   (waitUntil), a hidratação tolera atraso de commit com retry + backoff.
 *
 * @author Cesar Ismael Pereira da Costa
 * @author Gemini Pro
 * @version 8.0.0 (Zero-Trust / Thin Payload)
 */

import { useState, useEffect, useRef } from "react";
import { callOrchestrator, GatewayErrorResponse } from "@/features/financial-hub/core/services/gateway";

/** Backoff exponencial simples. */
const delay = (ms: number) => new Promise((res) => setTimeout(res, ms));

export type OrchestratorAction = "VISIT" | "CONSULT" | "REDIRECT" | "SIMULATE" | "CONTACT";

/** Matriz de origem/tracking (sem PII). */
export interface InteractionContext {
  utm_source: "direct" | "offer" | "lp" | "banner" | "whatsapp" | "email" | "sms";
  utm_medium?: "none" | "sms" | "push" | "qr-code" | "organic";
  utm_campaign?: string;
  origin_url?: string;
}

/**
 * Contrato Thin de saída: intenção + identificadores.
 * Objetos gordos (entity, offer, seller, event) NÃO fazem parte do contrato —
 * são hidratados no Edge via hydrate-data.
 */
export interface ThinInteractionPayload {
  action?: OrchestratorAction;
  visit_id?: string;
  visit_update_id?: string;
  origin_visit_update_id?: string;
  simulation_id?: string;
  product_id?: number;
  category_id?: number;
  offer_id?: string | number;
  event_id?: string | number;
  seller_id?: string | number;
  entity_id?: string | number;
  origin_url?: string;
  target_url?: string;
  interaction_context?: InteractionContext;
}

/**
 * useOrchestratorHydration
 * Ciclo de vida da HIDRATAÇÃO (GET). Usa estritamente a URL como fonte:
 * exige visit_id e visit_update_id (cursor temporal obrigatório).
 */
export function useOrchestratorHydration(visitId: string | null, visitUpdateId?: string | null) {
  const [simData, setSimData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Partial<GatewayErrorResponse> | null>(null);
  const [retryCount, setRetryCount] = useState<number>(0);

  // Tolerância a GET que atropela o POST em background (waitUntil).
  const MAX_RETRIES = 2;

  const lastFetchedHash = useRef<string | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const effectiveUpdateId = visitUpdateId || urlParams.get("visit_update_id");

    if (!visitId || !effectiveUpdateId) {
      if (visitId && !effectiveUpdateId) {
        console.warn(
          "⚠️ [Orchestrator] 'visit_update_id' ausente na URL! Hidratação abortada: o cursor temporal é obrigatório.",
        );
      }
      setLoading(false);
      return;
    }

    const currentHash = `${visitId}-${effectiveUpdateId}`;
    if (lastFetchedHash.current === currentHash) return;

    lastFetchedHash.current = currentHash;
    setLoading(true);

    callOrchestrator({ visit_id: visitId, visit_update_id: effectiveUpdateId }, "GET")
      .then((data) => {
        setSimData(data);
        setError(null);
        setRetryCount(0);
        setLoading(false);
      })
      .catch(async (err) => {
        if (retryCount < MAX_RETRIES) {
          console.warn(
            `🔄 [Orchestrator] Consistência eventual/falha de rede. Retry (${retryCount + 1}/${MAX_RETRIES})...`,
          );
          await delay(150 * (retryCount + 1));
          lastFetchedHash.current = null;
          setRetryCount((prev) => prev + 1);
        } else {
          console.error("❌ [Orchestrator] Limite de tentativas excedido. Interrompendo hidratação.");
          setError(err);
          setLoading(false);
        }
      });
  }, [visitId, visitUpdateId, retryCount]);

  return { simData, loading, error };
}

/**
 * orchestrateNavigation
 * Envia a INTENÇÃO (POST) e navega conforme a URL decidida pelo backend.
 * O payload é montado em formato Thin — o gateway ainda reforça o achatamento.
 */
export const orchestrateNavigation = async (
  action: OrchestratorAction,
  Payload: ThinInteractionPayload & Record<string, any> = {},
): Promise<void> => {
  if (typeof window === "undefined") {
    console.warn(`⚠️ [orchestrateNavigation] Navegação no servidor abortada para a ação: ${action}.`);
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const currentVisitId = urlParams.get("visit_id");
  const currentUpdateId = urlParams.get("visit_update_id");
  const originUrl = Payload.origin_url || window.location.href;

  const thinPayload: ThinInteractionPayload = {
    action,
    origin_url: originUrl,
    target_url: Payload.target_url,
    visit_id: Payload.visit_id || currentVisitId || undefined,
    origin_visit_update_id: Payload.origin_visit_update_id || currentUpdateId || undefined,
    simulation_id: Payload.simulation_id,
    product_id: Payload.product_id,
    category_id: Payload.category_id ?? Payload.offer?.category_id,
    offer_id: Payload.offer_id ?? Payload.offer?.offer_id,
    event_id: Payload.event_id ?? Payload.event?.event_id,
    seller_id: Payload.seller_id ?? Payload.seller?.seller_id,
    entity_id: Payload.entity_id ?? Payload.entity?.entity_id,
    interaction_context: {
      utm_source: Payload.interaction_context?.utm_source ?? "direct",
      utm_medium: Payload.interaction_context?.utm_medium,
      utm_campaign: Payload.interaction_context?.utm_campaign,
      origin_url: originUrl,
    },
  };

  console.log("🚀 [useOrchestrator] ThinPayload enviado:", JSON.stringify(thinPayload, null, 2));

  try {
    const data = await callOrchestrator(thinPayload, "POST");

    if (data?.url) {
      const currentPath = window.location.href.split("?")[0];
      const targetPath = data.url.split("?")[0];

      if (targetPath === currentPath) {
        console.warn("[useOrchestrator] Destino idêntico à origem. ReplaceState silencioso para hidratar a URL.");
        window.history.replaceState({}, "", data.url);
      } else {
        window.location.replace(data.url);
      }
    } else {
      console.warn("⚠️ [useOrchestrator] Backend processou o payload, mas reteve a URL de destino.");
    }
  } catch (err: any) {
    console.error("❌ [useOrchestrator] Aborto crítico no fluxo de orquestração:", err);

    if (err?.fallback_url) {
      const urlObj = new URL(err.fallback_url, window.location.origin);
      if (err.message) urlObj.searchParams.set("alert_msg", err.message);
      if (err.code) urlObj.searchParams.set("alert_type", err.code);
      window.location.replace(urlObj.toString());
      return;
    }

    throw err;
  }
};
