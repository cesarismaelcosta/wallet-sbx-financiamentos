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
 * --    (pgcrypto já vem habilitado por padrão no projeto Supabase — não é
 * --    preciso "garantir" isso rodando gen_random_bytes(0): essa chamada,
 * --    aliás, dá erro ["Length not in range"], porque o pgcrypto exige um
 * --    tamanho > 0. Use gen_random_bytes(24) diretamente, como no passo 2.)
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
 * -- USAGE no schema public -- OBRIGATÓRIO. Sem ele o Postgres não enxerga as
 * -- tabelas pelo nome e responde `relation "visits" does not exist` (e não
 * -- "permission denied"), mesmo com os GRANTs de tabela acima. Foi o que
 * -- aconteceu em homologação em 29/09/2026. Só dá visibilidade do schema --
 * -- não libera nenhuma tabela além das listadas no GRANT acima.
 * GRANT USAGE ON SCHEMA public TO db_edge_worker;
 *
 * -- 3. Guarda a connection string como secret das functions (DB_POOLER_URL).
 * --    Formato (SEMPRE Transaction pooler, porta 6543, usuário com sufixo do
 * --    projeto -- o Supavisor é compartilhado entre projetos da mesma região e
 * --    usa esse sufixo pra rotear a conexão):
 * --
 * --      postgresql://db_edge_worker.<project-ref>:<senha>@<host-do-pooler>:6543/postgres
 * --
 * --    EXEMPLO (projeto de DEV -- ref ldzutiojmcawhwdhojlo, região us-west-1):
 * --
 * --      postgresql://db_edge_worker.ldzutiojmcawhwdhojlo:<senha>@aws-0-us-west-1.pooler.supabase.com:6543/postgres
 * --
 * --    ⚠️ O host e o ref do exemplo SÓ valem para dev. Cada ambiente (dev,
 * --    homologação, produção) é um projeto diferente, com ref próprio e,
 * --    possivelmente, outra região -- logo, outro host. Copiar o exemplo de
 * --    dev para outro ambiente é o mesmo erro que já aconteceu com a URL dos
 * --    crons (homologação chamando o projeto de dev). Sempre pegue host e ref
 * --    no painel do PRÓPRIO projeto (passo 3.1).
 * --
 * -- 3.1 Pelo painel web (sem CLI), no projeto do ambiente que está configurando:
 * --    a) Botão Connect (topo) -> "Connect to your project" -> Direct
 * --       ("Connection string") -> Connection Method: Transaction pooler.
 * --    b) Copie a connection string. Ela vem com o usuário
 * --       `postgres.<project-ref>` -- TROQUE por `db_edge_worker.<project-ref>`.
 * --       Host e porta 6543 ficam como vieram.
 * --    c) NÃO clique em "Reset database password" nesse painel: ele troca a
 * --       senha do `postgres` (usada por outras integrações), não a do
 * --       db_edge_worker. Para (re)definir a senha do db_edge_worker, no SQL
 * --       Editor do mesmo projeto:
 * --
 * --         select encode(gen_random_bytes(24), 'hex') as nova_senha;
 * --         alter role db_edge_worker with password '<nova_senha>';
 * --
 * --       A partir do ALTER ROLE as functions desse projeto não conectam até
 * --       o secret ser atualizado (passo d) -- faça os dois em sequência.
 * --    d) Edge Functions -> Manage secrets -> DB_POOLER_URL (editar, ou Add new
 * --       secret se não existir) -> cole a string do passo b com a senha.
 * --       Vale na próxima execução das functions, sem redeploy.
 * --
 * -- 3.2 Pelo CLI (equivalente ao 3.1, com --project-ref do ambiente certo):
 * --
 * --      supabase secrets set DB_POOLER_URL="postgresql://db_edge_worker.<project-ref>:<senha>@<host-do-pooler>:6543/postgres" --project-ref <project-ref>
 * --
 * -- 3.3 Conferência: faça uma chamada que use o banco (ex.: uma simulação) e,
 * --    logo em seguida, no SQL Editor do projeto:
 * --
 * --      select usename, application_name, state
 * --      from pg_stat_activity
 * --      where usename = 'db_edge_worker';
 * --
 * --    Deve aparecer db_edge_worker com application_name = Supavisor. Vazio
 * --    com tudo parado é normal (idle_timeout fecha as conexões ociosas).
 * --
 * --    E as permissões do passo 2 (as duas colunas têm que vir true):
 * --
 * --      select has_schema_privilege('db_edge_worker', 'public', 'USAGE')         as usage_schema_public,
 * --             has_table_privilege ('db_edge_worker', 'public.visits', 'SELECT') as select_visits;
 *
 * -- Rotação de senha (ex: exposição acidental): passo 3.1 (c) + (d) -- os
 * -- dois lados (ALTER ROLE e secret) precisam ficar sincronizados.
 */

// 🛡️ [SBXW-31 FIX]: versão fixa (era sem versão — resolvia sempre para a
// "latest" do módulo, com aviso `x-deno-warning: Implicitly using latest
// version` no deploy; qualquer alteração a montante entrava em produção sem
// revisão nem sinal, no módulo que abre conexão direta ao banco fora de RLS).
// @deno-types="https://deno.land/x/postgresjs@v3.4.8/mod.js"
import postgres from 'https://deno.land/x/postgresjs@v3.4.8/mod.js';

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
  // [2026-09-29]: reduzido de 5 para 2. O motivo original do 5 (deixar os
  // `Promise.all` de persist-data.ts rodarem em paralelo) não se sustenta: esses
  // Promise.all rodam dentro de `sql.begin(async (t) => ...)`, e uma transação
  // usa UMA conexão só -- as queries com `t` já eram serializadas nela, com
  // max 5 ou max 1. Enquanto isso, 5 conexões por instância x várias instâncias
  // vivas ao mesmo tempo lotava a fila do Supavisor para o db_edge_worker (em
  // dev, uma requisição ficou 77s esperando vaga antes do handler). 2 deixa uma
  // conexão livre para consultas fora da transação sem multiplicar a pressão.
  // Se aparecer "too many connections"/"no available connections" de novo,
  // baixar para 1 é o próximo passo.
  max: 2,
  idle_timeout: 10,    // 🚀 CRÍTICO: Fecha conexões ociosas rápido para não engasgar o banco
  connect_timeout: 10  // Derruba rápido se o banco não responder
});