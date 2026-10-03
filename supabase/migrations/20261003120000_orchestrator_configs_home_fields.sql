-- =============================================================================
-- [HOME] Campos de exibição dos produtos na home em orchestrator_configs.
--
-- Novos campos (logo após is_active):
--   home_key    text  -> qual botão da home a linha alimenta (mesmo nome do
--                        flowsConfig em src/routes/produtos.index.lazy.tsx:
--                        cartao, carros, caminhoes, imoveis, floorPlan,
--                        equityCarro, equityImovel, seguroResidencial, seguroAuto)
--   home_status text  -> 'visible' (aparece e clica) | 'coming_soon' (aparece
--                        desabilitado, "Em breve") | 'hidden' (não aparece)
--   home_order  int   -> ordem do botão na home
--
-- Como o Postgres não permite inserir coluna no meio, a tabela é RECRIADA
-- reaproveitando tudo o que existe hoje (levantado em dev em 03/10/2026):
--   * colunas, defaults e identity (ids preservados; sequência ajustada)
--   * CHECKs: config_type, entity_type, integration_method
--   * FK partner_id -> partners(id)
--   * FK de entrada: visit_orchestrator_configs.orchestrator_config_id
--     (ON DELETE CASCADE) — removida antes e recriada depois; linhas de
--     visit_orchestrator_configs NÃO são apagadas
--   * índice idx_orchestrator_configs_lookup_composite
--   * trigger trg_updated_at_orchestrator_configs (handle_updated_at)
--   * RLS ligado (sem FORCE) + policy Leitura_Staff (SELECT, authenticated)
--   * grants: somente postgres e service_role (anon/authenticated revogados,
--     pois o Supabase concede por padrão em tabela nova)
-- Sem views dependentes nem publicação realtime.
-- RPCs que usam a tabela (resolvem pelo nome, continuam funcionando):
--   get_backoffice_orchestrator_data  (row_to_json -> já devolve os campos novos)
--   save_backoffice_orchestrator_config (INSERT com lista de colunas -> campos
--     novos ficam no default; ainda não edita os campos de home)
--
-- A recriação roda em um único bloco (DO): se algo falhar, nada muda.
-- Idempotente: se home_key já existir, a recriação é pulada; a carga inicial
-- só preenche linhas com home_key nulo.
-- =============================================================================

do $mig$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'orchestrator_configs'
      and column_name = 'home_key'
  ) then
    raise notice 'orchestrator_configs já possui home_key — recriação pulada.';
    return;
  end if;

  perform set_config('lock_timeout', '15s', true);
  lock table public.orchestrator_configs, public.visit_orchestrator_configs
    in access exclusive mode;

  -- 1) Cópia dos dados
  create temp table _oc_backup on commit drop as
    select * from public.orchestrator_configs;

  -- 2) Solta a FK de entrada e remove a tabela antiga
  alter table public.visit_orchestrator_configs
    drop constraint if exists visit_orch_configs_config_id_fkey;

  drop table public.orchestrator_configs;

  -- 3) Recria com a nova ordem de colunas
  create table public.orchestrator_configs (
    id                  bigint generated always as identity not null,
    partner_id          bigint,
    config_type         text not null,
    lookup_id           bigint not null,
    page_url            text,
    is_active           boolean default true,
    home_key            text,
    home_status         text not null default 'hidden',
    home_order          integer,
    is_integrated       boolean default false,
    integration_method  text,
    entity_type         text default 'PF+PJ'::text,
    integration_details jsonb default '{}'::jsonb,
    rules               jsonb default '{"allow_custom_value": true, "installment_options": [12, 24, 36, 48, 60], "default_installments": 48, "max_down_payment_percentage": 80, "min_down_payment_percentage": 20}'::jsonb,
    consent_configs     jsonb default '[]'::jsonb,
    page_configs        jsonb default '{"box_bg": "bg-white/80", "box_radius": "rounded-3xl", "primary_color": "#8B5CF6"}'::jsonb,
    page_faqs           jsonb default '[]'::jsonb,
    created_at          timestamptz default now(),
    updated_at          timestamptz default now(),
    constraint orchestrator_configs_pkey primary key (id),
    constraint orchestrator_configs_config_type_check
      check (config_type = any (array['EVENT','SELLER','PRODUCT','SUBCATEGORY','CATEGORY'])),
    constraint orchestrator_configs_entity_type_check
      check (entity_type = any (array['PF','PJ','PF+PJ'])),
    constraint orchestrator_configs_integration_method_check
      check (integration_method = any (array['API','EMAIL','FILE','MANUAL'])),
    constraint orchestrator_configs_home_status_check
      check (home_status = any (array['visible','coming_soon','hidden'])),
    constraint orchestrator_configs_partner_id_fkey
      foreign key (partner_id) references public.partners(id)
  );

  -- 4) Devolve os dados com os mesmos ids
  insert into public.orchestrator_configs (
    id, partner_id, config_type, lookup_id, page_url, is_active,
    is_integrated, integration_method, entity_type, integration_details,
    rules, consent_configs, page_configs, page_faqs, created_at, updated_at
  ) overriding system value
  select
    id, partner_id, config_type, lookup_id, page_url, is_active,
    is_integrated, integration_method, entity_type, integration_details,
    rules, consent_configs, page_configs, page_faqs, created_at, updated_at
  from _oc_backup;

  perform setval(
    pg_get_serial_sequence('public.orchestrator_configs', 'id'),
    coalesce((select max(id) from public.orchestrator_configs), 0) + 1,
    false
  );

  -- 5) Índice, trigger, RLS, policy e grants
  create index idx_orchestrator_configs_lookup_composite
    on public.orchestrator_configs using btree (partner_id, config_type, lookup_id);

  create trigger trg_updated_at_orchestrator_configs
    before update on public.orchestrator_configs
    for each row execute function public.handle_updated_at();

  alter table public.orchestrator_configs enable row level security;

  create policy "Leitura_Staff" on public.orchestrator_configs
    for select to authenticated
    using (public.check_user_role(array['admin','manager','viewer']));

  revoke all on public.orchestrator_configs from public, anon, authenticated;
  grant all on public.orchestrator_configs to service_role;

  -- 6) Religa a FK de entrada
  alter table public.visit_orchestrator_configs
    add constraint visit_orch_configs_config_id_fkey
    foreign key (orchestrator_config_id)
    references public.orchestrator_configs(id) on delete cascade;

  -- 7) Conferência: mesma quantidade de linhas
  if (select count(*) from public.orchestrator_configs)
     <> (select count(*) from _oc_backup) then
    raise exception 'Contagem diferente após recriar orchestrator_configs.';
  end if;
