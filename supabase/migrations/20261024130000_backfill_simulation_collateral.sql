-- =============================================================================
-- Backfill das garantias (simulation_collateral_home / simulation_collateral_vehicle)
--
-- Simulações FlowCredi gravadas antes da financial-gateway passar a gravar a
-- garantia: os dados informados pelo cliente estão em
-- simulations.raw_payload -> simulation_details (mesmo mapeamento do persist-data.ts).
-- Idempotente: só insere para simulações que ainda não têm garantia.
-- =============================================================================

insert into public.simulation_collateral_home
  (simulation_id, real_estate_type, estimated_value, is_debt_free, debt_amount, city, state, collateral_details)
select s.id,
       nullif(trim(d->>'property_type'), ''),
       nullif(d->>'property_value', '')::numeric,
       coalesce((d->>'property_paid')::boolean, false),
       case when coalesce((d->>'property_paid')::boolean, false) then 0
            else coalesce(nullif(d->>'outstanding_balance', '')::numeric, 0) end,
       nullif(trim(d->>'property_city'), ''),
       nullif(trim(d->>'property_state'), ''),
       '{}'::jsonb
from public.simulations s
cross join lateral (select s.raw_payload->'simulation_details' as d) x
where nullif(trim(d->>'property_type'), '') is not null
  and not exists (select 1 from public.simulation_collateral_home h where h.simulation_id = s.id);

insert into public.simulation_collateral_vehicle
  (simulation_id, license_plate, licensing_state, brand, model, manufacture_year, model_year, doors,
   declared_value, is_debt_free, debt_amount, kinship_degree, collateral_details)
select s.id,
       upper(nullif(trim(d->>'vehicle_plate'), '')),
       nullif(trim(d->>'vehicle_state'), ''),
       nullif(trim(d->>'vehicle_brand'), ''),
       nullif(trim(d->>'vehicle_model'), ''),
       nullif(d->>'vehicle_year', '')::integer,
       nullif(d->>'vehicle_model_year', '')::integer,
       nullif(d->>'vehicle_doors', '')::integer,
       nullif(d->>'vehicle_value', '')::numeric,
       coalesce((d->>'vehicle_paid')::boolean, false),
       case when coalesce((d->>'vehicle_paid')::boolean, false) then 0
            else coalesce(nullif(d->>'outstanding_balance', '')::numeric, 0) end,
       case when (d->>'vehicle_owner')::boolean then 'SELF' else 'OTHERS' end,
       case when d ? 'vehicle_fuel' then jsonb_build_object('fuel_type', d->>'vehicle_fuel') else '{}'::jsonb end
from public.simulations s
cross join lateral (select s.raw_payload->'simulation_details' as d) x
where nullif(trim(d->>'vehicle_plate'), '') is not null
  and not exists (select 1 from public.simulation_collateral_vehicle v where v.simulation_id = s.id);
