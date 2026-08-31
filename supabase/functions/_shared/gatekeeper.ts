/**
 * @fileoverview Middleware de Autorização e Integridade de Jornada (Gatekeeper)
 * @path supabase/functions/_shared/gateKeeper.ts
 *
 * =========================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: IN-MEMORY ZERO-TRUST VALIDATION
 * =========================================================================
 * O Guardião das regras de negócio do Hub Financeiro.
 *
 * [MUDANÇAS ARQUITETURAIS - REFATORAÇÃO DE PERFORMANCE (Thin Payload)]:
 * 1. {I/O Free}: O Gatekeeper NÃO faz mais chamadas de rede (Fetch Upstream).
 * 2. {Strict Ownership}: A validação foca no cruzamento do JWT contra as 
 *    entidades já materializadas pela hidratação no servidor.
 *
 * [CORREÇÕES v6.1.0]:
 * 1. {mode: "verify" | "link"}: `validateSimulationIntegrity` ganhou modo 
 *    tolerante a consistência eventual para o primeiro vínculo da oferta.
 * 2. {Skip vazio}: Otimização Fast Path para requisições vazias.
 *
 * @author Cesar Ismael Pereira da Costa
 * @author Gemini Pro
 * @version 6.1.0 (Stateless, I/O Free & Race-Aware Validations)
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { debugLog } from "./logger.ts";
import type { TrustedEntity, TrustedOffer } from "./hydrate-data.ts";

// =========================================================================
// [1] GATEKEEPER DE JORNADA: VISITA + OFERTA (OWNERSHIP DO BEM)
// =========================================================================

export function validateOfferAccess(args: {
  trustedEntity: TrustedEntity;
  trustedOffer: TrustedOffer | null;
  sessionUserId: string;
}): void {
  const { trustedEntity, trustedOffer, sessionUserId } = args;

  if (String(trustedEntity.entity_id) !== String(sessionUserId)) {
    debugLog(`🚨 [Gatekeeper][Security] SPOOFING DETECTADO: JWT(${sessionUserId}) != DB Entity(${trustedEntity.entity_id})`);
    throw new Error("FORBIDDEN_ACCESS");
  }

  if (!trustedOffer) {
    debugLog("[Gatekeeper] Contexto estéril (Home/Dashboard ou modo light). Nenhuma oferta para validar.");
    return;
  }

  const isSold = Boolean(trustedOffer.offer_status_sold);

  if (isSold) {
    debugLog(`🚨 [Gatekeeper] Oferta ${trustedOffer.offer_id} indisponível para negócio (Available: ${isAvailable} | Sold: ${isSold}).`);
    throw new Error("OFFER_NOT_AVAILABLE");
  }

  const ownerId = trustedOffer.winner_id ?? trustedOffer.buyer_id ?? null;

  if (ownerId && String(ownerId) !== String(sessionUserId)) {
    debugLog(`🚨 [Gatekeeper][Security] TENTATIVA DE SEQUESTRO DE LOTE: Oferta ${trustedOffer.offer_id} arrematada por ${ownerId}. Sessão ativa pertence a ${sessionUserId}.`);
    throw new Error("FORBIDDEN_OFFER_ACCESS");
  }

  debugLog(`✅ [Gatekeeper] Acesso concedido. Oferta ${trustedOffer.offer_id} validada e aberta para simulação.`);
}

// =========================================================================
// [2] GATEKEEPER DE SIMULAÇÃO: PROTEÇÃO CONTRA CROSS-TAMPERING
// =========================================================================

export type IntegrityMode = "verify" | "link";

export async function validateSimulationIntegrity(
  supabase: SupabaseClient,
  visitId: string,
  payload: {
    simulation_id?: string | null;
    entity_id: string; 
    offer_id?: string | null;
  },
  mode: IntegrityMode = "verify",
): Promise<void> {
  const { simulation_id, entity_id, offer_id } = payload;

  if (!simulation_id && !entity_id && !offer_id) {
    debugLog("[Gatekeeper] Nenhum vínculo a cruzar. Validação dispensada.");
    return;
  }

  if (!simulation_id) {
    debugLog(`[Gatekeeper] Simulação Nova detectada (mode=${mode}). Validando integridade relacional.`);

    const { data: visit, error: visitError } = await supabase
      .from('visits')
      .select('visit_entities(entity_id), visit_offers(offer_id)')
      .eq('id', visitId)
      .single();

    if (visitError || !visit) throw new Error("VISIT_NOT_FOUND");

    const dbEntityId = (visit as any).visit_entities?.[0]?.entity_id;
    if (entity_id && String(dbEntityId) !== String(entity_id)) {
      debugLog(`🚨 [Security] Entidade Trusted (${entity_id}) diverge do DB Base da Visita (${dbEntityId})`);
      throw new Error("INVALID_RELATIONSHIP: Inconsistência severa de identidade.");
    }

    if (offer_id) {
      const isOfferLinked = (visit as any).visit_offers?.some((o: any) => String(o.offer_id) === String(offer_id));

      if (!isOfferLinked) {
        if (mode === "link") {
          debugLog(`⏳ [Gatekeeper][link] Oferta ${offer_id} ainda não materializada em visit_offers (${visitId}). Prosseguindo (consistência eventual).`);
        } else {
          debugLog(`🚨 [Security] Oferta (${offer_id}) injetada NÃO foi visitada neste carrinho (visit_id: ${visitId}).`);
          throw new Error("INVALID_RELATIONSHIP: Oferta não autorizada para este carrinho.");
        }
      }
    }
    return; 
  }

  debugLog(`[Gatekeeper] Simulação Existente [${simulation_id}] (mode=${mode}). Validando escudo Cross-Tampering.`);

  const { data: sim, error: simError } = await supabase
    .from('simulations')
    .select('id, visit_id, entity_id, simulation_offers(offer_id)')
    .eq('id', simulation_id)
    .eq('visit_id', visitId) 
    .single();

  if (simError || !sim) {
    debugLog(`🚨 [Security] Simulação ${simulation_id} NÃO pertence à Visita ${visitId}`);
    throw new Error("INVALID_RELATIONSHIP: Você não tem permissão para acessar esta simulação.");
  }

  if (entity_id && String((sim as any).entity_id) !== String(entity_id)) {
    debugLog(`🚨 [Security] CROSS-TAMPERING: Simulação é da Entidade ${(sim as any).entity_id}, Payload injetou ${entity_id}`);
    throw new Error("INVALID_RELATIONSHIP: Inconsistência de identidade entre Proponente e Simulação original.");
  }

  if (offer_id) {
    const isOfferLinked = (sim as any).simulation_offers?.some((so: any) => String(so.offer_id) === String(offer_id));
    if (!isOfferLinked) {
      if (mode === "link") {
        debugLog(`⏳ [Gatekeeper][link] Oferta ${offer_id} sendo anexada à simulação ${simulation_id}. Vínculo pendente aceito.`);
      } else {
        debugLog(`🚨 [Security] CROSS-TAMPERING: Simulação tenta injetar Oferta externa (${offer_id}) no UPDATE.`);
        throw new Error("INVALID_RELATIONSHIP: Inconsistência grave (Cross-Tampering de Ofertas).");
      }
    }
  }

  debugLog(`✅ [Gatekeeper] Escudo Cross-Tampering validado com sucesso. Update autorizado.`);
}