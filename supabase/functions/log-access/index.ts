/**
 * @fileoverview Resolvedor de Geo Pendente para login_history (Cron Worker)
 * @path supabase/functions/log-access/index.ts
 *
 * ============================================================================
 * [HISTÓRICO — POR QUE ESSE ARQUIVO MUDOU DE FUNÇÃO]
 * ============================================================================
 * Até 2026-09-17, esta pasta (`log-access`) era o endpoint de telemetria/
 * auditoria chamado pelo front-end do backoffice: JWT do Google Auth,
 * allowlist de eventos, rate-limit, staff-check antes de gravar
 * `login_history`. Essa responsabilidade foi migrada para a RPC Postgres
 * `public.log_access_event` (chamada via `supabase.rpc(...)`, autenticada
 * pela própria sessão do PostgREST — sem precisar de uma Edge Function no
 * meio do caminho, já que a RPC lê `current_setting('request.headers')` e
 * `auth.email()` diretamente. Ver migration
 * `20260917120000_create_log_access_event_rpc.sql`).
 *
 * Com o slug de ingestão liberado, esta pasta foi REAPROVEITADA para
 * hospedar o worker de geo — em vez de criar uma Edge Function nova do zero
 * só para isso. O nome ficou "historicamente errado" (não faz mais log de
 * acesso, resolve geo pendente de `login_history`), mas evita manter duas
 * functions deployadas quando uma já estava disponível e livre. Se isso
 * confundir no futuro, dá pra renomear a pasta/slug — mas troque o
 * `registry.ts`, o secret HMAC e o `cron.schedule` junto (ver script de
 * setup abaixo).
 *
 * ============================================================================
 * [O QUE ESTE WORKER FAZ]
 * ============================================================================
 * A RPC `log_access_event` grava `country` a partir do header `cf-ipcountry`
 * (a Cloudflare da própria Supabase entrega de graça em toda requisição),
 * mas NUNCA recebe `cf-ipcity`/`cf-region` (exigiria um plano Cloudflare que
 * não controlamos, já que é a CDN da Supabase, não a nossa). Por isso toda
 * linha nasce com `city = 'N/A'`.
 *
 * Este worker varre periodicamente as linhas com `city = 'N/A'`, resolve o
 * geo via `ip-api.com` (mesmo fallback externo que `_shared/infrastructure.ts`
 * sempre teve) e atualiza o banco — de forma DURÁVEL: se uma execução falhar
 * ou a instância for reciclada no meio do caminho, a linha continua "N/A" e
 * é pega de novo na próxima execução do cron. Nenhuma linha fica presa
 * esperando um `waitUntil` que pode não terminar a tempo.
 *
 * ============================================================================
 * [SEGURANÇA: MESMO MOLDE DO notification-dispatcher]
 * ============================================================================
 * Chamador é o `pg_cron` — não pode guardar segredo em texto no comando SQL
 * (`select * from cron.job` expõe qualquer coisa escrita ali). Por isso a
 * autenticação é HMAC (`requiresHmac` em `registry.ts`, `enforcement:
 * 'wrapper'` — o `server.ts` já valida a assinatura ANTES do handler rodar,
 * usando `_shared/hmac.ts`/`verifyHmacSignature`, o segredo lido do Supabase
 * Vault no lado do cron). Este arquivo não faz nenhuma checagem de auth
 * própria — é tudo centralizado no wrapper, igual ao `notification-dispatcher`.
 * O antigo mecanismo `staff-google-auth` (JWT do Google Auth) que esta rota
 * usava até 2026-09-17 foi REMOVIDO por completo — não sobra nenhum código
 * de autenticação de usuário aqui.
 *
 * @author Cesar Ismael Pereira da Costa
 */

/**
 * SETUP DE INFRAESTRUTURA (rodar uma vez no SQL Editor do projeto):
 * Ver arquivo `login_geo_resolver_cron_setup.sql` entregue junto com esta
 * mudança — cria o segredo no Vault e agenda o `pg_cron` apontando para
 * `.../functions/v1/log-access` (esta mesma function, sob o slug antigo).
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withSecurity } from "../_shared/server.ts";
import { resolveGeoFallback } from "../_shared/infrastructure.ts";
import { debugLog } from "../_shared/logger.ts";

// Teto de linhas processadas por execução (roda a cada 5 min — não precisa
// tentar drenar uma fila acumulada inteira numa única chamada).
const BATCH_LIMIT = 30;
// Teto de chamadas simultâneas ao ip-api.com (mesmo espírito do
// notification-dispatcher: nem serializa tudo, nem estoura em rajada).
const CONCURRENCY = 5;

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

/** Executa `worker` sobre `items` respeitando um teto de concorrência. */
async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  const executing: Promise<void>[] = [];
  for (const item of items) {
    const p = worker(item).then(() => {
      executing.splice(executing.indexOf(p), 1);
    });
    executing.push(p);
    if (executing.length >= limit) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

serve(withSecurity('log-access', async (_req: Request) => {
  debugLog("1. --- GEO RESOLVER (slug log-access) INICIADO ---");

  // Filtra por `city`, não por `country` — a Cloudflare da própria Supabase
  // já entrega país de graça em toda requisição (ver `log_access_event` na
  // migration), então country já costuma vir preenchido desde o insert. O
  // que realmente fica pendente e precisa do fallback externo (ip-api.com)
  // é cidade/estado.
  const { data: pending, error: fetchError } = await supabaseAdmin
    .from('login_history')
    .select('id, ip_address')
    .eq('city', 'N/A')
    .order('created_at', { ascending: true })
    .limit(BATCH_LIMIT);

  if (fetchError) {
    debugLog("Erro ao buscar linhas pendentes:", fetchError);
    return { status: 500, data: { error: "fetch_failed" } };
  }

  if (!pending || pending.length === 0) {
    debugLog("Nenhuma linha com geo pendente.");
    return { status: 200, data: { message: "sem_pendencias" } };
  }

  debugLog(`Encontradas ${pending.length} linhas pendentes. Resolvendo com concorrência ${CONCURRENCY}.`);

  let resolved = 0;
  let stillPending = 0;

  await runWithConcurrency(pending, CONCURRENCY, async (row) => {
    const geo = await resolveGeoFallback(row.ip_address);

    if (!geo) {
      // Continua "N/A" — pega de novo na próxima execução do cron.
      stillPending++;
      return;
    }

    const { error: updateError } = await supabaseAdmin
      .from('login_history')
      .update({ country: geo.country, state: geo.state, city: geo.city })
      .eq('id', row.id);

    if (updateError) {
      debugLog(`Falha ao atualizar geo da linha ${row.id}:`, updateError);
      stillPending++;
      return;
    }

    resolved++;
  });

  debugLog(`Concluído: ${resolved} resolvidas, ${stillPending} ainda pendentes.`);
  return { status: 200, data: { resolved, still_pending: stillPending } };
}));