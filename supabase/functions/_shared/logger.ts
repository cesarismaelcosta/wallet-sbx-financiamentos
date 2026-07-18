/**
 * @file logger.ts
 * @description Utilitário de log centralizado para padronização de saídas em produção e desenvolvimento.
 * Implementa mascaramento de dados sensíveis (PII) e rastreamento automático de chamadas.
 */

const IS_DEBUG = Deno.env.get("DEBUG_MODE") === "true";

/**
 * Sanitiza strings para remover padrões comuns de dados sensíveis (PII).
 * @param {any} data - Dado bruto que pode conter CPF ou E-mail.
 * @returns {any} O dado com padrões sensíveis mascarados.
 */
const maskPII = (data: any): any => {
  if (typeof data !== 'string') return data;
  return data
    // Mascara CPF (ex: 123.456.789-00 -> ***.***.***-00)
    .replace(/\d{3}\.\d{3}\.\d{3}-\d{2}/g, '***.***.***-**')
    // Mascara Email (ex: cesar@email.com -> c****@email.com)
    .replace(/([a-zA-Z0-9._-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,6})/g, '$1****@$2');
};

/**
 * Loga mensagens no console apenas se a variável de ambiente DEBUG_MODE for "true".
 * Identifica automaticamente a função chamadora via Stack Trace.
 * 
 * @param {string} message - A mensagem descritiva do log.
 * @param {any} [data] - Objeto ou dado opcional para depuração.
 */
export const debugLog = (message: string, data?: any) => {
  if (!IS_DEBUG) return;

  // Extração do nome da função chamadora através do Stack Trace
  // O índice 2 do array corresponde ao contexto de execução de quem chamou a função
  const stack = new Error().stack?.split('\n') || [];
  const callerLine = stack[2] || "unknown";
  const match = callerLine.match(/at\s+(.+)\s+\(/);
  const callerName = match ? match[1].split('.').pop() : "anonymous";

  const rawData = data ? JSON.stringify(data, null, 2) : "";
  const safeData = maskPII(rawData);

  // Saída formatada: Timestamp é omitido pois o ambiente Supabase Edge já o injeta nativamente
  console.log(`[${callerName}] ${message}`, safeData);
};