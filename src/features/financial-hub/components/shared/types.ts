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
  [key: string]: unknown; // Permite campos extras genéricos (ex: renda, profissão)
}

/**
 * @interface Manager
 * @description Representa o operador/gerenciador da oferta (manager_details).
 * Esta entidade é responsável pela operação do leilão ou evento.
 */
export interface Manager {
  manager_name: string;
  [key: string]: unknown; // Captura metadados específicos para a coluna JSONB manager_details
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
  [key: string]: unknown; // Captura metadados específicos para a coluna JSONB seller_details/seller_details
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
  [key: string]: unknown; // Captura campos como 'numero_leilao' ou 'tipo_evento' (event_details)
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
  [key: string]: unknown; // Captura cor, placa, chassi ou quilometragem
}

/**
 * @interface Offer
 * @description A oferta comercial genérica. 
 * Não mapeamos detalhes específicos (veículo, imóvel) aqui para manter a 
 * flexibilidade total via index signature.
 */
/** Foto da oferta (a principal vem com highlight). */
export interface OfferPhoto {
  link?: string;
  highlight?: boolean;
}

export interface Offer {
  offer_id: string;
  offer_description: string;
  offer_value: number;
  category_id?: number;    // Injetado pelo Orquestrador após o de-para
  category: string;        // Texto vindo do site
  subcategory_id?: number | string; 
  subcategory?: string;             
  lote_index?: string | number;     // número do lote exibido na jornada
  lote_numero?: string | number;
  lot_number?: string | number;
  vehicle_details?: Partial<Vehicle>; // veículos: FIPE, anos etc.
  category_name?: string;
  event_description?: string;
  photos?: OfferPhoto[];
  [key: string]: unknown;      // Aqui entrará 'vehicle', 'equity' ou qualquer outro detalhe enviado
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
    legal_text_snapshot?: unknown;
    accepted_at?: string;
    [key: string]: unknown;
  }>;

  // Campos de contexto injetados pelo Orquestrador
  rules?: ProductRules | null;
  page_configs?: PageConfigs | null;
  consent_configs?: ConsentConfig[] | null;
  page_faqs?: FaqItem[] | null;

  // ROTEAMENTO
  is_integrated?: boolean;                    // Indica se a visita veio de um parceiro integrado (ex: Fandi, Cartão)
  integration_method?: string;                // integration_method = 'API', 'EMAIL', 'FILE', 'MANUAL'
  integration_details?: Record<string, unknown> | null;  // Permite enviar detalhes específicos do parceiro (ex: nome do parceiro, CNPJ, ponto de venda, webhook URL, etc.)  
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


// =========================================================================
// CONFIGURAÇÕES DO PRODUTO (orchestrator_configs) — formato real das colunas
// rules, consent_configs, page_configs e page_faqs.
// =========================================================================

/** Link de um aceite: página externa ("web") ou explicação em tooltip ("tooltip"). */
export interface ConsentLink {
  text: string;
  type: "web" | "tooltip";
  url?: string;
  tooltip_text?: string;
}

/** Um aceite exibido na jornada (orchestrator_configs.consent_configs[]). */
export interface ConsentConfig {
  id: string;
  template_text: string; // texto com {marcadores} que viram links
  links?: ConsentLink[];
  position: number;
  is_required?: boolean;
  default_state?: boolean;
  effective_date?: string;
  flowcredi_type?: string; // aceites enviados à FlowCredi
  flowcredi_version?: number;
}

/** Trecho de texto com destaque (headline/description do painel da oferta). */
export interface TextPart {
  text: string;
  type: "normal" | "highlight" | "bold";
}

/** orchestrator_configs.page_configs */
export interface PageConfigs {
  offer_panel?: {
    partner?: { name: string; label: string; id?: number | string };
    headline?: { parts: TextPart[] };
    description?: { parts: TextPart[] };
    benefits?: { icon: string; title: string; description: string }[];
  };
  footer?: {
    links?: { url: string; text: string }[];
    template_text?: string;
  };
  primary_color?: string;
  box_bg?: string;
  box_radius?: string;
}

/** Uma pergunta do FAQ (orchestrator_configs.page_faqs[]). */
export interface FaqItem {
  question: string;
  answer: string;
  bullets?: string[];
  position?: number;
}

/** orchestrator_configs.integration_details — contatos e destino do parceiro (editados no backoffice). */
export interface IntegrationDetails {
  urlWhatsApp?: string;
  whatsapp_number?: string;
  urlRedirect?: string;
  email?: string;
  cnpjLoja?: string;
  [key: string]: unknown;
}

