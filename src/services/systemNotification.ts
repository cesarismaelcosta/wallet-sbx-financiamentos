/**
 * @fileoverview Serviço: Notification System
 * @path src/services/notification.ts
 * 
 * =========================================================================
 * [ARQUITETURA HÍBRIDA & LOGGING ASSÍNCRONO]
 * =========================================================================
 * Centraliza o envio de logs de erro técnicos para a Edge Function.
 * Integrado ao `session.ts` para respeitar o isolamento de rede:
 * - Em Produção: Envia a requisição anexando o Cookie HttpOnly (`fetchOptions`).
 * - Em Desenvolvimento: Injeta os headers de token manualmente via `authHeaders()`.
 * 
 * @author Cesar Ismael Pereira da Costa
 * @version 2.1.0
 */

import { fetchOptions, authHeaders } from './session.ts';

export interface SystemErrorPayload {
  context: string;
  subject?: string;
  message?: any;
  payload?: any;
  visit_id?: string | null;
  visit_update_id?: string | null;
  simulation_id?: string | null;
  simulation_update_id?: string | null;
  details?: any;
}

/**
 * Envia um payload de erro para o serviço de notificação centralizado de forma assíncrona.
 * Suporta tanto o envio direto por objeto quanto a assinatura estendida (status/usuário + payload).
 * 
 * @param {string | SystemErrorPayload} arg1 - Status da sessão/usuário ou o objeto completo de erro.
 * @param {SystemErrorPayload} [arg2] - Objeto detalhado do erro (caso o primeiro argumento seja uma string).
 */
export const logSystemError = async (
  arg1: string | SystemErrorPayload,
  arg2?: SystemErrorPayload
): Promise<void> => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return;

  // =========================================================================
  // [NORMALIZAÇÃO CONTRATUAL]: Compatibiliza chamadas legadas e diretas
  // =========================================================================
  let errorData: SystemErrorPayload;

  if (typeof arg1 === 'string') {
    // Caso seja chamado com 2 argumentos: logSystemError("STATUS", { context, message, ... })
    errorData = {
      context: arg2?.context || 'UNKNOWN_CONTEXT',
      subject: arg2?.subject || 'Alerta de Erro no Sistema',
      message: arg2?.message || 'Falha não especificada.',
      ...(arg2 || {}),
      payload: {
        auth_status_or_user: arg1,
        ...(arg2?.payload || {})
      }
    };
  } else {
    // Caso seja chamado com 1 argumento (Objeto direto): logSystemError({ context, message, ... })
    errorData = arg1;
  }

  // [FAILSAFE DE BORDA]: Garante que os campos contratuais obrigatórios nunca vão nulos
  if (!errorData.context) errorData.context = 'UNKNOWN_CONTEXT';
  if (!errorData.message) errorData.message = 'Falha não especificada na requisição.';

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/notification-system-message`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${supabaseAnonKey}`,
        "apikey": supabaseAnonKey,
        "Content-Type": "application/json",
        ...authHeaders() // Injeta o token via header estritamente em ambiente DEV/Cross-Origin
      },
      ...fetchOptions, // Garante credentials: 'include' em Produção para o navegador mandar o Cookie HttpOnly
      body: JSON.stringify(errorData),
    });

    if (!response.ok) {
      console.warn("⚠️ [NotificationService] Servidor retornou erro ao registrar log:", response.status);
    }
  } catch (err) {
    // [SILENT FAIL]: Logs de erro nunca devem quebrar a experiência ou o fluxo do usuário
    console.error("🚨 [NotificationService] Falha de rede ao despachar log de erro:", err);
  }
};