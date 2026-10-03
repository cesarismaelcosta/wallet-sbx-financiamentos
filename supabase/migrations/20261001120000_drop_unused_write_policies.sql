-- =============================================================================
-- [SEGURANÇA] Remove regras de escrita (RLS) que não têm efeito.
--
-- Situação (avaliação de 01/10/2026): várias tabelas têm regras de INSERT,
-- UPDATE e DELETE para o papel `authenticated` (Escrita_*, Delete_*), algumas
-- incompletas (sem USING ou sem WITH CHECK). Nenhuma tem efeito, porque o papel
-- `authenticated` NÃO tem permissão (GRANT) de INSERT/UPDATE/DELETE nessas
-- tabelas — toda gravação passa pelo servidor (service_role), que ignora RLS.
--
-- Risco evitado: se um dia alguém conceder a permissão na tabela, encontraria
-- uma regra pela metade já ativa. Se for preciso gravar pelo navegador no
-- futuro, escreve-se a regra completa naquele momento.
--
-- O que este script faz:
--   * Apaga SOMENTE regras de INSERT, UPDATE e DELETE do schema public que se
--     aplicam a `authenticated` e cuja tabela NÃO dá a `authenticated`
--     nenhuma permissão de INSERT/UPDATE/DELETE.
--   * NÃO mexe em regras de leitura (SELECT) nem nas regras de tipo ALL
--     (ex.: Acesso_Admin_Total), que também servem às consultas.
--   * Se uma tabela tiver permissão de escrita para `authenticated`, as regras
--     dela são mantidas (e aparecem no aviso "mantida").
-- Idempotente: pode ser rodado mais de uma vez.
-- =============================================================================

do $mig$
declare
  r record;
  v_has_write_grant boolean;
begin
  for r in
    select p.schemaname, p.tablename, p.policyname, p.cmd
    from pg_policies p
    where p.schemaname = 'public'
      and p.cmd in ('INSERT', 'UPDATE', 'DELETE')
      and 'authenticated' = any (p.roles)
    order by p.tablename, p.policyname
  loop
    select exists (
      select 1 from information_schema.role_table_grants g
      where g.table_schema = r.schemaname
        and g.table_name = r.tablename
        and g.grantee = 'authenticated'
        and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
    ) into v_has_write_grant;

    if v_has_write_grant then
      raise notice 'mantida (tabela com permissão de escrita): %.% -> %', r.tablename, r.cmd, r.policyname;
    else
      execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
      raise notice 'removida: % (%) em %', r.policyname, r.cmd, r.tablename;
    end if;
  end loop;
end $mig$;

-- Conferência: deve voltar vazio (nenhuma regra de escrita para authenticated
-- em tabela sem permissão de escrita).
select p.tablename, p.policyname, p.cmd
from pg_policies p
where p.schemaname = 'public'
  and p.cmd in ('INSERT', 'UPDATE', 'DELETE')
  and 'authenticated' = any (p.roles)
  and not exists (
    select 1 from information_schema.role_table_grants g
    where g.table_schema = 'public' and g.table_name = p.tablename
      and g.grantee = 'authenticated' and g.privilege_type in ('INSERT', 'UPDATE', 'DELETE')
  );