/** orchestrator_configs.rules — limites e opções de cada produto (todas opcionais). */
export interface ProductRules {
  // Valores e entrada
  min_financed_amount?: number;
  max_financed_amount?: number;
  min_down_payment_percentage?: number;
  max_down_payment_percentage?: number;
  max_financing_percentage?: number;
  max_loan_percentage?: number;
  max_offer_cap_percent?: number;
  allow_custom_value?: boolean;
  // Prazo e parcelas
  min_term_months?: number;
  max_term_months?: number;
  default_term_months?: number;
  term_step_months?: number;
  default_installments?: number;
  installment_options?: number[];
  payment_factors?: Record<string, number>;
  // Renda
  min_monthly_income?: number;
  // FlowCredi
  flowcredi_product?: "mortgage" | "home_equity" | "auto_equity" | string;
  flowcredi_bank_by_seller?: Record<string, unknown>;
}

// =========================================================================
// RESPOSTA DO FINANCIAL-GATEWAY (callSimulation)
// =========================================================================

/**
 * Uma consulta (uma linha de simulation_consults) como volta do gateway.
 * Campos extras por parceiro (ex.: FlowCredi `details`, `installment_schedule`)
 * ficam no índice e são lidos com o tipo do próprio parceiro.
 */
export interface GatewayConsult {
  status_id: number | null;
  is_selected: boolean | null;
  external_operation_id?: string | null;
  message: string | null;
  financial_institution_id?: number | null;
  financial_institution_name: string | null;
  requested_value: number | null;
  down_payment_amount: number | null;
  down_payment_percentage?: number | null;
  financed_amount: number | null;
  installments: number | null;
  cet_rate?: number | null;
  installment_value: number | null;
  amortization_type?: string | null;
  last_installment_value?: number | null;
  [key: string]: unknown;
}

/** Corpo devolvido pelo financial-gateway (simulation-handler: payloadFinal). */
export interface GatewayResult {
  success: boolean;
  status_id?: number | null;
  simulation_id?: string | null;
  simulation_update_id?: string | null;
  mensagem?: string | null;
  consults: GatewayConsult[];
  state?: {
    entity?: HubEntity;
    offer?: Partial<Offer>;
    seller?: Partial<Seller>;
    event?: Partial<Event>;
    manager?: Partial<Manager>;
    rules?: ProductRules | null;
    page_configs?: PageConfigs | null;
    consent_configs?: ConsentConfig[] | null;
    simulationResult?: {
      consults: GatewayConsult[];
      simulation_id?: string | null;
      simulation_update_id?: string | null;
    };
  };
}

// =========================================================================
// DADOS DA JORNADA (hidratação do orchestrator + estado do wizard)
// =========================================================================

/** Cliente como chega na hidratação (entity_details espalhado + colunas da entidade). */
export type HubEntity = Partial<Entity> & { entity_type?: string };

/**
 * Dados de uma jornada: o que o orchestrator devolve na hidratação (GET) e o
 * que o wizard guarda em `state.data`. Campos próprios de cada produto
 * (ex.: flowInputs) ficam no índice e são tipados no passo que os usa.
 */
export interface HubData {
  // Resposta da hidratação / erro tratado pelo OrchestratorWrapper
  success?: boolean | "loading";
  code?: string;
  message?: string;
  fallback_url?: string;

  // Cursores da jornada
  visit_id?: string | null;
  visit_update_id?: string | null;
  simulation_id?: string | null;
  simulation_update_id?: string | null;
  product_id?: number | null;
  partner_id?: number | null;
  origin_url?: string;
  target_url?: string;
  interaction_context?: Partial<InteractionContext>;

  // Contexto confiável (hidratado no servidor)
  entity?: HubEntity;
  manager?: Partial<Manager>;
  seller?: Partial<Seller>;
  event?: Partial<Event>;
  offer?: Partial<Offer>;

  // Configuração do produto
  rules?: ProductRules | null;
  consent_configs?: ConsentConfig[] | null;
  page_configs?: PageConfigs | null;
  page_faqs?: FaqItem[] | null;
  is_integrated?: boolean | null;
  integration_method?: string | null;
  integration_details?: IntegrationDetails | null;
  hydration_source?: string | null;
  config_matched_by?: string | null;
  orchestrator_config_id?: number | null;
  simulation_details?: Record<string, unknown> | null;

  // Resultado da última simulação
  simulationResult?: GatewayResult | null;

  [key: string]: unknown;
}


