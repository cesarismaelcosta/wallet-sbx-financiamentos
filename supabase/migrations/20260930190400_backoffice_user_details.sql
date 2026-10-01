-- =============================================================================
-- [AUDITORIA] Histórico de usuários do backoffice (backoffice_user_details).
-- 1 linha por ação: CREATE | ACTIVATE | DEACTIVATE | ROLE_CHANGE | PERMISSIONS_CHANGE,
-- com retrato {role, is_active, allowed_partners, allowed_products} ANTES e DEPOIS.
-- Quem fez: backoffice_users.updated_by (preenchido pela edge function
-- manage-backoffice-users com o e-mail do admin logado).
-- Segurança igual ao login_history: RLS, policy só admin, sem grant anon/authenticated.
-- Idempotente: pode ser rodado mais de uma vez.
-- =============================================================================

alter table public.backoffice_users add column if not exists updated_by text;

create table if not exists public.backoffice_user_details (
  id                 uuid        primary key default gen_random_uuid(),
  backoffice_user_id uuid        references public.backoffice_users(id) on delete set null,
  target_email       text        not null,
  action             text        not null check (action in ('CREATE','ACTIVATE','DEACTIVATE','ROLE_CHANGE','PERMISSIONS_CHANGE')),
  actor_email        text        not null,
  old_values         jsonb,
  new_values         jsonb       not null,
  created_at         timestamptz not null default now()
);
create index if not exists backoffice_user_details_user_idx on public.backoffice_user_details (backoffice_user_id, created_at desc);

alter table public.backoffice_user_details enable row level security;
drop policy if exists "Acesso_Admin_Total" on public.backoffice_user_details;
create policy "Acesso_Admin_Total" on public.backoffice_user_details
  as permissive for all to authenticated using (check_user_role(array['admin'::text]));
revoke all on public.backoffice_user_details from public, anon, authenticated;
grant all on public.backoffice_user_details to service_role;

create or replace function public.log_backoffice_user_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor text := coalesce(nullif(new.updated_by, ''), auth.email(), 'sistema');
  v_new   jsonb := jsonb_build_object('role', new.role, 'is_active', new.is_active,
                                      'allowed_partners', new.allowed_partners, 'allowed_products', new.allowed_products);
  v_old   jsonb;
begin
  if tg_op = 'INSERT' then
    insert into backoffice_user_details (backoffice_user_id, target_email, action, actor_email, old_values, new_values)
    values (new.id, new.email, 'CREATE', v_actor, null, v_new);
    return new;
  end if;
  v_old := jsonb_build_object('role', old.role, 'is_active', old.is_active,
                              'allowed_partners', old.allowed_partners, 'allowed_products', old.allowed_products);
  if new.is_active is distinct from old.is_active then
    insert into backoffice_user_details (backoffice_user_id, target_email, action, actor_email, old_values, new_values)
    values (new.id, new.email, case when new.is_active then 'ACTIVATE' else 'DEACTIVATE' end, v_actor, v_old, v_new);
  end if;
  if new.role is distinct from old.role then
    insert into backoffice_user_details (backoffice_user_id, target_email, action, actor_email, old_values, new_values)
    values (new.id, new.email, 'ROLE_CHANGE', v_actor, v_old, v_new);
  end if;
  if new.allowed_partners is distinct from old.allowed_partners or new.allowed_products is distinct from old.allowed_products then
    insert into backoffice_user_details (backoffice_user_id, target_email, action, actor_email, old_values, new_values)
    values (new.id, new.email, 'PERMISSIONS_CHANGE', v_actor, v_old, v_new);
  end if;
  return new;
end;
$$;
revoke all on function public.log_backoffice_user_change() from public, anon, authenticated;

drop trigger if exists trg_backoffice_user_details on public.backoffice_users;
create trigger trg_backoffice_user_details after insert or update on public.backoffice_users
  for each row execute function public.log_backoffice_user_change();

create or replace function public.get_backoffice_user_history(p_user_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor record;
begin
  select * into v_actor from public.current_backoffice_actor();
  if v_actor.role is null or v_actor.role <> 'admin' then
    return jsonb_build_object('error', 'forbidden');
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', d.id, 'action', d.action, 'actor_email', d.actor_email,
             'old_values', d.old_values, 'new_values', d.new_values, 'created_at', d.created_at) order by d.created_at desc)
    from backoffice_user_details d where d.backoffice_user_id = p_user_id), '[]'::jsonb);
end;
$$;
revoke all on function public.get_backoffice_user_history(uuid) from public, anon;
grant execute on function public.get_backoffice_user_history(uuid) to authenticated;
