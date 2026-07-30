/**
 * @fileoverview Serviço: Notification System
 * @path src/services/notification.ts
 * 
 * =========================================================================
 * [ARQUITETURA HÍBRIDA & LOGGING ASSÍNCRONO]
 * =========================================================================
 * Centraliza o envio de logs de erro técnicos para a Edge Function.
 * Padrão contratual único: raw_payload.
 */

import { fetchOptions, authHeaders } from './session.ts';

export interface SystemErrorPayload {
  context: string;
  subject?: string;
  message?: any;
  raw_payload?: any;
  visit_id?: string | null;
  visit_update_id?: string | null;
  simulation_id?: string | null;
  simulation_update_id?: string | null;
}

/**
 * Envia um payload de erro para o serviço de notificação de forma assíncrona.
 * 
 * @param {string | SystemErrorPayload} errorOrStatus - Status da sessão/usuário ou o objeto completo de erro.
 * @param {SystemErrorPayload} [payloadDetails] - Objeto detalhado do erro (caso o primeiro argumento seja uma string).
 */
export const logSystemError = async (
  errorOrStatus: string | SystemErrorPayload,
  payloadDetails?: SystemErrorPayload
): Promise<void> => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return;

  let errorData: SystemErrorPayload;

  if (typeof errorOrStatus === 'string') {
    errorData = {
      context: payloadDetails?.context || 'UNKNOWN_CONTEXT',
      subject: payloadDetails?.subject || 'Alerta de Erro no Sistema',
      message: payloadDetails?.message || 'Falha não especificada.',
      ...(payloadDetails || {}),
      raw_payload: {
        auth_status_or_user: errorOrStatus,
        ...(payloadDetails?.raw_payload || {})
      }
    };
  } else {
    errorData = errorOrStatus;
  }

  if (!errorData.context) errorData.context = 'UNKNOWN_CONTEXT';
  if (!errorData.message) errorData.message = 'Falha não especificada na requisição.';

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/notification-system-message`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseAnonKey}`,
        "apikey": supabaseAnonKey,
        "Content-Type": "application/json",
        ...authHeaders()
      },
      ...fetchOptions,
      body: JSON.stringify(errorData),
    });

    if (!response.ok) {
      console.warn("⚠️ [NotificationService] Servidor retornou erro ao registrar log:", response.status);
    }
  } catch (err) {
    console.error("🚨 [NotificationService] Falha de rede ao despachar log de erro:", err);
  }
};