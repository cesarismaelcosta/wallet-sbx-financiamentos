/**
 * @fileoverview EDGE FUNCTION: Orchestrator Configs (Consulta Segura de Rotas)
 * @path supabase/functions/orchestrator-configs/index.ts
 * 
 * @description Fornece acesso protegido e restrito às configurações de rotas, 
 *              regras, FAQs, offer_panel e consentimentos, respeitando a hierarquia 
 *              e os headers de segurança oficiais da sbX.
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
  // Captura dos headers de rastreio e fallback exatamente como no orquestrador principal
  const originPath = req.headers.get("x-original-url") || "/";
  const authPath = req.headers.get("x-auth-fallback-url") || "/";

  try {
    if (req.method !== "GET") {
      return {
        status: 405,
        data: { success: false, code: "METHOD_NOT_ALLOWED", message: "Método HTTP não permitido." }
      };
    }

    // =========================================================================
    // SEGURANÇA: Validação de Identidade idêntica ao Orquestrador
    // =========================================================================
    let auth;
    try {
      auth = await validateRequest(req);
    } catch (err: any) {
      let userMessage = "Falha de autenticação. Por favor, faça login novamente.";
      let errorCode = "UNAUTHORIZED";
      let fallbackUrl = authPath;
      let statusCode = 401;

      if (err.message.includes("SESSION_EXPIRED")) {
        userMessage = "Sua sessão expirou. Por favor, faça login novamente.";
        errorCode = "SESSION_EXPIRED";
      } else if (err.message.includes("FORBIDDEN")) {
        userMessage = "Você não tem permissão para acessar este recurso.";
        errorCode = "FORBIDDEN";
        fallbackUrl = originPath;
        statusCode = 403;
      }

      return { 
        status: statusCode,
        data: { 
          success: false,
          code: errorCode,
          message: userMessage, 
          fallback_url: fallbackUrl 
        }
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

    // Se o entityDocument não foi passado na query string, podemos opcionalmente buscar o perfil do usuário logado (auth.user_id) na base
    let resolvedDoc = entityDocument;
    let resolvedType = entityType;

    if (!resolvedDoc && auth?.user_id) {
      const { data: entityData } = await supabase
        .from("entities")
        .select("document, entity_type")
        .eq("id", auth.user_id)
        .maybeSingle();

      if (entityData) {
        resolvedDoc = entityData.document;
        resolvedType = entityData.entity_type;
      }
    }

    // Executa a resolução baseada na mesma hierarquia do orquestrador
    const configData = await resolveOrchestratorConfigs(supabase, lookupId, resolvedDoc, resolvedType);

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
      data: { 
        success: false, 
        code: "INTERNAL_SERVER_ERROR", 
        message: err.message || "Erro interno ao buscar configuração da rota.",
        fallback_url: originPath
      }
    };
  }
}));