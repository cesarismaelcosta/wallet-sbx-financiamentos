/**
 * @fileoverview Resolvedor Compartilhado de Configurações de Jornada
 * @path supabase/functions/_shared/orchestrator-configs.ts
 *
 * =========================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: SINGLE SOURCE OF BUSINESS RULES
 * =========================================================================
 * Antes da refatoração Zero-Trust, `rules` / `page_configs` / `consent_configs`
 * chegavam ao Financial Gateway DENTRO do payload do cliente. Com o `pickThin`
 * essas chaves passaram a ser (corretamente) descartadas — e o gateway ficaria
 * cego às regras de negócio.
 *
 * Este módulo extrai a lógica de prioridade que vivia duplicada dentro de
 * `orchestrator/index.ts` (`resolveDestination` e `resolveOrchestratorConfigs`)
 * e a expõe para QUALQUER edge function reconstruir a config server-side.
 *
 * [PRIORIDADE DE MATCH] (mais específico -> mais genérico):
 *   EVENT > SELLER > PRODUCT > SUBCATEGORY > CATEGORY
 * O perfil (PF/PJ) é derivado do `entity_type` confiável da hidratação.
 *
 * @author Cesar Ismael Pereira da Costa
 * @author Gemini Pro
 * @version 1.0.0
 */

import { debugLog } from "./logger.ts";

/** Espelha as colunas reais de `public.orchestrator_configs`. */
export interface ResolvedConfig {
  orchestrator_config_id: number | null;
  page_url: string | null;
  partner_id: number | null;
  is_integrated: boolean;
  integration_method: string | null;
  integration_details: Record<string, any>;
  rules: Record<string, any>;
  consent_configs: Record<string, any> | any[];
  page_configs: Record<string, any>;
  page_faqs: Record<string, any> | any[];
  /** Qual eixo casou. Útil para auditoria e debug de roteamento. */
  matched_by: "EVENT" | "SELLER" | "PRODUCT" | "SUBCATEGORY" | "CATEGORY" | null;
}

const EMPTY_CONFIG: ResolvedConfig = {
  orchestrator_config_id: null,
  page_url: null,
  partner_id: null,
  is_integrated: false,
  integration_method: null,
  integration_details: {},
  rules: {},
  consent_configs: {},
  page_configs: {},
  page_faqs: {},
  matched_by: null,
};

const SELECT_COLS =
  "id, page_url, partner_id, is_integrated, integration_method, integration_details, entity_type, rules, consent_configs, page_configs, page_faqs";

/**
 * @description Resolve a configuração ativa da jornada por ordem de especificidade.
 * NUNCA lança: devolve `EMPTY_CONFIG` quando não há match, deixando a decisão
 * de "bloquear ou seguir" para o chamador (o Orchestrator bloqueia; o Gateway
 * segue com os defaults do parceiro).
 */
export async function resolveOrchestratorConfigs(args: {
  supabase: any;
  eventId?: string | number | null;
  sellerId?: string | number | null;
  productId?: string | number | null;
  subcategoryId?: string | number | null;
  categoryId?: string | number | null;
  entityType?: "F" | "J" | "PF" | "PJ" | string | null;
}): Promise<ResolvedConfig> {
  const { supabase, eventId, sellerId, productId, subcategoryId, categoryId, entityType } = args;

  const currentProfile = entityType === "J" || entityType === "PJ" ? "PJ" : "PF";

  const priorities: Array<{ type: ResolvedConfig["matched_by"]; id: unknown }> = [
    { type: "EVENT", id: eventId },
    { type: "SELLER", id: sellerId },
    { type: "PRODUCT", id: productId },
    { type: "SUBCATEGORY", id: subcategoryId },
    { type: "CATEGORY", id: categoryId },
  ];

  for (const priority of priorities) {
    const lookupId = Number(priority.id);
    if (!priority.id || Number.isNaN(lookupId) || lookupId <= 0) continue;

    const { data, error } = await supabase
      .from("orchestrator_configs")
      .select(SELECT_COLS)
      .eq("lookup_id", lookupId)
      .eq("config_type", priority.type)
      .eq("is_active", true)
      .in("entity_type", [currentProfile, "PF+PJ"])
      .maybeSingle();

    if (error) {
      debugLog(`[Configs][AVISO] Falha na query ${priority.type}(${lookupId}): ${error.message}`);
      continue;
    }
    if (!data) continue;

    debugLog(`✅ [Configs] Match via ${priority.type}(${lookupId}) | Perfil: ${currentProfile}`);

    return {
      orchestrator_config_id: data.id ?? null,
      page_url: data.page_url ?? null,
      partner_id: data.partner_id ?? null,
      is_integrated: data.is_integrated ?? false,
      integration_method: data.integration_method ?? null,
      integration_details: data.integration_details ?? {},
      rules: data.rules ?? {},
      consent_configs: data.consent_configs ?? {},
      page_configs: data.page_configs ?? {},
      page_faqs: data.page_faqs ?? {},
      matched_by: priority.type,
    };
  }

  debugLog("[Configs] Nenhuma configuração ativa encontrada para o contexto informado.");
  return { ...EMPTY_CONFIG };
}
