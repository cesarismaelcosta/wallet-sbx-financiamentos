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
 * -- =============================================================================
 * -- Log de bloqueios (auditoria) -- NÃO manda alerta, só registra pra não
 * -- jogar fora. Só grava quando a requisição É bloqueada (v_count >
 * -- p_max_requests) -- nunca 1 linha por requisição permitida. 1 linha por
 * -- (bucket, janela realmente estourada), com contador de quantas vezes
 * -- aquele balde bateu 429 naquela janela -- mesmo espírito de
 * -- `edge_rate_limits`, não cresce com o volume de tráfego normal.
 * -- =============================================================================
 * create table if not exists public.edge_rate_limit_blocks (
 *   bucket_key text not null,
 *   window_start timestamptz not null,
 *   blocked_count integer not null default 1,
 *   max_requests integer not null,
 *   window_seconds integer not null,
 *   last_blocked_at timestamptz not null default now(),
 *   primary key (bucket_key, window_start)
 * );
 *
 * alter table public.edge_rate_limit_blocks enable row level security;
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
 *   v_window_start timestamptz;
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
 *   returning request_count, window_start into v_count, v_window_start;
 *
 *   if v_count > p_max_requests then
 *     -- Só chega aqui quando estoura -- é o "somente o que estourar jogamos
 *     -- lá". Upsert: se o mesmo balde já bateu 429 nessa mesma janela,
 *     -- só incrementa o contador em vez de criar linha nova.
 *     insert into public.edge_rate_limit_blocks (
 *       bucket_key, window_start, blocked_count, max_requests, window_seconds, last_blocked_at
 *     )
 *     values (p_bucket_key, v_window_start, 1, p_max_requests, p_window_seconds, now())
 *     on conflict (bucket_key, window_start) do update set
 *       blocked_count = public.edge_rate_limit_blocks.blocked_count + 1,
 *       last_blocked_at = now();
 *
 *     return false;
 *   end if;
 *
 *   return true;
 * end;
 * $$;
 *
 * -- Só o necessário para o db_edge_worker -- nunca ALL PRIVILEGES.
 * grant select, insert, update on public.edge_rate_limits to db_edge_worker;
 * grant select, insert, update on public.edge_rate_limit_blocks to db_edge_worker;
 * grant execute on function public.check_rate_limit(text, integer, integer) to db_edge_worker;
 *
 * -- Limpeza automática: pg_cron já habilitado neste projeto (mesmo
 * -- mecanismo do job de geo do login_history, via a function log-access).
 * -- Roda 1x por dia, apaga linhas de `edge_rate_limits` com mais de 1 dia
 * -- (bem além dos 60s reais de janela hoje -- só margem de segurança
 * -- generosa) e linhas de `edge_rate_limit_blocks` com mais de 90 dias
 * -- (essa é log de auditoria, não contador operacional -- retenção maior
 * -- de propósito; ajuste o intervalo abaixo se quiser outro prazo).
 * -- cron.schedule com um jobname que já existe SUBSTITUI o job antigo
 * -- (seguro rodar de novo, ex: ao replicar em homologação) -- mesmo job,
 * -- agora limpando as duas tabelas.
 * select cron.schedule(
 *   'edge_rate_limits_cleanup',
 *   '0 3 * * *', -- todo dia às 03:00 UTC
 *   $$
 *     delete from public.edge_rate_limits where window_start < now() - interval '1 day';
 *     delete from public.edge_rate_limit_blocks where window_start < now() - interval '90 days';
 *   $$
 * );
 *
 * Usa a MESMA conexão do resto da function (`sql` de `_shared/db.ts`, role
 * `db_edge_worker`). [2026-09-29] Antes tinha um pool próprio (`max: 1`) por
 * instância -- a conexão extra esgotava a fila do Supavisor e travava a
 * requisição antes do handler. Ver o comentário [FIX 2026-09-29] mais abaixo.
 *
 * Cada bucket (função+IP) é 1 linha só, sobrescrita a cada janela -- o
 * crescimento da tabela é limitado ao número de pares distintos vistos, não
 * ao volume de tráfego. Limpeza das linhas antigas fica a cargo de um job
 * pg_cron diário (ver a migração SQL que criou `edge_rate_limits`), não
 * deste arquivo.
 *
 * O log de bloqueios (`edge_rate_limit_blocks`) roda inteiro dentro do
 * `check_rate_limit` -- não existe nenhuma chamada nova de rede/DB no lado
 * do Deno (`checkRateLimit` abaixo NÃO mudou) -- é a mesma consulta única de
 * sempre, só que a function no Postgres agora também grava quando bloqueia.
 * Fail-open cobre esse log também: se a function inteira falhar por
 * qualquer motivo, o catch abaixo libera a requisição igual.
 *
 * [FAIL-OPEN]: se a checagem falhar por qualquer motivo (banco fora do ar,
 * timeout, DB_POOLER_URL ausente nesta function, etc.), a requisição é
 * LIBERADA -- rate limiting não deve virar um novo jeito de derrubar o app.
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

// [FIX 2026-09-29]: antes este arquivo abria um pool PRÓPRIO (postgres(...,
// { max: 1 })) em cada instância da function. Somado ao pool principal de
// db.ts (max: 5), isso esgotava a fila do Supavisor para o db_edge_worker
// quando várias instâncias estavam vivas ao mesmo tempo -- a conexão do rate
// limit NÃO falhava, ficava esperando vaga (77s medidos em dev), e como esta
// checagem é o primeiro await do withSecurity, a requisição inteira travava
// antes do handler (timeout de 90s no front). Agora reaproveita o `sql` de
// db.ts (nenhuma conexão extra) e tem teto de tempo: se não responder em
// RATE_LIMIT_TIMEOUT_MS, libera a requisição (mesmo fail-open de sempre).
const RATE_LIMIT_TIMEOUT_MS = 2000;

/**
 * @param bucketKey Chave do balde (ex: `${functionName}:${clientIp}`).
 * @param maxRequests Máximo de requisições permitidas dentro da janela.
 * @param windowSeconds Tamanho da janela, em segundos.
 * @returns `true` se a requisição pode seguir, `false` se deve ser bloqueada
 *   (429). Em qualquer falha de infraestrutura ou demora acima de
 *   RATE_LIMIT_TIMEOUT_MS, retorna `true` (fail-open).
 */
export async function checkRateLimit(
  bucketKey: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<boolean> {
  let timer: number | undefined;
  try {
    // Import dinâmico: se DB_POOLER_URL faltar, db.ts lança na importação --
    // cai no catch abaixo e libera, em vez de derrubar a function inteira.
    const { sql } = await import("./db.ts");

    const consulta = sql`
      select public.check_rate_limit(${bucketKey}, ${maxRequests}, ${windowSeconds}) as allowed
    `.then(([row]: any[]) => row?.allowed !== false);

    const limite = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => {
        console.error(`[rate-limit] Sem resposta em ${RATE_LIMIT_TIMEOUT_MS}ms -- liberando por padrão (${bucketKey}).`);
        resolve(true);
      }, RATE_LIMIT_TIMEOUT_MS);
    });

    return await Promise.race([consulta, limite]);
  } catch (err) {
    console.error("[rate-limit] Falha ao consultar check_rate_limit -- liberando por padrão:", err);
    return true;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
