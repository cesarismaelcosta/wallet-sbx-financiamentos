-- =============================================================================
-- Registro de permissões + escape da busca da Auditoria
--
-- 1) REGISTRO (não muda nada no banco publicado): as migrations do repositório estavam
--    incompletas. A retirada das permissões de anon/authenticated nas tabelas de dados foi
--    aplicada direto no banco, sem migration. Uma auditoria que lia só as migrations concluía
--    que o usuário logado lia clientes de todos os parceiros pelo PostgREST. No banco, as tabelas
--    já estavam bloqueadas (conferido em dev e homologação em 25/11/2026). Este bloco deixa o
--    repositório igual ao banco:
--      - tabelas de dados: nenhum acesso direto de anon/authenticated (só RPCs com escopo e o
--        servidor: service_role / db_edge_worker, não alterados aqui);
--      - 8 tabelas de domínio: só leitura para anon e authenticated;
--      - backoffice_users: só leitura para authenticated (RLS Leitura_Staff).
-- 2) audit_login_stats e get_backoffice_audit: na busca (p_search), % e _ deixam de funcionar
--    como curinga do ILIKE (escapados). Só admin chama as duas; ajuste pedido pela auditoria.
-- Rodar inteiro no SQL Editor (um ambiente por vez). Tudo numa transação.
-- =============================================================================

begin;

-- 1) Tabelas de dados: sem acesso direto do navegador
revoke all on public.allowed_email_domains from anon, authenticated;
revoke all on public.backoffice_access_requests from anon, authenticated;
revoke all on public.backoffice_user_details from anon, authenticated;
revoke all on public.edge_rate_limit_blocks from anon, authenticated;
revoke all on public.edge_rate_limits from anon, authenticated;
revoke all on public.login_history from anon, authenticated;
revoke all on public.login_history_details from anon, authenticated;
revoke all on public.notification_alert_recipients from anon, authenticated;
revoke all on public.notification_outbox from anon, authenticated;
revoke all on public.notifications from anon, authenticated;
revoke all on public.orchestrator_configs from anon, authenticated;
revoke all on public.simulation_collateral_home from anon, authenticated;
revoke all on public.simulation_collateral_vehicle from anon, authenticated;
revoke all on public.simulation_consents from anon, authenticated;
revoke all on public.simulation_consults from anon, authenticated;
revoke all on public.simulation_offers from anon, authenticated;
revoke all on public.simulation_updates from anon, authenticated;
revoke all on public.simulations from anon, authenticated;
revoke all on public.visit_consents from anon, authenticated;
revoke all on public.visit_entities from anon, authenticated;
revoke all on public.visit_offers from anon, authenticated;
revoke all on public.visit_orchestrator_configs from anon, authenticated;
revoke all on public.visit_updates from anon, authenticated;
revoke all on public.visits from anon, authenticated;

-- Tabelas de domínio: só leitura
revoke all on public.category_types from anon, authenticated;
grant select on public.category_types to anon, authenticated;
revoke all on public.financial_institutions from anon, authenticated;
grant select on public.financial_institutions to anon, authenticated;
revoke all on public.partners from anon, authenticated;
grant select on public.partners to anon, authenticated;
revoke all on public.product_types from anon, authenticated;
grant select on public.product_types to anon, authenticated;
revoke all on public.result_partner_types from anon, authenticated;
grant select on public.result_partner_types to anon, authenticated;
revoke all on public.result_types from anon, authenticated;
grant select on public.result_types to anon, authenticated;
revoke all on public.stage_types from anon, authenticated;
grant select on public.stage_types to anon, authenticated;
revoke all on public.status_types from anon, authenticated;
grant select on public.status_types to anon, authenticated;

-- backoffice_users: só leitura para usuário logado (filtrada pela RLS Leitura_Staff)
revoke all on public.backoffice_users from anon, authenticated;
grant select on public.backoffice_users to authenticated;

-- 2) Escape de % e _ na busca da Auditoria (troca feita no texto atual das duas funções)
do $$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select p.oid, p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('audit_login_stats', 'get_backoffice_audit')
  loop
    v_def := pg_get_functiondef(r.oid);
    if v_def ilike '%replace(replace(replace(p_search%' then
      continue; -- já aplicada
    end if;
    v_new := replace(v_def, $q$'%' || p_search || '%'$q$,
      $q$'%' || replace(replace(replace(p_search, '\', '\\'), '%', '\%'), '_', '\_') || '%'$q$);
    if v_new = v_def then
      raise exception 'Trecho esperado não encontrado em %', r.proname;
    end if;
    execute v_new;
  end loop;
end $$;

commit;

-- Conferência (rodar depois):
-- select c.relname,
--        has_table_privilege('anon', c.oid, 'select') anon,
--        has_table_privilege('authenticated', c.oid, 'select') auth_sel,
--        has_table_privilege('authenticated', c.oid, 'insert') auth_ins
-- from pg_class c
-- where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
--   and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('authenticated', c.oid, 'select')
--        or has_table_privilege('authenticated', c.oid, 'insert'))
-- order by 1;                                 -- só as 8 de domínio + backoffice_users
-- select proname from pg_proc where proname in ('audit_login_stats','get_backoffice_audit')
--   and prosrc ilike '%replace(replace(replace(p_search%';   -- 2 linhas
