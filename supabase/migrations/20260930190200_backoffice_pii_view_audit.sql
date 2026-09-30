-- =============================================================================
-- [LGPD] Registro de quem abriu o DETALHE (dados pessoais completos) de uma
-- simulação ou consulta no backoffice.
--  * log_pii_view(): grava 1 evento 'pii_view' em login_history + 1 linha em
--    login_history_details (quem, qual registro, hash do CPF do cliente, IP, UA).
--    Toda abertura é registrada (sem deduplicação). Nunca quebra a RPC
--    chamadora (erros viram WARNING).
--  * get_backoffice_simulation_details / get_backoffice_consult_details:
--    chamam log_pii_view() quando o registro é de fato devolvido.
--  * get_backoffice_audit: devolve `details` (record_type/record_id) e a busca
--    aceita CPF/CNPJ (compara pelo hash).
--  * get_backoffice_access_summary(): resumo MASCARADO do registro acessado,
--    para o painel lateral da Auditoria (só admin).
-- Requer: 20260930190000_login_history_details.sql e
--         20260930190100_backoffice_mask_pii_lists.sql (funções mask_*).
-- =============================================================================

create or replace function public.document_sha256(p text) returns text
language sql immutable set search_path = public, extensions, pg_catalog as $$
  select case when coalesce(regexp_replace(p, '\D', '', 'g'), '') = '' then null
              else encode(sha256(convert_to(regexp_replace(p, '\D', '', 'g'), 'UTF8')), 'hex') end
$$;
revoke all on function public.document_sha256(text) from public, anon, authenticated;

create or replace function public.log_pii_view(p_record_type text, p_record_id uuid)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_email   text := auth.email();
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip      text;
  v_ua      text;
  v_doc     text;
  v_lh_id   uuid;
begin
  if v_email is null or p_record_id is null or p_record_type not in ('simulation', 'consult') then
    return;
  end if;

  -- [LGPD]: toda abertura do detalhe é registrada (sem deduplicação).

  -- IP: só headers de borda (x-client-ip não é confiável aqui).
  v_ip := coalesce(
    nullif(v_headers->>'cf-connecting-ip', ''),
    nullif(split_part(v_headers->>'x-forwarded-for', ',', 1), ''),
    nullif(v_headers->>'x-real-ip', ''),
    '0.0.0.0');
  v_ua := coalesce(v_headers->>'user-agent', '');

  if p_record_type = 'simulation' then
    select s.document into v_doc from simulations s where s.id = p_record_id;
  else
    select ve.document into v_doc
    from visit_updates vu join visit_entities ve on ve.visit_id = vu.visit_id
    where vu.id = p_record_id
    limit 1;
  end if;

  insert into login_history (email, origin_page, origin_function, event, success, ip_address, country, state, city, device_type, operating_system, user_agent)
  values (
    lower(v_email),
    case when p_record_type = 'simulation' then '/backoffice/simulations' else '/backoffice/consults' end,
    case when p_record_type = 'simulation' then 'get_backoffice_simulation_details' else 'get_backoffice_consult_details' end,
    'pii_view', true, v_ip, coalesce(nullif(v_headers->>'cf-ipcountry', ''), 'N/A'), 'N/A', 'N/A',
    case when v_ua ilike '%Mobi%' then 'Mobile' else 'Desktop' end,
    case when v_ua ilike '%Windows%' then 'Windows' when v_ua ilike '%Mac%' then 'MacOS'
         when v_ua ilike '%Android%' then 'Android' when v_ua ilike '%iPhone%' then 'iOS' else 'Linux/Other' end,
    v_ua)
  returning id into v_lh_id;

  insert into login_history_details (login_history_id, actor_email, record_type, record_id, subject_document_hash, ip_address, user_agent)
  values (v_lh_id, lower(v_email), p_record_type, p_record_id, public.document_sha256(v_doc), v_ip, v_ua);
exception when others then
  raise warning '[log_pii_view] falha ao registrar acesso: %', sqlerrm;
end;
$$;
revoke all on function public.log_pii_view(text, uuid) from public, anon, authenticated;

