/**
 * @fileoverview Lógica de Serviço (Service Layer) para o Orquestrador sbX.
 * * ============================================================================
 * ARQUITETURA DE DADOS E NAVEGAÇÃO (Padrão Zero-Storage)
 * ============================================================================
 * - Active Tracking: O registro de intenção ocorre estritamente via interação (click/submit).
 * - URL as Single Source of Truth: O estado da jornada foi migrado de sessionStorage 
 * para URL Search Params (?visit_id=X). Isso imuniza a aplicação contra a falha 
 * clássica de dessincronização ao usar o botão "Voltar" (Back/Forward) do navegador.
 * - Responsabilidade: O Orquestrador atua como o "Traffic Controller", garantindo 
 * que nenhuma simulação ocorra sem rastreabilidade e contexto prévio.
 */

import { useState, useEffect, useRef } from "react";
import { callOrchestrator } from "@/features/financial-hub/core/services/gateway";

/**
 * @interface Entity
 * @description Representa o proponente da transação (PF ou PJ).
 * O 'entity_id' suporta string para garantir conformidade com o tipo TEXT no banco de dados.
 */
export interface Entity {
  entity_id: number | string;
  name: string;
  document: string;
  phone: string;
  email: string;
  birth_date: string; // Padrão de ingestão: ISO String ou YYYY-MM-DD
  gender: string;
  [key: string]: any; // Extensibilidade para campos dinâmicos (ex: renda, profissão)
}

/**
 * @interface Manager
 * @description Representa o operador/gerenciador da oferta (ex: Leiloeiro).
 * Responsável pela operação estrutural do evento de venda.
 */
export interface Manager {
  manager_name: string;
  [key: string]: any; // Metadados para persistência na coluna JSONB 'manager_details'
}

/**
 * @interface Seller
 * @description Representa o vendedor ou proprietário real do bem ativo.
 * Vital para fluxos B2B2C onde o operador (Manager) difere do dono do ativo.
 */
export interface Seller {
  seller_id: string;
  legal_name: string;
  trade_name: string;
  economic_group: string;
  [key: string]: any; // Metadados para persistência na coluna JSONB 'seller_details'
}

/**
 * @interface Event
 * @description Snapshot contextual e temporal do evento de origem (ex: Leilão, Campanha).
 */
export interface Event {
  event_id: string;
  event_description: string;
  event_start_date: string;
  event_end_date: string;
  [key: string]: any; // Atributos estendidos (ex: numero_leilao, modalidade_evento)
}

/**
 * @interface Vehicle
 * @description Atributos técnicos específicos para o nicho de garantias/financiamento automotivo.
 */
export interface Vehicle {
  manufacture_year: number;
  model_year: number;
  fipe_code: string;
  fipe_value?: number;
  [key: string]: any; // Flexibilidade para chassi, quilometragem, placa, cor
}

/**
 * @interface Offer
 * @description Oferta comercial abstrata (Agnóstica ao tipo de produto).
 * O detalhamento técnico (vehicle, real_estate) deve ser injetado dinamicamente nas chaves extras.
 */
export interface Offer {
  offer_id: string;
  offer_description: string;
  offer_value: number;
  category_id?: number; // Preenchido no backend via roteamento (de-para)
  category: string;     // String literal enviada pelo frontend/sandbox
  [key: string]: any;   // Extensão de payload (Ex: Injeção de 'vehicle' ou 'equity')
}

/**
 * @interface InteractionContext
 * @description Define a matriz de origem e o tracking de marketing do usuário.
 * Fundamental para o motor de regras definir elegibilidade baseada no canal de aquisição.
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
 * Encapsula a jornada, o usuário e a intenção comercial em uma única transação.
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
 * * @param {string | null} visitId - O ID primário da sessão atual.
 * @param {string | null} [visitUpdateId] - O ID secundário (snapshot) da última interação.
 * @returns {Object} { simData, loading, error } - Estado reativo da hidratação.
 */
