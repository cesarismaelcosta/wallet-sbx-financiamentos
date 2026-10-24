-- =============================================================================
-- simulations e simulation_consults: tabela de amortização e última parcela
--
-- Novas colunas, no início do bloco de valores da simulação:
--   amortization_type       text     SAC | PRICE
--   installment_value       numeric  1ª parcela (coluna existente, só muda de posição)
--   last_installment_value  numeric  última parcela
--
-- Em simulation_consults também:
--   is_selected             boolean  condição exibida ao cliente (uma por banco, com as parcelas)
--
-- Ordem final do bloco de valores (nas duas tabelas):
--   amortization_type, installment_value, last_installment_value, requested_value,
--   down_payment_amount, down_payment_percentage, financed_amount, installments, cet_rate
--
-- O Postgres não reposiciona colunas: as duas tabelas são recriadas na ordem nova,
-- com cópia dos dados e de tudo que elas têm (PK, FKs, checks, índices, trigger,
-- RLS, policies, grants, comentários e publications). Policies, grants, comentários
-- e publications são copiados dinamicamente do ambiente em que o script roda.
-- As FKs das tabelas filhas (offers, updates, consents, collateral home/vehicle)
-- são recriadas apontando para a tabela nova (ON DELETE CASCADE, como hoje).
--
-- Backfill: linhas da FlowCredi já gravadas recebem tabela e última parcela a partir
-- de simulation_details (bloco `details`; nas linhas antigas de dev, `flowcredi`).
-- Demais parceiros ficam com null.
--
-- Tudo dentro de um único bloco DO: é uma instrução só, então qualquer erro desfaz
-- o script inteiro (o SQL Editor do Supabase não segura BEGIN/COMMIT entre instruções).
-- Compatível com a financial-gateway atual (os INSERTs usam colunas nomeadas).
-- =============================================================================

do $migration$
declare
  v_acl      jsonb;
  v_pol      jsonb;
  v_comments jsonb;
  v_pub      jsonb;
  r          record;
