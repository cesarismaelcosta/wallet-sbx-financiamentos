-- =============================================================================
-- Backoffice: funções ajustadas ao novo modelo de etapas e status
-- (rodar DEPOIS de 20261025120000_stage_status_types.sql)
--
-- simulation_stats: passa a contar por id de status (antes contava por texto do
-- nome, e "Em simulação" dava sempre 0). Colunas novas:
--   total, com_condicoes (9), leads_enviados (11), pre_aprovadas (12),
--   volume (valor financiado de leads enviados + pré-aprovadas: clientes que seguiram)
--
-- get_backoffice_simulation_details: cada consulta passa a trazer banco (nome e logo),
-- status, se é a condição selecionada, SAC/PRICE, 1ª e última parcela, valores e
-- simulation_details (condições do banco e parcelas). Passa a trazer também a
-- garantia (simulation_collateral_home / simulation_collateral_vehicle) e o
-- simulation_details da simulação.
-- =============================================================================

drop function if exists public.simulation_stats(timestamptz, timestamptz, bigint[], integer[], text, text[]);

create function public.simulation_stats(
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_partner_ids bigint[] default null,
  p_product_ids integer[] default null,
  p_search text default null,
  p_status text[] default null
)
returns table(total bigint, com_condicoes bigint, leads_enviados bigint, pre_aprovadas bigint, volume numeric)
language plpgsql
stable security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_user  public.backoffice_users;
  v_parts text[];
  v_prods text[];
begin
  select * into v_user
  from public.backoffice_users
  where lower(email) = lower(coalesce(auth.jwt() ->> 'email',''))
    and is_active = true;

  if v_user.id is null then
    raise exception 'not authorized';
  end if;

  if v_user.role = 'viewer' then
    v_parts := array(select jsonb_array_elements_text(coalesce(v_user.allowed_partners, '[]'::jsonb)));
    v_prods := array(select jsonb_array_elements_text(coalesce(v_user.allowed_products, '[]'::jsonb)));
  end if;

  return query
  select
    count(*)::bigint,
    count(*) filter (where s.status_id = 9)::bigint,
    count(*) filter (where s.status_id = 11)::bigint,
    count(*) filter (where s.status_id = 12)::bigint,
    coalesce(sum(s.financed_amount) filter (where s.status_id in (11, 12)), 0)::numeric
  from public.simulations s
  left join public.status_types st on st.id = s.status_id
  where (p_from is null or s.created_at >= p_from)
    and (p_to   is null or s.created_at <= p_to)
    and (v_parts is null or '*' = any(v_parts) or s.partner_id::text = any(v_parts))
    and (v_prods is null or '*' = any(v_prods) or s.product_id::text = any(v_prods))
    and (p_partner_ids is null or s.partner_id = any(p_partner_ids))
    and (p_product_ids is null or s.product_id = any(p_product_ids))
    and (p_status is null or st.name = any(p_status))
    and (p_search is null
         or s.name ilike '%'||p_search||'%'
         or regexp_replace(coalesce(s.document,''), '\D', '', 'g') like '%'||regexp_replace(p_search, '\D', '', 'g')||'%');
end;
$function$;

revoke all on function public.simulation_stats(timestamptz, timestamptz, bigint[], integer[], text, text[]) from public, anon;
grant execute on function public.simulation_stats(timestamptz, timestamptz, bigint[], integer[], text, text[]) to authenticated;