-- Detalhe de simulação: registra o acesso quando o registro é devolvido
do $mig$
declare d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'get_backoffice_simulation_details';
  -- Idempotente: se a função já registra o acesso, não altera de novo.
  if d like '%log_pii_view%' then return; end if;
  if (select count(*) from regexp_matches(d, 'RETURN v_result;', 'g')) <> 1 then
    raise exception 'get_backoffice_simulation_details: esperado exatamente 1 "RETURN v_result;".';
  end if;
  n := replace(d, 'RETURN v_result;',
    $x$-- [LGPD]: registra quem abriu o detalhe (dados pessoais completos).
  IF v_result IS NOT NULL THEN
    PERFORM public.log_pii_view('simulation', p_simulation_id);
  END IF;

  RETURN v_result;$x$);
  execute n;
end $mig$;

-- Detalhe de consulta: idem
do $mig$
declare d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'get_backoffice_consult_details';
  -- Idempotente: se a função já registra o acesso, não altera de novo.
  if d like '%log_pii_view%' then return; end if;
  if (select count(*) from regexp_matches(d, 'RETURN v_result;', 'g')) <> 1 then
    raise exception 'get_backoffice_consult_details: esperado exatamente 1 "RETURN v_result;".';
  end if;
  n := replace(d, 'RETURN v_result;',
    $x$-- [LGPD]: registra quem abriu o detalhe (dados pessoais completos).
   IF v_result IS NOT NULL THEN
     PERFORM public.log_pii_view('consult', p_visit_update_id);
   END IF;

   RETURN v_result;$x$);
  execute n;
end $mig$;

