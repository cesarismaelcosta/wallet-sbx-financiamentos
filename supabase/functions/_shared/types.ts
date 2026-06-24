/**
 * @interface OriginDetails
 * @description Padronização dos dados de infraestrutura e origem (Origin-Tracing).
 */
export interface OriginDetails {
  ip_address: string;
  country: string;
  state: string;
  city: string;
  user_agent: string;
  device_type: string;
  operating_system: string;
  metadata: {
    timestamp: string;
    tls_version?: string | null;
    [key: string]: any; 
  };
}

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
  category: string;        // Texto vindo do site/sandbox
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
  is_integrated?: boolean;                    // Indica se a visita veio de um parceiro integrado (ex: Fandi, Cartão) ou do Sandbox
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

/**
 * @interface OrchestratorResponse
 * @description Define o comando de saída enviado pelo Orquestrador para o cliente.
 * Determina como a transição de contexto (redirecionamento) deve ser executada.
 */
export interface OrchestratorResponse {
  /**
   * @property {string} action - O tipo de comportamento esperado:
   *   - 'REDIRECT': Navegação direta (ex: via location.href).
   *   - 'POST_REDIRECT': Requer submissão de formulário via POST (usado para dados sensíveis).
   */
  action: "REDIRECT" | "POST_REDIRECT";

  /** @property {string} url - O destino final já resolvido pela inteligência de roteamento. */
  url: string;

  /** @property {string} method - Método HTTP para a execução da ação ('GET' ou 'POST'). */
  method: "GET" | "POST";

  /**
   * @property {object} payload - Bloco de dados opcional para transporte de contexto.
   * @property {string} payload.visit_id - A chave mestra gerada para rastreabilidade da jornada.
   * @property {any} [payload.key] - Permite injetar outros identificadores necessários na página de destino.
   */
  payload?: {
    visit_id: string;
    [key: string]: any;
  };
}

/**
 * @interface SimulationResponse
 * @description Representa cada linha de consulta individual (Marketplace).
 * Cada item aqui será uma linha na tabela 'simulation_consults'.
 */
export interface SimulationResponse {
  success: boolean;
  message?: string;
  consults: Consultation[];
  // Audit Trail individual para esta linha
  raw: any; 
}

/**
 * @interface Consultation
 * @description Representa cada linha de consulta individual (Marketplace).
 * Cada item aqui será uma linha na tabela 'simulation_consults'.
 */
export interface Consultation {
  status_id: number | null;             // ID sbX (1: Aprovado, 2: Negado, 8: Falha)
  is_selected: boolean | null;          // Indica se esta consulta foi a escolhida pelo usuário (relevante para múltiplas opções) 
  external_operation_id: string | null; // ID no parceiro (proposta)
  message: string | null;               // Mensagem do banco/parceiro
  
  // Barramento Financeiro Específico desta Consulta
  financial_institution_id: number | null;
  financial_institution_name: string | null;
  requested_value: number | null;
  down_payment_amount: number | null;
  down_payment_percentage: number | null;
  financed_amount: number | null;
  installments: number | null;
  cet_rate: number | null;
  installment_value: number | null;
}



/**
 * @interface SimulationFinancials
 * @description Define os campos financeiros obrigatórios para cálculos e auditoria.
 */
export interface SimulationFinancials {
  requested_value: number | null;          // Valor total do bem
  down_payment_amount: number  | null;     // Valor da entrada em R$
  down_payment_percentage: number | null;  // % da entrada
  installments: number | null;             // Número de parcelas
  financed_amount: number | null;          // Valor que será efetivamente financiado
  cet_rate?: number | null;                // Taxa CET (opcional na entrada, obrigatória no retorno)
  simulated_at?: string | null;            // Timestamp da simulação
  [key: string]: any | null;               // Flexibilidade para taxas extras (IOF, TAC, etc)
}

/**
 * export interface: VehicleCollateral
 * @description Define a estrutura esperada para dados de garantia de veículos (Car Equity).
 */
