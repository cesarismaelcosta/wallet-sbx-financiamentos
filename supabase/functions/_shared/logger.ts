/**
 * @file logger.ts
 * @description Utilitário de log centralizado para padronização de saídas em produção e desenvolvimento.
 * Implementa mascaramento de dados sensíveis (PII) e rastreamento automático de chamadas.
 */

const IS_DEBUG = Deno.env.get("DEBUG_MODE") !== "false";
const IS_AUDIT_ENABLED = Deno.env.get("AUDIT_MODE") !== "false";

// Registro Central de dados sensíveis para controle granular de mascaramento
// mask: true -> Mascara o dado (PII ou Segredo)
// audit: true -> Se AUDIT_MODE estiver ativo, revela o dado real
type RedactConfig = { mask: boolean; audit: boolean; };

const SENSITIVE_REGISTRY: Record<string, RedactConfig> = {
  // Tokens (NUNCA exibir - Segurança máxima)
  "session_token": { mask: true, audit: false },
  "auth_token": { mask: true, audit: false },
  "access_token": { mask: true, audit: false },
  "refresh_token": { mask: true, audit: false },
  "chaveAcesso": { mask: true, audit: false },
  "api_key": { mask: true, audit: false },
  "password": { mask: true, audit: false },
  "senha": { mask: true, audit: false },
  
  // PII (Mascarar por padrão, mas permitir auditar em caso de suporte técnico)
  "cpf": { mask: true, audit: true },
  "cnpj": { mask: true, audit: true },
  "email": { mask: true, audit: true },
  "name": { mask: true, audit: true },
  "document": { mask: true, audit: true },
  
  // Rastreio (Necessários para debug, sem risco de segurança)
  "ip_address": { mask: false, audit: true },
  "user_id": { mask: false, audit: true },
};

/**
 * Função recursiva que limpa o objeto baseado no registro acima.
 * Caso encontre uma chave sensível, decide se mascara ou revela conforme a config.
 */
const redact = (key: string, value: any): any => {
  const config = SENSITIVE_REGISTRY[key.toLowerCase()];

  // Se não está no registro, retorna o valor original (seguro)
  if (!config) return value;

  // Se é segredo proibido de auditar (audit: false), bloqueia sempre
  if (config.mask && !config.audit) return "[REDACTED]";

  // Se tem configuração de auditoria, revela apenas se o modo auditoria estiver ligado
  if (config.mask && config.audit) {
    return IS_AUDIT_ENABLED ? value : "[MASKED]";
  }

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