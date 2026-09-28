-- =============================================================================
-- PARTE 1: URL do próprio projeto no Vault (elimina URL cravada nos crons)
-- =============================================================================
-- Rodar UMA VEZ por ambiente. Troque a URL abaixo pela URL de CADA projeto
-- antes de rodar (Project Settings → API → Project URL).
--
-- Valor pronto pra HOMOLOGAÇÃO (qadgbfhjtgufioxtyamq) já preenchido abaixo.

select vault.create_secret(
  'https://qadgbfhjtgufioxtyamq.supabase.co',
  'project_self_url',
  'URL pública deste MESMO projeto -- usada pelos crons pra chamar suas próprias Edge Functions'
);

-- -----------------------------------------------------------------------
-- Reagenda os 2 crons pra ler a URL do Vault em vez de cravada em texto.
-- cron.schedule com jobname existente SUBSTITUI o job antigo (seguro rodar
-- de novo).
-- -----------------------------------------------------------------------

select cron.schedule(
  'resolver-geo-login-history',
  '*/5 * * * *',
  $$
  WITH params AS (
    SELECT
      extract(epoch FROM now())::bigint::text AS ts,
      (SELECT decrypted_secret FROM vault.decrypted_secrets
       WHERE name = 'login_geo_resolver_secret') AS secret,
      (SELECT decrypted_secret FROM vault.decrypted_secrets
       WHERE name = 'project_self_url') AS base_url
  )
  SELECT net.http_post(
    url := p.base_url || '/functions/v1/log-access',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-timestamp', p.ts,
      'x-signature', encode(hmac(p.ts, p.secret, 'sha256'), 'hex')
    ),
    body := '{}'::jsonb
  )
  FROM params p;
  $$
);

select cron.schedule(
  'processar-notificacoes-pendentes',
  '* * * * *',
  $$
WITH params AS (
  SELECT
    extract(epoch FROM now())::bigint::text AS ts,
    (SELECT decrypted_secret FROM vault.decrypted_secrets
     WHERE name = 'notification_dispatcher_secret') AS secret,
    (SELECT decrypted_secret FROM vault.decrypted_secrets
     WHERE name = 'project_self_url') AS base_url
)
SELECT net.http_post(
  url := p.base_url || '/functions/v1/notification-dispatcher',
  headers := jsonb_build_object(
    'Content-Type', 'application/json',
    'x-timestamp', p.ts,
    'x-signature', encode(hmac(p.ts, p.secret, 'sha256'), 'hex')
  ),
  body := '{}'::jsonb
)
FROM params p;
$$
);

-- Conferir: as duas linhas devem mostrar "project_self_url" sendo lido do
-- Vault, não mais a URL em texto puro dentro do comando.
select jobid, jobname, command
from cron.job
where jobname in ('resolver-geo-login-history', 'processar-notificacoes-pendentes');


-- =============================================================================
-- PARTE 2: updated_at em login_history (mesmo padrão das outras 22 tabelas)
-- =============================================================================
-- Reaproveita a função `handle_updated_at()` que já existe no banco (mesma
-- usada por visits, visit_entities, notification_outbox, etc.) -- não cria
-- nada novo, só estende o padrão já estabelecido pra esta tabela.

alter table public.login_history
  add column if not exists updated_at timestamptz default now();

create trigger trg_updated_at_login_history
before update on public.login_history
for each row execute function handle_updated_at();

-- Conferir que o trigger foi criado:
select trigger_name, event_manipulation, action_statement
from information_schema.triggers
where event_object_table = 'login_history';
