// =========================================================================
// [REFACTOR E4]: Telemetria Segura, Zero LocalStorage e Alinhada com a Borda
// =========================================================================

// Configuração central do Storage (Session, para evaporar ao fechar a aba)
const STORAGE = typeof window !== "undefined" ? sessionStorage : null;
const LAST_LOG_KEY = "sbx.login.last";
const QUEUE_KEY = "sbx.login.queue";

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

// Fila de retry segura (Zero Tokens)
function enqueue(payload: any) {
  if (!STORAGE) return;
  const queue = JSON.parse(STORAGE.getItem(QUEUE_KEY) || "[]");
  queue.push(payload);
  STORAGE.setItem(QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Envia o evento mapeando EXATAMENTE para o que a Edge Function espera
 */
async function postEvent(payload: LogLoginHistoryInput, accessToken: string): Promise<boolean> {
  try {
    // MAPEAMENTO CORRETO PARA O BACKEND
    const backendPayload = {
      event: payload.event,
      success: payload.success,
      reason: payload.failureReason, // 👈 CORREÇÃO: Traduz failureReason para reason
      origin_page: typeof window !== "undefined" ? window.location.pathname : null,
      origin_function: "logLoginHistoryEvent",
    };

    // Ajuste a URL se necessário (ex: se usar proxy do Vite, mude para "/api/loginhistory")
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/login-history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`, // Token isolado e seguro no Header
      },
      body: JSON.stringify(backendPayload), // Envia SEM o email (backend lê do JWT)
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

  if (!ok) {
    // 4. A Fila de Retry recebe APENAS metadata higienizado. Zero Tokens. Zero E-mail.
    enqueue({
      event: input.event,
      success: input.success,
      failureReason: input.failureReason,
      queuedAt: Date.now(),
      attempts: 1,
    });
  }

  return { success: ok };
}
