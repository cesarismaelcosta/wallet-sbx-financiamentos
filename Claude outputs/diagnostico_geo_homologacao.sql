-- =============================================================================
-- DIAGNÓSTICO: por que state/city não estão sendo preenchidos em login_history
-- =============================================================================
-- Rodar cada bloco separadamente no SQL Editor do projeto de HOMOLOGAÇÃO.
-- São todas queries de LEITURA (nenhuma altera dados) -- seguro rodar.
--
-- Contexto (pra interpretar os resultados): toda linha nasce com
-- city = 'N/A' (a Cloudflare da Supabase não entrega cidade/estado no
-- insert, só country). Um cron (`resolver-geo-login-history`, a cada 5 min)
-- chama a Edge Function `log-access`, que busca linhas com city = 'N/A' e
-- resolve via ip-api.com. Qualquer elo quebrado nessa corrente deixa tudo
-- "N/A" pra sempre, sem erro visível pro usuário que loga.
-- =============================================================================


-- -----------------------------------------------------------------------
-- 1) O cron existe e está ativo?
-- -----------------------------------------------------------------------
-- Esperado: 1 linha, active = true, schedule = '*/5 * * * *'.
-- Se vier VAZIO: o cron nunca foi criado neste ambiente (a causa mais
-- provável -- ver o arquivo login_geo_resolver_cron_setup.sql, que precisa
-- rodar em CADA ambiente separadamente, não só em produção).
select jobid, jobname, schedule, active
from cron.job
where jobname = 'resolver-geo-login-history';


-- -----------------------------------------------------------------------
-- 2) O segredo HMAC existe no Vault?
-- -----------------------------------------------------------------------
-- Esperado: 1 linha. Se vier VAZIO: o cron está assinando com um segredo
-- NULL -- a assinatura HMAC nunca vai bater, o log-access rejeita com 401
-- em toda chamada, e as linhas nunca são resolvidas. Sintoma bate 100% com
-- "sempre N/A, mesmo horas depois".
select name
from vault.decrypted_secrets
where name = 'login_geo_resolver_secret';


-- -----------------------------------------------------------------------
-- 3) O cron está rodando (do lado do Postgres) e sem erro de SQL?
-- -----------------------------------------------------------------------
-- ATENÇÃO ao ler isso: "succeeded" aqui só significa que o comando SQL
-- (net.http_post) foi disparado sem erro -- é uma chamada ASSÍNCRONA, então
-- isso NÃO garante que o log-access respondeu 200. Serve só pra confirmar
-- que o pg_cron está de fato acionando o job a cada 5 min.
select jrd.status, jrd.return_message, jrd.start_time, jrd.end_time
from cron.job_run_details jrd
join cron.job j on j.jobid = jrd.jobid
where j.jobname = 'resolver-geo-login-history'
order by jrd.start_time desc
limit 20;


-- -----------------------------------------------------------------------
-- 4) O que o log-access respondeu de verdade (status HTTP)?
-- -----------------------------------------------------------------------
-- Isso é a resposta REAL da Edge Function. Olhe a coluna status_code:
--   200 = rodou normal (pode não ter tido nada pendente, ou já resolveu)
--   401 = HMAC rejeitado (confirma o problema do item 2)
--   429 = rate limit bloqueando (improvável, hoje o limite dessa function
--         é 100/min e é sempre o mesmo IP interno de cron chamando)
--   500 = erro dentro da function (ver items 5/6)
-- Atenção: essa tabela é limpa 1x por dia (job "limpar-net-http-response"),
-- então só mostra as últimas ~24h.
select id, status_code, created,
       convert_from(content, 'UTF8') as corpo_resposta
from net._http_response
order by created desc
limit 20;


-- -----------------------------------------------------------------------
-- 5) Quantas linhas estão pendentes, e desde quando?
-- -----------------------------------------------------------------------
-- Se "pendente_mais_antigo" for de MINUTOS atrás: normal, é só esperar o
-- próximo ciclo do cron (roda a cada 5 min).
-- Se for de HORAS ou DIAS atrás: confirma que está travado de verdade,
-- não é só demora -- aponta pra item 1, 2 ou 4.
select
  count(*) as total,
  count(*) filter (where city = 'N/A') as pendentes,
  min(created_at) filter (where city = 'N/A') as pendente_mais_antigo,
  max(created_at) as linha_mais_recente
from public.login_history;


-- -----------------------------------------------------------------------
-- 6) As linhas específicas que você já viu com problema
-- -----------------------------------------------------------------------
-- Confirma se ainda estão pendentes agora, ou se algo já resolveu.
select id, ip_address, country, state, city, created_at
from public.login_history
where id in (
  '2424eb7b-cb87-474b-8b8a-1c94fa04937c',
  '6467df34-4695-4d43-a329-549eb39e14f0'
);
