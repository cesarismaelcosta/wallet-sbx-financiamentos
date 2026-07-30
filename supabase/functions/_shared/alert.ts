/**
 * =========================================================================
 * UTILITY: CENTRALIZED SYSTEM ALERTS
 * =========================================================================
 * @module _shared/alert
 * @description Helper global para disparar telemetria de erros e falhas de comunicação
 * para a Edge Function 'notification-system-message'.
 */

import { debugLog } from "./logger.ts";

interface AlertPayload {
  context: string;
  message: string;
  subject?: string;
  visitId?: string | null;
  visitUpdateId?: string | null;
  simulationId?: string | null;
  simulationUpdateId?: string | null;
  rawPayload?: any;
}

/**
 * Dispara de forma assíncrona um alerta de sistema para a Outbox.
 * 
 * @param params - Objeto contendo os metadados do erro e contexto.
 */
export async function sendSystemAlert(params: AlertPayload): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      console.error("[ALERT_ERROR] Variáveis de ambiente do Supabase ausentes.");
      return;
    }

    // Chamada HTTP assíncrona para a Edge Function central de notificações
    // Disparo estrito: envia EXATAMENTE os 8 campos exigidos pelo contrato de ingestão
    await fetch(`${supabaseUrl}/functions/v1/notification-system-message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`
      },
      body: JSON.stringify({
        context: params.context,
        subject: params.subject || `Alerta de Sistema: ${params.context} ⚠️`,
        message: params.message,
        visit_id: params.visitId || null,
        visit_update_id: params.visitUpdateId || null,
        simulation_id: params.simulationId || null,
        simulation_update_id: params.simulationUpdateId || null,
        raw_payload: params.rawPayload || {
          timestamp: new Date().toISOString()
        }
      })
    });
  } catch (err: any) {
    debugLog("[CRITICAL] Falha ao despachar alerta para 'notification-system-message':", err.message);
  }
}