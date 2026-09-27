/**
 * @fileoverview Rate Limiting via Postgres (sem infra externa)
 * @path supabase/functions/_shared/rate-limit.ts
 *
 * SETUP DE INFRAESTRUTURA (rodar uma vez no SQL Editor do projeto -- em
 * produção e em homologação, pra manter os dois ambientes em sincronia.
 * Não roda automaticamente por deploy nenhum -- é responsabilidade manual):
 *
 * -- =============================================================================
 * -- Rate Limiting (Edge Functions) -- tabela + function
 * -- =============================================================================
 * -- Reaproveita o role `db_edge_worker` já existente (criado no setup do
 * -- DB_POOLER_URL) -- não cria nenhum role novo, nenhum secret novo.
 * --
 * -- Design: 1 linha por par (função, IP), sobrescrita a cada janela de tempo,
 * -- não 1 linha por requisição -- o tamanho da tabela cresce com o número de
 * -- pares distintos, não com o volume de tráfego.
 *
 * create table if not exists public.edge_rate_limits (
 *   bucket_key text primary key,
 *   window_start timestamptz not null default now(),
 *   request_count integer not null default 1
 * );
 *
 * -- RLS habilitado sem nenhuma policy: bloqueia por padrão qualquer acesso
 * -- via PostgREST (anon/authenticated), mesmo que alguém conceda grant por
 * -- engano no futuro. O db_edge_worker já tem BYPASSRLS (ver setup
 * -- original em db.ts), então não é afetado por isso.
 * alter table public.edge_rate_limits enable row level security;
 *
 * create or replace function public.check_rate_limit(
 *   p_bucket_key text,
 *   p_max_requests integer,
 *   p_window_seconds integer
 * ) returns boolean
 * language plpgsql
 * as $$
 * declare
 *   v_count integer;
 * begin
 *   insert into public.edge_rate_limits (bucket_key, window_start, request_count)
 *   values (p_bucket_key, now(), 1)
 *   on conflict (bucket_key) do update set
 *     request_count = case
 *       when public.edge_rate_limits.window_start <= now() - (p_window_seconds || ' seconds')::interval
 *         then 1
 *       else public.edge_rate_limits.request_count + 1
 *     end,
 *     window_start = case
 *       when public.edge_rate_limits.window_start <= now() - (p_window_seconds || ' seconds')::interval
 *         then now()
 *       else public.edge_rate_limits.window_start
 *     end
 *   returning request_count into v_count;
 *
 *   return v_count <= p_max_requests;
 * end;
 * $$;
 *
 * -- Só o necessário para o db_edge_worker -- nunca ALL PRIVILEGES.
 * grant select, insert, update on public.edge_rate_limits to db_edge_worker;
 * grant execute on function public.check_rate_limit(text, integer, integer) to db_edge_worker;
 *
 * -- Limpeza automática: pg_cron já habilitado neste projeto (mesmo
 * -- mecanismo do job de geo do login_history, via a function log-access).
 * -- Roda 1x por dia, apaga linhas com mais de 1 dia (bem além dos 60s
 * -- reais de janela hoje -- só margem de segurança generosa).
 * -- cron.schedule com um jobname que já existe SUBSTITUI o job antigo
 * -- (seguro rodar de novo, ex: ao replicar em homologação).
 * select cron.schedule(
 *   'edge_rate_limits_cleanup',
 *   '0 3 * * *', -- todo dia às 03:00 UTC
 *   $$ delete from public.edge_rate_limits where window_start < now() - interval '1 day'; $$
 * );
 *
 * Reaproveita o role `db_edge_worker` (ver `_shared/db.ts`), mas com uma
 * conexão PRÓPRIA e minúscula (`max: 1`), isolada do pool usado por
 * persist-data.ts/orchestrator -- uma rajada de checagens de rate limit não
 * deve competir pelas mesmas conexões que as operações de negócio, e
 * vice-versa (motivo: incidente de esgotamento de conexão do Supavisor em
 * 16/09 -- ver comentário em db.ts).
 *
 * Cada bucket (função+IP) é 1 linha só, sobrescrita a cada janela -- o
 * crescimento da tabela é limitado ao número de pares distintos vistos, não
 * ao volume de tráfego. Limpeza das linhas antigas fica a cargo de um job
 * pg_cron diário (ver a migração SQL que criou `edge_rate_limits`), não
 * deste arquivo.
 *
 * [FAIL-OPEN]: se a checagem falhar por qualquer motivo (banco fora do ar,
 * timeout, DB_POOLER_URL ausente nesta function, etc.), a requisição é
 * LIBERADA -- rate limiting não deve virar um novo jeito de derrubar o app.
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

// @deno-types="https://deno.land/x/postgresjs@v3.4.8/mod.js"
import postgres from 'https://deno.land/x/postgresjs@v3.4.8/mod.js';

const dbUrl = Deno.env.get('DB_POOLER_URL');

// Pool isolado e enxuto -- só pra rate limiting (ver motivo no cabeçalho).
const rateLimitSql = dbUrl
  ? postgres(dbUrl, {
      prepare: false,   // Obrigatório para o Transaction Pooler (Supavisor)
      ssl: 'require',   // Obrigatório para o pooler
      max: 1,
      idle_timeout: 5,
      connect_timeout: 5,
    })
  : null;

/**
 * @param bucketKey Chave do balde (ex: `${functionName}:${clientIp}`).
 * @param maxRequests Máximo de requisições permitidas dentro da janela.
 * @param windowSeconds Tamanho da janela, em segundos.
 * @returns `true` se a requisição pode seguir, `false` se deve ser bloqueada
 *   (429). Em qualquer falha de infraestrutura, retorna `true` (fail-open).
 */
export async function checkRateLimit(
  bucketKey: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<boolean> {
  if (!rateLimitSql) {
    console.error("[rate-limit] DB_POOLER_URL ausente -- rate limiting desativado nesta chamada.");
    return true;
  }

  try {
    const [row] = await rateLimitSql`
      select public.check_rate_limit(${bucketKey}, ${maxRequests}, ${windowSeconds}) as allowed
    `;
    return row?.allowed !== false;
  } catch (err) {
    console.error("[rate-limit] Falha ao consultar check_rate_limit -- liberando por padrão:", err);
    return true;
  }
}