begin
  -- 0. Travas de segurança ------------------------------------------------------
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'simulations' and column_name = 'amortization_type'
  ) then
    raise exception 'Migration já aplicada: simulations.amortization_type existe.';
  end if;

  -- Views ou materialized views dependentes seriam apagadas pelo drop: aborta.
  if exists (
    select 1
    from pg_depend d
    join pg_rewrite rw on rw.oid = d.objid
    where d.refobjid in ('public.simulations'::regclass, 'public.simulation_consults'::regclass)
      and rw.ev_class not in ('public.simulations'::regclass, 'public.simulation_consults'::regclass)
  ) then
    raise exception 'Existem views dependentes de simulations/simulation_consults. Ajustar o script antes.';
  end if;

  lock table public.simulations, public.simulation_consults in access exclusive mode;

  -- 1. Guarda grants, policies, comentários e publications atuais ---------------
  select coalesce(jsonb_agg(jsonb_build_object('relname', c.relname, 'grantee', a.grantee, 'privilege_type', a.privilege_type)), '[]')
    into v_acl
  from pg_class c
  cross join lateral aclexplode(c.relacl) a
  where c.oid in ('public.simulations'::regclass, 'public.simulation_consults'::regclass)
    and a.grantee <> c.relowner;

  select coalesce(jsonb_agg(to_jsonb(p)), '[]')
    into v_pol
  from (
    select tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public' and tablename in ('simulations', 'simulation_consults')
  ) p;

  select coalesce(jsonb_agg(jsonb_build_object('relname', c.relname, 'attname', a.attname, 'description', d.description)), '[]')
    into v_comments
  from pg_description d
  join pg_class c on c.oid = d.objoid
  left join pg_attribute a on a.attrelid = c.oid and a.attnum = d.objsubid and d.objsubid > 0
  where c.oid in ('public.simulations'::regclass, 'public.simulation_consults'::regclass)
    and d.classoid = 'pg_class'::regclass;

  select coalesce(jsonb_agg(jsonb_build_object('pubname', pubname, 'tablename', tablename)), '[]')
    into v_pub
  from pg_publication_tables
  where schemaname = 'public' and tablename in ('simulations', 'simulation_consults');

  -- 2. Tabelas novas na ordem nova ----------------------------------------------
  create table public.simulations__new (
    id                       uuid not null default gen_random_uuid(),
    visit_id                 uuid not null,
    is_integrated            boolean default false,
    integration_method       text,
    partner_id               bigint,
    product_id               integer,
    entity_id                text,
    entity_type              text,
    document                 text,
    name                     text,
    phone                    text,
    email                    text,
    birth_date               date,
    gender                   text,
    entity_details           jsonb,
    financial_institution_id integer,
    amortization_type        text,
    installment_value        numeric,
    last_installment_value   numeric,
    requested_value          numeric,
    down_payment_amount      numeric,
    down_payment_percentage  numeric,
    financed_amount          numeric,
    installments             integer,
    cet_rate                 numeric,
    simulation_details       jsonb,
    stage_id                 integer,
    status_id                integer,
    result_partner_id        character varying,
    external_operation_id    text,
    raw_payload              jsonb,
    created_at               timestamptz default now(),
    updated_at               timestamptz default now()
  );

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

  -- 3. Cópia dos dados (com backfill da FlowCredi) ------------------------------
  insert into public.simulations__new (
    id, visit_id, is_integrated, integration_method, partner_id, product_id,
    entity_id, entity_type, document, name, phone, email, birth_date, gender, entity_details,
    financial_institution_id, amortization_type, installment_value, last_installment_value,
    requested_value, down_payment_amount, down_payment_percentage, financed_amount, installments, cet_rate,
    simulation_details, stage_id, status_id, result_partner_id, external_operation_id, raw_payload,
    created_at, updated_at
  )
  select
    s.id, s.visit_id, s.is_integrated, s.integration_method, s.partner_id, s.product_id,
    s.entity_id, s.entity_type, s.document, s.name, s.phone, s.email, s.birth_date, s.gender, s.entity_details,
    s.financial_institution_id,
    f.flow->>'tabela',
    s.installment_value,
    nullif(f.flow->>'ultimaParcela', '')::numeric,
    s.requested_value, s.down_payment_amount, s.down_payment_percentage, s.financed_amount, s.installments, s.cet_rate,
    s.simulation_details, s.stage_id, s.status_id, s.result_partner_id, s.external_operation_id, s.raw_payload,
    s.created_at, s.updated_at
  from public.simulations s
  -- simulation_details guarda a consulta principal (insert) ou a resposta inteira (update)
  cross join lateral (
    select coalesce(
      s.simulation_details->'details',
      s.simulation_details->'flowcredi',
      jsonb_path_query_first(s.simulation_details, '$.consults[*] ? (@.is_selected == true).details'),
      jsonb_path_query_first(s.simulation_details, '$.consults[*] ? (@.is_selected == true).flowcredi'),
      s.simulation_details->'consults'->0->'details',
      s.simulation_details->'consults'->0->'flowcredi'
    ) as flow
  ) f;

  insert into public.simulation_consults__new (
    id, simulation_id, financial_institution_id, is_selected, amortization_type, installment_value, last_installment_value,
    requested_value, down_payment_amount, down_payment_percentage, financed_amount, installments, cet_rate,
    external_operation_id, status_id, simulation_details, raw_payload, created_at, updated_at
  )
  select
    c.id, c.simulation_id, c.financial_institution_id,
    -- FlowCredi: exibida = marcada como melhor do banco; demais parceiros: is_selected do json
    case
      when c.simulation_details ? 'bank_best' then true
      when c.simulation_details ? 'details' or c.simulation_details ? 'flowcredi' then false
      else coalesce((c.simulation_details->>'is_selected')::boolean, false)
    end,
    coalesce(c.simulation_details->'details', c.simulation_details->'flowcredi')->>'tabela',
    c.installment_value,
    nullif(coalesce(c.simulation_details->'details', c.simulation_details->'flowcredi')->>'ultimaParcela', '')::numeric,
    c.requested_value, c.down_payment_amount, c.down_payment_percentage, c.financed_amount, c.installments, c.cet_rate,
    c.external_operation_id, c.status_id, c.simulation_details, c.raw_payload, c.created_at, c.updated_at
  from public.simulation_consults c;

  if (select count(*) from public.simulations) <> (select count(*) from public.simulations__new) then
    raise exception 'Contagem divergente em simulations.';
  end if;
  if (select count(*) from public.simulation_consults) <> (select count(*) from public.simulation_consults__new) then
    raise exception 'Contagem divergente em simulation_consults.';
  end if;

  -- 4. Troca das tabelas --------------------------------------------------------
  -- O cascade remove só as FKs das tabelas filhas (os dados delas ficam); recriadas no passo 6.
  drop table public.simulation_consults;
  drop table public.simulations cascade;

  alter table public.simulations__new rename to simulations;
  alter table public.simulation_consults__new rename to simulation_consults;

  -- 5. Constraints, índices e trigger (mesmos nomes de antes) ---------------------
  alter table public.simulations
    add constraint simulations_pkey primary key (id),
    add constraint simulations_visit_id_fkey foreign key (visit_id) references public.visits (id) on delete cascade,
    add constraint simulations_partner_id_fkey foreign key (partner_id) references public.partners (id),
    add constraint simulations_product_id_fkey foreign key (product_id) references public.product_types (id),
    add constraint simulations_financial_institution_id_fkey foreign key (financial_institution_id) references public.financial_institutions (id),
    add constraint simulations_stage_id_fkey foreign key (stage_id) references public.stage_types (id),
    add constraint simulations_status_id_fkey foreign key (status_id) references public.status_types (id),
    add constraint simulations_result_partner_id_fkey foreign key (result_partner_id) references public.result_partner_types (id),
    add constraint simulations_entity_type_check check (entity_type = any (array['F'::text, 'J'::text])),
    add constraint simulations_integration_method_check check (integration_method = any (array['API'::text, 'EMAIL'::text, 'FILE'::text, 'MANUAL'::text]));

  alter table public.simulation_consults
    add constraint simulation_consults_pkey primary key (id),
    add constraint simulation_consults_simulation_id_fkey foreign key (simulation_id) references public.simulations (id) on delete cascade,
    add constraint simulation_consults_financial_institution_id_fkey foreign key (financial_institution_id) references public.financial_institutions (id),
    add constraint simulation_consults_status_id_fkey foreign key (status_id) references public.status_types (id);

  create index idx_simulations_created_at_desc on public.simulations using btree (created_at desc);
  create index idx_simulations_entity_product on public.simulations using btree (entity_id, product_id);
  create index idx_simulations_feed_composite on public.simulations using btree (created_at desc, partner_id, product_id);
  create index idx_simulations_financial_institution_id on public.simulations using btree (financial_institution_id);
  create index idx_simulations_partner_id on public.simulations using btree (partner_id);
  create index idx_simulations_product_id on public.simulations using btree (product_id);
  create index idx_simulations_result_partner_id on public.simulations using btree (result_partner_id);
  create index idx_simulations_stage_id on public.simulations using btree (stage_id);
  create index idx_simulations_status_id on public.simulations using btree (status_id);
  create index idx_simulations_visit_id on public.simulations using btree (visit_id);

  create index idx_simulation_consults_fi_id on public.simulation_consults using btree (financial_institution_id);
  create index idx_simulation_consults_simulation_id on public.simulation_consults using btree (simulation_id);
  create index idx_simulation_consults_status_id on public.simulation_consults using btree (status_id);

  create trigger trg_updated_at_simulations before update on public.simulations
    for each row execute function update_updated_at_column();
  create trigger trg_updated_at_simulation_consults before update on public.simulation_consults
    for each row execute function update_updated_at_column();

  -- 6. FKs das tabelas filhas -----------------------------------------------------
  alter table public.simulation_offers
    add constraint simulation_offers_simulation_id_fkey foreign key (simulation_id) references public.simulations (id) on delete cascade;
  alter table public.simulation_updates
    add constraint simulation_updates_simulation_id_fkey foreign key (simulation_id) references public.simulations (id) on delete cascade;
  alter table public.simulation_consents
    add constraint simulation_consents_simulation_id_fkey foreign key (simulation_id) references public.simulations (id) on delete cascade;
  alter table public.simulation_collateral_home
    add constraint simulation_collateral_home_simulation_id_fkey foreign key (simulation_id) references public.simulations (id) on delete cascade;
  alter table public.simulation_collateral_vehicle
    add constraint simulation_collateral_vehicle_simulation_id_fkey foreign key (simulation_id) references public.simulations (id) on delete cascade;

  -- 7. RLS, grants, policies, comentários e publications (cópia do estado anterior)
  alter table public.simulations enable row level security;
  alter table public.simulation_consults enable row level security;

  -- Remove os grants automáticos (default privileges) das tabelas recém-criadas...
  for r in
    select c.relname, a.grantee
    from pg_class c
    cross join lateral aclexplode(c.relacl) a
    where c.oid in ('public.simulations'::regclass, 'public.simulation_consults'::regclass)
      and a.grantee <> c.relowner
    group by c.relname, a.grantee
  loop
    execute format('revoke all on table public.%I from %s', r.relname,
      case when r.grantee = 0 then 'public' else quote_ident(r.grantee::regrole::text) end);
  end loop;

  -- ...e devolve exatamente os que existiam antes.
  for r in select * from jsonb_to_recordset(v_acl) as x(relname text, grantee oid, privilege_type text) loop
    execute format('grant %s on table public.%I to %s', r.privilege_type, r.relname,
      case when r.grantee = 0 then 'public' else quote_ident(r.grantee::regrole::text) end);
  end loop;

  for r in select * from jsonb_to_recordset(v_pol) as x(tablename text, policyname text, permissive text, roles text[], cmd text, qual text, with_check text) loop
    execute format('create policy %I on public.%I as %s for %s to %s%s%s',
      r.policyname, r.tablename, r.permissive, r.cmd,
      (select string_agg(case when x = 'public' then 'public' else quote_ident(x) end, ', ') from unnest(r.roles) x),
      case when r.qual is not null then ' using (' || r.qual || ')' else '' end,
      case when r.with_check is not null then ' with check (' || r.with_check || ')' else '' end);
  end loop;

  for r in select * from jsonb_to_recordset(v_comments) as x(relname text, attname text, description text) loop
    if r.attname is null then
      execute format('comment on table public.%I is %L', r.relname, r.description);
    else
      execute format('comment on column public.%I.%I is %L', r.relname, r.attname, r.description);
    end if;
  end loop;

  for r in select * from jsonb_to_recordset(v_pub) as x(pubname text, tablename text) loop
    execute format('alter publication %I add table public.%I', r.pubname, r.tablename);
  end loop;

  comment on column public.simulations.amortization_type is 'Tabela de amortização: SAC | PRICE';
  comment on column public.simulations.installment_value is '1ª parcela (no PRICE, a parcela fixa)';
  comment on column public.simulations.last_installment_value is 'Última parcela';
  comment on column public.simulation_consults.is_selected is 'Condição exibida ao cliente (FlowCredi: uma por banco, com as parcelas)';
  comment on column public.simulation_consults.amortization_type is 'Tabela de amortização: SAC | PRICE';
  comment on column public.simulation_consults.installment_value is '1ª parcela (no PRICE, a parcela fixa)';
  comment on column public.simulation_consults.last_installment_value is 'Última parcela';
end
$migration$;

-- =============================================================================
-- Conferência (rodar depois, só leitura)
-- =============================================================================
-- select table_name, ordinal_position, column_name from information_schema.columns
-- where table_schema = 'public' and table_name in ('simulations', 'simulation_consults')
-- order by table_name, ordinal_position;
--
-- select tablename, policyname, cmd, roles from pg_policies
-- where schemaname = 'public' and tablename in ('simulations', 'simulation_consults');
--
-- select c.relname, a.grantee::regrole, a.privilege_type
-- from pg_class c cross join lateral aclexplode(c.relacl) a
-- where c.oid in ('public.simulations'::regclass, 'public.simulation_consults'::regclass);
--
-- select conrelid::regclass, conname from pg_constraint
-- where confrelid = 'public.simulations'::regclass;
