/**
 * @file financial-gateway-webhook/index.ts
 * @description Gateway especializado para recepção de Webhooks de parceiros financeiros.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { tratarWebhookFandi } from './fandi-service.ts';
import { withSecurity } from "../_shared/server.ts";
import { generateSignature } from "../_shared/crypto.ts"; // <-- Importe sua função aqui

const DEBUG_MODE = true;
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[WEBHOOK-GATEWAY] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

// ID Oficial da empresa MeResolve (Fandi)
const MERESOLVE_PARTNER_ID = 2; 

serve(withSecurity('webhook-gateway', async (req: Request) => {
  try {
    const url = new URL(req.url);
    const pathname = url.pathname.toLowerCase();

    debugLog(`Recebido: ${req.method} em ${pathname}`);

    // 1. EXTRAÇÃO DINÂMICA
    const pathParts = pathname.split("/").filter(Boolean);
    
    const partnerIndex = pathParts.findIndex(part => part === "fandi");
    const partner = partnerIndex !== -1 ? pathParts[partnerIndex] : null;
    const simulationId = partnerIndex !== -1 ? pathParts[partnerIndex + 1] : null;
    const receivedSignature = partnerIndex !== -1 ? pathParts[partnerIndex + 2] : null;

    // 2. ROTEAMENTO E SEGURANÇA
    switch (partner) {
      case "fandi":
        if (!simulationId || !receivedSignature) {
          debugLog("Acesso negado: Credenciais ausentes na URL.");
          return { status: 401, data: { error: "Credenciais de segurança ausentes." } };
        }
        
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
        const supabase = createClient(supabaseUrl, supabaseKey);

        // Busca o visit_id para o hash e o partner_id para a barreira Cross-Tenant
        // IMPORTANTE: Ajuste 'partner_id' abaixo se a sua coluna tiver outro nome
        const { data: simulation, error: dbError } = await supabase
          .from('simulations')
          .select('visit_id, partner_id') 
          .eq('visit_id', visitId)
          .single();

        if (dbError || !simulation) {
          debugLog(`Alerta: Simulação ${simulationId} não localizada.`);
          return { status: 404, data: { error: "Simulação não encontrada." } };
        }

        // 🛡️ BARREIRA CROSS-TENANT
        if (simulation.partner_id !== MERESOLVE_PARTNER_ID) {
          console.error(`[ALERTA] Simulação ${simulationId} não pertence à MeResolve!`);
          return { status: 403, data: { error: "Acesso negado. Conflito de propriedade." } };
        }

        // 🛡️ PROVA CRIPTOGRÁFICA HMAC SHA-256
        const MASTER_SECRET = Deno.env.get('WEBHOOK_MASTER_SECRET');
        if (!MASTER_SECRET) throw new Error("A variável WEBHOOK_MASTER_SECRET não foi configurada.");

        // Assinatura esperada: "fandi:visit123...:sim456..."
        const expectedPayload = `${simulation.visit_id}:${simulation.simulationId}`;
        const expectedSignature = await generateSignature(expectedPayload, MASTER_SECRET);

        if (receivedSignature !== expectedSignature) {
          console.error(`[SEGURANÇA] Violação HMAC! Assinatura inválida para: ${simulationId}`);
          return { status: 403, data: { error: "Acesso negado. Falha de integridade." } };
        }

        debugLog(`Segurança validada. Delegando para Service Fandi.`);
        
        // 3. EXECUÇÃO
        const result = await tratarWebhookFandi(simulationId, req);
        return { status: 200, data: result };

      default:
        debugLog(`Tentativa de acesso em rota não mapeada: ${partner}`);
        return { status: 404, data: { error: "Parceiro financeiro não reconhecido." } };
    }

  } catch (err: any) {
    console.error("[WEBHOOK-GATEWAY CRITICAL ERROR]:", err.message);
    return {
      status: 500,
      data: { error: err.message, details: "Falha no pipeline de recepção." }
    };
  }
}));