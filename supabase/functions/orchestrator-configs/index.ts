/**
 * @fileoverview EDGE FUNCTION: Orchestrator Configs (Consulta Segura de Rotas)
 * @path supabase/functions/orchestrator-configs/index.ts
 * 
 * @description Copia a lógica exata de hierarquia e resolução de regras do orquestrador principal 
 *              para fornecer as configurações de rotas, regras, FAQs, offer_panel e consentimentos.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateRequest } from "../_shared/auth.ts";
import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";

/**
 * @function resolveOrchestratorConfigs
 * @description Mesma lógica de cascata e prioridade do orquestrador principal.
 */
async function resolveOrchestratorConfigs(
  supabase: any,
  lookupId: any,
  entityDocument?: string,
  entityType?: "F" | "J" | string,
) {
  const cleanDoc = String(entityDocument || "").replace(/\D/g, "");
  const isPJ = cleanDoc.length === 14 || entityType === "J";
  const currentProfile = isPJ ? "PJ" : "PF";

  // Ordem de prioridade oficial da arquitetura sbX
  const priorityTypes = ["PRODUCT", "EVENT", "SELLER", "CATEGORY"];

  for (const configType of priorityTypes) {
    debugLog(`[resolveOrchestratorConfigs] Tentando match para lookup_id: ${lookupId} com tipo: ${configType} para perfil: ${currentProfile}`);
    
    const { data, error } = await supabase
      .from("orchestrator_configs")
      .select("*")
      .eq("lookup_id", Number(lookupId))
      .eq("config_type", configType)
      .eq("is_active", true)
      .in("entity_type", [currentProfile, "PF+PJ"])
      .maybeSingle();

    if (!error && data) {
      debugLog(`[resolveOrchestratorConfigs] Match cravado via tipo: ${configType}`);
      return data;
    }
  }

  // Fallback de segurança caso o perfil venha vazio
  const { data: fallbackData, error: fallbackError } = await supabase
    .from("orchestrator_configs")
    .select("*")
    .eq("lookup_id", Number(lookupId))
    .eq("is_active", true)
    .maybeSingle();

  if (!fallbackError && fallbackData) {
    return fallbackData;
  }

  return null;
}

serve(withSecurity('orchestrator-configs', async (req: Request) => {
  try {
    if (req.method !== "GET") {
      return {
        status: 405,
        data: { success: false, code: "METHOD_NOT_ALLOWED", message: "Método HTTP não permitido." }
      };
    }

    // Validação de Identidade (Segurança padrão da sbX)
    let auth;
    try {
      auth = await validateRequest(req);
    } catch (err: any) {
      return {
        status: 401,
        data: { success: false, code: "UNAUTHORIZED", message: err.message || "Não autorizado." }
      };
    }

    const url = new URL(req.url);
    const lookupId = url.searchParams.get("lookup_id") || url.searchParams.get("product_id");
    const entityType = url.searchParams.get("entity_type");
    const entityDocument = url.searchParams.get("entity_document");

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

    // Executa a resolução baseada na mesma hierarquia do orquestrador
    const configData = await resolveOrchestratorConfigs(supabase, lookupId, entityDocument, entityType);

    if (!configData) {
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