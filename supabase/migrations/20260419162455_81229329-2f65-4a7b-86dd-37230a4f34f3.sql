-- 1) Enum de papéis
do $$ begin
  if not exists (select 1 from pg_type where typname = 'backofficerole') then
    create type public.backofficerole as enum ('admin', 'manager', 'viewer');
  end if;
end $$;

-- 2) Função de timestamp (reutilizável)
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updatedat = now();
  return new;
end;
$$;

-- 3) Tabela backofficeusers
create table if not exists public.backofficeusers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null unique,
  role public.backofficerole not null default 'viewer',
  isactive boolean not null default true,
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now()
);

create trigger backofficeusers_set_updatedat
  before update on public.backofficeusers
  for each row execute function public.update_updated_at_column();

alter table public.backofficeusers enable row level security;

drop policy if exists "backofficeusers self read" on public.backofficeusers;
create policy "backofficeusers self read"
  on public.backofficeusers for select
  to authenticated
  using (lower(email) = lower((auth.jwt() ->> 'email')));

-- 4) RPC anti-enumeração: verifica e-mail autorizado
create or replace function public.is_email_authorized(_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.backofficeusers
    where lower(email) = lower(_email)
      and isactive = true
  );
$$;

revoke all on function public.is_email_authorized(text) from public;
grant execute on function public.is_email_authorized(text) to anon, authenticated;

-- 5) Helper: usuário autenticado é backoffice ativo?
create or replace function public.is_current_user_backoffice()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.backofficeusers
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and isactive = true
  );
$$;

grant execute on function public.is_current_user_backoffice() to authenticated;

-- 6) Tabela entity (proponentes)
create table if not exists public.entity (
  identity text primary key,
  entitydocument text not null,
  entitytype text,
  fullname text not null,
  email text,
  phonenumber text,
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now()
);

create trigger entity_set_updatedat
  before update on public.entity
  for each row execute function public.update_updated_at_column();

alter table public.entity enable row level security;

create policy "entity backoffice read"
  on public.entity for select
  to authenticated
  using (public.is_current_user_backoffice());

-- 7) Tabela simulation
create table if not exists public.simulation (
  idsimulation text primary key,
  identity text references public.entity(identity) on delete set null,
  idroute integer,
  status text,
  stage text,
  idevent text,
  eventdescription text,
  idoffer text,
  offerdescription text,
  financedamount numeric,
  downpaymentamount numeric,
  downpaymentpercentage numeric,
  installmentscount integer,
  installmentvalue numeric,
  cetrate numeric,
  createdat timestamptz not null default now(),
  updatedat timestamptz not null default now()
);

create trigger simulation_set_updatedat
  before update on public.simulation
  for each row execute function public.update_updated_at_column();

create index if not exists simulation_identity_idx on public.simulation(identity);

alter table public.simulation enable row level security;

create policy "simulation backoffice read"
  on public.simulation for select
  to authenticated
  using (public.is_current_user_backoffice());

-- 8) Cadastra você como admin
insert into public.backofficeusers (name, email, role, isactive)
values ('Cesar Costa', 'cesarismaelcosta@gmail.com', 'admin', true)
on conflict (email) do update
  set name = excluded.name,
      role = 'admin',
      isactive = true,
      updatedat = now();