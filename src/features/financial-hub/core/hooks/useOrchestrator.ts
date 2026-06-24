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
 * @param {string} visitId - ID da jornada recuperado via URL.
 */
export function useOrchestratorHydration(visitId: string, visitUpdateId?: string | null) {
  const [simData, setSimData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // TRAVA DE SEGURANÇA: Garante execução única
  const hasFetched = useRef(false);

  useEffect(() => {
    // Se já buscou ou não tem ID, não faz nada.
    if (hasFetched.current || !visitId) {
      setLoading(false);
      return;
    }
    
    // Define o ID efetivo: prioriza a prop, mas recupera do storage se a prop for nula
    const effectiveUpdateId = visitUpdateId || sessionStorage.getItem("sbx_last_update_id");

    // Trava o fetch: se não tiver o ID, não continua
    if (!effectiveUpdateId) {
      setLoading(false);
      return;
    }

    // 3. Marca como buscado ANTES da chamada
    hasFetched.current = true;
    sessionStorage.setItem("sbx_last_update_id", effectiveUpdateId);  

    callOrchestrator(
      { visit_id: visitId, visit_update_id: visitUpdateId }, 
      'GET' 
    )
      .then((data) => {
        setSimData(data);
        setError(null);
      })
      .catch((err) => {
        console.error(`❌ [useOrchestratorHydration] Falha de hidratação p/ visita ${visitId}:`, err);
        setError(err.message || "Falha na resolução do contrato.");
      })
      .finally(() => setLoading(false));
  }, [visitId]);

  return { simData, loading, error };
}

/**
 * @function orchestrateNavigation
 * @description Responsável pela ORQUESTRAÇÃO (POST).
 * Executa o registro de jornada (One-Shot) e redirecionamento.
 * * @param {'VISIT' | 'CONSULT' | 'REDIRECT' | 'SIMULATE' | 'CONTACT'} action - Tipo de intenção do usuário.
 * @param {any} [extraPayload] - Dados adicionais do formulário.
 */
export const orchestrateNavigation = async (
  action: 'VISIT' | 'CONSULT' | 'REDIRECT' | 'SIMULATE' | 'CONTACT',
  Payload: any = {}
): Promise<void> => {
  
  const visitId = sessionStorage.getItem("sbx_visit_id");
  const originUpdateId = sessionStorage.getItem("sbx_last_update_id");

  // Construção explícita do payload
  const orchestratorPayload = {
    action: action,
    origin_url: Payload.origin_url,
    target_url: Payload.target_url, // O servidor exige este campo explicitamente
    visit_id: visitId || undefined,
    origin_visit_update_id: originUpdateId || undefined,
    ...Payload,
    interaction_context: {
      utm_source: "sandbox_navigation",
      origin_url: Payload.origin_url, // Registo: De onde veio
      target_url: Payload.target_url, // Registo: Para onde queria ir
      ...(Payload.interaction_context || {})
    }
  };

  // DEBUG: Veja isto no F12 > Console antes de dar o erro 400
  console.log("🚀 [Debug] Payload enviado ao Orquestrador:", JSON.stringify(orchestratorPayload, null, 2));

  try {
    const data = await callOrchestrator(orchestratorPayload, 'POST');
    
    if (data?.visit_id) sessionStorage.setItem("sbx_visit_id", data.visit_id);
    if (data?.visit_update_id) sessionStorage.setItem("sbx_last_update_id", data.visit_update_id);

    // 5. Redirecionamento com segurança (o "Travão")
    if (data?.url) {
      // Se a URL de destino for a mesma que a atual, não fazemos o refresh para não perder os dados
      if (data.url === window.location.href) {
        console.warn("[Orchestrator] Já estamos no destino exato.");
      } else {
        window.location.href = data.url;
      }
    } else {
      // Se não vier URL, não recarregamos a página
      console.warn("Orquestrador respondeu sem URL de destino.");
    }
  } catch (err) {
    console.error("[Orchestrator] Falha:", err);
    throw err;
  }
};