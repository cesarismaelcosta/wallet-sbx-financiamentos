-- =============================================================================
-- log_access_event: IP pela mesma regra das Edge Functions (SBXW-17) e user-agent limitado.
-- - IP: cf-connecting-ip primeiro (definido pela Cloudflare, não forjável); x-client-ip sai
--   (enviado pelo cliente, forjável). Ordem igual à de _shared/infrastructure.ts.
-- - user-agent: até 500 caracteres.
-- - Execução: só authenticated (sai de public/anon; para anon a função já não gravava nada).
-- Rodar inteiro no SQL Editor, um ambiente por vez.
-- =============================================================================

begin;

create or replace function public.log_access_event(p_event text, p_success boolean default true, p_origin_page text default null::text, p_origin_function text default null::text, p_failure_reason text default null::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
declare
  v_email text := auth.email();
  v_headers jsonb := current_setting('request.headers', true)::jsonb;
  -- IP: mesma regra das Edge Functions (SBXW-17). cf-connecting-ip é definido pela Cloudflare
  -- (não forjável); os demais cabeçalhos podem ser enviados pelo cliente e só valem como reserva.
  v_ip text := coalesce(
    nullif(v_headers->>'cf-connecting-ip', ''),
    nullif(split_part(v_headers->>'x-forwarded-for', ',', 1), ''),
    nullif(v_headers->>'x-real-ip', ''),
    '0.0.0.0'
  );
  v_country text := coalesce(nullif(v_headers->>'cf-ipcountry', ''), 'N/A');
  v_ua text := left(coalesce(v_headers->>'user-agent', ''), 500);
  v_device text;
  v_os text;
  v_safe_page text;
  v_safe_function text;
  v_effective_success boolean := coalesce(p_success, true);
  v_is_staff boolean;
  v_recent_count int;
begin
  -- Zero-Trust Identity: sem e-mail verificado via JWT, não grava nada.
  if v_email is null then
    return;
  end if;

  -- Filtro Ofensivo contra Log Flooding: evento fora da allowlist é
  -- descartado silenciosamente (mesmo comportamento neutro de sempre).
  if p_event not in ('page_view','ui_error','blocked','login','refresh','logout','failed_attempt') then
    return;
  end if;

  -- Rate limit: 20 eventos / 60s por e-mail.
  select count(*) into v_recent_count
  from public.login_history
  where email = v_email and created_at >= now() - interval '60 seconds';

  if v_recent_count >= 20 then
    return;
  end if;

  -- Staff-check: eventos que representam uma SESSÃO válida de backoffice
  -- (login/logout/refresh com success != false) exigem e-mail cadastrado e
  -- ativo em backoffice_users. "blocked"/"failed_attempt"/"page_view"/
  -- "ui_error" continuam liberados para qualquer JWT autenticado.
  if p_event in ('login','logout','refresh') and v_effective_success is distinct from false then
    select exists(
      select 1 from public.backoffice_users
      where email = lower(v_email) and is_active = true
    ) into v_is_staff;

    if not v_is_staff then
      return;
    end if;
  end if;

  -- Sanitização Anti-XSS (fallback de rotas invasivas).
  v_safe_page := case when p_origin_page in (
    '/backoffice','/backoffice/login','/backoffice/simulations','/backoffice/consults',
    '/backoffice/users','/backoffice/audit','/backoffice/reports','/backoffice/configs',
    '/backoffice/domains','/backoffice/alerts','/backoffice/routes'
  ) then p_origin_page else '/backoffice/unknown_route' end;

  v_safe_function := coalesce(left(p_origin_function, 100), 'validateUserAccess');

  v_device := case when v_ua ilike '%Mobi%' then 'Mobile' else 'Desktop' end;
  v_os := case
    when v_ua ilike '%Windows%' then 'Windows'
    when v_ua ilike '%Mac%' then 'MacOS'
    when v_ua ilike '%Android%' then 'Android'
    when v_ua ilike '%iPhone%' then 'iOS'
    else 'Linux/Other'
  end;

  insert into public.login_history (
    email, event, success, origin_page, origin_function, failure_reason,
    ip_address, country, state, city, device_type, operating_system, user_agent,
    origin_details
  ) values (
    v_email, p_event, v_effective_success, v_safe_page, v_safe_function,
    left(p_failure_reason, 100),
    v_ip, v_country, 'N/A', 'N/A', v_device, v_os, v_ua,
    jsonb_build_object(
      'event', p_event,
      'reason', coalesce(left(p_failure_reason, 100), 'sessionRefresh'),
      'success', v_effective_success,
      'origin_page', v_safe_page,
      'origin_function', v_safe_function
    )
  );
end;
$function$;

revoke execute on function public.log_access_event(text, boolean, text, text, text) from public, anon;
grant execute on function public.log_access_event(text, boolean, text, text, text) to authenticated;

commit;

-- Conferência (rodar depois):
-- select has_function_privilege('anon', 'public.log_access_event(text,boolean,text,text,text)', 'execute') as anon,          -- false
--        has_function_privilege('authenticated', 'public.log_access_event(text,boolean,text,text,text)', 'execute') as auth; -- true
-- select position('x-client-ip' in pg_get_functiondef('public.log_access_event'::regproc)) = 0 as sem_x_client_ip;          -- true