create or replace function public.get_backoffice_simulation_details(p_simulation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  v_result jsonb;
  v_actor record;
  v_allowed_partners jsonb;
  v_allowed_products jsonb;
begin
  select * into v_actor from public.current_backoffice_actor();
  if v_actor.role is null then
    return jsonb_build_object('error', 'forbidden');
  end if;

  -- mesmo escopo de allowed_partners/allowed_products das listas
  v_allowed_partners := v_actor.allowed_partners;
  v_allowed_products := v_actor.allowed_products;
  if v_actor.role in ('admin', 'manager') then
    v_allowed_partners := '["*"]'::jsonb;
    v_allowed_products := '["*"]'::jsonb;
  end if;

  select jsonb_build_object(
    'id', s.id, 'created_at', s.created_at, 'updated_at', s.updated_at, 'name', s.name, 'document', s.document, 'phone', s.phone, 'email', s.email,
    'amortization_type', s.amortization_type, 'installment_value', s.installment_value, 'last_installment_value', s.last_installment_value,
    'requested_value', s.requested_value, 'down_payment_amount', s.down_payment_amount, 'down_payment_percentage', s.down_payment_percentage,
    'financed_amount', s.financed_amount, 'installments', s.installments, 'cet_rate', s.cet_rate,
    'raw_payload', s.raw_payload, 'entity_details', s.entity_details, 'birth_date', s.birth_date, 'gender', s.gender, 'entity_type', s.entity_type,
    'simulation_details', s.simulation_details, 'product_id', s.product_id, 'partner_id', s.partner_id, 'stage_id', s.stage_id, 'status_id', s.status_id,
    'partners', case when p.id is not null then jsonb_build_object('id', p.id, 'name', p.name, 'logo_url', p.logo_url) else null end,
    'product_types', case when pt.id is not null then jsonb_build_object('id', pt.id, 'name', pt.name) else null end,
    'stage_types', case when st.id is not null then jsonb_build_object('id', st.id, 'name', st.name, 'description', st.description) else null end,
    'status_types', case when stt.id is not null then jsonb_build_object('id', stt.id, 'name', stt.name, 'description', stt.description) else null end,
    'financial_institutions', case when fi.id is not null then jsonb_build_object('id', fi.id, 'name', fi.name, 'logo_url', fi.logo_url) else null end,
    'result_partner_types', case when rpt.id is not null then jsonb_build_object('id', rpt.id, 'description', rpt.description) else null end,
    'visits', case when v.id is not null then jsonb_build_object('id', v.id, 'created_at', v.created_at, 'utm_source', v.utm_source, 'utm_campaign', v.utm_campaign, 'country', v.country, 'state', v.state, 'city', v.city, 'ip_address', v.ip_address, 'operating_system', v.operating_system, 'device_type', v.device_type, 'origin_url', v.origin_url, 'target_url', v.target_url) else null end,
    'simulation_offers', (select jsonb_agg(jsonb_build_object('id', so.id, 'simulation_id', so.simulation_id, 'manager_name', so.manager_name, 'seller_id', so.seller_id, 'legal_name', so.legal_name, 'trade_name', so.trade_name, 'event_id', so.event_id, 'event_description', so.event_description, 'event_end_date', so.event_end_date, 'event_start_date', so.event_start_date, 'offer_id', so.offer_id, 'offer_description', so.offer_description, 'offer_value', so.offer_value, 'category_id', so.category_id, 'subcategory_id', so.subcategory_id, 'subcategory', so.subcategory, 'offer_details', so.offer_details, 'event_details', so.event_details, 'manager_details', so.manager_details, 'category_types', case when ct.id is not null then jsonb_build_object('id', ct.id, 'name', ct.name) else null end)) from simulation_offers so left join category_types ct on so.category_id = ct.id where so.simulation_id = s.id),
    'simulation_consents', (select jsonb_agg(jsonb_build_object('id', sc.id, 'consent_id', sc.consent_id, 'accepted', sc.accepted, 'accepted_at', sc.accepted_at, 'created_at', sc.created_at, 'ip_address', sc.ip_address, 'country', sc.country, 'state', sc.state, 'city', sc.city, 'operating_system', sc.operating_system, 'device_type', sc.device_type, 'origin_details', sc.origin_details, 'page_snapshot', sc.page_snapshot)) from simulation_consents sc where sc.simulation_id = s.id),
    'simulation_updates', (select jsonb_agg(jsonb_build_object('id', su.id, 'operation', su.operation, 'created_at', su.created_at, 'ip_address', su.ip_address, 'country', su.country, 'state', su.state, 'city', su.city, 'user_agent', su.user_agent, 'device_type', su.device_type, 'operating_system', su.operating_system, 'origin_details', su.origin_details)) from simulation_updates su where su.simulation_id = s.id),
    'simulation_consults', (select jsonb_agg(jsonb_build_object(
        'id', c.id, 'created_at', c.created_at, 'status_id', c.status_id, 'is_selected', c.is_selected,
        'financial_institution_id', c.financial_institution_id,
        'financial_institutions', case when cfi.id is not null then jsonb_build_object('id', cfi.id, 'name', cfi.name, 'logo_url', cfi.logo_url) else null end,
        'amortization_type', c.amortization_type, 'installment_value', c.installment_value, 'last_installment_value', c.last_installment_value,
        'requested_value', c.requested_value, 'down_payment_amount', c.down_payment_amount, 'financed_amount', c.financed_amount,
        'installments', c.installments, 'cet_rate', c.cet_rate, 'external_operation_id', c.external_operation_id,
        'simulation_details', c.simulation_details
      ) order by c.is_selected desc nulls last, c.installment_value nulls last)
      from simulation_consults c
      left join financial_institutions cfi on cfi.id::text = c.financial_institution_id::text
      where c.simulation_id = s.id),
    'collateral_home', (select to_jsonb(h) - 'simulation_id' from simulation_collateral_home h where h.simulation_id = s.id limit 1),
    'collateral_vehicle', (select to_jsonb(cv) - 'simulation_id' from simulation_collateral_vehicle cv where cv.simulation_id = s.id limit 1)
  ) into v_result
  from simulations s
  left join partners p on s.partner_id = p.id
  left join product_types pt on s.product_id = pt.id
  left join stage_types st on s.stage_id = st.id
  left join status_types stt on s.status_id = stt.id
  left join financial_institutions fi on s.financial_institution_id = fi.id
  left join result_partner_types rpt on s.result_partner_id = rpt.id
  left join visits v on s.visit_id = v.id
  where s.id = p_simulation_id
    and (v_allowed_partners is null or v_allowed_partners ? '*' or v_allowed_partners ? s.partner_id::text)
    and (v_allowed_products is null or v_allowed_products ? '*' or v_allowed_products ? s.product_id::text);

  -- LGPD: registra quem abriu o detalhe (dados pessoais completos)
  if v_result is not null then
    perform public.log_pii_view('simulation', p_simulation_id);
  end if;

  return v_result;
end;
$function$;
