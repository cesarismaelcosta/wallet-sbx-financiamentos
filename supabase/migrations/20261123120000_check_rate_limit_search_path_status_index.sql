-- =============================================================================
-- Avisos do Supabase:
-- 1) check_rate_limit sem caminho de busca fixo (regra do AGENTS.md). A função já usa
--    nomes completos (public.edge_rate_limits / public.edge_rate_limit_blocks); fixar o
--    search_path não muda o que ela faz.
-- 2) status_types.stage_id (FK para stage_types) sem índice. Tabela de domínio pequena:
--    impacto quase nulo, só tira o aviso de desempenho.
-- Rodar inteiro no SQL Editor (um ambiente por vez). Tudo numa transação.
-- =============================================================================

begin;

alter function public.check_rate_limit(text, integer, integer) set search_path = public, pg_temp;

create index if not exists idx_status_types_stage_id on public.status_types using btree (stage_id);

commit;

-- Conferência (rodar depois):
-- select array_to_string(proconfig, ',') from pg_proc
--  where oid = 'public.check_rate_limit(text,integer,integer)'::regprocedure;   -- search_path=public, pg_temp
-- select indexname from pg_indexes where indexname = 'idx_status_types_stage_id'; -- 1 linha
