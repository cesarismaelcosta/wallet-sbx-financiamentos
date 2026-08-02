// =========================================================================
// [REFACTOR E4]: Telemetria Segura e Zero LocalStorage
// =========================================================================

// Configuração central do Storage (Session, para evaporar ao fechar a aba)
const STORAGE = typeof window !== 'undefined' ? sessionStorage : null;
const LAST_LOG_KEY = 'sbx.login.last';
const QUEUE_KEY = 'sbx.login.queue'; // Assumindo que a função enqueue usa essa chave

export type LoginHistoryEvent =
  | "login"
  | "refresh"    
  | "logout"
  | "failed_attempt"
  | "blocked";

// A TIPAGEM MUDA: Retiramos a exigência de dados sensíveis para gravação local
type LogLoginHistoryInput = {
  // email: string; 👈 REMOVIDO: O backend descobre via JWT. Não precisa trafegar.
  event: LoginHistoryEvent; 
  success?: boolean;
  failureReason?: string | null;
  // accessToken: string; 👈 REMOVIDO DO PAYLOAD: O token deve ser resolvido apenas na hora do fetch
  occurredAt?: string;
};

// =========================================================================
// [FUNÇÕES AUXILIARES DE STORAGE HIGIENIZADO]
// =========================================================================

// Adaptação da sua função shouldLogEvent (agora sem usar email)
function shouldLogEvent(event: LoginHistoryEvent): boolean {
  if (!STORAGE) return true;
  const lastLogRaw = STORAGE.getItem(LAST_LOG_KEY);
  if (!lastLogRaw) return true;
  
  try {
    const lastLog = JSON.parse(lastLogRaw);
    // Trava de 5 minutos apenas para o mesmo tipo de evento
    if (lastLog.event === event && (Date.now() - lastLog.time) < 5 * 60 * 1000) {
      return false;
    }
  } catch (e) {
    // Ignora erro de parse
  }
  return true;
}

// Adaptação segura do seu enqueue (Zero Tokens no disco)
function enqueue(payload: any) {
  if (!STORAGE) return;
  const queue = JSON.parse(STORAGE.getItem(QUEUE_KEY) || '[]');
  queue.push(payload);
  STORAGE.setItem(QUEUE_KEY, JSON.stringify(queue));
}

// =========================================================================
// [FUNÇÃO PRINCIPAL]
// =========================================================================

export async function logLoginHistoryEvent(
  input: LogLoginHistoryInput,
  accessToken: string // 👈 Agora o token é injetado como parâmetro separado e volátil, não entra no payload persistente
): Promise<{ success: boolean }> {
  
  // 1. Throttle seguro (Lendo do SessionStorage e sem comparar e-mail)
  if (input.event === "login" && !shouldLogEvent(input.event)) {
    return { success: true };
  }

  const payload = {
    ...input,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };

  // 2. Passa o token volatilmente para a função que faz o POST (presumo que postEvent monte o Request)
  // Certifique-se de que postEvent envia accessToken no header Authorization e não no body.
  const ok = await postEvent(payload, accessToken); 
  
  if (ok && input.event === "login") {
    // 3. Marcação de tempo limpa e no sessionStorage (Zero PII)
    if (STORAGE) {
      STORAGE.setItem(LAST_LOG_KEY, JSON.stringify({
        event: input.event,
        time: Date.now()
      }));
    }
  }

  if (!ok) {
    // 4. A Fila de Retry recebe APENAS metadata (event, reason, time). Zero Tokens. Zero E-mail.
    enqueue({ ...payload, queuedAt: Date.now(), attempts: 1 });
  }
  return { success: ok };
}