// @deno-types="https://deno.land/x/postgresjs/mod.js"
import postgres from "https://deno.land/x/postgresjs/mod.js";

// Lê a URL do banco das variáveis de ambiente do projeto
// const dbUrl = Deno.env.get("SUPABASE_DB_URL");
const dbPoolerUrl = Deno.env.get("DB_POOLER_URL");

if (!dbPoolerUrl) {
  throw new Error("Erro de Configuração: A variável DB_POOLER_URL não está definida.");
}

// 🔥 INCLUA ESTA LINHA: Ela vai imprimir qual é o usuário que a URL está realmente montando (sem vazar a senha)
console.log("⚠️ DEBUG DA URL: O usuário lido da variável é ->", dbPoolerUrl.split(':')[1].replace(/\/\/|@.*/g, '').split(':')[0]);

// Inicializa o cliente uma única vez
// O export permite que você use a conexão em qualquer arquivo
export const sql = postgres(dbPoolerUrl, {
  user: "postgres.ldzutiojmcawhwdhojlo", // 🔥 OVERRIDE ABSOLUTO: Ignora o que o parser leu e força o usuário correto
  prepare: false,
  prepare: false, // Mantém false (Obrigatório para o Pooler)
  ssl: "require", // <-- Obrigatório para o pooler
  max: 1, // 🚀 CRÍTICO: Edge Function usa 1 conexão otimizada
  idle_timeout: 10, // 🚀 CRÍTICO: Fecha conexões ociosas rápido para não engasgar o banco
  connect_timeout: 10, // Derruba rápido se o banco não responder
});
