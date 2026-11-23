-- =============================================================================
-- Segurança do backoffice (scan do Lovable)
-- 1) Só sessão de login GOOGLE libera o backoffice. Antes bastava o e-mail do token estar em
--    backoffice_users; uma conta e-mail/senha com o e-mail de um admin passaria (se o cadastro
--    por e-mail estivesse aberto sem confirmação). Agora exige no token:
--      amr contém {"method":"oauth"}  (a sessão veio de login OAuth, não de senha/link)
--      app_metadata.providers contém "google"
--    Vale para as funções que liberam acesso e para as políticas (check_user_role).
-- 2) Cadastro repetido em Alertas/Domínios devolvia o erro do banco com o nome da constraint.
--    Agora devolve só 'email_in_use' / 'domain_in_use'.
-- Rodar inteiro no SQL Editor (um ambiente por vez). Tudo numa transação.
-- =============================================================================

begin;

-- Sessão de login Google (usado nas funções abaixo, inline)
--   coalesce((auth.jwt() -> 'amr') @> '[{"method":"oauth"}]'::jsonb, false)
--   and coalesce((auth.jwt() -> 'app_metadata' -> 'providers') ? 'google', false)

create or replace function public.check_user_role(required_roles text[])
 returns boolean language sql stable security definer
 set search_path to 'public', 'pg_temp'
as $$
  select coalesce((auth.jwt() -> 'amr') @> '[{"method":"oauth"}]'::jsonb, false)
     and coalesce((auth.jwt() -> 'app_metadata' -> 'providers') ? 'google', false)
     and exists (
       select 1 from public.backoffice_users
        where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          and is_active = true
          and role::text = any(required_roles)
     );
$$;

create or replace function public.is_current_user_backoffice()
 returns boolean language sql stable security definer
 set search_path to 'public', 'pg_temp'
as $$
  select coalesce((auth.jwt() -> 'amr') @> '[{"method":"oauth"}]'::jsonb, false)
     and coalesce((auth.jwt() -> 'app_metadata' -> 'providers') ? 'google', false)
     and exists (
       select 1 from public.backoffice_users
        where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          and is_active = true
     );
$$;

create or replace function public.is_current_user_backoffice_admin()
 returns boolean language sql stable security definer
 set search_path to 'public', 'pg_temp'
as $$
  select coalesce((auth.jwt() -> 'amr') @> '[{"method":"oauth"}]'::jsonb, false)
     and coalesce((auth.jwt() -> 'app_metadata' -> 'providers') ? 'google', false)
     and exists (
       select 1 from public.backoffice_users bu
        where lower(bu.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
          and bu.is_active = true
          and bu.role = 'admin'
     );
$$;

create or replace function public.current_backoffice_actor()
 returns table(role text, allowed_partners jsonb, allowed_products jsonb)
 language plpgsql stable security definer
 set search_path to 'public', 'pg_temp'
as $$
declare
  v_email text := auth.jwt() ->> 'email';
begin
  if v_email is null
     or not coalesce((auth.jwt() -> 'amr') @> '[{"method":"oauth"}]'::jsonb, false)
     or not coalesce((auth.jwt() -> 'app_metadata' -> 'providers') ? 'google', false) then
    return;
  end if;

  return query
  select b.role::text, b.allowed_partners, b.allowed_products
    from public.backoffice_users b
   where lower(b.email) = lower(v_email)
     and b.is_active = true;
end;
$$;

create or replace function public.get_backoffice_session()
 returns jsonb language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare
  v_caller_email text := auth.jwt() ->> 'email';
  v_user_record record;
begin
  if v_caller_email is null then
    return jsonb_build_object('error', 'token_ausente_ou_invalido');
  end if;

  -- Só sessão de login Google (não senha/link mágico)
  if not coalesce((auth.jwt() -> 'amr') @> '[{"method":"oauth"}]'::jsonb, false)
     or not coalesce((auth.jwt() -> 'app_metadata' -> 'providers') ? 'google', false) then
    return jsonb_build_object('error', 'login_google_obrigatorio');
  end if;

  select * into v_user_record from public.backoffice_users where lower(email) = lower(v_caller_email);

  if not found then
    return jsonb_build_object('error', 'user_does_not_exist');
  elsif v_user_record.is_active = false then
    return jsonb_build_object('error', 'user_inactive');
  end if;

  return jsonb_build_object(
    'email', v_user_record.email,
    'name', v_user_record.name,
    'role', v_user_record.role,
    'is_active', v_user_record.is_active,
    'allowed_partners', v_user_record.allowed_partners,
    'allowed_products', v_user_record.allowed_products
  );
end;
$$;

-- 1b) Funções que leem backoffice_users direto pelo e-mail do token: o e-mail só vale com
--     sessão Google de usuário ativo (public.is_current_user_backoffice(), acima). Troca feita
--     no texto atual de cada função; se o trecho esperado não existir, a migração para (erro).
do $$
declare
  r record;
  v_def text;
  v_new text;
