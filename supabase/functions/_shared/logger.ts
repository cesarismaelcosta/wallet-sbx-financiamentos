/**
 * @file logger.ts
 * @description Utilitário de log centralizado para padronização de saídas em produção e desenvolvimento.
 * Implementa mascaramento de dados sensíveis (PII) e rastreamento automático de chamadas de forma case-insensitive.
 */

const IS_DEBUG = Deno.env.get("DEBUG_MODE") !== "false";

// Registro Central de dados sensíveis para controle granular de mascaramento.
// As chaves devem estar em minúsculo (lowercase) para garantir o funcionamento do filtro case-insensitive.
type RedactConfig = { mask: boolean };

const SENSITIVE_REGISTRY: Record<string, RedactConfig> = {
  // ==========================================
  // Tokens e Segredos de Autenticação
  // ==========================================
  "session_token": { mask: true },
  "auth_token": { mask: true },
  "access_token": { mask: true },
  "refresh_token": { mask: true },
  "chaveacesso": { mask: true },
  "api_key": { mask: true },
  "password": { mask: true },
  "senha": { mask: true },
  
  // ==========================================
  // PII e Identificação (Inglês e Português)
  // ==========================================
  "cpf": { mask: true },
  "cnpj": { mask: true },
  "cpfcnpj": { mask: true },
  "email": { mask: true },
  "name": { mask: true },
  "nome": { mask: true },
  "document": { mask: true },
  "document_number": { mask: true },
  "phone": { mask: true },
  "celular": { mask: true },
  "mothers_name": { mask: true },
  "mothersname": { mask: true },
  "document_rg": { mask: true },
  "birth_date": { mask: true },
  "datanascimento": { mask: true },
  "gender": { mask: true },
  "login": { mask: true },
  "clienteid": { mask: false },
  "guid": { mask: false },
  
  // ==========================================
  // Dados Financeiros, Veículo e Endereço
  // ==========================================
  "valorparcela": { mask: true },
  "valorentrada": { mask: true },
  "valorfinanciado": { mask: true },
  "valor": { mask: true },
  "valorveiculo": { mask: true },
  "requested_value": { mask: true },
  "down_payment_amount": { mask: true },
  "chassi": { mask: true },
  "renavam": { mask: true },
  "placa": { mask: true },
  "license_plate": { mask: true },
  "fipe": { mask: true },
  "fipe_code": { mask: true },
  "postal_code": { mask: true },
  
  // ==========================================
  // Integração e Payloads Brutos
  // ==========================================
  "urlcallback": { mask: false },
  "cnpjloja": { mask: false },
  "vendedroid": { mask: false },
  "pontovendaid": { mask: false },
  "instituicaofinanceiraid": { mask: false },
  "raw_payload": { mask: true },
  "integration_details": { mask: true },
  "entity_details": { mask: true },
  "owners": { mask: true },
  
  // ==========================================
  // Estruturas de Dados e Metadados
  // ==========================================
  "address": { mask: true },
  "seller": { mask: true },
  "metadata": { mask: true },
  "entity": { mask: false },
  "offer_detailed_description": { mask: false },
  
  // ==========================================
  // Rastreio (Manter visível para auditoria)
  // ==========================================
  "ip_address": { mask: false },
  "user_id": { mask: false }
};

/**
 * Função de mascaramento individual que trata as chaves de forma case-insensitive.
 * Normaliza a chave recebida para minúsculo antes de consultar o registro central,
 * garantindo que variações como "CPF", "Cpf" ou "cpf" sejam mascaradas corretamente.
 * 
 * @param {string} key - A chave do objeto a ser validada.
 * @param {any} value - O valor associado à chave.
 * @returns {any} O valor original ou "[MASKED]" caso corresponda a uma regra sensível.
 */
const redact = (key: string, value: any): any => {
  if (!key) return value;
  
  // Normaliza a chave para minúsculo para evitar falhas por variação de case (ex: PascalCase de APIs externas)
  const normalizedKey = key.toLowerCase();
  const config = SENSITIVE_REGISTRY[normalizedKey];

  // Se não está no registro, retorna o valor original (seguro)
  if (!config) return value;

  // Se mask é true, bloqueia sempre
  if (config.mask) return "[MASKED]";

  return value;
};

/**
 * Varredura profunda (recursiva) no objeto para aplicar o redactor em todos os níveis.
 * Essencial para interceptar dados sensíveis aninhados (ex: payload.entity.document ou dados de parceiros).
 * 
 * @param {any} obj - O objeto ou array a ser inspecionado.
 * @returns {any} Uma nova estrutura de dados sanitizada.
 */
const deepRedact = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') return obj;
  
  // Lida com Arrays iterando sobre cada elemento
  if (Array.isArray(obj)) return obj.map(deepRedact);

  // Lida com Objetos construindo um clone limpo
  const cleanObj: any = {};
  for (const [key, value] of Object.entries(obj)) {
    const redactedValue = redact(key, value);
    cleanObj[key] = (typeof redactedValue === 'object' && redactedValue !== null) 
      ? deepRedact(redactedValue) 
      : redactedValue;
  }
  return cleanObj;
};

/**
 * Loga mensagens no console apenas se a variável de ambiente DEBUG_MODE for "true" (ou conforme configuração).
 * Identifica automaticamente a função chamadora via Stack Trace para facilitar o rastreio de bugs.
 * 
 * @param {string} message - A mensagem descritiva do log.
 * @param {any} [data] - Objeto ou dado opcional para depuração (será sanado automaticamente pelo deepRedact).
 */
export const debugLog = (message: string, data?: any) => {
  if (!IS_DEBUG) return;

  // Extração do nome da função chamadora através do Stack Trace do Deno/V8
  // O índice 2 do array corresponde ao contexto de execução de quem invocou o debugLog
  const stack = new Error().stack?.split('\n') || [];
  const callerLine = stack[2] || "unknown";
  const match = callerLine.match(/at\s+(.+)\s+\(/);
  const callerName = match ? match[1].split('.').pop() : "anonymous";

  try {
    // Processa os dados antes de logar para evitar qualquer vazamento acidental de PII
    // Usamos JSON.parse(JSON.stringify) para limpar instâncias complexas e evitar ciclos de memória
    const cleanData = data ? deepRedact(JSON.parse(JSON.stringify(data))) : null;
    
    // Saída formatada: Timestamp é omitido pois o ambiente Supabase Edge já o injeta nativamente nas execuções
    console.log(`[${callerName}] ${message}`, cleanData);
  } catch (e) {
    // Falha interna de formatação ou log nunca deve derrubar o fluxo principal da aplicação
    console.error(`[${callerName}] ERRO INTERNO DO LOGGER:`, e);
  }
};