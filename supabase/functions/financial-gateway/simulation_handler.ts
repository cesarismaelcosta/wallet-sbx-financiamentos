/**
 * SIMULATION HANDLER - CAMADA DE NORMALIZAÇÃO E PERSISTÊNCIA
 * @author Engenharia Wallet sbX / Cesar Ismael
 * @description Este módulo atua como o "Sanitizador" do Gateway. Sua função é receber payloads 
 * de diversas origens (Sandbox, Mobile, Web), normalizar os dados para um esquema plano (Flat) 
 * e garantir a gravação íntegra na tabela 'simulations'.
 * 
 * --- PILARES TÉCNICOS ---
 * 1. NORMALIZAÇÃO: O "Desempacotador" transforma objetos aninhados em tipos primitivos e seguros.
 * 2. VALIDAÇÃO CONDICIONAL: Implementa travas de negócio específicas por categoria de bem.
 * 3. LOOKUP DE CONFIGURAÇÃO: Resolve IDs de produtos e URLs de parceiros dinamicamente via banco.
 * 4. PERSISTÊNCIA INTEGRAL: Executa o Triple-Write (Simulations, Updates, Opt-in) para compliance.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processarFluxoFandi } from "./fandi-service.ts";
import { processarFluxoCartao } from "./credit-card-service.ts";
import { processarFluxoParceiro } from "./partner-service.ts";

// CONFIGURAÇÃO DE CORS - LIBERAÇÃO DE TRÁFEGO
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/**
 * CONFIGURAÇÕES TÉCNICAS E FLAGS DE AMBIENTE
 */

