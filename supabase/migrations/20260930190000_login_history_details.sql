-- =============================================================================
-- login_history_details
-- Detalhe de eventos do login_history que envolvem acesso a dados pessoais
-- (ex.: pii_view -- abertura do detalhe de uma simulação ou consulta no backoffice).
-- Cada linha pertence a UM evento do login_history (FK login_history_id).
-- Segurança: mesmas regras do login_history -- RLS ativo, policy
-- "Acesso_Admin_Total" (só admin), e sem GRANT para anon/authenticated
-- (gravação e leitura só via funções SECURITY DEFINER / service_role).
-- =============================================================================

create table if not exists public.login_history_details (
  id                    uuid        primary key default gen_random_uuid(),
  login_history_id      uuid        not null references public.login_history(id) on delete cascade,
  actor_email           text        not null,
  record_type           text        not null check (record_type in ('simulation', 'consult')),
  record_id             uuid        not null,
  subject_document_hash text,
  ip_address            text,
  user_agent            text,
  created_at            timestamptz not null default now()
);

comment on table  public.login_history_details is 'Detalhe de eventos do login_history com acesso a dados pessoais (pii_view): quem abriu qual registro de qual cliente.';
comment on column public.login_history_details.record_type is 'simulation = simulations.id | consult = visit_updates.id';
comment on column public.login_history_details.subject_document_hash is 'sha256 do CPF/CNPJ (só dígitos) do cliente do registro, para busca "quem acessou o cliente X".';

create index if not exists login_history_details_login_history_id_idx on public.login_history_details (login_history_id);
create index if not exists login_history_details_subject_idx on public.login_history_details (subject_document_hash, created_at desc);
create index if not exists login_history_details_actor_idx on public.login_history_details (actor_email, created_at desc);
create index if not exists login_history_details_record_idx on public.login_history_details (record_type, record_id);

alter table public.login_history_details enable row level security;

drop policy if exists "Acesso_Admin_Total" on public.login_history_details;
create policy "Acesso_Admin_Total" on public.login_history_details
  as permissive for all to authenticated
  using (check_user_role(array['admin'::text]));

revoke all on public.login_history_details from public, anon, authenticated;
grant all on public.login_history_details to service_role;
