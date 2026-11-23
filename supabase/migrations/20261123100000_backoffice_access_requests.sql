-- =============================================================================
-- Backoffice: só 2 admins + pedidos de acesso
-- 1) Admins: ficam só cesar.costa e joao.freitas; os demais admins viram manager
--    (auditoria ROLE_CHANGE pela trigger, com updated_by = cesar.costa).
-- 2) Tabela backoffice_access_requests: pedido de acesso de quem entra com Google
--    e não está em backoffice_users (parceiros, produtos e motivo). Só a Edge Function
--    manage-backoffice-users (service_role) lê e grava; RLS ligado, sem acesso do navegador.
-- 3) notification_outbox / notifications: novo context_type BACKOFFICE_ACCESS
--    (e-mails do pedido, da liberação e da recusa).
-- Rodar inteiro no SQL Editor (um ambiente por vez). Tudo numa transação.
-- =============================================================================

begin;

-- 1) Admins
update public.backoffice_users
   set role = 'manager'::public.backofficerole,
       updated_by = 'cesar.costa@superbid.net'
 where role = 'admin'::public.backofficerole
   and lower(email) not in ('cesar.costa@superbid.net', 'joao.freitas@superbid.net');

-- 2) Pedidos de acesso
create table public.backoffice_access_requests (
  id uuid not null default gen_random_uuid(),
  email text not null,
  name text,
  partners jsonb not null default '[]'::jsonb,
  products jsonb not null default '[]'::jsonb,
  reason text not null,
  status text not null default 'pending',
  rejected_reason text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by text,
  constraint backoffice_access_requests_pkey primary key (id),
  constraint backoffice_access_requests_status_check check (status = any (array['pending'::text, 'approved'::text, 'rejected'::text])),
  constraint backoffice_access_requests_reason_check check (length(btrim(reason)) between 1 and 500)
);
comment on table public.backoffice_access_requests is
  'Pedidos de acesso ao backoffice (quem entrou com Google e não está em backoffice_users). Lido e gravado só pela Edge Function manage-backoffice-users.';

-- Um pedido pendente por e-mail
create unique index backoffice_access_requests_pending_key
  on public.backoffice_access_requests using btree (lower(email)) where status = 'pending';
create index idx_backoffice_access_requests_email
  on public.backoffice_access_requests using btree (lower(email), requested_at desc);

alter table public.backoffice_access_requests enable row level security;
revoke all on public.backoffice_access_requests from public, anon, authenticated;
grant all on public.backoffice_access_requests to service_role;

-- 3) Novo tipo de e-mail
alter table public.notification_outbox drop constraint notification_outbox_context_type_check;
alter table public.notification_outbox add constraint notification_outbox_context_type_check
  check (context_type = any (array['SIMULATION'::text, 'VISIT'::text, 'SYSTEM_ERROR'::text, 'BACKOFFICE_ACCESS'::text]));
alter table public.notifications drop constraint notifications_context_type_check;
alter table public.notifications add constraint notifications_context_type_check
  check (context_type = any (array['SIMULATION'::text, 'VISIT'::text, 'SYSTEM_ERROR'::text, 'BACKOFFICE_ACCESS'::text]));

commit;

-- Conferência (rodar depois):
-- select email, role from backoffice_users where role = 'admin';              -- só cesar.costa e joao.freitas
-- select count(*) from backoffice_access_requests;                            -- 0
-- select relrowsecurity from pg_class where oid = 'public.backoffice_access_requests'::regclass;  -- true
