/**
 * @file financial-gateway-webhook/index.ts
 * @description Gateway especializado para recepção de Webhooks de parceiros financeiros.
 * 
 * PADRÃO DE CHAMADA (Endpoint Dinâmico):
 * O identificador da simulação (UUID) é passado diretamente no path da URL para 
 * garantir o rastreamento, mesmo que o payload do parceiro sofra alterações.
 * 
 * URL Esperada: .../financial-gateway-webhook/[PARCEIRO]/[ID_DA_SIMULACAO]
 * Exemplo: .../financial-gateway-webhook/fandi/2dcf75e3-0e75-4039-ae2f-51c6d578fb18
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { processSimulation } from './fandi-service.ts'; // Correção: A função chama tratarWebhookFandi do fandi-service.ts
import { withSecurity } from "../_shared/server.ts";

/**
 * CONFIGURAÇÕES TÉCNICAS E FLAGS DE AMBIENTE
 */

// Chave de controle para logs de depuração
const DEBUG_MODE = true;

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[WEBHOOK-GATEWAY] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

serve(withSecurity('webhook-gateway', async (req: Request) => {
  try {
    const url = new URL(req.url);
    const pathname = url.pathname.toLowerCase();

    /**
     * 1. LOG DE ENTRADA E RASTREABILIDADE
     * Registra a chegada da requisição sem tocar no stream do corpo (req.json/text),
     * evitando o esgotamento prematuro dos dados que a Service precisará processar.
     */
    debugLog(`[WEBHOOK-GATEWAY] Recebido: ${req.method} em ${pathname}`);

    /**
     * 2. EXTRAÇÃO DINÂMICA DE CONTEXTO
     * Segmenta o path para identificar o parceiro e o simulationId.
     * A lógica baseia-se na posição relativa ao nome do parceiro no array de partes da URL.
     */
    const pathParts = pathname.split("/").filter(Boolean);
    
    // Identifica o parceiro (ex: 'fandi') para validar a origem
    const partnerIndex = pathParts.findIndex(part => part === "fandi");
    const partner = partnerIndex !== -1 ? pathParts[partnerIndex] : null;
    
    // O simulationId deve ser obrigatoriamente o segmento seguinte ao parceiro
    const simulationId = partnerIndex !== -1 ? pathParts[partnerIndex + 1] : null;

    /**
     * 3. ROTEAMENTO DE NEGÓCIO POR PARCEIRO (Switch-Gate)
     * Isola o processamento de cada instituição financeira.
     */
    switch (partner) {
      case "fandi":
        // Validação de segurança: Impede o processamento se o UUID não estiver no path
        if (!simulationId) {
          throw new Error("Simulation ID (UUID) ausente no path da URL.");
        }
        
        debugLog(`[WEBHOOK-GATEWAY] Direcionando callback Fandi para Simulação: ${simulationId}`);
        
        /**
         * DELEGAÇÃO PARA SERVICE:
         * Passamos o simulationId extraído do path e o objeto Request intacto.
         * Isso garante que o 'fandi-service' realize apenas o UPDATE no registro correto.
         */
        const result = await tratarWebhookFandi(simulationId, req);
        return { status: 200, data: result };

      default:
        // Caso a URL não siga o padrão de parceiros cadastrados
        debugLog(`[WEBHOOK-GATEWAY] Tentativa de acesso em rota não mapeada: ${partner}`);
        return {
          status: 404,
          data: { error: "Parceiro ou rota inválida" }
        };
    }

  } catch (err: any) {
    /**
     * TRATAMENTO DE ERROS CRÍTICOS
     * Captura falhas de parsing de URL ou erros internos da service, retornando 500 
     * para sinalizar ao parceiro que a tentativa deve ser reprocessada posteriormente.
     */
    console.error("[WEBHOOK-GATEWAY CRITICAL ERROR]:", err.message);
    return {
      status: 500,
      data: { 
        error: err.message,
        details: "Verifique os logs de execução para análise de rastreabilidade."
      }
    };
  }
}));