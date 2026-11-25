/**
 * @file logger.ts
 * @description Utilitário de log centralizado para padronização de saídas em produção e desenvolvimento.
 * Implementa mascaramento de dados sensíveis (PII) e rastreamento automático de chamadas de forma case-insensitive.
 *
 * - `debugLog`: só com DEBUG_MODE = "true" (desligado por padrão). Mascara PII (SENSITIVE_REGISTRY)
 *   e segredos (mesma lista de `_shared/strip-secrets.ts`: chaves, tokens, URL de callback assinada).
 * - `logError`: SEMPRE loga (erro precisa de rastro), mas só contexto, código e mensagem curta do
 *   erro, nunca o objeto inteiro (erro do Postgres pode trazer o valor que causou o problema, ex. CPF).
 */

import { isSecretKey } from "./strip-secrets.ts";

// Debug só quando explicitamente ligado (DEBUG_MODE = "true"). Em dev, configure a variável.
const IS_DEBUG = Deno.env.get("DEBUG_MODE") === "true";

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
  "valorparcela": { mask: false },
  "valorentrada": { mask: false },
  "valorfinanciado": { mask: false },
  "valor": { mask: false },
  "valorveiculo": { mask: false },
  "requested_value": { mask: false },
  "down_payment_amount": { mask: false },
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
  "urlcallback": { mask: true },
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
const redact = (key: string, value: unknown): unknown => {
  if (!key) return value;
  
  // Normaliza a chave para minúsculo para evitar falhas por variação de case (ex: PascalCase de APIs externas)
  const normalizedKey = key.toLowerCase();
  // Segredos (chaves, tokens, URL assinada): sempre ocultos, mesma lista do strip-secrets
  if (isSecretKey(key)) return "[MASKED]";
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
const deepRedact = (obj: unknown): unknown => {
  if (obj === null || typeof obj !== 'object') {
    // 🛡️ [SBXW-30 FIX]: uma string solta passava direto, sem checagem alguma
    // (foi assim que um secret em texto claro, passado como segundo argumento
    // de debugLog, chegou ao log). Números/booleanos/undefined seguem
    // passando (baixo risco de serem segredo, evita mudança de comportamento
    // desnecessária); só string é tratada como não confiável por padrão.
    return typeof obj === 'string' ? '[REDACTED:scalar-string]' : obj;
  }
  
  // Lida com Arrays iterando sobre cada elemento
  if (Array.isArray(obj)) return obj.map(deepRedact);

  // Lida com Objetos construindo um clone limpo
  const cleanObj: Record<string, unknown> = {};
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
export const debugLog = (message: string, data?: unknown) => {
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

/** Tamanho máximo da mensagem de erro no log. */
const MAX_ERROR_MESSAGE = 300;

/**
 * Loga um erro SEM o objeto inteiro: contexto + código (ex.: 23505 do Postgres) + mensagem curta.
 * Não passa o `detail` do Postgres (que pode conter o valor, ex. CPF/e-mail repetido) nem stack.
 * Sempre loga (independe de DEBUG_MODE). `extra`: ids de rastreio (passa pelo mesmo mascaramento).
 */
export const logError = (context: string, err: unknown, extra?: Record<string, unknown>) => {
  try {
    const e = (err ?? {}) as { code?: unknown; message?: unknown; name?: unknown };
    const code = typeof e.code === "string" || typeof e.code === "number" ? String(e.code) : undefined;
    const raw = typeof e.message === "string" ? e.message : typeof err === "string" ? err : String(e.name ?? "erro");
    const message = raw.length > MAX_ERROR_MESSAGE ? `${raw.slice(0, MAX_ERROR_MESSAGE)}…` : raw;
    const safeExtra = extra ? deepRedact(JSON.parse(JSON.stringify(extra))) : undefined;
    console.error(`[${context}]`, { code, message, ...(safeExtra ? { extra: safeExtra } : {}) });
  } catch (_) {
    console.error(`[${context}] erro (falha ao formatar)`);
  }
};
