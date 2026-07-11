/**
 * @fileoverview Serviço: Notification System
 * Centraliza a chamada para a Edge Function de notificações de sistema.
 * --------------------------------------------------------------------------------
 * 1. OBJETIVO: Registrar logs de erro técnicos de forma assíncrona.
 * 2. PADRÃO: Utiliza fetch nativo com headers de identidade (session-token).
 * 3. SEGURANÇA: Comunicação via Supabase Edge Function com AnonKey.
 * --------------------------------------------------------------------------------
 * @author Cesar Ismael Pereira da Costa
 * @version 1.0.0
 */

export interface SystemErrorPayload {
  context: string;
  message: string;
  details?: any;
  payload?: any;
  visit_id?: string | null;
  visit_update_id?: string | null;
  simulation_id?: string | null;
  simulation_update_id?: string | null;
}

/**
 * @function logSystemError
 * @description Envia um payload de erro para o serviço de notificação centralizado.
 * @param sessionToken - Token de sessão do usuário para identificação de contexto.
 * @param errorData - Objeto contendo os detalhes do erro e IDs de rastreio.
 */
export const logSystemError = async (
  sessionToken: string,
  errorData: SystemErrorPayload
): Promise<void> => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/notification-system-message`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseAnonKey}`,
        "apikey": supabaseAnonKey,
        "x-session-token": sessionToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(errorData),
    });

    if (!response.ok) {
      console.error("Falha ao registrar log de erro no servidor:", response.statusText);
    }
  } catch (err) {
    // Falha silenciosa: logs de erro não devem interromper o fluxo principal do usuário
    console.error("[SERVICE-NOTIFICATION ERROR]:", err);
  }
};