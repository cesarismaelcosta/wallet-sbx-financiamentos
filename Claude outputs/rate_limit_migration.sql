-- =============================================================================
-- Rate Limiting (Edge Functions) -- tabela + function
-- =============================================================================
-- Rodar no SQL Editor do projeto -- em PRODUÇÃO e em HOMOLOGAÇÃO, pra manter
-- os dois ambientes em sincronia (mesmo padrão do setup do db_edge_worker).
--
-- Reaproveita o role `db_edge_worker` já existente (criado no setup do
-- DB_POOLER_URL) -- não cria nenhum role novo, nenhum secret novo.
--
-- Design: 1 linha por par (função, IP), sobrescrita a cada janela de tempo,
-- não 1 linha por requisição -- o tamanho da tabela cresce com o número de
-- pares distintos, não com o volume de tráfego.
-- =============================================================================

create table if not exists public.edge_rate_limits (
  bucket_key text primary key,
  window_start timestamptz not null default now(),
  request_count integer not null default 1
);

-- RLS habilitado sem nenhuma policy: bloqueia por padrão qualquer acesso via
-- PostgREST (anon/authenticated), mesmo que alguém conceda grant por engano
-- no futuro. O db_edge_worker já tem BYPASSRLS (ver setup original), então
-- não é afetado por isso.
alter table public.edge_rate_limits enable row level security;

create or replace function public.check_rate_limit(
  p_bucket_key text,
  p_max_requests integer,
  p_window_seconds integer
) returns boolean
language plpgsql
as $$
declare
  v_count integer;
begin
  insert into public.edge_rate_limits (bucket_key, window_start, request_count)
  values (p_bucket_key, now(), 1)
  on conflict (bucket_key) do update set
    request_count = case
      when public.edge_rate_limits.window_start <= now() - (p_window_seconds || ' seconds')::interval
        then 1
      else public.edge_rate_limits.request_count + 1
    end,
    window_start = case
      when public.edge_rate_limits.window_start <= now() - (p_window_seconds || ' seconds')::interval
        then now()
      else public.edge_rate_limits.window_start
    end
  returning request_count into v_count;

  return v_count <= p_max_requests;
end;
$$;

-- Só o necessário para o db_edge_worker -- nunca ALL PRIVILEGES.
grant select, insert, update on public.edge_rate_limits to db_edge_worker;
grant execute on function public.check_rate_limit(text, integer, integer) to db_edge_worker;

-- =============================================================================
-- Limpeza automática (pg_cron)
-- =============================================================================
-- `pg_cron` já está habilitado neste projeto (é o mesmo mecanismo que já
-- roda o job de geo do login_history, via a function `log-access`) --
-- reaproveitado aqui, sem extensão nova.
--
-- Roda 1x por dia e apaga linhas cuja janela já expirou há mais de 1 dia --
-- bem além dos 60s reais de janela hoje, só como margem de segurança generosa
-- (evita apagar uma linha "em uso" por qualquer imprecisão de horário).
--
-- cron.schedule com um jobname que já existe SUBSTITUI o job antigo (seguro
-- rodar esse bloco de novo, ex: ao replicar em homologação).
select cron.schedule(
  'edge_rate_limits_cleanup',
  '0 3 * * *', -- todo dia às 03:00 UTC
  $$ delete from public.edge_rate_limits where window_start < now() - interval '1 day'; $$
);
