/**
 * @file fandi-service.ts
 * @description Motor de processamento assíncrono para retornos da Fandi (MeResolve).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { captureInfrastructure } from "../_shared/infrastructure.ts";

const DEBUG_MODE = true;
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[FANDI-SERVICE] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

export async function tratarWebhookFandi(simulationId: string, req: Request) {
  // 1. CAPTURA DE INFRAESTRUTURA (Single Source of Truth)
  const infra = await captureInfrastructure(req);

  // 2. PARSE DO PAYLOAD
  let body: any;
  try {
    body = await req.json();
  } catch (e) {
    debugLog("ERRO CRÍTICO: Payload do Webhook inválido.");
    throw new Error("Invalid JSON Payload");
  }

  debugLog("Payload recebido e decodificado", body);

  // 3. NORMALIZAÇÃO (Case Insensitivity)
  const s = body.Simulacao || body.simulacao; 
  const v = body.Veiculo || body.veiculo;     
  const c = body.Cliente || body.cliente;     
  
  const bacenOriginal = s?.CodigoBacen || s?.codigoBacen;
  const codigoProposta = body.CodigoProposta || body.codigoProposta;

  // 4. SUPABASE CLIENT
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 5. REGRAS DE STATUS
  const statusFinalId = bacenOriginal ? 1 : 2;
  const financialInstId = bacenOriginal ? parseInt(bacenOriginal, 10) : null;

  debugLog(`Bacen: ${bacenOriginal} -> Status Final: ${statusFinalId}`);

  // 6. TRILHA DE AUDITORIA
  const { error: logError } = await supabase.from('simulation_updates').insert({
    simulation_id: simulationId,
    operation: 'UPDATE',
    status_id: statusFinalId,
    stage_id: 2, 
    ip_address: infra.ip_address,
    country: infra.country,
    state: infra.state,
    city: infra.city,
    user_agent: infra.user_agent,
    device_type: infra.device_type,
    operating_system: infra.operating_system,
    origin_details: infra,
    financial_institution_id: financialInstId,
    simulation_details: {
      installments: s?.QuantidadeParcelas || s?.quantidadeParcelas,
      down_payment: s?.ValorEntrada || s?.valorEntrada,
      requested_value: v?.Valor || v?.valor,
      installment_value: s?.ValorParcela || s?.valorParcela,
      financial_institution_name: s?.NomeIF || s?.nomeIF,
      status_fandi: statusFinalId,
      updated_at: new Date().toISOString()
    },
    raw_payload: body 
  });

  if (logError) debugLog("FALHA AO INSERIR AUDITORIA", logError);

  // 7. UPDATE DA SIMULAÇÃO
  const { error: updateError } = await supabase
    .from('simulations')
    .update({ 
      status_id: statusFinalId, 
      financial_institution_id: financialInstId,
      updated_at: new Date().toISOString() 
    })
    .eq('id', simulationId);

  if (updateError) {
    debugLog("ERRO NO UPDATE FINAL", updateError);
    throw new Error("Database Update Failed");
  }

  debugLog("Processamento finalizado", simulationId);

  return { success: true, fandi_id: codigoProposta, status_applied: statusFinalId };
}