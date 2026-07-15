/**
 * @fileoverview Contrato de Tipagem da Engine (Motor)
 * * PROPÓSITO:
 * Define os tipos genéricos que estruturam o estado de qualquer jornada.
 * Ao separar a "Meta" (controle do wizard) dos "Dados" (informação da jornada),
 * garantimos que o motor seja reutilizável para qualquer produto.
 * * INTEGRAÇÃO:
 * - Utilizado por `WizardProvider` para tipar o `useWizard`.
 * - Utilizado pelos componentes de `Step` para garantir Type Safety nos dados.
 * * INTERDEPENDÊNCIAS:
 * - Este arquivo é a fundação base para a Engine de jornadas.
 */

// Informações de controle do Wizard (Genérico para todas as jornadas)
export type WizardMeta = {
  step: number;
  blocked?: { reason: string };
  simulationId?: string;
};

// Estrutura global do estado, usando Generics <T> para permitir 
// que cada jornada defina os seus próprios dados de formulário.
export type WizardState<T> = {
  meta: WizardMeta;
  data: T;
};

// Definição do contrato de contexto (o que o hook `useWizard` irá expor)
export type WizardContextValue<T> = {
  state: WizardState<T>;
  update: (patch: Partial<WizardState<T>>) => void;
  updateData: (data: Partial<T>) => void; // Shortcut para atualizar apenas os dados
  goTo: (step: number) => void;
  next: () => void;
  back: () => void;
  reset: (initialData: T) => void;
};


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
  [key: string]: any; // Captura metadados específicos para a coluna JSONB seller_details/seller_details
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
  category: string;        // Texto vindo do site
  [key: string]: any;      // Aqui entrará 'vehicle', 'equity' ou qualquer outro detalhe enviado
}

/**
 * @interface InteractionContext
 * @description Define a origem e o contexto da interação do usuário.
 * É o rastreador que determina as regras de validação que serão aplicadas.
 * 
 * @property {string} utm_source - O canal de entrada:
 *   - 'offer': Clique originado de um lote/item específico no site.
 *   - 'banner', 'whatsapp', 'email', 'sms': Origens de campanhas de marketing.
 * @property {string} origin_url - A URL exata onde o usuário estava (referência de origem).
 */
export interface InteractionContext {
  utm_source: 'direct' | 'offer' | 'lp' | 'banner' | 'whatsapp' | 'email' | 'sms';
  utm_medium: 'none' | 'organic' | 'home' | 'event' | 'offer';
  utm_campaign: string;
  origin_url: string;
}


/**
 * @interface OrchestratorPayload
 * @description O contrato mestre de entrada para o ecossistema sbX.
 * Reflete a estrutura de snapshots (details) das novas tabelas.
 */
export interface OrchestratorPayload {
  // IDENTIFICAÇÃO (Sempre Obrigatórios)
  interaction_context: InteractionContext;   // Obrigatório: GPS da visita (origem/canal)
  entity?: Entity;                           // Obrigatório: Snapshot do proponente (entity_details)

  // CONTEXTO DE NEGÓCIO (Opcionais na raiz, validados por regra)
  manager?: Manager;  // Obrigatório se utm_source === 'offer' (manager_details)
  seller?: Seller;    // Opcional: Dono do bem (seller_details)
  event?: Event;      // Opcional: Contexto do leilão (event_details)
  offer?: Offer;      // Opcional: Detalhes do bem e preço (offer_details)

  // Opcional: Detalhes do bem e preço (offer_details)
  consents?: Array<{
    consent_id: string;
    accepted: boolean;
    legal_text_snapshot?: any;
    accepted_at?: string;
    [key: string]: any;
  }>;

  // Campos de contexto injetados pelo Orquestrador
  rules?: any;
  page_configs?: any;
  consent_configs?: any;
  page_faqs?: any;

  // ROTEAMENTO
  is_integrated?: boolean;                    // Indica se a visita veio de um parceiro integrado (ex: Fandi, Cartão)
  integration_method?: string;                // integration_method = 'API', 'EMAIL', 'FILE', 'MANUAL'
  integration_details?: Record<string, any>;  // Permite enviar detalhes específicos do parceiro (ex: nome do parceiro, CNPJ, ponto de venda, webhook URL, etc.)  
  product_id?: number; 
  partner_id?: number; 
  action?: 'VISIT' | 'CONSULT' | 'REDIRECT' | 'SIMULATE' | 'CONTACT';
  action_description?: string; // Campo adicional para descrever a ação com mais detalhes (ex: 'REDIRECT_TO_WHATSAPP', 'SIMULATION_ELIGIBILITY_CHECK', etc.)
  visit_id?: string; 
  visit_update_id?: string;         // Identificador da visit_update da página atual
  origin_visit_update_id?: string;  // Identificador da visit_update da página anterior
  simulation_id?: string;
  origin_url?:string;
  target_url?:string;
}