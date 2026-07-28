/**
 * @fileoverview EDGE FUNCTION: Orchestrator Configs (Consulta Segura de Rotas)
 * @path supabase/functions/orchestrator-configs/index.ts
 * 
 * @description Fornece acesso protegido e restrito às configurações de rotas, 
 *              regras, FAQs, offer_panel e consentimentos da tabela orchestrator_configs.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateRequest } from "../_shared/auth.ts";
import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";

serve(withSecurity('orchestrator-configs', async (req: Request) => {
  try {
    if (req.method !== "GET") {
      return {
        status: 405,
        data: { success: false, code: "METHOD_NOT_ALLOWED", message: "Método HTTP não permitido." }
      };
    }

    // Validação de Identidade (Segurança padrão da sbX)
    try {
      await validateRequest(req);
    } catch (err: any) {
      return {
        status: 401,
        data: { success: false, code: "UNAUTHORIZED", message: err.message || "Não autorizado." }
      };
    }

    const url = new URL(req.url);
    const lookupId = url.searchParams.get("lookup_id") || url.searchParams.get("product_id");

    if (!lookupId) {
      return {
        status: 400,
        data: { success: false, code: "MISSING_PARAMETER", message: "O parâmetro 'lookup_id' ou 'product_id' é obrigatório." }
      };
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    debugLog(`[orchestrator-configs] Buscando configuração para lookup_id: ${lookupId}`);

    // Consulta protegida utilizando a Service Role Key (banco blindado de acessos externos diretos)
    const { data: configData, error } = await supabase
      .from("orchestrator_configs")
      .select("*")
      .eq("lookup_id", Number(lookupId))
      .eq("is_active", true)
      .maybeSingle();

    if (error || !configData) {
      return {
        status: 404,
        data: { success: false, code: "CONFIG_NOT_FOUND", message: `Nenhuma configuração ativa encontrada para o ID ${lookupId}.` }
      };
    }

    // Sanitização e parseamento de campos JSON caso venham como string
    const parseJson = (val: any, fallback: any) => {
      if (!val) return fallback;
      if (typeof val === 'object') return val;
      try { return JSON.parse(val); } catch { return fallback; }
    };

    const hydratedConfig = {
      ...configData,
      integration_details: parseJson(configData.integration_details, {}),
      rules: parseJson(configData.rules, {}),
      consent_configs: parseJson(configData.consent_configs, []),
      page_configs: parseJson(configData.page_configs, {}),
      page_faqs: parseJson(configData.page_faqs, []),
    };

    return {
      status: 200,
      data: {
        success: true,
        data: hydratedConfig
      }
    };

  } catch (err: any) {
    debugLog(`[orchestrator-configs Fatal Error]: ${err.message}`);
    return {
      status: 500,
      data: { success: false, code: "INTERNAL_SERVER_ERROR", message: err.message || "Erro interno ao buscar configuração da rota." }
    };
  }
}));