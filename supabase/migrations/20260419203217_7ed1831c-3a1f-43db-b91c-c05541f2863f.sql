create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove agendamento anterior, se existir, para tornar a migration idempotente.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'enrich-loginhistory-geo-every-5min') then
    perform cron.unschedule('enrich-loginhistory-geo-every-5min');
  end if;
end $$;

select cron.schedule(
  'enrich-loginhistory-geo-every-5min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://id-preview--517910c3-8d3f-4f12-9eec-428e6ef116a8.lovable.app/hooks/enrich-loginhistory-geo',
    headers := '{"Content-Type": "application/json", "Lovable-Context": "cron", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4dHJ3c3VkZGhhZHNpd2NybWlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MDg3MDUsImV4cCI6MjA5MjE4NDcwNX0.Q3iGn5BWQivBvH-wJQYz_4uX2W5LX85dUR-3DhavHWE"}'::jsonb,
    body := '{}'::jsonb
  ) as request_id;
  $$
);