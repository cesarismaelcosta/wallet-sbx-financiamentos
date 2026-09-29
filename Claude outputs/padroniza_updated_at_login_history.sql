-- =============================================================================
-- Padroniza login_history com o mesmo padrão updated_at das outras 22 tabelas
-- =============================================================================
-- Rodar no SQL Editor -- em DEV e depois em HOMOLOGAÇÃO (mesmo script nos
-- dois ambientes, pra manter tudo em sincronia).
--
-- Reaproveita a função `handle_updated_at()` que já existe no banco (mesma
-- usada por visits, visit_entities, notification_outbox, etc.) -- não cria
-- nada novo, só estende o padrão já estabelecido pra esta tabela. Nome do
-- trigger segue a convenção existente: trg_updated_at_<tabela>.
--
-- Idempotente: seguro rodar mais de uma vez no mesmo ambiente (o `drop
-- trigger if exists` existe justamente porque o Postgres não tem `create
-- trigger if not exists`).
--
-- Depois de rodar, nada precisa mudar no código: o próprio UPDATE que o
-- log-access já faz (country/state/city) dispara o trigger sozinho e
-- preenche updated_at -- não precisa redeploy de function nenhuma por causa
-- deste script.
-- =============================================================================

alter table public.login_history
  add column if not exists updated_at timestamptz default now();

drop trigger if exists trg_updated_at_login_history on public.login_history;

create trigger trg_updated_at_login_history
before update on public.login_history
for each row execute function handle_updated_at();

-- -----------------------------------------------------------------------
-- Conferir: deve aparecer 1 linha, event_manipulation = UPDATE,
-- action_statement mencionando handle_updated_at.
-- -----------------------------------------------------------------------
select trigger_name, event_manipulation, action_statement
from information_schema.triggers
where event_object_table = 'login_history';
