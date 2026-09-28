-- =============================================================================
-- FIX: cron jobs de homologação apontando pro projeto ERRADO
-- =============================================================================
-- Causa raiz confirmada: os jobs `resolver-geo-login-history` e
-- `processar-notificacoes-pendentes` (pg_cron) têm a URL de destino cravada
-- como `https://ldzutiojmcawhwdhojlo.supabase.co/...` -- um projeto
-- DIFERENTE do de homologação (`qadgbfhjtgufioxtyamq`). O cron dispara, o
-- outro projeto responde 200 normalmente (por isso "sem_pendencias" nos
-- logs), mas quem processa é a Edge Function do OUTRO projeto, olhando pro
-- banco do OUTRO projeto -- o de homologação nunca é tocado. Por isso as 23
-- linhas de login_history (e possivelmente notificações pendentes também)
-- nunca são resolvidas aqui.
--
-- Rodar isto UMA VEZ no SQL Editor do projeto de homologação
-- (qadgbfhjtgufioxtyamq). cron.schedule com um jobname que já existe
-- SUBSTITUI o job antigo -- seguro rodar de novo.
-- =============================================================================

-- -----------------------------------------------------------------------
-- 1) Corrige o resolvedor de geo (log-access)
-- -----------------------------------------------------------------------
select cron.schedule(
  'resolver-geo-login-history',
  '*/5 * * * *',
  $$
  WITH params AS (
    SELECT
      extract(epoch FROM now())::bigint::text AS ts,
      (SELECT decrypted_secret FROM vault.decrypted_secrets
       WHERE name = 'login_geo_resolver_secret') AS secret
  )
  SELECT net.http_post(
    url := 'https://qadgbfhjtgufioxtyamq.supabase.co/functions/v1/log-access',
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

-- -----------------------------------------------------------------------
-- 2) Corrige o dispatcher de notificações (mesmo bug, mesmo motivo)
-- -----------------------------------------------------------------------
select cron.schedule(
  'processar-notificacoes-pendentes',
  '* * * * *',
  $$
WITH params AS (
  SELECT
    extract(epoch FROM now())::bigint::text AS ts,
    (SELECT decrypted_secret FROM vault.decrypted_secrets
     WHERE name = 'notification_dispatcher_secret') AS secret
)
SELECT net.http_post(
  url := 'https://qadgbfhjtgufioxtyamq.supabase.co/functions/v1/notification-dispatcher',
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

-- -----------------------------------------------------------------------
-- 3) Conferir que a URL mudou de verdade
-- -----------------------------------------------------------------------
-- Espera-se ver "qadgbfhjtgufioxtyamq" nas duas linhas, não mais
-- "ldzutiojmcawhwdhojlo".
select jobid, jobname, command
from cron.job
where jobname in ('resolver-geo-login-history', 'processar-notificacoes-pendentes');


-- -----------------------------------------------------------------------
-- 4) Depois de esperar uns 5-10 minutos, confirmar que a fila baixou
-- -----------------------------------------------------------------------
select
  count(*) as total,
  count(*) filter (where city = 'N/A') as pendentes,
  min(created_at) filter (where city = 'N/A') as pendente_mais_antigo
from public.login_history;

-- -----------------------------------------------------------------------
-- 5) BÔNUS: como o mesmo bug afetava o notification-dispatcher, vale
-- conferir se há notificações acumuladas há muito tempo em homologação
-- (mesma lógica: se sempre chamou o projeto errado, isso aqui também
-- pode estar com fila parada).
-- -----------------------------------------------------------------------
select status, count(*), min(created_at) as mais_antiga
from public.notification_outbox
group by status
order by status;
