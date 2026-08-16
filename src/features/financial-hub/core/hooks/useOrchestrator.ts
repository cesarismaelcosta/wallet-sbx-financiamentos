/**
 * @fileoverview Lógica de Serviço (Service Layer) para o Orquestrador sbX.
 * @path src/features/financial-hub/core/hooks/useOrchestrator.ts
 * 
 * ============================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: EVENTUAL CONSISTENCY & RESILIENCE
 * ============================================================================
 * - Active Tracking: O registro de intenção ocorre estritamente via interação.
 * - URL as Truth: O estado da jornada migrou do sessionStorage para a URL.
 * 
 * [MUDANÇAS ARQUITETURAIS - REFATORAÇÃO DE PERFORMANCE]:
 * 1. {Race Condition Shield}: O `MAX_RETRIES` do hook de hidratação foi elevado 
 *    para 2. Como as rotas de navegação agora respondem de forma assíncrona 
 *    (`waitUntil`), o Frontend pode chegar na próxima tela ANTES do banco 
 *    commitar a transação de escrita. Esse *backoff* local do React garante 
 *    que a UI espere a "consistência eventual" da infraestrutura se assentar 
 *    sem quebrar a jornada do usuário.
 * 
 * @author Cesar Ismael Pereira da Costa
 * @author Gemini Pro
 * @version 7.8.0 (Resiliência Híbrida para Transações Assíncronas)
 */

import { useState, useEffect, useRef } from "react";
import { callOrchestrator, GatewayErrorResponse } from "@/features/financial-hub/core/services/gateway";

/**
 * @interface Entity
 * @description Representa o proponente da transação (PF ou PJ).
 */
export interface Entity {
  entity_id: number | string;
  name: string;
  document: string;
  phone: string;
  email: string;
  birth_date: string; 
  gender: string;
  [key: string]: any; 
}

/**
 * @interface Manager
 * @description Representa o operador/gerenciador da oferta (ex: Leiloeiro).
 */
export interface Manager {
  manager_name: string;
  [key: string]: any;
}

/**
 * @interface Seller
 * @description Representa o vendedor ou proprietário real do bem ativo.
 */
export interface Seller {
  seller_id: string;
  legal_name: string;
  trade_name: string;
  economic_group: string;
  [key: string]: any;
}

/**
 * @interface Event
 * @description Snapshot contextual e temporal do evento de origem.
 */
export interface Event {
  event_id: string;
  event_description: string;
  event_start_date: string;
  event_end_date: string;
  [key: string]: any;
}

/**
 * @interface Vehicle
 * @description Atributos técnicos para o nicho de garantias automotivas.
 */
export interface Vehicle {
  manufacture_year: number;
  model_year: number;
  fipe_code: string;
  fipe_value?: number;
  [key: string]: any;
}

/**
 * @interface Offer
 * @description Oferta comercial abstrata (Agnóstica ao tipo de produto).
 */
export interface Offer {
  offer_id: string;
  offer_description: string;
  offer_value: number;
  category_id?: number; 
  category: string;     
  [key: string]: any;   
}

/**
 * @interface InteractionContext
 * @description Define a matriz de origem e tracking.
 */
export interface InteractionContext {
  utm_source: "direct" | "offer" | "lp" | "banner" | "whatsapp" | "email" | "sms";
  utm_medium: "none" | "sms" | "push" | "qr-code" | "organic";
  utm_campaign: string;
  origin_url: string;
}

/**
 * @interface OrchestratorPayload
 * @description Contrato mestre de I/O para o ecossistema sbX. 
 */
export interface OrchestratorPayload {
  interaction_context: InteractionContext;
  entity?: Entity;
  manager?: Manager;
  seller?: Seller;
  event?: Event;
  offer?: Offer;
  product_id?: number;
  action?: "VISIT" | "CONSULT" | "REDIRECT" | "SIMULATE" | "CONTACT";
  visit_id?: string;
  visit_update_id?: string;
  origin_visit_update_id?: string;
  simulation_id?: string;
  origin_url?: string;
  target_url?: string;
  collateral_vehicle?: Vehicle;
  collateral_home?: any;
  [key: string]: any;
}

/**
 * @hook useOrchestratorHydration
 * @description Hook responsável pelo ciclo de vida de HIDRATAÇÃO (GET Method).
 * Recupera os dados validados do backend utilizando ESTRITAMENTE a URL como fonte.
 * @param {string | null} visitId - O ID primário da sessão atual.
 * @param {string | null} [visitUpdateId] - O ID secundário (snapshot) da última interação.
 * @returns {Object} { simData, loading, error } - Estado reativo da hidratação.
 */
