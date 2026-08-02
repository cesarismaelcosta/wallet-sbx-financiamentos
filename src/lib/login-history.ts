// =========================================================================
// [REFACTOR E4]: Telemetria Segura, Zero LocalStorage e Alinhada com a Borda
// =========================================================================

// Configuração central do Storage (Session, para evaporar ao fechar a aba)
const STORAGE = typeof window !== "undefined" ? sessionStorage : null;
const LAST_LOG_KEY = "sbx.login.last";
const QUEUE_KEY = "sbx.login.queue"; 

export type LoginHistoryEvent = "login" | "refresh" | "logout" | "failed_attempt" | "blocked";

// A TIPAGEM CORRETA: Precisa do email para o cache local, mas sem o accessToken
type LogLoginHistoryInput = {
  email: string; // OBRIGATÓRIO: Usado apenas no cache do navegador para não bloquear usuários diferentes
  event: LoginHistoryEvent;
  success?: boolean;
  failureReason?: string | null;
  occurredAt?: string;
};

// =========================================================================
// [FUNÇÕES AUXILIARES DE STORAGE HIGIENIZADO]
// =========================================================================

// Trava de 5 minutos AGORA POR USUÁRIO
function shouldLogEvent(email: string, event: LoginHistoryEvent): boolean {
  if (!STORAGE) return true;
  const lastLogRaw = STORAGE.getItem(LAST_LOG_KEY);
  if (!lastLogRaw) return true;

  try {
    const lastLog = JSON.parse(lastLogRaw);
    // Só bloqueia se for o mesmo evento E O MESMO USUÁRIO em menos de 5 min
    if (lastLog.email === email && lastLog.event === event && (Date.now() - lastLog.time) < 5 * 60 * 1000) {
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
      origin_function: "logLoginHistoryEvent"
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
  
  // 1. Throttle seguro (Lendo do SessionStorage e checando pelo E-MAIL)
  if (input.event === "login" && !shouldLogEvent(input.email, input.event)) {
    return { success: true };
  }

  // 2. Chama o postEvent que faz a ponte e isola o Token
  const ok = await postEvent(input, accessToken);

  if (ok && input.event === "login") {
    // 3. Salva o e-mail no sessionStorage APENAS para a trava local funcionar
    if (STORAGE) {
      STORAGE.setItem(
        LAST_LOG_KEY,
        JSON.stringify({
          email: input.email,
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
      attempts: 1 
    });
  }
  
  return { success: ok };
}