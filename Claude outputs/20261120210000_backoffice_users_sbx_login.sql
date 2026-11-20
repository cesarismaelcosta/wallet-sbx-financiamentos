-- =============================================================================
-- backoffice_users: nova coluna sbx_login (login da Superbid do usuário interno)
-- logo depois de email. Postgres não reordena colunas: a tabela é recriada com os
-- mesmos dados, ids, restrições, índices, RLS, triggers e permissões.
-- sbx_login: mostra o link "Backoffice" no menu do avatar do hub para esse login.
-- Auditoria: log_backoffice_user_change passa a registrar sbx_login (SBX_LOGIN_CHANGE).
-- =============================================================================

-- 1) Tabela nova na ordem desejada (sem triggers ainda: a cópia não gera auditoria)
create table public.backoffice_users_new (
  id uuid not null default gen_random_uuid(),
  name text,
  email text not null,
  sbx_login text,
  role public.backofficerole not null default 'viewer'::public.backofficerole,
  is_active boolean default true,
  allowed_partners jsonb default '[]'::jsonb,
  allowed_products jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  updated_by text
);

-- 2) Cópia dos usuários (mesmos ids)
insert into public.backoffice_users_new
  (id, name, email, role, is_active, allowed_partners, allowed_products, created_at, updated_at, updated_by)
select id, name, email, role, is_active, allowed_partners, allowed_products, created_at, updated_at, updated_by
from public.backoffice_users;

-- 3) Troca das tabelas
alter table public.backoffice_user_details drop constraint backoffice_user_details_backoffice_user_id_fkey;
drop table public.backoffice_users;
alter table public.backoffice_users_new rename to backoffice_users;

-- 4) Restrições e índices (mesmos nomes) + login único sem diferenciar maiúsculas
alter table public.backoffice_users add constraint backoffice_users_pkey primary key (id);
alter table public.backoffice_users add constraint backoffice_users_email_key unique (email);
create index idx_backoffice_users_created_desc on public.backoffice_users using btree (created_at desc);
create index idx_backoffice_users_auth_lookup on public.backoffice_users using btree (email, is_active);
create index idx_backoffice_users_lower_email on public.backoffice_users using btree (lower(email));
create unique index backoffice_users_sbx_login_key on public.backoffice_users using btree (lower(sbx_login)) where sbx_login is not null;

-- 5) RLS e política (idêntica à anterior)
alter table public.backoffice_users enable row level security;
create policy "Leitura_Staff" on public.backoffice_users
  for select to authenticated
  using (check_user_role(array['admin'::text, 'manager'::text, 'viewer'::text]));

-- 6) Permissões (iguais às anteriores)
revoke all on public.backoffice_users from anon, authenticated;
grant select on public.backoffice_users to authenticated;
grant all on public.backoffice_users to service_role;

-- 7) Triggers
create trigger trg_backoffice_user_details after insert or update on public.backoffice_users
  for each row execute function log_backoffice_user_change();
create trigger trg_updated_at_backoffice_users before update on public.backoffice_users
  for each row execute function handle_updated_at();

-- 8) Chave estrangeira da auditoria
alter table public.backoffice_user_details
  add constraint backoffice_user_details_backoffice_user_id_fkey
  foreign key (backoffice_user_id) references public.backoffice_users(id) on delete set null;

-- 9) Auditoria registra o sbx_login (nova ação SBX_LOGIN_CHANGE)
alter table public.backoffice_user_details drop constraint backoffice_user_details_action_check;
alter table public.backoffice_user_details add constraint backoffice_user_details_action_check
  check (action = any (array['CREATE'::text, 'ACTIVATE'::text, 'DEACTIVATE'::text, 'ROLE_CHANGE'::text,
                             'PERMISSIONS_CHANGE'::text, 'SBX_LOGIN_CHANGE'::text]));

create or replace function public.log_backoffice_user_change()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_actor text := coalesce(nullif(new.updated_by, ''), auth.email(), 'sistema');
  v_new   jsonb := jsonb_build_object('role', new.role, 'is_active', new.is_active, 'sbx_login', new.sbx_login,
                                      'allowed_partners', new.allowed_partners, 'allowed_products', new.allowed_products);
  v_old   jsonb;
begin
  if tg_op = 'INSERT' then
    insert into backoffice_user_details (backoffice_user_id, target_email, action, actor_email, old_values, new_values)
    values (new.id, new.email, 'CREATE', v_actor, null, v_new);
    return new;
  end if;
  v_old := jsonb_build_object('role', old.role, 'is_active', old.is_active, 'sbx_login', old.sbx_login,
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
  if new.sbx_login is distinct from old.sbx_login then
    insert into backoffice_user_details (backoffice_user_id, target_email, action, actor_email, old_values, new_values)
    values (new.id, new.email, 'SBX_LOGIN_CHANGE', v_actor, v_old, v_new);
  end if;
  return new;
end;
$function$;
