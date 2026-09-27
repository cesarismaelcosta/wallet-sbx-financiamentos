-- =============================================================================
-- Rate Limiting (Edge Functions) -- log de bloqueios (edge_rate_limit_blocks)
-- =============================================================================
-- Rodar UMA VEZ no SQL Editor do projeto -- em produção e em homologação,
-- pra manter os dois ambientes em sincronia. Pressupõe que a migração
-- original do rate limiting (tabela `edge_rate_limits` + função
-- `check_rate_limit` + grants + cron `edge_rate_limits_cleanup`) já foi
-- aplicada antes desta.
--
-- O que esta migração faz:
--   1. Cria `edge_rate_limit_blocks`: só recebe uma linha quando um balde
--      (função, IP) REALMENTE estoura o limite -- nunca 1 linha por
--      requisição permitida. 1 linha por (bucket, janela estourada), com um
--      contador de quantas vezes aquele balde bateu 429 naquela janela.
--   2. Substitui `check_rate_limit` por uma versão que, ao bloquear, grava
--      nessa tabela na mesma chamada (sem round-trip extra, sem client
--      Supabase novo em lugar nenhum -- roda dentro do mesmo pool isolado
--      que o rate limiting já usa).
--   3. Estende o job de limpeza diário (`edge_rate_limits_cleanup`, já
--      existente) para também apagar linhas de `edge_rate_limit_blocks` com
--      mais de 90 dias (retenção maior de propósito -- essa tabela é log de
--      auditoria, não contador operacional).
-- =============================================================================

create table if not exists public.edge_rate_limit_blocks (
  bucket_key text not null,
  window_start timestamptz not null,
  blocked_count integer not null default 1,
  max_requests integer not null,
  window_seconds integer not null,
  last_blocked_at timestamptz not null default now(),
  primary key (bucket_key, window_start)
);

-- RLS habilitado sem nenhuma policy: bloqueia por padrão qualquer acesso via
-- PostgREST (anon/authenticated). O db_edge_worker já tem BYPASSRLS.
alter table public.edge_rate_limit_blocks enable row level security;

create or replace function public.check_rate_limit(
  p_bucket_key text,
  p_max_requests integer,
  p_window_seconds integer
) returns boolean
language plpgsql
as $$
declare
  v_count integer;
  v_window_start timestamptz;
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
  returning request_count, window_start into v_count, v_window_start;

  if v_count > p_max_requests then
    -- Só chega aqui quando estoura -- "somente o que estourar jogamos lá".
    insert into public.edge_rate_limit_blocks (
      bucket_key, window_start, blocked_count, max_requests, window_seconds, last_blocked_at
    )
    values (p_bucket_key, v_window_start, 1, p_max_requests, p_window_seconds, now())
    on conflict (bucket_key, window_start) do update set
      blocked_count = public.edge_rate_limit_blocks.blocked_count + 1,
      last_blocked_at = now();

    return false;
  end if;

  return true;
end;
$$;

-- Só o necessário para o db_edge_worker -- nunca ALL PRIVILEGES.
grant select, insert, update on public.edge_rate_limit_blocks to db_edge_worker;
-- (grant sobre edge_rate_limits e execute sobre check_rate_limit já existem
-- da migração original -- não precisam ser refeitos.)

-- Job de limpeza -- MESMO jobname da migração original, agora limpando as
-- duas tabelas. cron.schedule com um jobname que já existe SUBSTITUI o job
-- antigo (seguro rodar de novo, inclusive ao replicar em homologação).
select cron.schedule(
  'edge_rate_limits_cleanup',
  '0 3 * * *', -- todo dia às 03:00 UTC
  $$
    delete from public.edge_rate_limits where window_start < now() - interval '1 day';
    delete from public.edge_rate_limit_blocks where window_start < now() - interval '90 days';
  $$
);
