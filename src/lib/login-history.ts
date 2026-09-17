// =========================================================================
// [REFACTOR E4]: Telemetria Segura, Zero LocalStorage e Alinhada com a Borda
// =========================================================================

// Configuração central do Storage (Session, para evaporar ao fechar a aba)
const STORAGE = typeof window !== "undefined" ? sessionStorage : null;
const LAST_LOG_KEY = "sbx.login.last";


export type LoginHistoryEvent = "login" | "refresh" | "logout" | "failed_attempt" | "blocked";

// O e-mail é consumido apenas em memória (hash para o throttle) e não trafega no payload
type LogLoginHistoryInput = {
  email: string; // Usado apenas em memória: vira hash SHA-256 para o throttle local (nunca persistido)
  event: LoginHistoryEvent;
  success?: boolean;
  failureReason?: string | null;
  occurredAt?: string;
};

// =========================================================================
// [FUNÇÕES AUXILIARES DE STORAGE HIGIENIZADO]
// =========================================================================

// =========================================================================
// [ZERO PII]: O e-mail nunca é persistido. O throttle usa um hash SHA-256
// (irreversível) apenas para diferenciar usuários dentro da mesma aba.
// =========================================================================
async function hashEmail(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();

  if (typeof crypto === "undefined" || !crypto.subtle) {
    return "nohash";
  }

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Trava de 5 minutos AGORA POR USUÁRIO (identificado por hash, nunca pelo e-mail)
function shouldLogEvent(emailHash: string, event: LoginHistoryEvent): boolean {
  if (!STORAGE) return true;
  const lastLogRaw = STORAGE.getItem(LAST_LOG_KEY);
  if (!lastLogRaw) return true;

  try {
    const lastLog = JSON.parse(lastLogRaw);
    // Só bloqueia se for o mesmo evento E O MESMO USUÁRIO em menos de 5 min
    if (lastLog.hash === emailHash && lastLog.event === event && Date.now() - lastLog.time < 5 * 60 * 1000) {
      return false;
    }
  } catch (e) {
    // Ignora erro de parse
  }
  return true;
}

// =========================================================================
// [ZERO STORAGE ÓRFÃO]: a antiga fila `sbx.login.queue` foi removida — nenhum
// consumidor a drenava, então só acumulava dados no sessionStorage. Falhas de
// telemetria agora são descartadas (visíveis apenas em DEV).
// =========================================================================


/**
 * Envia o evento mapeando EXATAMENTE para o que a RPC espera
 *
 * 🛡️ [MIGRADO - 2026-09-17]: antes chamava a Edge Function `log-access` via
 * fetch cru (só com header Authorization). Essa function foi reaproveitada
 * para outro papel (worker de geo, ver `supabase/functions/log-access/index.ts`)
 * e o registro de evento passou pra RPC Postgres `public.log_access_event`
 * (migration `20260917120000_create_log_access_event_rpc.sql`), que lê
 * IP/país direto dos headers da própria requisição PostgREST e a identidade
 * via `auth.email()` — não depende mais de nenhuma Edge Function no meio do
 * caminho. Mantido como fetch cru (sem importar o client completo do
 * Supabase) pra preservar o isolamento de token que este arquivo já tinha —
 * só que agora contra o endpoint REST de RPC do PostgREST, que exige o
 * header `apikey` além do `Authorization` (diferente da Edge Function
 * antiga, que só exigia o Bearer).
 */
async function postEvent(payload: LogLoginHistoryInput, accessToken: string): Promise<boolean> {
  try {
    // MAPEAMENTO CORRETO PARA A RPC (parâmetros nomeados `p_*`)
    const rpcPayload = {
      p_event: payload.event,
      p_success: payload.success,
      p_origin_page: typeof window !== "undefined" ? window.location.pathname : null,
      p_origin_function: "logLoginHistoryEvent",
      p_failure_reason: payload.failureReason,
    };

    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/log_access_event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY, // exigido pelo Kong/PostgREST da Supabase
        Authorization: `Bearer ${accessToken}`, // Token isolado e seguro no Header
      },
      body: JSON.stringify(rpcPayload), // Envia SEM o email (RPC lê de auth.email())
    });
    return res.ok;
  } catch {
    return false;
  }
}

// =========================================================================
// [FUNÇÃO PRINCIPAL]
// =========================================================================

export async function logLoginHistoryEvent(
  input: LogLoginHistoryInput,
  accessToken: string,
): Promise<{ success: boolean }> {
  // 1. Throttle seguro (Lendo do SessionStorage e checando por HASH do e-mail)
  const emailHash = await hashEmail(input.email);

  if (input.event === "login" && !shouldLogEvent(emailHash, input.event)) {
    return { success: true };
  }

  // 2. Chama o postEvent que faz a ponte e isola o Token
  const ok = await postEvent(input, accessToken);

  if (ok && input.event === "login") {
    // 3. Salva APENAS o hash no sessionStorage para a trava local funcionar (Zero PII)
    if (STORAGE) {
      STORAGE.setItem(
        LAST_LOG_KEY,
        JSON.stringify({
          hash: emailHash,
          event: input.event,
          time: Date.now(),
        }),
      );
    }
  }

  if (!ok && import.meta.env.DEV) {
    // 4. Sem fila persistida: apenas sinaliza a falha em desenvolvimento.
    console.warn("[login-history] falha ao registrar evento:", input.event);
  }


  return { success: ok };
}