-- Auditoria: devolve `details` e aceita busca por CPF/CNPJ.
-- Função completa (não depende do texto atual da função em cada ambiente).
CREATE OR REPLACE FUNCTION public.get_backoffice_audit(
  p_limit integer DEFAULT 50, p_offset integer DEFAULT 0,
  p_date_from timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_date_to timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_status text DEFAULT 'all'::text, p_event text DEFAULT 'all'::text, p_search text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_result JSONB;
  v_actor RECORD;
BEGIN
  p_limit := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);

  SELECT * INTO v_actor FROM public.current_backoffice_actor();
  IF v_actor.role IS NULL OR v_actor.role != 'admin' THEN
      RETURN '[]'::jsonb;
  END IF;

  WITH paginated_audit AS (
    SELECT
      lh.id, lh.email, lh.event, lh.success, lh.failure_reason, lh.ip_address, lh.country, lh.state, lh.city,
      lh.user_agent, lh.device_type, lh.operating_system, lh.origin_details, lh.created_at, lh.origin_page, lh.origin_function
    FROM login_history lh
    WHERE
      (p_date_from IS NULL OR lh.created_at >= p_date_from)
      AND (p_date_to IS NULL OR lh.created_at <= p_date_to)
      AND (p_status = 'all' OR (p_status = 'success' AND lh.success = true) OR (p_status = 'fail' AND lh.success = false))
      AND (p_event = 'all' OR lh.event = p_event)
      AND (p_search IS NULL OR p_search = '' OR lh.email ILIKE '%' || p_search || '%' OR lh.ip_address ILIKE '%' || p_search || '%'
           OR (length(regexp_replace(p_search, '\D', '', 'g')) IN (11, 14) AND EXISTS (
                 SELECT 1 FROM login_history_details lhd
                 WHERE lhd.login_history_id = lh.id
                   AND lhd.subject_document_hash = public.document_sha256(p_search))))
    ORDER BY lh.created_at DESC
    LIMIT p_limit OFFSET p_offset
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'id', pa.id, 'email', pa.email, 'event', pa.event, 'success', pa.success, 'failure_reason', pa.failure_reason,
      'ip_address', pa.ip_address, 'country', pa.country, 'state', pa.state, 'city', pa.city,
      'user_agent', pa.user_agent, 'device_type', pa.device_type, 'operating_system', pa.operating_system,
      'origin_details', pa.origin_details, 'created_at', pa.created_at, 'origin_page', pa.origin_page, 'origin_function', pa.origin_function,
      'details', (SELECT jsonb_build_object('record_type', lhd.record_type, 'record_id', lhd.record_id)
                  FROM login_history_details lhd WHERE lhd.login_history_id = pa.id LIMIT 1)
    )
  ) INTO v_result FROM paginated_audit pa;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_backoffice_audit(integer, integer, timestamptz, timestamptz, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_backoffice_audit(integer, integer, timestamptz, timestamptz, text, text, text) TO authenticated;

-- Resumo mascarado do registro acessado (painel lateral da Auditoria)
create or replace function public.get_backoffice_access_summary(p_login_history_id uuid)
returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor  record;
  v_det    record;
  v_record jsonb;
begin
  select * into v_actor from public.current_backoffice_actor();
  if v_actor.role is null or v_actor.role <> 'admin' then
    return jsonb_build_object('error', 'forbidden');
  end if;

  select * into v_det from login_history_details where login_history_id = p_login_history_id limit 1;
  if not found then
    return null;
  end if;

  if v_det.record_type = 'simulation' then
    select jsonb_build_object(
      'created_at', s.created_at,
      'name', s.name,
      'document', public.mask_document(s.document),
      'phone', public.mask_phone(s.phone),
      'email', public.mask_email(s.email),
      'product', pt.name, 'partner', p.name, 'status', st.name,
      'financed_amount', s.financed_amount, 'installments', s.installments, 'installment_value', s.installment_value,
      'offer', (select (to_jsonb(so) - 'raw_payload') || jsonb_build_object('category_types', jsonb_build_object('name', ct.name))
                from simulation_offers so left join category_types ct on ct.id = so.category_id
                where so.simulation_id = s.id limit 1)
    ) into v_record
    from simulations s
    left join product_types pt on pt.id = s.product_id
    left join partners p on p.id = s.partner_id
    left join status_types st on st.id = s.status_id
    where s.id = v_det.record_id;
  else
    select jsonb_build_object(
      'created_at', vu.created_at,
      'action', vu.action,
      'name', ve.name,
      'document', public.mask_document(ve.document),
      'phone', public.mask_phone(ve.phone),
      'email', public.mask_email(ve.email),
      'product', pt.name, 'partner', p.name,
      'offer', (select (to_jsonb(vo) - 'raw_payload') || jsonb_build_object('category_types', jsonb_build_object('name', ct.name))
                from visit_offers vo left join category_types ct on ct.id = vo.category_id
                where vo.visit_id = vu.visit_id
                order by (vo.visit_update_id = vu.id) desc nulls last, vo.created_at desc limit 1)
    ) into v_record
    from visit_updates vu
    left join visit_entities ve on ve.visit_id = vu.visit_id
    left join product_types pt on pt.id = vu.product_id
    left join partners p on p.id = vu.partner_id
    where vu.id = v_det.record_id
    limit 1;
  end if;

  return jsonb_build_object(
    'record_type', v_det.record_type,
    'record_id', v_det.record_id,
    'actor_email', v_det.actor_email,
    'accessed_at', v_det.created_at,
    'ip_address', v_det.ip_address,
    'user_agent', v_det.user_agent,
    'record', v_record
  );
end;
$$;
revoke all on function public.get_backoffice_access_summary(uuid) from public, anon;
grant execute on function public.get_backoffice_access_summary(uuid) to authenticated;

-- Backfill: eventos pii_view gravados antes do ajuste de dispositivo/cidade.
update public.login_history set
  state = coalesce(state, 'N/A'), city = coalesce(city, 'N/A'), country = coalesce(country, 'N/A'),
  device_type = case when user_agent ilike '%Mobi%' then 'Mobile' else 'Desktop' end,
  operating_system = case when user_agent ilike '%Windows%' then 'Windows' when user_agent ilike '%Mac%' then 'MacOS'
    when user_agent ilike '%Android%' then 'Android' when user_agent ilike '%iPhone%' then 'iOS' else 'Linux/Other' end
where event = 'pii_view' and device_type is null;
