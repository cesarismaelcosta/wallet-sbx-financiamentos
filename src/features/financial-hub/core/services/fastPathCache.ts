/**
 * @fileoverview Serviço de Cache Epêmero em RAM (Zero-Latency Fast Path)
 * @path src/features/financial-hub/core/services/fastPathCache.ts
 *
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: MEMÓRIA VOLÁTIL & STRICT MODE SHIELD
 * =========================================================================
 * Este módulo atua como o "Caminhão de Transporte" entre a intenção (POST) 
 * na Vitrine e a hidratação (GET) do Formulário/Wizard, permitindo a 
 * transição de telas em 0 milissegundos sem requisições redundantes de rede.
 *
 * [MECÂNICA ARQUITETURAL]:
 * 1. {In-Memory Ephemeral Storage}: Os dados trafegam exclusivamente via RAM.
 *    Não usamos localStorage ou sessionStorage para evitar vazamento de PII
 *    (Zero-Trust) e sujeira de estado entre abas.
 * 2. {Strict Mode Shield (TTL)}: Abandonamos o padrão "Read-and-Destroy" imediato.
 *    Para suportar o Strict Mode do React 18 (que monta o componente duas vezes 
 *    no ambiente de desenvolvimento) e evitar Race Conditions na hidratação, 
 *    a maleta recebe um TTL (Time-To-Live) de 2000ms.
 * 3. {State Leak Shield (Key Binding)}: O cache é assinado com o `visit_update_id`.
 *    Isso garante que uma etapa do funil não consuma acidentalmente o cache 
 *    "sujo" da etapa anterior, forçando um GET real caso a chave não bata.
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 */

// Guardamos a chave junto com o estado
let memoryCache: { key: string | null; state: any } | null = null;

export const setFastPathState = (state: any) => {
  // Extrai a chave de forma defensiva (direto do estado ou dentro do nó visit)
  const key = state?.visit_update_id ?? state?.visit?.visit_update_id ?? null;
  
  memoryCache = { key, state };

  // TTL (Time To Live) Shield: 2 segundos de sobrevida antes da limpeza.
  setTimeout(() => {
    memoryCache = null;
  }, 2000);
};

// Agora aceita a chave requerida pelo hook (useOrchestratorHydration)
export const consumeFastPathState = (key?: string) => {
  if (!memoryCache) return null;
  
  // Se nenhuma chave foi pedida, ou se a chave confere com o cache, libera a maleta.
  if (!key || memoryCache.key === key) {
    return memoryCache.state;
  }
  
  // Se a chave não bate, bloqueia a leitura para não vazar estado de outra tela.
  return null;
};

export const clearFastPathState = () => {
  memoryCache = null;
};