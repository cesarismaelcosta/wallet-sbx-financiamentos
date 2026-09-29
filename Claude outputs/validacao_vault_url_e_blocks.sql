-- =============================================================================
-- VALIDAÇÃO: Vault project_self_url + crons via Vault + edge_rate_limit_blocks
-- =============================================================================
-- Só leitura -- roda em qualquer ambiente, quantas vezes quiser. Rode cada
-- bloco separado e confira o "esperado" de cada um.
-- =============================================================================


-- -----------------------------------------------------------------------
-- 1) O secret project_self_url existe no Vault?
-- -----------------------------------------------------------------------
-- Esperado: 1 linha, name = 'project_self_url'.
select name
from vault.decrypted_secrets
where name = 'project_self_url';


-- -----------------------------------------------------------------------
-- 2) Os dois crons estão lendo a URL do Vault (não mais cravada em texto)?
-- -----------------------------------------------------------------------
-- Esperado: 2 linhas. Na coluna `command`, procure por
-- "name = 'project_self_url'" e "p.base_url ||" -- NÃO deve mais aparecer
-- nenhuma URL literal tipo 'https://xxxxx.supabase.co/...' dentro do texto.
select jobid, jobname, schedule, active, command
from cron.job
where jobname in ('resolver-geo-login-history', 'processar-notificacoes-pendentes');


-- -----------------------------------------------------------------------
-- 3) Confirma que NENHUM cron ainda tem URL de projeto cravada no texto
-- -----------------------------------------------------------------------
-- Esperado: 0 linhas. Se vier alguma linha, esse job ainda está com URL
-- fixa em vez de ler do Vault (pode ser algum outro job que não foi pego
-- na migração, vale investigar).
select jobid, jobname, command
from cron.job
where command ilike '%supabase.co%'
  and command not ilike '%project_self_url%';


-- -----------------------------------------------------------------------
-- 4) A tabela edge_rate_limit_blocks existe com as colunas certas?
-- -----------------------------------------------------------------------
-- Esperado: 6 linhas (bucket_key, window_start, blocked_count,
-- max_requests, window_seconds, last_blocked_at).
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'edge_rate_limit_blocks'
order by ordinal_position;


-- -----------------------------------------------------------------------
-- 5) O grant do db_edge_worker está correto na tabela nova?
-- -----------------------------------------------------------------------
-- Esperado: 3 linhas -- SELECT, INSERT, UPDATE (sem DELETE, sem ALL).
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name = 'edge_rate_limit_blocks'
  and grantee = 'db_edge_worker'
order by privilege_type;


-- -----------------------------------------------------------------------
-- 6) check_rate_limit foi mesmo substituída (grava em edge_rate_limit_blocks)?
-- -----------------------------------------------------------------------
-- Esperado: 1 linha, e o texto de `definicao` deve conter
-- "edge_rate_limit_blocks" -- confirma que é a versão nova da função, não a
-- antiga (que só mexia em edge_rate_limits).
select pg_get_functiondef(oid) as definicao
from pg_proc
where proname = 'check_rate_limit';


-- -----------------------------------------------------------------------
-- 7) O job de limpeza diário está apagando as duas tabelas?
-- -----------------------------------------------------------------------
-- Esperado: 1 linha, `command` com dois DELETEs -- um em edge_rate_limits
-- (1 day) e outro em edge_rate_limit_blocks (90 days).
select jobid, jobname, schedule, command
from cron.job
where jobname = 'edge_rate_limits_cleanup';


-- -----------------------------------------------------------------------
-- 8) Teste funcional rápido: já existe algum bloqueio real registrado?
-- -----------------------------------------------------------------------
-- Não é obrigatório ter linhas aqui ainda (só aparece depois que algum
-- balde realmente estourar o limite) -- é só pra você ver o formato, caso
-- já tenha estourado algum rate limit em teste.
select bucket_key, window_start, blocked_count, max_requests, window_seconds, last_blocked_at
from public.edge_rate_limit_blocks
order by last_blocked_at desc
limit 20;
