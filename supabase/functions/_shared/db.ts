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
  max: 1,              // 🚀 CRÍTICO: Força a Edge Function a usar 1 única conexão otimizada
  idle_timeout: 10,    // 🚀 CRÍTICO: Fecha conexões ociosas rápido para não engasgar o banco
  connect_timeout: 10  // Derruba rápido se o banco não responder
});