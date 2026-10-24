-- =============================================================================
-- simulation_collateral_vehicle e simulation_collateral_home: recriadas
--
-- As duas tabelas existiam desde o baseline, mas nada gravava nelas (0 linhas).
-- Passam a ser gravadas pela financial-gateway (persist-data.ts) nas jornadas
-- FlowCredi de Car Equity (veículo) e Home Equity (imóvel).
--
-- Recriadas (drop + create) com as colunas na ordem certa e tudo que tinham:
-- PK, FK para simulations (ON DELETE CASCADE), índice por simulation_id, trigger
-- de updated_at, RLS e policy Leitura_Staff. Grants: service_role (como hoje) e
-- db_edge_worker (INSERT, SELECT, UPDATE, mesmo padrão de simulation_consults).
--
-- Valores gravados como a FlowCredi recebe (ex.: real_estate_type "Apartamento").
-- kinship_degree: SELF (veículo no nome do cliente) ou OTHERS.
-- Só os campos que as jornadas preenchem, mais fipe_code/fipe_value (reservados para
-- quando a FIPE for usada; o valor informado pelo cliente vai em declared_value).
-- Saíram os nunca usados: has_deed, address, number, complement, neighborhood,
-- postal_code, country e owners.
--
-- Trava: aborta se alguma das tabelas tiver linhas.
-- Tudo dentro de um único bloco DO (o SQL Editor do Supabase não segura BEGIN/COMMIT).
-- =============================================================================

do $migration$
begin
  if exists (select 1 from public.simulation_collateral_vehicle)
     or exists (select 1 from public.simulation_collateral_home) then
    raise exception 'As tabelas de garantia têm linhas: ajustar o script para copiar os dados antes.';
  end if;

  drop table public.simulation_collateral_vehicle;
  drop table public.simulation_collateral_home;

  -- Veículo ------------------------------------------------------------------
  create table public.simulation_collateral_vehicle (
    id                uuid primary key default gen_random_uuid(),
    simulation_id     uuid not null references public.simulations (id) on delete cascade,
    license_plate     text,
    licensing_state   text,                         -- UF de licenciamento
    brand             text,
    model             text,
    manufacture_year  integer,
    model_year        integer,
    doors             integer,
    fipe_code         text,
    fipe_value        numeric,                      -- só se vier da FIPE
    declared_value    numeric,                      -- valor informado pelo cliente
    is_debt_free      boolean,
    debt_amount       numeric default 0,            -- saldo devedor
    kinship_degree    text,                         -- SELF | OTHERS
    collateral_details jsonb default '{}'::jsonb,
    created_at        timestamptz default now(),
    updated_at        timestamptz default now()
  );
  create index idx_simulation_collateral_vehicle_sim_id on public.simulation_collateral_vehicle (simulation_id);
  create trigger trg_updated_at_simulation_collateral_vehicle
    before update on public.simulation_collateral_vehicle
    for each row execute function update_updated_at_column();
  alter table public.simulation_collateral_vehicle enable row level security;
  create policy "Leitura_Staff" on public.simulation_collateral_vehicle
    for select to authenticated using (check_user_role(array['admin'::text, 'manager'::text, 'viewer'::text]));
  revoke all on public.simulation_collateral_vehicle from anon, authenticated;
  grant all on public.simulation_collateral_vehicle to service_role;
  grant insert, select, update on public.simulation_collateral_vehicle to db_edge_worker;

  -- Imóvel -------------------------------------------------------------------
  create table public.simulation_collateral_home (
    id                uuid primary key default gen_random_uuid(),
    simulation_id     uuid not null references public.simulations (id) on delete cascade,
    real_estate_type  text,
    estimated_value   numeric,                      -- valor informado pelo cliente
    is_debt_free      boolean,
    debt_amount       numeric default 0,            -- saldo devedor
    city              text,
    state             text,
    collateral_details jsonb default '{}'::jsonb,
    created_at        timestamptz default now(),
    updated_at        timestamptz default now()
  );
  create index idx_simulation_collateral_home_sim_id on public.simulation_collateral_home (simulation_id);
  create trigger trg_updated_at_simulation_collateral_home
    before update on public.simulation_collateral_home
    for each row execute function update_updated_at_column();
  alter table public.simulation_collateral_home enable row level security;
  create policy "Leitura_Staff" on public.simulation_collateral_home
    for select to authenticated using (check_user_role(array['admin'::text, 'manager'::text, 'viewer'::text]));
  revoke all on public.simulation_collateral_home from anon, authenticated;
  grant all on public.simulation_collateral_home to service_role;
  grant insert, select, update on public.simulation_collateral_home to db_edge_worker;
end
$migration$;