export interface VehicleCollateral {
  license_plate: string;      // Placa do veículo
  brand: string;              // Marca (ex: Toyota)
  model: string;              // Modelo (ex: Corolla)
  model_year: number;         // Ano do modelo
  manufacture_year: number;   // Ano de fabricação
  fipe_code: string;          // Código Tabela FIPE
  fipe_value: number;         // Valor de mercado FIPE
  kinship_degree: string;     // Relação de parentesco do proprietário
}

/**
 * export interface: HomeCollateral
 * @description Define a estrutura esperada para dados de garantia de imóveis (Home Equity).
 */
export interface HomeCollateral {
  real_estate_type: string;   // Tipo: HOUSE, APARTMENT, etc.
  estimated_value: number;    // Valor estimado do imóvel
  debt_amount: number;        // Saldo devedor atual
  has_deed: string;           // Possui escritura? (YES/NO)
  address: string;            // Logradouro
  number: string;             // Número
  complement?: string;        // Complemento (opcional)
  neighborhood: string;       // Bairro
  city: string;               // Cidade
  state: string;              // Estado (UF)
  postal_code: string;        // CEP
  country: string;            // País
  owners: string[];           // Lista de proprietários
}

/**
 * @interface SimulationPayload
 * @description Contrato mestre para o ecossistema sbX.
 * O uso de [key: string]: any permite que campos extras enviados pelo 
 * front-end sejam aceitos sem quebrar a validação do TypeScript.
 */
export interface SimulationPayload {
  visit_id: string;
  simulation_id: string;
  is_integrated: boolean;       // Indica se a simulação veio de um parceiro integrado (ex: Fandi, Cartão) ou do Sandbox
  integration_method: string;   // integration_method = 'API', 'EMAIL', 'FILE', 'MANUAL'
  partner_id: number;
  product_id: number;
  action?: 'VISIT' | 'CONSULT' | 'REDIRECT' | 'SIMULATE' | 'CONTACT';
  action_description?: string;

  // CONTEXTO DE VISITA (Sempre obrigatórios)
  interaction_context: InteractionContext;   // Obrigatório: GPS da visita (origem/canal)
  entity?: Entity;                           // Obrigatório: Snapshot do proponente (entity_details)

  // CONTEXTO DE NEGÓCIO (Opcionais na raiz, validados por regra)
  manager?: Manager;  // Obrigatório se utm_source === 'offer' (manager_details)
  seller?: Seller;    // Opcional: Dono do bem (seller_details)
  event?: Event;      // Opcional: Contexto do leilão (event_details)
  offer?: Offer;      // Opcional: Detalhes do bem e preço (offer_details)
  simulation_details: SimulationFinancials;
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
  step?: 'CHECK_ELIGIBILITY' | 'EXECUTE_SIMULATION';
  [key: string]: any; // Permite novos nós na raiz do payload
}

/**
 * @interface SimulationConsent
 * @description Estrutura para gravação na tabela 'simulation_consents'.
 * Garante o snapshot jurídico completo de cada termo aceito.
 */
export interface SimulationConsent {
  simulation_id: number;
  consent_id: string;
  accepted: boolean;
  accepted_at: string;
  partner_id: number;
  product_id: number;
  entity_id: string | null;
  document: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  birth_date: string | null;
  gender: string | null;
  entity_details: any;
  ip_address: string;
  country: string;
  state: string;
  city: string;
  user_agent: string;
  device_type: string;
  operating_system: string;
  origin_details: any;
  manager_details: any;
  seller_details: any;
  event_details: any;
  offer_details: any;
  page_snapshot: {
    branding: any;
    rules: any;
    faq: any;
    consents_rendered: any;
    legal_text: any;
    [key: string]: any; 
  };
  raw_payload: any;
}

/**
 * @interface SimulationUpdate
 * @description Estrutura para a tabela de logs 'simulation_updates'.
 */
export interface SimulationUpdate {
  simulation_id: number;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  stage_id: number;
  status_id: number;
  simulation_details: SimulationFinancials;
  ip_address: string;
  country: string;
  state: string;
  city: string;
  user_agent: string;
  device_type: string;
  operating_system: string;
  origin_details: any;
  raw_payload: any;
}