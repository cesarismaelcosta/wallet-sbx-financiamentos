-- =============================================================================
-- [LGPD] Máscara de dados pessoais nas LISTAGENS do backoffice.
-- Dado completo só nas RPCs de detalhe (que passam a registrar o acesso -- ver
-- 20260930190200_backoffice_pii_view_audit.sql).
--  * get_backoffice_simulations: document/phone/email mascarados
--  * get_backoffice_consults:    visit_entities mascarado + novo p_search (busca no banco)
--  * get_dashboard_simulations_raw / get_dashboard_visits_raw: 'document' vira
--    impressão digital (md5 dos dígitos) -- só serve para contar CPFs distintos.
-- Os blocos DO alteram a definição atual por substituição de trecho e ABORTAM
-- se o trecho esperado não existir (definição diferente entre ambientes).
-- =============================================================================

create or replace function public.mask_document(p text) returns text
language sql immutable set search_path = pg_catalog as $$
  select case
    when p is null or p = '' then p
    when length(regexp_replace(p, '\D', '', 'g')) = 11
      then left(regexp_replace(p, '\D', '', 'g'), 3) || '.***.***-' || right(regexp_replace(p, '\D', '', 'g'), 2)
    when length(regexp_replace(p, '\D', '', 'g')) = 14
      then left(regexp_replace(p, '\D', '', 'g'), 2) || '.***.***/****-' || right(regexp_replace(p, '\D', '', 'g'), 2)
    else '***' end
$$;

create or replace function public.mask_phone(p text) returns text
language sql immutable set search_path = pg_catalog as $$
  select case
    when p is null or p = '' then p
    when length(regexp_replace(p, '\D', '', 'g')) >= 4 then '(**) *****-' || right(regexp_replace(p, '\D', '', 'g'), 4)
    else '***' end
$$;

create or replace function public.mask_email(p text) returns text
language sql immutable set search_path = pg_catalog as $$
  select case
    when p is null or p = '' or position('@' in p) = 0 then p
    else left(split_part(p, '@', 1), 2) || '***@' || split_part(p, '@', 2) end
$$;

create or replace function public.document_fingerprint(p text) returns text
language sql immutable set search_path = pg_catalog as $$
  select case when coalesce(regexp_replace(p, '\D', '', 'g'), '') = '' then null
              else md5(regexp_replace(p, '\D', '', 'g')) end
$$;

revoke all on function public.mask_document(text), public.mask_phone(text), public.mask_email(text), public.document_fingerprint(text)
  from public, anon, authenticated;

-- 1) get_backoffice_simulations
do $mig$
declare d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'get_backoffice_simulations';
  n := replace(d, $x$'document', ps.document, 'phone', ps.phone, 'email', ps.email$x$,
                  $x$'document', public.mask_document(ps.document), 'phone', public.mask_phone(ps.phone), 'email', public.mask_email(ps.email)$x$);
  if n = d then raise exception 'get_backoffice_simulations: trecho document/phone/email não encontrado.'; end if;
  execute n;
end $mig$;

-- 2) get_backoffice_consults (+ p_search)
do $mig$
declare d text; n text; prev text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'get_backoffice_consults';

  n := replace(d, $x$jsonb_build_object('name', ve.name, 'document', ve.document, 'phone', ve.phone, 'email', ve.email)$x$,
                  $x$jsonb_build_object('name', ve.name, 'document', public.mask_document(ve.document), 'phone', public.mask_phone(ve.phone), 'email', public.mask_email(ve.email))$x$);
  if n = d then raise exception 'get_backoffice_consults: trecho visit_entities não encontrado.'; end if;

  prev := n;
  n := replace(n, 'p_product_ids integer[] DEFAULT NULL::integer[])',
                  'p_product_ids integer[] DEFAULT NULL::integer[], p_search text DEFAULT NULL::text)');
  if n = prev then raise exception 'get_backoffice_consults: assinatura não encontrada.'; end if;

  prev := n;
  n := replace(n, 'AND (p_date_from IS NULL OR vu.created_at >= p_date_from)',
    $x$AND (p_search IS NULL OR btrim(p_search) = '' OR EXISTS (
          SELECT 1 FROM visit_entities ves
          WHERE ves.visit_id = v.id
            AND (ves.name ILIKE '%' || btrim(p_search) || '%'
                 OR (regexp_replace(p_search, '\D', '', 'g') <> ''
                     AND regexp_replace(coalesce(ves.document, ''), '\D', '', 'g') LIKE '%' || regexp_replace(p_search, '\D', '', 'g') || '%'))))
      AND (p_date_from IS NULL OR vu.created_at >= p_date_from)$x$);
  if n = prev then raise exception 'get_backoffice_consults: filtro p_date_from não encontrado.'; end if;

  drop function public.get_backoffice_consults(integer, integer, timestamptz, timestamptz, integer[], integer[]);
  execute n;
end $mig$;

revoke all on function public.get_backoffice_consults(integer, integer, timestamptz, timestamptz, integer[], integer[], text) from public, anon;
grant execute on function public.get_backoffice_consults(integer, integer, timestamptz, timestamptz, integer[], integer[], text) to authenticated, service_role;

-- 3) Dashboard: CPF vira impressão digital (só para contar clientes únicos)
do $mig$
declare d text; n text;
begin
  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'get_dashboard_simulations_raw';
  n := replace(d, $x$'document', s.document,$x$, $x$'document', public.document_fingerprint(s.document),$x$);
  if n = d then raise exception 'get_dashboard_simulations_raw: trecho document não encontrado.'; end if;
  execute n;

  select pg_get_functiondef(p.oid) into d from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'get_dashboard_visits_raw';
  n := replace(d, $x$jsonb_build_object('document', ve.document)$x$, $x$jsonb_build_object('document', public.document_fingerprint(ve.document))$x$);
  if n = d then raise exception 'get_dashboard_visits_raw: trecho document não encontrado.'; end if;
  execute n;
end $mig$;
