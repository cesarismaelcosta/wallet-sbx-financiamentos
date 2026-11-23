-- =============================================================================
-- Extensões fora do esquema public (aviso "Extension in Public" do Supabase).
-- - pg_trgm: relocável; só é usada pelos índices GIN de login_history (email e ip_address,
--   para as buscas ILIKE da Auditoria). Os índices continuam valendo após a troca.
-- - pg_net: NÃO é relocável -> remove e instala de novo em extensions. As funções dela
--   continuam no esquema net (net.http_post), então as tarefas do pg_cron
--   (processar-notificacoes-pendentes, resolver-geo-login-history) seguem funcionando.
--   Efeito: perde só respostas HTTP antigas (net._http_response) e pedidos em andamento;
--   e-mails pendentes na notification_outbox saem no minuto seguinte.
--   Se algo depender da pg_net (ex.: webhook do banco), o DROP falha e nada é alterado.
-- Cada parte só roda se a extensão ainda estiver em public (pode rodar nos dois ambientes).
-- Rodar inteiro no SQL Editor (um ambiente por vez). Tudo numa transação.
-- =============================================================================

begin;

create schema if not exists extensions;

do $$
begin
  if exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
             where e.extname = 'pg_trgm' and n.nspname = 'public') then
    execute 'alter extension pg_trgm set schema extensions';
  end if;

  if exists (select 1 from pg_extension e join pg_namespace n on n.oid = e.extnamespace
             where e.extname = 'pg_net' and n.nspname = 'public') then
    execute 'drop extension pg_net';
    execute 'create extension pg_net with schema extensions';
  end if;
end $$;

commit;

-- Conferência (rodar depois):
-- select e.extname, n.nspname from pg_extension e join pg_namespace n on n.oid = e.extnamespace
--  where e.extname in ('pg_trgm', 'pg_net');                 -- as duas em extensions
-- select jobname, status, start_time from cron.job_run_details
--  order by start_time desc limit 5;                         -- tarefas rodando (succeeded)
