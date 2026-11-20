-- =============================================================================
-- has_backoffice_access(login): o login da Superbid pertence a usuário ATIVO do backoffice?
-- Usada pelas Edge Functions que emitem o token de sessão (_shared/backoffice-access.ts) para
-- gravar a marca `backofficeAccess` (só mostra o link "Backoffice" no avatar do hub).
-- O papel das Edge Functions (db_edge_worker) NÃO lê backoffice_users: a função devolve só
-- true/false (security definer, search_path fixo) e só db_edge_worker pode executá-la.
-- Rodar inteiro no SQL Editor, um ambiente por vez.
-- =============================================================================

begin;

create or replace function public.has_backoffice_access(p_login text)
 returns boolean
 language sql
 stable
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select exists (
    select 1 from public.backoffice_users
    where p_login is not null
      and length(btrim(p_login)) between 2 and 100
      and lower(sbx_login) = lower(btrim(p_login))
      and is_active = true
  );
$function$;

revoke execute on function public.has_backoffice_access(text) from public, anon, authenticated;
grant execute on function public.has_backoffice_access(text) to db_edge_worker;

commit;

-- Conferência (rodar depois):
-- select has_function_privilege('db_edge_worker', 'public.has_backoffice_access(text)', 'execute') as worker,  -- true
--        has_function_privilege('anon', 'public.has_backoffice_access(text)', 'execute') as anon,                -- false
--        has_function_privilege('authenticated', 'public.has_backoffice_access(text)', 'execute') as auth;       -- false