end
$mig$;

comment on column public.orchestrator_configs.home_key is
  'Botão da home que esta linha alimenta (chave do flowsConfig em produtos.index.lazy.tsx).';
comment on column public.orchestrator_configs.home_status is
  'Exibição na home: visible | coming_soon (Em breve, desabilitado) | hidden.';
comment on column public.orchestrator_configs.home_order is
  'Ordem do botão na home.';

-- 8) Carga inicial = home atual (flowsConfig em produtos.index.lazy.tsx)
--    disabled:false -> visible | disabled:true -> coming_soon
--    Só preenche linhas ainda sem home_key.
update public.orchestrator_configs oc
set home_key = v.home_key, home_status = v.home_status, home_order = v.home_order
from (values
  ('PRODUCT',  8, 'cartao',       'visible',     1),
  ('CATEGORY', 10, 'carros',      'visible',     2),
  ('CATEGORY', 11, 'caminhoes',   'visible',     3),
  ('CATEGORY', 13, 'imoveis',     'coming_soon', 4),
  ('PRODUCT',  7, 'equityCarro',  'visible',     6),
  ('PRODUCT',  6, 'equityImovel', 'coming_soon', 7),
  ('PRODUCT',  9, 'seguroAuto',   'visible',     9)
) as v(config_type, lookup_id, home_key, home_status, home_order)
where oc.config_type = v.config_type
  and oc.lookup_id = v.lookup_id
  and oc.home_key is null;
-- floorPlan (ordem 5) e seguroResidencial (ordem 8) não têm linha em
-- orchestrator_configs; hoje aparecem desabilitados na home.

-- 9) RPC de gravação do backoffice passa a salvar os campos de home
--    (mesmo código de antes + home_key, home_status, home_order).
CREATE OR REPLACE FUNCTION public.save_backoffice_orchestrator_config(p_payload jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor RECORD;
BEGIN
  SELECT * INTO v_actor FROM public.current_backoffice_actor();
  IF v_actor.role IS NULL OR v_actor.role != 'admin' THEN
      RAISE EXCEPTION 'forbidden';
  END IF;

  IF p_payload ? 'id' THEN
    UPDATE orchestrator_configs SET
      lookup_id = p_payload->>'lookup_id',
      config_type = p_payload->>'config_type',
      entity_type = p_payload->>'entity_type',
      page_url = p_payload->>'page_url',
      integration_method = p_payload->>'integration_method',
      partner_id = (p_payload->>'partner_id')::INT,
      is_active = (p_payload->>'is_active')::BOOLEAN,
      home_key = NULLIF(TRIM(p_payload->>'home_key'), ''),
      home_status = COALESCE(NULLIF(p_payload->>'home_status', ''), 'hidden'),
      home_order = NULLIF(p_payload->>'home_order', '')::INT,
      is_integrated = (p_payload->>'is_integrated')::BOOLEAN,
      integration_details = p_payload->'integration_details',
      rules = p_payload->'rules',
      page_configs = p_payload->'page_configs',
      consent_configs = p_payload->'consent_configs',
      page_faqs = p_payload->'page_faqs',
      updated_at = NOW()
    WHERE id = (p_payload->>'id')::INT;
  ELSE
    INSERT INTO orchestrator_configs (
      lookup_id, config_type, entity_type, page_url, integration_method, partner_id, is_active,
      home_key, home_status, home_order, is_integrated,
      integration_details, rules, page_configs, consent_configs, page_faqs
    ) VALUES (
      p_payload->>'lookup_id', p_payload->>'config_type', p_payload->>'entity_type', p_payload->>'page_url',
      p_payload->>'integration_method', (p_payload->>'partner_id')::INT, COALESCE((p_payload->>'is_active')::BOOLEAN, true),
      NULLIF(TRIM(p_payload->>'home_key'), ''), COALESCE(NULLIF(p_payload->>'home_status', ''), 'hidden'),
      NULLIF(p_payload->>'home_order', '')::INT,
      COALESCE((p_payload->>'is_integrated')::BOOLEAN, true), p_payload->'integration_details', p_payload->'rules',
      p_payload->'page_configs', p_payload->'consent_configs', p_payload->'page_faqs'
    );
  END IF;
END;
$function$;