/** Resposta do orchestrator ao registrar uma intenção (POST): próxima URL + estado já hidratado. */
export interface OrchestratorPostResponse {
  success?: boolean;
  action?: string;
  url?: string;
  visit_id?: string;
  visit_update_id?: string;
  simulation_id?: string | null;
  partner_id?: number | null;
  state?: HubData;
  code?: string;
  message?: string;
  fallback_url?: string;
  [key: string]: unknown;
}


// =========================================================================
// PAINÉIS (backoffice / home) — linhas como chegam das consultas do Supabase.
// Campos conforme as colunas atuais do banco (o types.ts gerado do Supabase está desatualizado).
// =========================================================================

/** Banco ligado à consulta (join financial_institutions). */
export interface FinancialInstitutionRef {
  name?: string | null;
  logo_url?: string | null;
}

/** simulation_consults (+ join do banco), como os painéis leem. */
export interface ConsultRow {
  id?: string;
  status_id?: number | null;
  is_selected?: boolean | null;
  external_operation_id?: string | null;
  financial_institution_name?: string | null;
  financial_institutions?: FinancialInstitutionRef | null;
  description?: string | null;
  installments?: number | null;
  installment_value?: number | null;
  last_installment_value?: number | null;
  cet_rate?: number | null;
  simulation_details?: { details?: unknown; [key: string]: unknown } | null;
  created_at?: string | null;
}

/** simulations (+ joins) no detalhe do backoffice. */
export interface SimulationRow {
  product_id?: number | null;
  partner_id?: number | null;
  financed_amount?: number | null;
  installments?: number | null;
  installment_value?: number | null;
  cet_rate?: number | null;
  raw_payload?: string | { simulation_details?: Record<string, unknown>; [key: string]: unknown } | null;
  consults?: ConsultRow[] | null;
  simulation_consults?: ConsultRow[] | null;
  simulation_offers?: { offer_value?: number | null; [key: string]: unknown }[] | null;
  collateral_home?: CollateralHomeRow | null;
  collateral_vehicle?: CollateralVehicleRow | null;
  status_types?: { name?: string | null; description?: string | null } | null;
  result_partner_types?: { description?: string | null } | null;
}

/** simulation_collateral_home */
export interface CollateralHomeRow {
  real_estate_type?: string | null;
  estimated_value?: number | null;
  is_debt_free?: boolean | null;
  debt_amount?: number | null;
  city?: string | null;
  state?: string | null;
  collateral_details?: Record<string, unknown> | null;
}

/** simulation_collateral_vehicle */
export interface CollateralVehicleRow {
  license_plate?: string | null;
  licensing_state?: string | null;
  brand?: string | null;
  model?: string | null;
  manufacture_year?: number | null;
  model_year?: number | null;
  doors?: number | null;
  fipe_code?: string | null;
  fipe_value?: number | null;
  declared_value?: number | null;
  is_debt_free?: boolean | null;
  debt_amount?: number | null;
  kinship_degree?: string | null;
  collateral_details?: Record<string, unknown> | null;
}

/** Colunas de visits usadas nos painéis. */
export interface VisitFields {
  id?: string;
  created_at?: string | null;
  utm_source?: string | null;
  utm_campaign?: string | null;
  country?: string | null;
  state?: string | null;
  city?: string | null;
  ip_address?: string | null;
  operating_system?: string | null;
  device_type?: string | null;
  origin_url?: string | null;
  target_url?: string | null;
}

/** visits (ou a simulação/consulta com a visita no join `visits`). */
export interface VisitRow extends VisitFields {
  visit_id?: string | null;
  visits?: VisitFields | null;
  [key: string]: unknown;
}

/** Origem do aceite (colunas de simulation_consents / visit_consents e origin_details). */
export interface ConsentOrigin {
  city?: string | null;
  state?: string | null;
  country?: string | null;
  ip_address?: string | null;
  operating_system?: string | null;
  device_type?: string | null;
}

/** Aceite gravado (simulation_consents / visit_consents). */
export interface AcceptedConsentRow extends ConsentOrigin {
  id?: string;
  consent_id?: string | null;
  accepted?: boolean | null;
  accepted_at?: string | null;
  page_snapshot?: string | { legal_text?: { template_text?: string; links?: ConsentLink[] } } | null;
  origin_details?: ConsentOrigin | null;
  [key: string]: unknown;
}