begin
  for r in
    select p.oid, p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('get_backoffice_simulations', 'get_dashboard_contact_count',
                         'get_dashboard_simulations_raw', 'get_dashboard_visits_raw',
                         'simulation_stats', 'visit_stats')
  loop
    v_def := pg_get_functiondef(r.oid);
    if v_def ilike '%is_current_user_backoffice()%' then
      continue; -- já aplicada
    end if;
    v_new := replace(v_def, 'v_caller_email text := auth.jwt() ->> ''email'';',
                     'v_caller_email text := case when public.is_current_user_backoffice() then auth.jwt() ->> ''email'' end;');
    v_new := replace(v_new, 'v_caller_email TEXT := auth.jwt() ->> ''email'';',
                     'v_caller_email TEXT := case when public.is_current_user_backoffice() then auth.jwt() ->> ''email'' end;');
    v_new := replace(v_new, 'lower(coalesce(auth.jwt() ->> ''email'',''''))',
                     'lower(coalesce(case when public.is_current_user_backoffice() then auth.jwt() ->> ''email'' end,''''))');
    if v_new = v_def then
      raise exception 'Trecho esperado não encontrado em %', r.proname;
    end if;
    execute v_new;
  end loop;
end $$;

-- 2) Erros sem nome de constraint
create or replace function public.create_backoffice_alert(p_name text, p_email text)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare
  v_actor record;
begin
  select * into v_actor from public.current_backoffice_actor();
  if v_actor.role is null or v_actor.role != 'admin' then
    raise exception 'forbidden';
  end if;

  begin
    insert into public.notification_alert_recipients (name, email, alert_category, is_active)
    values (p_name, p_email, 'ALL', true);
  exception when unique_violation then
    raise exception 'email_in_use';
  end;
end;
$$;

create or replace function public.create_backoffice_domain(p_domain text)
 returns void language plpgsql security definer
 set search_path to 'public', 'pg_temp'
as $$
declare
  v_actor record;
begin
  select * into v_actor from public.current_backoffice_actor();
  if v_actor.role is null or v_actor.role != 'admin' then
    raise exception 'forbidden';
  end if;

  begin
    insert into public.allowed_email_domains (domain, is_active) values (p_domain, true);
  exception when unique_violation then
    raise exception 'domain_in_use';
  end;
end;
$$;

commit;

-- Conferência (rodar depois, logado no backoffice com Google): as telas abrem normalmente.
-- select proname from pg_proc where pronamespace = 'public'::regnamespace
--  and proname in ('check_user_role','is_current_user_backoffice','is_current_user_backoffice_admin',
--                  'current_backoffice_actor','get_backoffice_session')
--  and prosrc ilike '%method":"oauth%';                           -- 5 linhas
-- select proname from pg_proc where pronamespace = 'public'::regnamespace
--  and proname <> 'is_current_user_backoffice' and prosrc ilike '%is_current_user_backoffice()%';  -- inclui as 6 de listagem/painel
