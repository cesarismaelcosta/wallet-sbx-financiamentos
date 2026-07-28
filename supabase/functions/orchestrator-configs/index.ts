/**
 * @fileoverview EDGE FUNCTION: Orchestrator Configs (Consulta Segura de Rotas)
 * @path supabase/functions/orchestrator-configs/index.ts
 * 
 * ============================================================================
 * ARQUITETURA DE REDE E ROTEAMENTO (sbX Core - Módulo de Configuração)
 * ============================================================================
 * Este módulo fornece acesso protegido, restrito e isolado (backend-to-database) 
 * às configurações de rotas, regras de negócio, FAQs, offer_panel e consentimentos 
 * armazenados na tabela `orchestrator_configs`.
 * 
 * - MODO LEITURA (GET): Hidrata componentes e drawers do front-end com base no 
 *   contexto do produto/lookup e perfil do cliente (PF/PJ), replicando a cascata 
 *   de prioridade oficial do orquestrador principal.
 * 
 * @author César Ismael Pereira da Costa
 * @description Single Source of Truth para metadados e regras de páginas do ecossistema sbX.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateRequest } from "../_shared/auth.ts";
import { withSecurity } from "../_shared/server.ts";
import { debugLog } from "../_shared/logger.ts";

/**
 * ============================================================================
 * HELPER FUNCTIONS (Motor de Decisão e Cascata Hierárquica)
 * ============================================================================
 */

/**
 * @function resolveOrchestratorConfigs
 * @description Réplica exata da lógica de cascata do orquestrador principal.
 * Opera via "Filtro de Prioridade (Cascata)": PRODUCT > EVENT > SELLER > CATEGORY,
 * validando estritamente o perfil da entidade (PF vs PJ vs PF+PJ) e o status ativo.
 * 
 * @param {any} supabase - Cliente Supabase com privilégios de Service Role.
 * @param {any} lookupId - Identificador de busca (product_id ou category_id).
 * @param {string} [entityDocument] - Documento da entidade para definição de perfil.
 * @param {string} [entityType] - Tipo explícito da entidade ("F" ou "J").
 * @returns {Promise<any|null>} O registro de configuração correspondente ou nulo.
 */
async function resolveOrchestratorConfigs(
  supabase: any,
  lookupId: any,
  entityDocument?: string,
  entityType?: "F" | "J" | string,
) {
  // 1. Higienização e Determinação do Perfil (PF vs PJ)
  const cleanDoc = String(entityDocument || "").replace(/\D/g, "");
  const isPJ = cleanDoc.length === 14 || entityType === "J";
  const currentProfile = isPJ ? "PJ" : "PF";

  // 2. Ordem de prioridade oficial da arquitetura sbX
  const priorityTypes = ["PRODUCT", "EVENT", "SELLER", "CATEGORY"];

  // 3. Execução da Cascata de Prioridade
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

  // 4. Fallback de Segurança (Caso o perfil não restrinja estritamente)
  const { data: fallbackData, error: fallbackError } = await supabase
    .from("orchestrator_configs")
    .select("*")
    .eq("lookup_id", Number(lookupId))
    .eq("is_active", true)
    .maybeSingle();

  if (!fallbackError && fallbackData) {
    debugLog(`[resolveOrchestratorConfigs] Match obtido via fallback geral para ID: ${lookupId}`);
    return fallbackData;
  }

  return null;
}

/**
 * ============================================================================
 * HANDLER PRINCIPAL (E/S SEGURA DE CONFIGURAÇÕES DE ROTA)
 * ============================================================================
 */
serve(withSecurity('orchestrator-configs', async (req: Request) => {
  // Captura preventiva dos headers de rastreio e fallback no milissegundo zero
  const originPath = req.headers.get("x-original-url") || "/";
  const authPath = req.headers.get("x-auth-fallback-url") || "/";

  try {
    // 1. Restrição Estrita de Método HTTP (Apenas Leitura via GET)
    if (req.method !== "GET") {
      return {
        status: 405,
        data: { success: false, code: "METHOD_NOT_ALLOWED", message: "Método HTTP não permitido." }
      };
    }

    // =========================================================================
    // 2. SEGURANÇA: Validação de Identidade (Padrão SbX Core)
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

    // =========================================================================
    // 3. EXTRACÃO DE PARÂMETROS DA URL
    // =========================================================================
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

    // =========================================================================
    // 4. CONEXÃO SEGURA COM O BANCO DE DADOS (Service Role Privileged)
    // =========================================================================
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // =========================================================================
    // 5. HIDRATAÇÃO DO PERFIL DO USUÁRIO (Se necessário)
    // =========================================================================
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

    // =========================================================================
    // 6. RESOLUÇÃO DE CONFIGURAÇÕES VIA MOTOR DE CASCATA
    // =========================================================================
    const configData = await resolveOrchestratorConfigs(supabase, lookupId, resolvedDoc, resolvedType);

    if (!configData) {
      return {
        status: 404,
        data: { success: false, code: "CONFIG_NOT_FOUND", message: `Nenhuma configuração ativa encontrada para o ID ${lookupId}.` }
      };
    }

    // =========================================================================
    // 7. SANITIZAÇÃO E PARSEAMENTO DE CAMPOS JSON/JSONB
    // =========================================================================
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

    // =========================================================================
    // 8. RETORNO DE SUCESSO ESTRUTURADO (200 OK)
    // =========================================================================
    return {
      status: 200,
      data: {
        success: true,
        data: hydratedConfig
      }
    };

  } catch (err: any) {
    debugLog(`[orchestrator-configs Fatal Error]: ${err.message}`);
    
    // Failsafe de Erro Crítico
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