export function useOrchestratorHydration(visitId: string | null, visitUpdateId?: string | null) {
  const [simData, setSimData] = useState<any | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  /**
   * TRAVA DE SEGURANÇA INTELIGENTE (Anti-Back Button)
   * Armazena um "hash" composto pela assinatura da URL atual. Se o usuário usar 
   * a navegação nativa do browser para retroceder, o useEffect detectará a mudança 
   * de hash e fará um re-fetch limpo do passado, evitando dados fantasmas na tela.
   */
  const lastFetchedHash = useRef<string | null>(null);

  useEffect(() => {
    // 1. Definição Dinâmica do Contexto (Prioridade: Prop -> URL Atual)
    const urlParams = new URLSearchParams(window.location.search);
    const effectiveUpdateId = visitUpdateId || urlParams.get("visit_update_id");

    // 2. Early Return: Sem chaves primárias, interrompe o ciclo para economizar I/O.
    if (!visitId || !effectiveUpdateId) {
      setLoading(false);
      return;
    }

    // 3. Verificação de Integridade de Chamada Dupla (React Strict Mode / Rerenders)
    const currentHash = `${visitId}-${effectiveUpdateId}`;
    if (lastFetchedHash.current === currentHash) {
      return; // Já hidratamos este exato estado, aborta chamada duplicada.
    }

    // 4. Marcação Pré-fetch (Evita Race Conditions)
    lastFetchedHash.current = currentHash;
    setLoading(true);

    console.group(`[useOrchestrator.ts | useOrchestratorHydration] Hydratação de página:`);
    console.log("visit_id Enviado para Orquestração:", visitId);
    console.log("visit_update_id Recebido:", visitUpdateId);
    console.log("visit_update_id Parametro da URL:", urlParams.get("visit_update_id"));
    console.groupEnd();

    // 5. Execução do Pipeline de Leitura
    callOrchestrator({ visit_id: visitId, visit_update_id: effectiveUpdateId }, "GET")
      .then((data) => {
        setSimData(data);
        setError(null);
      })
      .catch((err) => {
        console.error(`❌ [useOrchestrator.ts | useOrchestratorHydration] Erro crítico para visita [${visitId}]:`, err);
        setError(err.message || "[useOrchestrator.ts | useOrchestratorHydration] Falha na resolução do contrato no Orchestrator.");
      })
      .finally(() => setLoading(false));

  }, [visitId, visitUpdateId]); // Array de dependência garante reação a mudanças na rota

  return { simData, loading, error };
}

/**
 * @function orchestrateNavigation
 * @description Ponto focal para envio de intenções de roteamento (POST Method).
 * Captura o estado atual, empacota as intenções do usuário e decide o fluxo 
 * de navegação seguro com base na resposta assinada pelo backend.
 * * @param {'VISIT' | 'CONSULT' | 'REDIRECT' | 'SIMULATE' | 'CONTACT'} action - Categoria da intenção.
 * @param {any} [Payload={}] - Dados fragmentados ou totais preenchidos no form da interface.
 * @throws {Error} Propaga falhas de rede ou de pipeline de backend para tratamento na UI.
 */
export const orchestrateNavigation = async (
  action: "VISIT" | "CONSULT" | "REDIRECT" | "SIMULATE" | "CONTACT",
  Payload: any = {},
): Promise<void> => {
  
  // 1. GUARDA DE SEGURANÇA SSR:
  // Se não estivermos no navegador, não fazemos nada. (importante para nosso loader de SSR)
  if (typeof window === "undefined") {
    console.warn(`⚠️ [orchestrateNavigation] Tentativa de navegar no servidor para a ação: ${action}. Abortando.`);
    return;
  }

  // 2. Snapshot da Origem: Lê os rastros de onde o usuário está EXATAMENTE agora.
  const urlParams = new URLSearchParams(window.location.search);
  const currentVisitId = urlParams.get("visit_id");
  const currentUpdateId = urlParams.get("visit_update_id");

  // 3. Montagem do Payload Master
  const orchestratorPayload = {
    action: action,
    origin_url: Payload.origin_url || window.location.href,
    target_url: Payload.target_url,
    visit_id: currentVisitId || undefined,
    origin_visit_update_id: currentUpdateId || undefined,
    ...Payload,
    interaction_context: {
      utm_source: Payload.interaction_context?.utm_source || "sandbox_navigation",
      origin_url: Payload.origin_url || window.location.href,
      target_url: Payload.target_url,
      ...(Payload.interaction_context || {}),
    },
  };

  console.log("🚀 [useOrchestrator.ts | orchestrateNavigation] Payload enviado para análise de roteamento:", JSON.stringify(orchestratorPayload, null, 2));

  try {
    // 4. Transmissão Segura
    const data = await callOrchestrator(orchestratorPayload, "POST");

    // 5. Lógica de Redirecionamento Baseada em Estado (SPA Optimization)
    if (data?.url) {
      const currentPath = window.location.href.split('?')[0];
      const targetPath = data.url.split('?')[0];

      // AVALIAÇÃO DE ROTA:
      // Se o backend ordenou ficar na mesma página (ex: simulação multipassos no mesmo componente),
      // fazemos uma injeção silenciosa dos novos parâmetros na URL, preservando o estado vivo do React.
      if (targetPath === currentPath) {
        console.warn("[useOrchestrator.ts | orchestrateNavigation] Destino idêntico à origem. Executando ReplaceState silencioso para hidratar URL.");
        window.history.replaceState({}, "", data.url);
      } else {
        // Se a rota for efetivamente nova, repassamos o controle para o navegador (Hard Redirect).
        window.location.replace(data.url);
      }
    } else {
      console.warn("⚠️ [useOrchestrator.ts | orchestrateNavigation] Backend processou o payload, mas reteve a URL de destino.");
    }
  } catch (err) {
    console.error("❌ [useOrchestrator.ts | orchestrateNavigation] Aborto crítico no fluxo de orquestração:", err);
    throw err;
  }
};