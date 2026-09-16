// @deno-types="https://deno.land/x/postgresjs/mod.js"
import postgres from 'https://deno.land/x/postgresjs/mod.js';

// 🛡️ [FIX]: `SUPABASE_DB_URL` é reservado — injetado automaticamente pela
// própria plataforma (aponta para a conexão DIRETA ao Postgres, conforme a
// doc oficial: "The URL for your Postgres database. You can use this to
// connect directly to your database") e não pode ser sobrescrito via
// `supabase secrets set` (a CLI recusa qualquer nome com prefixo SUPABASE_).
// Usamos um nome próprio para apontar explicitamente para o Transaction
// Pooler (Supavisor) — compatível com o uso stateless de Edge Function e
// com o `prepare: false` já exigido abaixo.
const dbUrl = Deno.env.get('DB_POOLER_URL');

if (!dbUrl) {
  throw new Error("Erro de Configuração: A variável DB_POOLER_URL não está definida.");
}

// Inicializa o cliente uma única vez
// O export permite que você use a conexão em qualquer arquivo
export const sql = postgres(dbUrl, {
  prepare: false,      // Mantém false (Obrigatório para o Pooler)
  max: 1,              // 🚀 CRÍTICO: Edge Function usa 1 conexão otimizada
  idle_timeout: 10,    // 🚀 CRÍTICO: Fecha conexões ociosas rápido para não engasgar o banco
  connect_timeout: 10  // Derruba rápido se o banco não responder
});