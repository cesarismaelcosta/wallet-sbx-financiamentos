/**
 * @fileoverview Lógica de Serviço (Service Layer) para o Orquestrador sbX.
 * * ARQUITETURA DE DADOS:
 * - O sistema utiliza Active Tracking: Registro ocorre apenas via interação (click).
 * - O estado da jornada é persistido via sessionStorage para garantir continuidade.
 * - O Orquestrador é o "Single Source of Truth" para rotas e registro de visitas.
 */

import { useState, useEffect, useRef } from "react";
import { callOrchestrator } from "@/features/financial-hub/core/services/gateway";

/**
 * @interface Entity
 * @description Representa o proponente. 
 * A mudança para 'number | string' no entity_id é para suportar o tipo TEXT do banco.
 */
export interface Entity {
  entity_id: number | string; 
  name: string;
  document: string;
  phone: string;
  email: string;
  birth_date: string; // ISO String ou YYYY-MM-DD
  gender: string;
  [key: string]: any; // Permite campos extras genéricos (ex: renda, profissão)
}

/**
 * @interface Manager
 * @description Representa o operador/gerenciador da oferta (manager_details).
 * Esta entidade é responsável pela operação do leilão ou evento.
 */
export interface Manager {
  manager_name: string;
  [key: string]: any; // Captura metadados específicos para a coluna JSONB manager_details
}

/**
 * @interface Seller
 * @description Representa o vendedor/proprietário real do bem (seller_details).
 * Importante para fluxos onde o operador (Manager) é diferente do dono do produto.
 */
export interface Seller {
  seller_id: string;
  legal_name: string;
  trade_name: string;
  economic_group: string;
  [key: string]: any; // Captura metadados específicos para a coluna JSONB seller_details
}

/**
 * @interface Event
 * @description Snapshot do contexto temporal e descritivo do evento (event_details).
 * Focada estritamente em metadados do leilão ou campanha.
 */
export interface Event {
  event_id: string;
  event_description: string;
  event_start_date: string;
  event_end_date: string;
  [key: string]: any; // Captura campos como 'numero_leilao' ou 'tipo_evento' (event_details)
}

/**
 * @interface Vehicle
 * @description Atributos técnicos específicos para o nicho de veículos.
 */
export interface Vehicle {
  manufacture_year: number;
  model_year: number;
  fipe_code: string;
  fipe_value?: number;
  [key: string]: any; // Captura cor, placa, chassi ou quilometragem
}

/**
 * @interface Offer
 * @description A oferta comercial genérica. 
 * Não mapeamos detalhes específicos (veículo, imóvel) aqui para manter a 
 * flexibilidade total via index signature.
 */
export interface Offer {
  offer_id: string;
  offer_description: string;
  offer_value: number;
  category_id?: number;    // Injetado pelo Orquestrador após o de-para
  category: string;        // Texto vindo do site/sandbox
  [key: string]: any;      // Aqui entrará 'vehicle', 'equity' ou qualquer outro detalhe enviado
}

/**
 * @interface InteractionContext
 * @description Define a origem e o contexto da interação do usuário.
 * É o rastreador que determina as regras de validação que serão aplicadas.
 */
export interface InteractionContext {
  utm_source: 'direct' | 'offer' | 'lp' | 'banner' | 'whatsapp' | 'email' | 'sms';
  utm_medium: 'none' | 'sms' | 'push' | 'qr-code' | 'organic';
  utm_campaign: string;
  origin_url: string;
}

/**
 * @interface OrchestratorPayload
 * @description O contrato mestre de entrada para o ecossistema sbX.
 */
export interface OrchestratorPayload {
  interaction_context: InteractionContext;
  entity?: Entity;
  manager?: Manager;
  seller?: Seller;
  event?: Event;
  offer?: Offer;
  product_id?: number; 
  action?: 'VISIT' | 'CONSULT' | 'REDIRECT' | 'SIMULATE' | 'CONTACT';
  visit_id?: string; 
  visit_update_id?: string;
  origin_visit_update_id?: string;
  simulation_id?: string;
  origin_url?: string;
  target_url?: string;
  collateral_vehicle?: Vehicle; // Expansão para car_equity
  collateral_home?: any;        // Expansão para home_equity
  [key: string]: any;
}

