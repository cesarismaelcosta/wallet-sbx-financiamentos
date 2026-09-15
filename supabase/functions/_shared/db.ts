// @deno-types="https://deno.land/x/postgresjs/mod.js"
import postgres from 'https://deno.land/x/postgresjs/mod.js';

// Lê a URL do banco das variáveis de ambiente do projeto
const dbUrl = Deno.env.get('SUPABASE_DB_URL');

if (!dbUrl) {
  throw new Error("Erro de Configuração: A variável SUPABASE_DB_URL não está definida.");
}

// Inicializa o cliente uma única vez
// O export permite que você use a conexão em qualquer arquivo
export const sql = postgres(dbUrl, {
  prepare: false,      // Mantém false (Obrigatório para o Pooler)
  // 🚀 [PERFORMANCE - 2026-09-15]: era `max: 1`. Motivo: persist-data.ts
  // (insertSimulationData/updateSimulationData) dispara várias escritas em
  // Promise.all (oferta, consultas, notificação, sincronização de visita) —
  // com 1 conexão só, essa "paralela" ficava na fila da mesma conexão em vez
  // de rodar de verdade. Subimos pra 5 (banco com max_connections=60, 15 em
  // uso na checagem) pra isso valer a pena.
  // ⚠️ Tempos observados (~3,7-3,9s no insert) vieram de teste em dev, de
  // máquina local — validar o ganho real em produção antes de tomar esses
  // números como referência.
  max: 5,
  idle_timeout: 10,    // 🚀 CRÍTICO: Fecha conexões ociosas rápido para não engasgar o banco
  connect_timeout: 10  // Derruba rápido se o banco não responder
});