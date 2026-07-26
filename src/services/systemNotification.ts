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
 * @version 2.0.0
 */

import { fetchOptions, authHeaders } from './session.ts';

export interface SystemErrorPayload {
  context: string;
  subject: string;
  message?: any;
  payload?: any;
  visit_id?: string | null;
  visit_update_id?: string | null;
  simulation_id?: string | null;
  simulation_update_id?: string | null;
}

/**
 * Envia um payload de erro para o serviço de notificação centralizado de forma assíncrona.
 * 
 * @param {SystemErrorPayload} errorData - Objeto contendo os detalhes do erro e IDs de rastreio.
 */
export const logSystemError = async (
  errorData: SystemErrorPayload
): Promise<void> => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) return;

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