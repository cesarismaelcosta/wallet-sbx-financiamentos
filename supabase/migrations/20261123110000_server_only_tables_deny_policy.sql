-- =============================================================================
-- Tabelas "só servidor": política explícita negando acesso do navegador
-- RLS já ligado e sem política = navegador já não lia nem gravava; o Supabase
-- avisava "RLS Enabled No Policy". A política restritiva deixa a intenção escrita
-- no banco e tira o aviso. Não muda nada para Edge Functions (service_role e
-- db_edge_worker ignoram RLS).
-- Rodar inteiro no SQL Editor (um ambiente por vez). Tudo numa transação.
-- =============================================================================

begin;

create policy "Sem_Acesso_Direto" on public.backoffice_access_requests
  as restrictive for all to anon, authenticated using (false) with check (false);

create policy "Sem_Acesso_Direto" on public.edge_rate_limits
  as restrictive for all to anon, authenticated using (false) with check (false);

create policy "Sem_Acesso_Direto" on public.edge_rate_limit_blocks
  as restrictive for all to anon, authenticated using (false) with check (false);

commit;

-- Conferência (rodar depois):
-- select tablename, policyname, permissive, roles, cmd from pg_policies
--  where policyname = 'Sem_Acesso_Direto';      -- 3 linhas, permissive = RESTRICTIVE