/** Cliente exibido no backoffice (colunas da entidade + entity_details). */
export interface EntityDisplay {
  name?: string | null;
  document?: string | null;
  email?: string | null;
  phone?: string | null;
  birth_date?: string | null;
  gender?: string | null;
  entity_type?: string | null;
  address?: Partial<NonNullable<BFFUserProfile["address"]>> | null;
  [key: string]: unknown;
}

/** Oferta exibida nos painéis (offer_details / simulation_offers + evento e vendedor). */
export interface OfferDisplay {
  offer_id?: string | number | null;
  offer_description?: string | null;
  offer_value?: number | null;
  subcategory?: string | null;
  category_types?: { id?: number; name?: string | null } | null;
  event_id?: string | number | null;
  event_description?: string | null;
  event_start_date?: string | null;
  event_end_date?: string | null;
  manager_id?: string | null;
  manager_name?: string | null;
  seller_id?: string | number | null;
  legal_name?: string | null;
  trade_name?: string | null;
  [key: string]: unknown;
}


/** Erro capturado em catch: erro do gateway/edge, do Supabase ou Error comum. */
export type CaughtError = {
  name?: string;
  message: string;
  code?: string | number;
  status?: number;
  fallback_url?: string;
  response?: { data?: { fallback_url?: string } }; // formato antigo (axios)
  data?: { fallback_url?: string };
};

/**
 * Resposta do orchestrator-configs: na home (mode=home) traz a lista de produtos
 * com o estado do botão; com filtros de contexto traz a configuração encontrada.
 */
export interface OrchestratorConfigsResult {
  products?: { key?: string; status?: string }[];
  [key: string]: unknown;
}

// src/types/user.ts

/**
 * @interface BFFUserProfile
 * @description Contrato estrito entre o Backend (Edge Function) e o Frontend.
 * Todas as alterações na estrutura de dados do usuário devem ser refletidas aqui.
 */
export interface BFFUserProfile {
  // Identificador único da entidade no banco de dados (UUID/String)
  entity_id: string;
  entity_type: "F" | "J";    // "F" para Pessoa Física, "J" para Pessoa Jurídica
  
  // Dados Pessoais
  name: string;
  document: string;         // CPF formatado ou bruto conforme definido na Edge
  document_rg?: string;     // Opcional: Nem todas as jornadas capturam RG
  email: string;
  phone: string;
  birth_date: string;       // ISO Date string
  gender: string;
  login: string;            // Login sistêmico
  mothers_name: string;

  // Objeto de Endereço (nullable caso o usuário não tenha completado onboarding)
  address: {
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
    zip_code: string;
    country: string;
  } | null;

  // Dados de auditoria e telemetria inseridos pelo BFF
  metadata?: {
    processedAt: string;    // Timestamp do processamento no BFF
    originIp: string;       // IP de origem do request para fins de segurança
  };
}

/**
 * @interface BFFUserProfile
 * @description Contrato estrito entre o Backend (Edge Function) e o Frontend.
 * Padronização de retornos.
 */
export interface BFFErrorResponse {
  success: boolean;
  code: string;
  message: string;
  fallback_url?: string;
}

/**
 * @interface BFFUserProfile
 * @description Contrato estrito entre o Backend (Edge Function) e o Frontend.
 * Todas as alterações na estrutura de dados de oferta devem ser refletidas aqui.
 */
export interface BFFOfferDetails {
  offer_id?: string | number;
  offer_description?: string;
  offer_value?: number | string;
  offer?: Partial<Offer>;
  event?: Partial<Event>;
  seller?: Partial<Seller>;
  id?: string | number;
  photos?: OfferPhoto[];
  seller_name?: string; // formatos antigos da busca
  event_start_date?: string;
  [key: string]: unknown;
}

/**
 * Status do funil (ids de status_types, iguais aos da financial-gateway em _shared/types.ts).
 * Cada status pertence a uma etapa: Simulação, Lead, Pré-análise, Proposta, Formalização, Paga.
 */
export const STATUS = {
  PENDENTE_ENVIO: 0,
  APROVADA: 1, // Proposta
  RECUSADA: 2, // Proposta
  EM_ANALISE: 3, // Proposta
  PENDENTE_DOCUMENTOS: 4, // Proposta
  CONTRATO_ASSINADO: 5, // Formalização
  PAGA: 6, // Paga
  CANCELADA: 7,
  FALHA: 8,
  COM_CONDICOES: 9, // Simulação
  SEM_CONDICOES: 10, // Simulação
  ENVIADO: 11, // Lead
  PRE_APROVADO: 12, // Pré-análise
  NEGADO: 13, // Pré-análise
  EM_FORMALIZACAO: 14, // Formalização
} as const;