// Chave de controle para logs de depuração
const DEBUG_MODE = true;

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[SIMILATION-HANDLER-DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

/**
 * @interface Consultation
 * @description Representa cada linha de consulta individual (Marketplace).
 * Cada item aqui será uma linha na tabela 'simulation_consults'.
 */
interface Consultation {
  status_id: number;                    // ID sbX (1: Aprovado, 2: Negado, 8: Falha)
  is_selected: boolean;                 // Indica se esta consulta foi a escolhida pelo usuário (relevante para múltiplas opções) 
  external_operation_id: string | null; // ID no parceiro (proposta)
  message: string;                      // Mensagem do banco/parceiro
  
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
 * @interface PartnerResponse
 * @description O Envelope que o fandi-service ou credit-card-service retorna.
 */
interface PartnerResponse {
  success: boolean;            // A integração (handshake) funcionou?
  message: string;             // Resumo da operação do serviço
  consults: Consultation[];    // Lista de todas as consultas realizadas
  // Audit Trail individual para esta linha
  raw: any; 
}

/**
 * @interface OriginDetails
 * @description Padronização dos dados de infraestrutura e origem (Origin-Tracing).
 */
interface OriginDetails {
  ip_address: string;
  country: string;
  state: string;
  city: string;
  user_agent: string;
  device_type: 'mobile' | 'desktop' | 'tablet' | 'other';
  operating_system: string;
  metadata: {
    timestamp: string;
    tls_version?: string | null;
  };
  [key: string]: any; 
}

/**
 * @interface SimulationFinancials
 * @description Define os campos financeiros obrigatórios para cálculos e auditoria.
 */
interface SimulationFinancials {
  requested_value: number;          // Valor total do bem
  down_payment_amount: number;      // Valor da entrada em R$
  down_payment_percentage: number;  // % da entrada
  installments: number;             // Número de parcelas
  financed_amount: number;          // Valor que será efetivamente financiado
  cet_rate?: number;                // Taxa CET (opcional na entrada, obrigatória no retorno)
  simulated_at?: string;            // Timestamp da simulação
  [key: string]: any;               // Flexibilidade para taxas extras (IOF, TAC, etc)
}

/**
 * @interface SimulationPayload
 * @description Contrato mestre para o ecossistema sbX.
 * O uso de [key: string]: any permite que campos extras enviados pelo 
 * front-end sejam aceitos sem quebrar a validação do TypeScript.
 */
interface SimulationPayload {
  visit_id: string;
  simulation_id: string;
  is_integrated: boolean;       // Indica se a simulação veio de um parceiro integrado (ex: Fandi, Cartão) ou do Sandbox
  integration_method: string;   // integration_method = 'API', 'EMAIL', 'FILE', 'MANUAL'
  partner_id: number;
  product_id: number;
  interaction_context: {
    utm_source: string;
    utm_medium:string;
    utm_campaign: string;
    origin_url: string;
    [key: string]: any;         // Permite metadados extras de rastreio
  };
  entity: {
    entity_id: string | number;
    name: string;
    document: string;
    phone: string;
    email: string;
    birth_date?: string;
    gender?: string;
    [key: string]: any; // Aceita campos como 'renda', 'profissao', etc.
  };
  manager?: {
    manager_name: string;
    [key: string]: any; // Captura metadados do leiloeiro/operador
  };
  seller?: {
    seller_id: string | number;
    legal_name: string;
    trade_name: string;economic_group: string;
    [key: string]: any; // Captura detalhes específicos do vendedor
  };
  event?: {
    event_id: string | number;
    event_description: string;
    event_start_date: string;
    event_end_date: string;
    [key: string]: any; // Captura outros campos dinâmicos de for necessário, como loca, etc
  };
  offer?: {
    offer_id: string | number;
    offer_description: string;
    offer_value: number;
    category_id: number;
    [key: string]: any; // Aceita 'vehicle_details', 'property_details', etc.
  };
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
  [key: string]: any; // Permite novos nós na raiz do payload
}

/**
 * @interface SimulationConsent
 * @description Estrutura para gravação na tabela 'simulation_consents'.
 * Garante o snapshot jurídico completo de cada termo aceito.
 */
interface SimulationConsent {
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
interface SimulationUpdate {
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

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

/**
 * RESOLVE PARTNER RESULT
 * @description Normaliza retornos brutos de parceiros em IDs estruturados de 6 dígitos.
 * Lógica de ID: [PartnerID(1)][StatusID(1)][Counter(4)]
 * 
 * @author Engenharia Wallet sbX / Cesar Ismael
 * @param partnerId ID do parceiro (ex: 1 para Fandi)
 * @param statusId Status da operação (1-8)
 * @param rawMessage Mensagem textual retornada pelo gateway
 * @returns Promise<string | null> ID de 6 dígitos ou null em caso de falha
 */
async function resolvePartnerResult(
  partnerId: number,
  statusId: number,
  rawMessage: string | null
): Promise<string | null> {

  // VALIDA PARÂMETROS E RETORNA null SE UM DELES NÃO FOR ENVIADO
  if (!rawMessage || !partnerId || !statusId) return null;

  // TIRA ESPAÇÕS DA MENSAGEM, SE HOUVER
  const sanitizedMessage = rawMessage.trim();
  
  debugLog(`Buscando result_partner_type: P:${partnerId} S:${statusId} M:${sanitizedMessage}`)

  try {
    // 1. Verificação de sinal de entrada (Crucial!)
    if (!partnerId || !statusId || !sanitizedMessage) {
      throw new Error(`Entrada invalida: P:${partnerId} S:${statusId} M:${sanitizedMessage}`);
    }

    // 2. Busca com maybeSingle (Evita o erro de 'nenhuma linha encontrada')
    const { data: existing, error: searchError } = await supabase
      .from('result_partner_types')
      .select('id')
      .eq('partner_id', partnerId)
      .eq('description', sanitizedMessage)
      .maybeSingle();

    if (searchError) throw searchError;
    if (existing) return existing.id;

    // 3. Geração do ID de 8 dígitos (2+2+4)
    const { count, error: countError } = await supabase
      .from('result_partner_types')
      .select('*', { count: 'exact', head: true })
      .eq('partner_id', partnerId)
      .eq('status_id', statusId);

    if (countError) throw countError;

    const nextCounter = (count || 0) + 1;
    
    // Mascaramento rigoroso: garante que 1 -> "01", 2 -> "02", 1 -> "0001"
    const pPart = String(partnerId).padStart(2, '0');
    const sPart = String(statusId).padStart(2, '0');
    const cPart = String(nextCounter).padStart(4, '0').slice(-4);

    const newId = `${pPart}${sPart}${cPart}`;

    debugLog(`Novo id: P:${partnerId} S:${statusId} M:${sanitizedMessage}`)

    // 4. Inserção com tratamento de erro
    const { error: insertError } = await supabase
      .from('result_partner_types')
      .insert({
        id: newId, 
        partner_id: partnerId,
        status_id: statusId,
        description: sanitizedMessage
      });

    if (insertError) throw insertError;

    return newId;

  } catch (error) {
    // Debug profundo: imprime o objeto de erro completo no console para vermos o JSON do Postgres
    console.error(`[RESOLVE-RESULT-CRITICAL] Detalhes do erro:`, JSON.stringify(error));
    return null; 
  }
}

/**
 * Helper para extrair OS e Device básico do User Agent
 */
function parseUserAgent(ua: string) {
  const os = ua.includes('Windows') ? 'Windows' : 
             ua.includes('Mac') ? 'MacOS' : 
             ua.includes('Android') ? 'Android' : 
             ua.includes('iPhone') ? 'iOS' : 'Linux/Other';
             
  const device = ua.includes('Mobi') ? 'Mobile' : 'Desktop';
  return { os, device };
}

/**
 * Captura dados detalhados de infraestrutura e geolocalização.
 * 
 * Lógica de Geo:
 * 1. Tenta recuperar via headers da Cloudflare (produção Supabase).
 * 2. Se falhar (localhost/dev), utiliza o IP-API como fallback.
 * 
 * @param {Request} req - O objeto da requisição HTTP.
 * @returns {Promise<object>} Objeto contendo IP, Geo, OS e Device Type.
 */
async function captureInfrastructure(req: Request) {
  const ua = req.headers.get('user-agent') || '';
  // Melhora a captura do IP
  const ip = req.headers.get('x-real-ip') || 
             req.headers.get('cf-connecting-ip') || 
             req.headers.get('x-forwarded-for')?.split(',')[0] || 
             '0.0.0.0';
  
  const { os, device } = parseUserAgent(ua);

  // Tenta capturar dos headers da Vercel/Supabase (mais comuns no Edge)
  let geo = {
    country: req.headers.get('x-vercel-ip-country') || req.headers.get('cf-ipcountry'),
    state: req.headers.get('x-vercel-ip-country-region') || req.headers.get('cf-region'),
    city: req.headers.get('x-vercel-ip-city') || req.headers.get('cf-ipcity')
  };

  // 3. SE ALGUM CAMPO ESTIVER FALTANDO, DISPARA O FALLBACK
  // Mudamos a condição para ser mais agressiva: se não tem cidade ou estado, busca no IP-API
  if (!geo.country || geo.country === 'XX' || !geo.city) {
    try {
      // Importante: se o IP for 0.0.0.0 ou 127.0.0.1, o ip-api não retorna nada útil localmente
      const queryIp = (ip === '0.0.0.0' || ip === '127.0.0.1') ? '' : ip;
      const res = await fetch(`http://ip-api.com/json/${queryIp}?fields=countryCode,regionName,city`);
      const fallback = await res.json();
      
      geo = {
        country: fallback?.countryCode || geo.country || 'N/A',
        state: fallback?.regionName || geo.state || 'N/A',
        city: fallback?.city || geo.city || 'N/A'
      };
    } catch (e) {
      console.warn("[sbX Infrastructure] Falha no fallback de Geo:", e.message);
    }
  }

  return {
    ip_address: ip,
    user_agent: ua,
    country: geo.country,
    state: geo.state,
    city: geo.city,
    operating_system: os,
    device_type: device
  };
}

export async function processSimulation(req: Request, payload: SimulationPayload) {
  if (!payload) throw new Error("Payload vazio.");

  // Pega informações da origem da chamada
  const infra = await captureInfrastructure(req);

  // =========================================================================
  // PASSO 1: PERSISTÊNCIA (MAPEAMENTO PARA TABELA 'simulations')
  // =========================================================================
  const entity = payload.entity || {};
  const manager = payload.manager || {};
  const seller = payload.seller || {};
  const event = payload.event || {};
  const offer = payload.offer || {};
  const simulation = payload.simulation_details || {};
  const vehicle = offer.vehicle_details || {};

  // Envia log para o Supabase, se ligado
  debugLog("PAYLOAD RECEBIDO -> PAYLOAD:", payload)
  debugLog("PAYLOAD RECEBIDO -> ENTITY:", entity)
  debugLog("PAYLOAD RECEBIDO -> MANAGER:", manager)
  debugLog("PAYLOAD RECEBIDO -> SELLER:", seller)
  debugLog("PAYLOAD RECEBIDO -> EVENT:", event)
  debugLog("PAYLOAD RECEBIDO -> OFFER:", offer)
  debugLog("PAYLOAD RECEBIDO -> SIMULATION:", simulation)
  debugLog("PAYLOAD RECEBIDO -> VEHICLE:", vehicle)

  const cleanData = {
    // Identificadores e Infra
    visit_id: payload.visit_id,
    simulation_id: payload?.simulation_id,
    partner_id: payload.partner_id,
    product_id: payload.product_id,
    // Proponente (Campos Achatados)
    entity_id: entity.entity_id?.toString() || null,
    document: entity.document?.replace(/\D/g, '') || null,
    name: entity.name?.trim() || null,
    phone: entity.phone?.trim() || null,
    email: entity.email?.trim().toLowerCase() || null,
    birth_date: entity.birth_date || null,
    gender: entity.gender || null,
    entity_details: entity, // Guarda o snapshot JSONB

    // Contexto Manager
    manager_name: manager.manager_name || null,
    manager_details: manager,

    // Contexto Seller
    seller_id: seller.seller_id?.toString() || null,
    legal_name: seller.legal_name || null,
    trade_name: seller.trade_name || null,
    economic_group: seller.economic_group || null,
    seller_details: seller,

    // Contexto Evento
    event_id: event.event_id || null,
    event_description: event.event_description || null,
    event_start_date: event.event_start_date || null,
    event_end_date: event.event_end_date || null,
    event_details: event,

    // Dados da Oferta
    offer_id: offer.offer_id?.toString() || null,
    offer_description: offer.offer_description || null,
    offer_value: parseFloat(offer.offer_value || 0),
    category_id: offer.category_id || null,
    offer_details: offer, // Aqui vai o veículo e tudo mais

    // Parâmetros Financeiros (Garantindo tipagem e evitando nulls inesperados)
    requested_value: simulation.requested_value != null ? parseFloat(simulation.requested_value) : null,
    down_payment_amount: simulation.down_payment_amount != null ? parseFloat(simulation.down_payment_amount) : null,
    down_payment_percentage: simulation.down_payment_percentage != null ? parseFloat(simulation.down_payment_percentage) : null,
    installments: simulation.installments != null ? parseInt(simulation.installments) : null,
    cet_rate: simulation.cet_rate != null ? parseFloat(simulation.cet_rate) : null,
    simulation_details: simulation, // Aqui vão outros detalhes da simulação

    // Cálculo de Valor Financiado (Só executa se houver os dois operandos)
    financed_amount: (simulation.requested_value != null && simulation.down_payment_amount != null) 
        ? Math.max(0, parseFloat(simulation.requested_value) - parseFloat(simulation.down_payment_amount)) 
        : null,

    // Conifgurações da rota, página e parceiro
    rules: payload.rules || null ,
    is_integrated: payload.is_integrated,             // Indica que esta simulação veio de um parceiro integrado ou não
    integration_method: payload.integration_method,   // 'API', 'EMAIL', 'FILE', 'MANUAL'
    integration_details: payload.integration_details || null
  };

  // Cálculo de segurança para o percentual
  if (cleanData.requested_value > 0) {
    cleanData.down_payment_percentage = (cleanData.down_payment_amount / cleanData.requested_value) * 100;
  }
  
  // Envia log para o Supabase, se ligado
  debugLog("PAYLOAD NORMALIZADO -> CLEANDATA:", cleanData)

  // =========================================================================
  // PASSO 2: PERSISTÊNCIA INTEGRAL (TRIPLE-WRITE)
  // =========================================================================

  /**
   * PERSISTÊNCIA NA TABELA MESTRE (simulations)
   * @description Realiza o insert principal que gera o ID da simulação. 
   * Este ID será a chave estrangeira (FK) para todas as tabelas de auditoria e consentimento.
   */
  const { data: sim, error: simError } = await supabase
    .from('simulations')
    .insert({
      // --- Identificadores de Contexto ---
      is_integrated: cleanData.is_integrated,             // Indica se esta simulação veio de um parceiro integrado ou não
      integration_method: cleanData.integration_method,   // 'API', 'EMAIL', 'FILE', 'MANUAL'
      partner_id: cleanData.partner_id,         // Parceiro (ex: Fandi)
      product_id: cleanData.product_id,         // ID do Produto Financeiro (ex: CDC Veículos)
     
      // --- Dados do Proponente (Flattened para busca rápida) ---
      entity_id: cleanData.entity_id,           // ID único do cliente no ecossistema
      name: cleanData.name,                     // Nome completo (sanitizado e trimado)
      document: cleanData.document,             // CPF/CNPJ (apenas números)
      phone: cleanData.phone,                   // Celular com DDD
      email: cleanData.email,                   // Email (normalizado para lowercase)
      birth_date: cleanData.birth_date,         // Data de nascimento (formato ISO)
      gender: cleanData.gender,                 // Gênero para análise demográfica
      entity_details: entity,                   // Snapshot JSONB completo do proponente

      // --- Contexto Organizador e Evento ---
      manager_name: cleanData.manager_name,     // Nome do Leiloeiro/Operador
      manager_details: manager,                 // Metadados do organizador (JSONB)
      event_id: cleanData.event_id,             // ID do Evento/Leilão (Corrigido typo: event_id)
      event_description: cleanData.event_description,
      event_start_date: cleanData.event_start_date, 
      event_end_date: cleanData.event_end_date,     
      event_details: event,                     // Snapshot JSONB do evento

      // --- Contexto Loja/Seller ---
      seller_id: cleanData.seller_id,           // ID da Loja/Vendedor
      legal_name: cleanData.legal_name,         // Razão Social
      trade_name: cleanData.trade_name,         // Nome Fantasia
      economic_group: cleanData.economic_group, // Grupo economico
      seller_details: seller,                   // Snapshot JSONB do Seller

      // --- Dados da Oferta (Corrigindo campos que ficaram vazios no dump) ---
      offer_id: cleanData.offer_id,
      offer_description: cleanData.offer_description,
      offer_value: cleanData.offer_value,           
      category_id: cleanData.category_id,
      offer_details: offer,
      
      // --- Parâmetros Financeiros da Simulação ---
      requested_value: cleanData.requested_value,          // Valor total do veículo
      down_payment_amount: cleanData.down_payment_amount,  // Valor da entrada (R$)
      down_payment_percentage: cleanData.down_payment_percentage, // % da entrada
      financed_amount: cleanData.financed_amount,          // Valor líquido financiado
      installments: cleanData.installments,                // Quantidade de parcelas

      /**
       * @column simulation_details (JSONB)
       * @type SimulationFinancials
       * @description Objeto financeiro íntegro para o motor de crédito e auditoria futura.
       */
      simulation_details: {
        requested_value: cleanData.requested_value,
        down_payment_amount: cleanData.down_payment_amount,
        down_payment_percentage: cleanData.down_payment_percentage,
        financed_amount: cleanData.financed_amount,
        installments: cleanData.installments,
        interest_rate: cleanData.cet_rate,       // CET enviado pelo frontend ou default
        simulated_at: new Date().toISOString()
      },

      // --- Status e Auditoria de Carga ---
      stage_id: 2,                              // Simulação
      status_id: 0,                             // Inicia com status 'Pendente de envio'
      visit_id: cleanData.visit_id,             // FK para a tabela de visitas (origem do tráfego)
      raw_payload: payload                      // Backup integral do JSON recebido
    })
    .select('id')
    .single();

  if (simError) throw new Error(`Erro Triple-Write (Mestre): ${simError.message}`);

  // Captura novo id de simulação
  const simulationId = sim.id;
  cleanData.simulation_id = simulationId

  /**
   * REGISTRO DE TRILHA DE AUDITORIA (simulation_updates)
   * @description Grava o rastro técnico da operação. Essencial para compliance (LGPD) 
   * e para depuração de erros de integração com o gateway.
   */
  const { error: updateError } = await supabase
    .from('simulation_updates')
    .insert({
      simulation_id: simulationId,              // FK para a simulação recém-criada
      operation: 'INSERT',                      // Tipo de operação: INSERT (Entrada) ou UPDATE (Retorno)
      status_id: 0,                             // Status padão "Pendente de envio"
      stage_id: 2,                              // Estágio padrão "Simulação"

      // --- Dados de Infraestrutura (Colunas Abertas para Filtros Rápidos) ---
      ip_address: infra.ip_address,
      country: infra.country,
      state: infra.state,
      city: infra.city,
      user_agent: infra.user_agent,
      device_type: infra.device_type,
      operating_system: infra.operating_system,

      /**
       * @column origin_details (JSONB)
       * @type OriginDetails
       * @description O "Snapshot de Origem". Salva o objeto de infraestrutura completo, 
       * garantindo que metadados dinâmicos (CF-Ray, TLS) sejam persistidos sem mudar o schema.
       */
      origin_details: infra, 

      /**
       * @column simulation_details (JSONB)
       * @type SimulationFinancials
       * @description Réplica dos dados financeiros para auditoria de mutação de taxas.
       */
      simulation_details: {
        requested_value: cleanData.requested_value,
        down_payment_amount: cleanData.down_payment_amount,
        financed_amount: cleanData.financed_amount,
        installments: cleanData.installments,
        cet_rate: cleanData.cet_rate, 
        simulated_at: new Date().toISOString()
      },

      raw_payload: payload                      // Payload original para reprodução de erros (Replay)
    } as SimulationUpdate);                     // Cast para garantir conformidade com a interface

  if (updateError) {
    // Envia log para o Supabase, se ligado
    debugLog("ERRO INSERT SIMULATION_UPDATS:", updateError.message);
  } else {
    // Envia log para o Supabase, se ligado
    debugLog("SUCESSO INSERT SIMULATION_UPDATS: simulação ", simulationId);
  }
  
  /**
   * PERSISTÊNCIA DE CONSENTIMENTOS (simulation_consents)
   * @description Registra os Opt-ins do usuário. Implementa o padrão "Snapshot Jurídico",
   * gravando exatamente o que foi visualizado na página antes do início da simulação financeira.
   */

  // Extração dos consentimentos enviados pelo front-end
  const consentsArray = payload.consents || [];

  const consentInserts: SimulationConsent[] = consentsArray.map((consent: any): SimulationConsent => ({
    simulation_id: simulationId,
    
    // --- Dados do Aceite ---
    consent_id: consent.consent_id,
    accepted: consent.accepted,
    accepted_at: consent.accepted_at || new Date().toISOString(),
    
    // --- Identificação do Cliente (Redundância para conformidade LGPD) ---
    partner_id: cleanData.partner_id,
    product_id: cleanData.product_id,
    entity_id: cleanData.entity_id,
    document: cleanData.document,
    name: cleanData.name,
    email: cleanData.email,
    phone: cleanData.phone,
    birth_date: cleanData.birth_date,
    gender: cleanData.gender,
    entity_details: entity,

    // --- Infraestrutura do Aceite ---
    ip_address: infra.ip_address,
    country: infra.country,
    state: infra.state,
    city: infra.city,
    user_agent: infra.user_agent,
    device_type: infra.device_type,
    operating_system: infra.operating_system,
    
    // --- Snapshots de Contexto e Origem ---
    origin_details: infra,
    manager_details: manager,
    seller_details: seller,
    event_details: event,
    offer_details: offer,
    
    // --- Snapshot Jurídico da Página (Branding, Regras, FAQs) ---
    page_snapshot: {
      branding: payload.page_configs || {},
      rules: payload.rules || {},
      faq: payload.page_faqs || [],
      consents_rendered: payload.consent_configs || [],
      legal_text: consent.legal_text_snapshot || {}
    },

    raw_payload: payload
  }));

  // Persistência em lote apenas se houver registros
  if (consentInserts.length > 0) {
    await supabase.from('simulation_consents').insert(consentInserts);
  }

  // =========================================================================
  // PASSO 3: SINCRONIZAÇÃO COM PARCEIROS EXTERNOS (GATEWAY DE CRÉDITO)
  // =========================================================================

  // Inicialização de variáveis de controle de fluxo
  let gatewayResult: PartnerResponse | null = null;
  let bestConsult: Consultation | null = null; 
  let result_partner_id: number | null = null; 

  switch (cleanData.partner_id) {
      case 1: // sbxPAY
        debugLog("INICIO SIMULAÇÃO CARTÃO: ", cleanData);
        gatewayResult = await processarFluxoCartao(cleanData);
        break;
      case 2: // Fandi (Integrado ou não)
        // 1. Chaveamento dinâmico baseado no contrato da rota vindo do banco
        const isIntegratedRoute = cleanData?.is_integrated === true;

        if (isIntegratedRoute) {
          // ===================================================================
          // ESTEIRA INTEGRADA VIA API (Ex: Fluxo Fandi para Varejo/PF)
          // ===================================================================
          debugLog("REQUISITANDO MOTOR INTEGRADO (FANDI API): ", cleanData);   
          gatewayResult = await processarFluxoFandi(cleanData); 
          
        } else {
          // ===================================================================
          // ESTEIRA CUSTOMIZADA / BALCÃO (Ex: Fluxo Parceiro / MeResolve PJ)
          // ===================================================================
          debugLog("REQUISITANDO MOTOR LOCAL (SIMULAÇÃO FLUXO PARCEIRO): ", cleanData);
          
          // Chama a função correta que calcula os fatores e monta o quadro branco
          gatewayResult = await processarFluxoParceiro(cleanData);
        }
        break;

      default:
          throw new Error(`Parceiro ${cleanData.partner_id} não suportado.`);
  }

  // =========================================================================
  // PASSO 4: PERSISTÊNCIA DAS CONSULTAS E ATUALIZAÇÃO FINAL
  // =========================================================================

  if (gatewayResult && gatewayResult.consults && gatewayResult.consults.length > 0) {
    
    debugLog("GATEWAY RESPONSE:", gatewayResult);

    // 4.1. LOOP DE PERSISTÊNCIA NAS CONSULTAS (Marketplace Multi-Oferta)
    for (const consult of gatewayResult.consults) {
      
      // Catalogação do ID amigável de 8 dígitos para cada consulta
      const resultPartnerId = await resolvePartnerResult(
        cleanData.partner_id,
        consult.status_id,
        consult.message
      );

      // Inserção na tabela simulation_consults (O rastro técnico)
      const { error: consultError } = await supabase
        .from('simulation_consults')
        .insert({
          simulation_id: simulationId,
          financial_institution_id: consult.financial_institution_id?.toString(),
          requested_value: consult.requested_value,
          down_payment_amount: consult.down_payment_amount,
          down_payment_percentage: consult.down_payment_percentage,
          financed_amount: consult.financed_amount,
          installments: consult.installments,
          cet_rate: consult.cet_rate,
          installment_value: consult.installment_value,
          external_operation_id: consult.external_operation_id,
          status_id: consult.status_id,
          simulation_details: consult,  // Guarda o objeto completo da consulta para auditoria 
          raw_payload: consult.raw      // Audit Trail individual por banco
        });

      if (consultError) debugLog("Erro ao persistir consulta individual:", consultError.message);
    }

    // 4.2. ELEIÇÃO DA OFERTA PRINCIPAL PARA A TABELA 'simulations'
    // "melhor" oferta vai para a tabela principal
    const bestConsult = gatewayResult.consults.find(c => c.is_selected === true) || gatewayResult.consults[0]; // Fallback de segurança

    // Resolve o ID amigável para a oferta principal
    const mainResultPartnerId = await resolvePartnerResult(
      cleanData.partner_id,
      bestConsult.status_id,
      bestConsult.message
    );

    // 4.3. UPDATE NA TABELA MESTRE (simulations)
    const { error: dbError } = await supabase
      .from('simulations')
      .update({
        status_id: bestConsult.status_id,
        result_partner_id: mainResultPartnerId,
        external_operation_id: bestConsult.external_operation_id,
        financial_institution_id: bestConsult.financial_institution_id,
        requested_value: bestConsult.requested_value,
        down_payment_amount: bestConsult.down_payment_amount,
        down_payment_percentage: bestConsult.down_payment_percentage,   
        financed_amount: bestConsult.financed_amount,
        installments: bestConsult.installments,
        cet_rate: bestConsult.cet_rate,
        installment_value: bestConsult.installment_value,
        // Snapshot completo: integração + todas as consults
        simulation_details: gatewayResult,
        raw_payload: { request: cleanData, response: gatewayResult }, // Atualiza o raw_payload com a resposta do gateway para auditoria
        updated_at: new Date().toISOString()
      })
      .eq('id', simulationId);

    if (dbError) console.error("ERRO UPDATE SIMULATIONS:", dbError.message);

    // 4.4. REGISTRO NA TRILHA DE AUDITORIA (simulation_updates)
    await supabase.from('simulation_updates').insert({
      simulation_id: simulationId,
      operation: 'UPDATE',
      stage_id: 2,
      status_id: bestConsult.status_id,
      result_partner_id: mainResultPartnerId,
      simulation_details: gatewayResult,
      ip_address: infra.ip_address,
      country: infra.country,
      state: infra.state,
      city: infra.city,
      user_agent: infra.user_agent,
      device_type: infra.device_type,
      operating_system: infra.operating_system,
      origin_details: infra, 
      raw_payload: { request: cleanData, response: gatewayResult }
    });
  }

  // 4.5. Resposta final para o Front-end

  // 1. Logo antes de montar o JSON de resposta
  // Isso garante que não dependemos de variáveis de escopo instáveis
  const finalConsult = gatewayResult?.consults?.find(c => c.is_selected === true) || gatewayResult?.consults?.[0];

  const payloadFinal = {
    sucesso: gatewayResult?.success || false,
    status_id: finalConsult?.status_id,
    simulation_id: String(simulationId),
    mensagem: gatewayResult?.message,
    consults: gatewayResult?.consults || []
  };

  // LOG PARA VOCÊ CONFERIR NO SUPABASE
  console.log("JSON FINAL SENDO DESPACHADO:", JSON.stringify(payloadFinal));

  return payloadFinal;
}