/**
 * @hook useOrchestratorHydration
 * @description Responsável pela HIDRATAÇÃO (GET). 
 * Recupera dados persistidos para preencher formulários e estados iniciais.
 * * @param {string} [visitId] - Opcional. Caso omitido, busca no sessionStorage.
 * @param {string} [visitUpdateId] - Opcional. Caso omitido, busca no sessionStorage.
 * @returns {Object} simData, loading, error - Retorna o estado da simulação.
 */
export function useOrchestratorHydration(visitId?: string, visitUpdateId?: string) {
  const [simData, setSimData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // TRAVA DE SEGURANÇA: Previne múltiplas requisições idênticas durante re-renders
  const hasFetched = useRef(false);

  useEffect(() => {
    // RESOLUÇÃO DE DADOS: Prioriza parâmetros passados, fallback para storage.
    // Isso permite que o layout passe o dado (se existir) ou apenas "acorde" o hook.
    const effectiveVisitId = visitId || sessionStorage.getItem("sbx_visit_id");
    const effectiveUpdateId = visitUpdateId || sessionStorage.getItem("sbx_last_update_id");

    if (hasFetched.current || !effectiveVisitId) {
      setLoading(false);
      return;
    }
    
    // PERSISTÊNCIA DE SESSÃO: Atualiza o cofre local antes da chamada.
    hasFetched.current = true;
    sessionStorage.setItem("sbx_visit_id", effectiveVisitId); 
    sessionStorage.setItem("sbx_last_update_id", effectiveUpdateId || ""); 

    // GATEWAY CALL: A chamada ao orchestrator é blindada pelos interceptors no gateway.ts
    callOrchestrator(
      { visit_id: effectiveVisitId, visit_update_id: effectiveUpdateId }, 
      'GET' 
    )
    .then((data) => {
      setSimData(data);
      setError(null);
    })
    .catch((err) => {
      // LOG DE SEGURANÇA: Capturamos erros aqui para evitar estouro na UI
      console.error(`❌ [useOrchestratorHydration] Falha de hidratação:`, err);
      setError(err.message || "Falha na resolução do contrato.");
    })
    .finally(() => setLoading(false));
  }, [visitId, visitUpdateId]);

  return { simData, loading, error };
}

/**
 * @function orchestrateNavigation
 * @description Ponto de escrita (POST). Registra jornadas e gerencia redirecionamentos.
 * * @param {'VISIT' | 'CONSULT' | 'REDIRECT' | 'SIMULATE' | 'CONTACT'} action - Intenção do lead.
 * @param {Object} Payload - Objeto com os metadados da interação.
 * @throws {Error} Lança erro caso o backend responda com status não 2xx.
 */
export const orchestrateNavigation = async (
  action: 'VISIT' | 'CONSULT' | 'REDIRECT' | 'SIMULATE' | 'CONTACT',
  Payload: any = {}
): Promise<void> => {
  
  const visitId = sessionStorage.getItem("sbx_visit_id");
  const originUpdateId = sessionStorage.getItem("sbx_last_update_id");

  const orchestratorPayload = {
    action,
    origin_url: Payload.origin_url,
    target_url: Payload.target_url,
    visit_id: visitId || undefined,
    origin_visit_update_id: originUpdateId || undefined,
    ...Payload,
    interaction_context: {
      utm_source: "sandbox_navigation",
      ...(Payload.interaction_context || {})
    }
  };

  try {
    const data = await callOrchestrator(orchestratorPayload, 'POST');
    
    // ATUALIZAÇÃO DE ESTADO: Mantém o cofre sincronizado com a resposta do backend
    if (data?.visit_id) sessionStorage.setItem("sbx_visit_id", data.visit_id);
    if (data?.visit_update_id) sessionStorage.setItem("sbx_last_update_id", data.visit_update_id);

    // NAVEGAÇÃO SEGURA: Só redireciona se houver URL válida
    if (data?.url && data.url !== window.location.href) {
      window.location.href = data.url;
    }
  } catch (err) {
    console.error("[Orchestrator] Falha:", err);
    throw err;
  }
};