export function useOrchestratorHydration(visitId: string | null, visitUpdateId?: string | null) {
  const [simData, setSimData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  
  const [error, setError] = useState<Partial<GatewayErrorResponse> | null>(null);

  const [retryCount, setRetryCount] = useState<number>(0);
  
  // ✨ [RACE CONDITION SHIELD]: Aumentado para 2. Garante tolerância 
  // caso o GET atropele o POST background (`waitUntil`) na rede.
  const MAX_RETRIES = 2; 

  const lastFetchedHash = useRef<string | null>(null);

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const effectiveUpdateId = visitUpdateId || urlParams.get("visit_update_id");

    if (!visitId || !effectiveUpdateId) {
      if (visitId && !effectiveUpdateId) {
        console.warn("⚠️ [Orchestrator] 'visit_update_id' ausente na URL! A hidratação foi abortada pois o cursor temporal é obrigatório. Verifique a Edge Function (Gateway).");
      }
      setLoading(false);
      return;
    }

    const currentHash = `${visitId}-${effectiveUpdateId}`;
    if (lastFetchedHash.current === currentHash) {
      return;
    }

    lastFetchedHash.current = currentHash;
    setLoading(true);

    callOrchestrator({ visit_id: visitId, visit_update_id: effectiveUpdateId }, "GET")
      .then((data) => {
        setSimData(data);
        setError(null);
        setRetryCount(0); // Reseta resiliência após sucesso
        setLoading(false);
      })
      .catch((err) => {
        if (retryCount < MAX_RETRIES) {
          console.warn(`🔄 [Orchestrator] Consistência eventual ou falha de rede detectada. Acionando Retry Automático (${retryCount + 1}/${MAX_RETRIES})...`);
          lastFetchedHash.current = null; // Destrava a ref otimista
          setRetryCount((prev) => prev + 1); // Mutação do estado re-dispara o useEffect
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
 * @function orchestrateNavigation
 * @description Ponto focal para envio de intenções de roteamento (POST Method).
 * Captura o estado atual, empacota as intenções do usuário e decide o fluxo 
 * de navegação seguro com base na resposta assinada pelo backend.
 * @param {'VISIT' | 'CONSULT' | 'REDIRECT' | 'SIMULATE' | 'CONTACT'} action - Categoria da intenção.
 * @param {any} [Payload={}] - Dados fragmentados ou totais preenchidos no form da interface.
 * @throws {Error} Propaga falhas de rede ou de pipeline de backend para tratamento na UI.
 */
export const orchestrateNavigation = async (
  action: "VISIT" | "CONSULT" | "REDIRECT" | "SIMULATE" | "CONTACT",
  Payload: any = {},
): Promise<void> => {
  
  if (typeof window === "undefined") {
    console.warn(`⚠️ [orchestrateNavigation] Tentativa de navegar no servidor para a ação: ${action}. Abortando.`);
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const currentVisitId = urlParams.get("visit_id");
  const currentUpdateId = urlParams.get("visit_update_id");

  const orchestratorPayload = {
    action: action,
    origin_url: Payload.origin_url || window.location.href,
    target_url: Payload.target_url,
    visit_id: currentVisitId || undefined,
    origin_visit_update_id: currentUpdateId || undefined,
    ...Payload,
    interaction_context: {
      utm_source: Payload.interaction_context?.utm_source,
      origin_url: Payload.origin_url || window.location.href,
      target_url: Payload.target_url,
      ...(Payload.interaction_context || {}),
    },
  };

  console.log("🚀 [useOrchestrator.ts | orchestrateNavigation] Payload enviado para análise de roteamento:", JSON.stringify(orchestratorPayload, null, 2));

  try {
    const data = await callOrchestrator(orchestratorPayload, "POST");

    if (data?.url) {
      const currentPath = window.location.href.split('?')[0];
      const targetPath = data.url.split('?')[0];

      if (targetPath === currentPath) {
        console.warn("[useOrchestrator.ts | orchestrateNavigation] Destino idêntico à origem. Executando ReplaceState silencioso para hidratar URL.");
        window.history.replaceState({}, "", data.url);
      } else {
        window.location.replace(data.url);
      }
    } else {
      console.warn("⚠️ [useOrchestrator.ts | orchestrateNavigation] Backend processou o payload, mas reteve a URL de destino.");
    }
  } catch (err: any) {
    console.error("❌ [useOrchestrator.ts | orchestrateNavigation] Aborto crítico no fluxo de orquestração:", err);
    
    if (err.fallback_url) {
       console.warn(`[Orchestrator] Forçando redirecionamento de erro para: ${err.fallback_url}`);
       
       const urlObj = new URL(err.fallback_url, window.location.origin);
       
       if (err.message) {
         urlObj.searchParams.set("alert_msg", err.message);
       }
       if (err.code) {
         urlObj.searchParams.set("alert_type", err.code);
       }

       window.location.replace(urlObj.toString());
       return; 
    }

    throw err;
  }
};