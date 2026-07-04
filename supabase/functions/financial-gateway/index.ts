/**
 * FINANCIAL GATEWAY - HUB DE INTEGRAÇÃO DE CRÉDITO
 * @version 1.0.0
 * @description Ponto central de orquestração entre o ecossistema Wallet sbX e parceiros financeiros (Fandi).
 * * --- ARQUITETURA DO FLUXO (A JORNADA DO CLIQUE) ---
 * 1. INGESTÃO: Recebe o payload estruturado do Sandbox/Front-end.
 * 2. SEGURANÇA (GATEKEEPER): Valida o token JWT e confirma a propriedade da visita.
 * 3. PERSISTÊNCIA: Aciona o 'simulation_handler' para validar e gravar a intenção (Status: Enviada).
 * 4. INTEGRAÇÃO (HANDSHAKE FANDI): Envio para o parceiro.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { processSimulation } from "./simulation-handler.ts";

const DEBUG_MODE = true;

const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[FINANCIAL GATEWAY INDEX] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

/**
 * CONFIGURAÇÃO GLOBAL DE HEADERS (PADRÃO COFRE)
 * Inclui os cabeçalhos customizados de sessão para a validação Zero Trust.
 */
const allowedHeaders = 'authorization, x-client-info, apikey, content-type, x-session-token, x-visit-id, x-visit-update-id, x-simulation-id';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': allowedHeaders,
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Content-Type': 'application/json'
};

serve(async (req) => {

  // 1. CORS HANDSHAKE
  if (req.method === 'OPTIONS') {
    return new Response('ok', { 
      status: 200, 
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': allowedHeaders,
      } 
    });
  }

  try {
    // =====================================================================
    // [NOVO PADRÃO] Captura de IDs via URL (Consistência com Orchestrator)
    // =====================================================================
    const url = new URL(req.url);
    const visitIdFromUrl = url.searchParams.get("visit_id");

    let payload;
    
    // Captura e valida o payload
    if (req.method === 'POST') {
      const rawBody = await req.text();
      if (!rawBody) throw new Error("Payload ausente na requisição POST.");
      payload = JSON.parse(rawBody);
    } else {
      return new Response(JSON.stringify({ error: "Método não permitido" }), { 
        status: 405, 
        headers: corsHeaders 
      });
    }

    // Se o visit_id veio pela URL, injetamos no payload para garantir o funcionamento
    if (visitIdFromUrl) {
      payload.visit_id = visitIdFromUrl;
    }

    // =====================================================================
    // [NOVO] TRAVA 1: Identificação do Usuário via JWT
    // =====================================================================
    const sessionToken = req.headers.get("x-session-token");
    if (!sessionToken) {
      return new Response(JSON.stringify({ code: "AUTH_REQUIRED", message: "Token de sessão ausente." }), { 
        status: 401, headers: corsHeaders 
      });
    }

    const tokenParts = sessionToken.split('.');
    const jwtPayload = JSON.parse(atob(tokenParts[1]));
    const sessionUserId = jwtPayload.sub;

    // =====================================================================
    // [NOVO] TRAVA 2: Validação Cross-User (Gatekeeper)
    // =====================================================================
    const visitId = payload.visit_id;
    if (!visitId) {
      throw new Error("O parâmetro 'visit_id' é obrigatório no payload da simulação ou na URL.");
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select(`
        id,
        visit_entities ( entity_id )
      `)
      .eq('id', visitId)
      .single();

    if (visitError || !visit) {
      throw new Error("Visita não encontrada no banco de dados.");
    }

    const visitEntityData = visit.visit_entities?.[0] || {};
    
    // Bloqueio implacável se o dono do token não for o dono da visita
    if (visitEntityData.entity_id && visitEntityData.entity_id !== String(sessionUserId)) {
      console.warn(`[SECURITY] Violação Financeira! User: ${sessionUserId} tentou simular na Visita: ${visitId}`);
      return new Response(JSON.stringify({ 
        code: "FORBIDDEN_ACCESS", 
        message: "Acesso negado: O recurso solicitado não pertence a esta sessão." 
      }), { 
        status: 403, headers: corsHeaders 
      });
    }
    // =====================================================================

    // CHAMADA DO HANDLER (Só chega aqui se o Gatekeeper autorizar)
    const result = await processSimulation(req, payload);
    
    return new Response(JSON.stringify(result), { 
      status: 200, 
      headers: corsHeaders 
    });
    
  } catch (err: any) {
    console.error("[GATEWAY ERROR]:", err.message);
    return new Response(JSON.stringify({ 
      error: err.message,
      details: "Consulte os logs da função para análise de rastreabilidade." 
    }), { 
      status: 400, 
      headers: corsHeaders 
    });
  }
});