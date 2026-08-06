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
 *   contexto flexível do card (event, seller, product, category) 
 *   e perfil do cliente (PF/PJ), replicando a cascata de prioridade oficial.
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
 * HELPER FUNCTIONS (Motor de Decisão e Cascata Hierárquica Flexível)
 * ============================================================================
 */

/**
 * @function resolveOrchestratorConfigs
 * @description Réplica exata da lógica de cascata adaptada para múltiplos contextos de cards.
 * Opera via "Filtro de Prioridade": EVENT > SELLER > PRODUCT > CATEGORY,
 * validando estritamente o perfil da entidade (PF vs PJ) e o status ativo.
 * 
 * @param {any} supabase - Cliente Supabase com privilégios de Service Role.
 * @param {any} [eventId] - Identificador do Evento.
 * @param {any} [sellerId] - Identificador do Seller.
 * @param {any} [categoryId] - Identificador da Categoria.
 * @param {any} [productId] - Identificador do Produto.
 * @param {string} [entityType] - Tipo explícito da entidade ("F", "J", "PF", "PJ").
 * @returns {Promise<any|null>} O registro de configuração correspondente ou nulo.
 */
async function resolveOrchestratorConfigs(
  supabase: any,
  eventId?: any,
  sellerId?: any,
  categoryId?: any,
  productId?: any,
  entityType?: "F" | "J" | "PF" | "PJ" | string, 
) {
  // 1. Determinação do Perfil Ativo Blindada (PF vs PJ)
  // Corrige o bug caso o input já venha explicitamente como "PJ" ou "PF"
  const currentProfile = (entityType === "J" || entityType === "PJ") ? "PJ" : "PF";

  // 2. Ordem de prioridade oficial da arquitetura sbX cobrindo todos os contextos de cards
  const priorities = [
    { type: "EVENT", id: eventId },
    { type: "SELLER", id: sellerId },
    { type: "PRODUCT", id: productId },
    { type: "CATEGORY", id: categoryId },
  ];

  // 3. Execução da Cascata de Prioridade Baseada no Contexto Disponível
  for (const priority of priorities) {
    if (priority.id && priority.id !== "undefined") {
      debugLog(`[resolveOrchestratorConfigs] Tentando match para tipo: ${priority.type} com ID: ${priority.id} para perfil: ${currentProfile}`);

      const { data, error } = await supabase
        .from("orchestrator_configs")
        .select("*")
        .eq("lookup_id", String(priority.id)) // 👈 Cópia como String garante compatibilidade no DB caso a coluna seja texto/varchar
        .eq("config_type", priority.type)
        .eq("is_active", true)
        .in("entity_type", [currentProfile, "PF+PJ"])
        .maybeSingle();

      if (error) {
        debugLog(`[resolveOrchestratorConfigs] Erro na query: ${error.message}`);
        continue;
      }
      
      if (data) {
        debugLog(`[resolveOrchestratorConfigs] Match cravado via tipo: ${priority.type}`);
        return data;
      }
    }
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
    // 3. EXTRACÃO DE PARÂMETROS DA URL (Contexto Multidimensional de Cards)
    // =========================================================================
    const url = new URL(req.url);
    const eventId = url.searchParams.get("event_id");
    const sellerId = url.searchParams.get("seller_id");
    const categoryId = url.searchParams.get("category_id");
    const productId = url.searchParams.get("product_id");
    const entityType = url.searchParams.get("entity_type");

    if (!eventId && !sellerId && !productId && !categoryId) {
      return {
        status: 400,
        data: { 
          success: false, 
          code: "MISSING_PARAMETER", 
          message: "É obrigatório informar ao menos um parâmetro de contexto do card (event_id, seller_id, product_id ou category_id)." 
        }
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
    // 5. HIDRATAÇÃO DO PERFIL DO USUÁRIO (Fallback via tabela entities)
    // =========================================================================
    let resolvedType = entityType;

    if (!resolvedType && auth?.user_id) {
      const { data: entityData } = await supabase
        .from("entities")
        .select("entity_type")
        .eq("id", auth.user_id)
        .maybeSingle();

      if (entityData) {
        resolvedType = entityData.entity_type;
      }
    }

    // =========================================================================
    // 6. RESOLUÇÃO DE CONFIGURAÇÕES VIA MOTOR DE CASCATA
    // =========================================================================
    const configData = await resolveOrchestratorConfigs(
      supabase,
      eventId,
      sellerId,
      categoryId,
      productId,
      resolvedType
    );

    if (!configData) {
      return {
        status: 404,
        data: { success: false, code: "CONFIG_NOT_FOUND", message: "Nenhuma configuração ativa encontrada para os parâmetros informados." }
      };
    }

    // =========================================================================
    // 7. SANITIZAÇÃO E PARSEAMENTO DE CAMPOS JSON/JSONB
    // (Garante nomes perfeitamente casados com a sua tabela)
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