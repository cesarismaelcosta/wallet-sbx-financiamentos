/**
 * @file logger.ts
 * @description Utilitário de log centralizado para padronização de saídas em produção e desenvolvimento.
 * Implementa mascaramento de dados sensíveis (PII) e rastreamento automático de chamadas.
 */

const IS_DEBUG = Deno.env.get("DEBUG_MODE") !== "false";

// Registro Central de dados sensíveis para controle granular de mascaramento
// mask: true -> Mascara o dado (PII ou Segredo)
type RedactConfig = { mask: boolean };

const SENSITIVE_REGISTRY: Record<string, RedactConfig> = {
  // Tokens e Segredos
  "session_token": { mask: true },
  "auth_token": { mask: true },
  "access_token": { mask: true },
  "refresh_token": { mask: true },
  "chaveAcesso": { mask: true },
  "api_key": { mask: true },
  "password": { mask: true },
  "senha": { mask: true },
  
  // PII e Identificação (Inglês e Português do seu código)
  "cpf": { mask: true },
  "cnpj": { mask: true },
  "cpfCNPJ": { mask: true },
  "email": { mask: true },
  "name": { mask: true },
  "nome": { mask: true },
  "document": { mask: true },
  "phone": { mask: true },
  "celular": { mask: true },
  "mothers_name": { mask: true },
  "document_rg": { mask: true },
  "birth_date": { mask: true },
  "dataNascimento": { mask: true },
  "login": { mask: true },
  "clienteId": { mask: false },
  "guid": { mask: false },
  
  // Dados Financeiros e Veículo
  "valorParcela": { mask: true },
  "valorEntrada": { mask: true },
  "valorFinanciado": { mask: true },
  "valor": { mask: true },
  "valorVeiculo": { mask: true },
  "requested_value": { mask: true },
  "down_payment_amount": { mask: true },
  "chassi": { mask: true },
  "renavam": { mask: true },
  "placa": { mask: true },
  "fipe": { mask: true },
  "fipe_code": { mask: true },
  
  // Integração
  "urlCallback": { mask: false },
  "cnpjLoja": { mask: false },
  "vendedorId": { mask: false },
  "pontoVendaId": { mask: false },
  "instituicaoFinanceiraId": { mask: false },
  
  // Estruturas
  "address": { mask: true },
  "seller": { mask: true },
  "metadata": { mask: true },
  "entity": { mask: false },
  "offer_detailed_description": { mask: false },
  
  // Rastreio (Manter visível)
  "ip_address": { mask: false },
  "user_id": { mask: false }
};

/**
 * Função recursiva que limpa o objeto baseado no registro acima.
 * Caso encontre uma chave sensível, mascara o valor se a config exigir.
 */
const redact = (key: string, value: any): any => {
  const config = SENSITIVE_REGISTRY[key];

  // Se não está no registro, retorna o valor original (seguro)
  if (!config) return value;

  // Se mask é true, bloqueia sempre
  if (config.mask) return "[MASKED]";

  return value;
};

/**
 * Varredura profunda no objeto para aplicar o redactor em todos os níveis.
 * Essencial para pegar dados sensíveis aninhados (ex: payload.entity.document).
 */
const deepRedact = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') return obj;
  
  // Lida com Arrays
  if (Array.isArray(obj)) return obj.map(deepRedact);

  // Lida com Objetos
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
 * Loga mensagens no console apenas se a variável de ambiente DEBUG_MODE for "true".
 * Identifica automaticamente a função chamadora via Stack Trace para facilitar o debug.
 * 
 * @param {string} message - A mensagem descritiva do log.
 * @param {any} [data] - Objeto ou dado opcional para depuração (será sanado automaticamente).
 */
export const debugLog = (message: string, data?: any) => {
  if (!IS_DEBUG) return;

  // Extração do nome da função chamadora através do Stack Trace
  // O índice 2 do array corresponde ao contexto de execução de quem chamou a função
  const stack = new Error().stack?.split('\n') || [];
  const callerLine = stack[2] || "unknown";
  const match = callerLine.match(/at\s+(.+)\s+\(/);
  const callerName = match ? match[1].split('.').pop() : "anonymous";

  try {
    // Processa os dados antes de logar para evitar vazamentos
    // Usamos JSON.parse(JSON.stringify) para limpar instâncias complexas (evita ciclos de memória)
    const cleanData = data ? deepRedact(JSON.parse(JSON.stringify(data))) : null;
    
    // Saída formatada: Timestamp é omitido pois o ambiente Supabase Edge já o injeta nativamente
    console.log(`[${callerName}] ${message}`, cleanData);
  } catch (e) {
    // Falha de segurança/log não deve derrubar a aplicação
    console.error(`[${callerName}] ERRO INTERNO DO LOGGER:`, e);
  }
};