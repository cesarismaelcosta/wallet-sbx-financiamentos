-- Tabela de histórico de tentativas de login no backoffice
create table public.loginhistory (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  event text not null check (event in ('send_otp', 'verify_otp', 'logout')),
  success boolean not null,
  failure_reason text check (failure_reason in (
    'email_not_authorized',
    'send_otp_failed',
    'invalid_or_expired_code',
    'account_locked',
    'invalid_email_format'
  )),
  ipaddress text,
  country text,
  state text,
  city text,
  useragent text,
  devicetype text,
  operatingsystem text,
  metadata jsonb,
  createdat timestamptz not null default now()
);

-- Índices para consultas comuns (filtros e checagem de lockout)
create index idx_loginhistory_email_createdat on public.loginhistory (lower(email), createdat desc);
create index idx_loginhistory_createdat on public.loginhistory (createdat desc);
create index idx_loginhistory_event_success on public.loginhistory (event, success);

-- RLS
alter table public.loginhistory enable row level security;

-- Apenas usuários do backoffice podem LER o histórico
create policy "loginhistory backoffice read"
  on public.loginhistory
  for select
  to authenticated
  using (public.is_current_user_backoffice());

-- Sem policies de insert/update/delete: só a edge function (service_role) escreve

-- Função para checar se um e-mail está bloqueado (5 falhas em 10 min => bloqueio por 30 min)
create or replace function public.is_email_locked(_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  with recent_failures as (
    select createdat
    from public.loginhistory
    where lower(email) = lower(_email)
      and event = 'verify_otp'
      and success = false
      and failure_reason = 'invalid_or_expired_code'
      and createdat > now() - interval '40 minutes'
    order by createdat desc
    limit 5
  ),
  fifth_failure as (
    select createdat
    from recent_failures
    offset 4 limit 1
  )
  select exists (
    select 1
    from fifth_failure
    where createdat > now() - interval '10 minutes'
      -- e ainda dentro da janela de 30 min de lockout (5ª falha foi há menos de 30 min)
      and createdat > now() - interval '30 minutes'
  );
$$;

-- Permite que a função seja chamada via RPC pelo cliente (para mostrar mensagem na UI)
grant execute on function public.is_email_locked(text) to anon, authenticated;