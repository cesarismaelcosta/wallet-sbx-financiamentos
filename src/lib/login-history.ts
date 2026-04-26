// 1. Adicionamos o novo tipo aqui
export type LoginHistoryEvent =
  | "login"
  | "refresh"    
  | "logout"
  | "failed_attempt"
  | "blocked";

type LogLoginHistoryInput = {
  email: string;
  event: LoginHistoryEvent; // Agora aceita o novo tipo
  success?: boolean;
  failureReason?: string | null;
  accessToken: string;
  occurredAt?: string;
};

// ... (resto das funções auxiliares: readQueue, writeQueue, enqueue, postEvent)

export async function logLoginHistoryEvent(
  input: LogLoginHistoryInput,
): Promise<{ success: boolean }> {
  
  // 2. A lógica agora diferencia o tratamento
  // Se for "login" (manual), mantemos a trava de 5 minutos
  // Se for "refresh" (automático), podemos logar ou ignorar conforme sua preferência
  if (input.event === "login" && !shouldLogEvent(input.email, input.event)) {
    return { success: true };
  }

  const payload = {
    ...input,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
  };

  const ok = await postEvent(payload);
  
  if (ok && input.event === "login") {
    localStorage.setItem(LAST_LOG_KEY, JSON.stringify({
      email: input.email,
      event: input.event,
      time: Date.now()
    }));
  }

  if (!ok) {
    enqueue({ ...payload, queuedAt: Date.now(), attempts: 1 });
  }
  return { success: ok };
}