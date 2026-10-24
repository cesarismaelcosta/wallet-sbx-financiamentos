-- =============================================================================
-- SOMENTE DEV — simulation_consults.is_selected (depois da coluna financial_institution_id)
--
-- Dev já rodou a versão anterior da migration 20261020120000 (sem is_selected).
-- Homol NÃO roda este arquivo: lá a migration 20261020120000 já cria a coluna.
--
-- Recria só simulation_consults, em um único bloco DO (qualquer erro desfaz tudo).
-- Backfill: FlowCredi → true nas linhas com bank_best (condição exibida), false nas demais;
-- outros parceiros → is_selected gravado no json.
-- =============================================================================

do $migration$
declare
  v_acl      jsonb;
  v_pol      jsonb;
  v_comments jsonb;
  v_pub      jsonb;
  r          record;
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'simulation_consults' and column_name = 'is_selected'
  ) then
    raise exception 'Já aplicado: simulation_consults.is_selected existe.';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'simulation_consults' and column_name = 'amortization_type'
  ) then
    raise exception 'Rode antes a migration 20261020120000.';
  end if;
  if exists (
    select 1 from pg_depend d join pg_rewrite rw on rw.oid = d.objid
    where d.refobjid = 'public.simulation_consults'::regclass and rw.ev_class <> 'public.simulation_consults'::regclass
  ) then
    raise exception 'Existem views dependentes de simulation_consults.';
  end if;

  lock table public.simulation_consults in access exclusive mode;

  select coalesce(jsonb_agg(jsonb_build_object('grantee', a.grantee, 'privilege_type', a.privilege_type)), '[]') into v_acl
  from pg_class c cross join lateral aclexplode(c.relacl) a
  where c.oid = 'public.simulation_consults'::regclass and a.grantee <> c.relowner;

  select coalesce(jsonb_agg(to_jsonb(p)), '[]') into v_pol
  from (select policyname, permissive, roles, cmd, qual, with_check from pg_policies
        where schemaname = 'public' and tablename = 'simulation_consults') p;

  select coalesce(jsonb_agg(jsonb_build_object('attname', a.attname, 'description', d.description)), '[]') into v_comments
  from pg_description d
  join pg_class c on c.oid = d.objoid
  left join pg_attribute a on a.attrelid = c.oid and a.attnum = d.objsubid and d.objsubid > 0
  where c.oid = 'public.simulation_consults'::regclass and d.classoid = 'pg_class'::regclass;

  select coalesce(jsonb_agg(pubname), '[]') into v_pub
  from pg_publication_tables where schemaname = 'public' and tablename = 'simulation_consults';

  create table public.simulation_consults__new (
    id                       uuid not null default gen_random_uuid(),
    simulation_id            uuid not null,
    financial_institution_id integer,
    is_selected              boolean default false,
    amortization_type        text,
    installment_value        numeric,
    last_installment_value   numeric,
    requested_value          numeric,
    down_payment_amount      numeric,
    down_payment_percentage  numeric,
    financed_amount          numeric,
    installments             integer,
    cet_rate                 numeric,
    external_operation_id    text,
    status_id                integer,
    simulation_details       jsonb,
    raw_payload              jsonb,
    created_at               timestamptz default now(),
    updated_at               timestamptz default now()
  );

  insert into public.simulation_consults__new (
    id, simulation_id, financial_institution_id, is_selected, amortization_type, installment_value, last_installment_value,
    requested_value, down_payment_amount, down_payment_percentage, financed_amount, installments, cet_rate,
    external_operation_id, status_id, simulation_details, raw_payload, created_at, updated_at
  )
  select
    c.id, c.simulation_id, c.financial_institution_id,
    case
      when c.simulation_details ? 'bank_best' then true
      when c.simulation_details ? 'details' or c.simulation_details ? 'flowcredi' then false
      else coalesce((c.simulation_details->>'is_selected')::boolean, false)
    end,
    c.amortization_type, c.installment_value, c.last_installment_value,
    c.requested_value, c.down_payment_amount, c.down_payment_percentage, c.financed_amount, c.installments, c.cet_rate,
    c.external_operation_id, c.status_id, c.simulation_details, c.raw_payload, c.created_at, c.updated_at
  from public.simulation_consults c;

  if (select count(*) from public.simulation_consults) <> (select count(*) from public.simulation_consults__new) then
    raise exception 'Contagem divergente em simulation_consults.';
  end if;

  drop table public.simulation_consults;
  alter table public.simulation_consults__new rename to simulation_consults;

  alter table public.simulation_consults
    add constraint simulation_consults_pkey primary key (id),
    add constraint simulation_consults_simulation_id_fkey foreign key (simulation_id) references public.simulations (id) on delete cascade,
    add constraint simulation_consults_financial_institution_id_fkey foreign key (financial_institution_id) references public.financial_institutions (id),
    add constraint simulation_consults_status_id_fkey foreign key (status_id) references public.status_types (id);

  create index idx_simulation_consults_fi_id on public.simulation_consults using btree (financial_institution_id);
  create index idx_simulation_consults_simulation_id on public.simulation_consults using btree (simulation_id);
  create index idx_simulation_consults_status_id on public.simulation_consults using btree (status_id);

  create trigger trg_updated_at_simulation_consults before update on public.simulation_consults
    for each row execute function update_updated_at_column();

  alter table public.simulation_consults enable row level security;

  for r in
    select a.grantee from pg_class c cross join lateral aclexplode(c.relacl) a
    where c.oid = 'public.simulation_consults'::regclass and a.grantee <> c.relowner
    group by a.grantee
  loop
    execute format('revoke all on table public.simulation_consults from %s',
      case when r.grantee = 0 then 'public' else quote_ident(r.grantee::regrole::text) end);
  end loop;

  for r in select * from jsonb_to_recordset(v_acl) as x(grantee oid, privilege_type text) loop
    execute format('grant %s on table public.simulation_consults to %s', r.privilege_type,
      case when r.grantee = 0 then 'public' else quote_ident(r.grantee::regrole::text) end);
  end loop;

  for r in select * from jsonb_to_recordset(v_pol) as x(policyname text, permissive text, roles text[], cmd text, qual text, with_check text) loop
    execute format('create policy %I on public.simulation_consults as %s for %s to %s%s%s',
      r.policyname, r.permissive, r.cmd,
      (select string_agg(case when x = 'public' then 'public' else quote_ident(x) end, ', ') from unnest(r.roles) x),
      case when r.qual is not null then ' using (' || r.qual || ')' else '' end,
      case when r.with_check is not null then ' with check (' || r.with_check || ')' else '' end);
  end loop;

  for r in select * from jsonb_to_recordset(v_comments) as x(attname text, description text) loop
    if r.attname is null then
      execute format('comment on table public.simulation_consults is %L', r.description);
    else
      execute format('comment on column public.simulation_consults.%I is %L', r.attname, r.description);
    end if;
  end loop;

  for r in select value #>> '{}' as pubname from jsonb_array_elements(v_pub) loop
    execute format('alter publication %I add table public.simulation_consults', r.pubname);
  end loop;

  comment on column public.simulation_consults.is_selected is 'Condição exibida ao cliente (FlowCredi: uma por banco, com as parcelas)';
end
$migration$;
