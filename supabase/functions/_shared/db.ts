/**
 * SETUP DE INFRAESTRUTURA (rodar uma vez no SQL Editor do projeto, e uma
 * vez via CLI para o secret da function):
 *
 * -- 1. Cria o role dedicado à conexão via Transaction Pooler (Supavisor).
 * --    Um role NOVO (não `postgres`) evita o bug de cache de credencial do
 * --    Supavisor que causou o incidente de 16/09 — ver comentário abaixo.
 * --    Troque <senha-gerada-aleatoriamente> por um valor forte e aleatório
 * --    (ex: `openssl rand -hex 24`, ou gerado no próprio SQL Editor com
 * --    `encode(gen_random_bytes(24), 'hex')`) — NUNCA a senha real deve
 * --    ficar neste arquivo nem em nenhum arquivo versionado.
 * SELECT gen_random_bytes(0); -- garante pgcrypto carregado, se ainda não estiver
 *
 * CREATE ROLE db_edge_worker WITH LOGIN PASSWORD '<senha-gerada-aleatoriamente>' BYPASSRLS;
 *
 * -- 2. Concede só o necessário — SELECT/INSERT/UPDATE nas tabelas que este
 * --    client realmente usa (persist-data.ts, simulation-handler.ts,
 * --    hydrate-data.ts, fandi-service.ts). Nunca `ALL PRIVILEGES`/
 * --    `ALL TABLES IN SCHEMA public` — isso daria acesso a tabelas sem
 * --    nenhuma relação com este client (ex: login_history, backoffice_users).
 * GRANT SELECT, INSERT, UPDATE
 * ON simulations, simulation_updates, simulation_offers, simulation_consults,
 *    simulation_consents, visits, visit_updates, visit_offers,
 *    visit_orchestrator_configs, visit_entities, visit_consents,
 *    result_partner_types, notification_outbox
 * TO db_edge_worker;
 *
 * -- Só USAGE (não ALL) — suficiente para nextval()/currval() em colunas
 * -- com sequence. Inofensivo nas tabelas que usam UUID em vez de serial.
 * GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO db_edge_worker;
 *
 * -- 3. Guarda a connection string como secret da function (nunca em .env
 * --    versionado). Note o usuário no formato `db_edge_worker.<project-ref>`
 * --    — o Supavisor exige esse sufixo pra rotear a conexão corretamente,
 * --    já que o pooler é compartilhado entre vários projetos da mesma
 * --    região (aqui: us-west-1).
 * supabase secrets set DB_POOLER_URL="postgresql://db_edge_worker.ldzutiojmcawhwdhojlo:<senha-gerada-aleatoriamente>@aws-0-us-west-1.pooler.supabase.com:6543/postgres" --project-ref ldzutiojmcawhwdhojlo
 *
 * -- Se um dia precisar rotacionar a senha deste role (ex: exposição
 * -- acidental), troque com `ALTER ROLE db_edge_worker WITH PASSWORD
 * -- '<nova-senha>';` e atualize o secret da function (passo 3) com o
 * -- mesmo valor novo — os dois lados precisam ficar sincronizados.
 */

// @deno-types="https://deno.land/x/postgresjs/mod.js"
import postgres from 'https://deno.land/x/postgresjs/mod.js';

// 🛡️ [FIX - 2026-09-17]: Voltamos pro Transaction Pooler (Supavisor) — mas
// não como `postgres`. O incidente de 16/09 ("password authentication
// failed for user postgres") batia com um bug conhecido de cache de
// credencial do Supavisor específico daquele usuário (ver commit anterior
// deste arquivo para o histórico completo da investigação). O workaround
// que resolveu: conectar com um role NOVO e dedicado, que o Supavisor nunca
// tinha em cache — `db_edge_worker`.
//
// Esse role foi criado com:
//   - GRANT explícito de SELECT/INSERT/UPDATE só nas ~13 tabelas que este
//     client realmente usa (visits/visit_updates/visit_offers/etc + as de
//     simulation) — nunca `ALL PRIVILEGES`/`ALL TABLES`.
//   - BYPASSRLS — confirmado NECESSÁRIO (não just-in-case): essas tabelas
//     têm RLS habilitado com políticas escopadas pra role `authenticated`
//     via JWT (`check_user_role(...)`), contexto que uma conexão Postgres
//     crua via postgres.js nunca tem. Sem BYPASSRLS, toda query seria
//     bloqueada por RLS antes mesmo de chegar no GRANT.
// A senha desse role vive só como secret da function (`DB_POOLER_URL`),
// nunca em código versionado.
const dbUrl = Deno.env.get('DB_POOLER_URL');

if (!dbUrl) {
  throw new Error("Erro de Configuração: A variável DB_POOLER_URL não está definida.");
}

// Inicializa o cliente uma única vez
// O export permite que você use a conexão em qualquer arquivo
export const sql = postgres(dbUrl, {
  prepare: false,      // Obrigatório para o Transaction Pooler (Supavisor)
  ssl: 'require',      // Obrigatório para o pooler
  // 🚧 [REVISITAR - 2026-09-17]: mantive `max: 5` (decisão de 2026-09-15,
  // motivo abaixo) em vez do `max: 1` — são dois objetivos que competem:
  //   - `max: 5` evita que os `Promise.all` de persist-data.ts
  //     (insertSimulationData/updateSimulationData) serializem na mesma
  //     conexão em vez de rodar em paralelo de verdade (motivo original do
  //     aumento de 1 pra 5, em 2026-09-15).
  //   - `max: 1` é o valor comumente recomendado pra Edge Function +
  //     Transaction Pooler, porque cada instância de function que sobe
  //     concorrentemente abre seu próprio pool — com `max: 5` e muitas
  //     instâncias simultâneas, dá pra esgotar o limite de conexões do
  //     Supavisor pro projeto mais rápido do que na Direct Connection.
  // Não decidi isso sozinho — se aparecer erro de "too many connections"/
  // "no available connections" no Supavisor depois do deploy, este é o
  // primeiro lugar a revisar, reduzindo esse número.
  max: 5,
  idle_timeout: 10,    // 🚀 CRÍTICO: Fecha conexões ociosas rápido para não engasgar o banco
  connect_timeout: 10  // Derruba rápido se o banco não responder
});