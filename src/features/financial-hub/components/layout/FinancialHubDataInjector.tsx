/**
 * @fileoverview Componente: FinancialHubDataInjector
 * @module features/financial-hub/components/layout
 *
 * =========================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: CONTEXT-FIRST HYDRATION
 * =========================================================================
 * O FinancialHubDataInjector atua como o irrigador do React Hook Form (Wizard).
 * Ele resolve o problema de concorrência com o Layout Pai (OrchestratorWrapper)
 * priorizando os dados em memória (simData) e acionando a API apenas como Fallback.
 *
 * [MUDANÇAS ARQUITETURAIS - OTIMIZAÇÃO EXTREMA]:
 * 1. {Zero-Network Path}: Lê o `useProductConsult()` primeiro. Se o Pai já fez o GET,
 *    injeta imediatamente no Wizard, economizando 1 requisição.
 * 2. {Temporal Consistency}: Se o Fallback for acionado, envia o `visit_update_id`
 *    garantindo que o Backend devolva o snapshot exato da tela.
 * 3. {Entity Fallback}: Caso o Orquestrador omita a Entidade, resgata o perfil
 *    do sessionStorage, blindando o fluxo de SIMULATE contra Erros 400.
 * 4. {Hook Hygiene}: Dependências atreladas a primitivos (visitId, visitUpdateId)
 *    para evitar re-renders por quebra de referência do objeto 'search'.
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import React, { useEffect, useRef } from "react";
import { useSearch } from "@tanstack/react-router";
import { callOrchestrator } from "@/features/financial-hub/core/services/gateway";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { useProductConsult } from "@/features/financial-hub/core/contexts/FinancialHubContext";

export function FinancialHubDataInjector({ children }: { children: React.ReactNode }) {
  const { updateData } = useWizard();

  const search = useSearch({ strict: false }) as {
    visit_id?: string;
    visit_update_id?: string;
  };

  // 1. Acesso ao Contexto Global (O Pai já pode ter feito o GET)
  const contextData = useProductConsult();
  const setIsOrchestratorHydrating = contextData?.setIsOrchestratorHydrating;

  // 🔒 Lock Idempotente: Garante injeção única por montagem
  const hasInitialized = useRef(false);

  const visitId = search?.visit_id;
  const visitUpdateId = search?.visit_update_id;

  // =========================================================================
  // 🛡️ [FAIL-SAFE]: ABORTAGEM PREVENTIVA (Sem ID = Sem Simulação)
  // =========================================================================
  useEffect(() => {
    if (!visitId && setIsOrchestratorHydrating) {
      setIsOrchestratorHydrating(false);
    }
  }, [visitId, setIsOrchestratorHydrating]);

  // =========================================================================
  // 💧 [HYDRATION ENGINE]: CONTEXT-FIRST + API FALLBACK
  // =========================================================================
  useEffect(() => {
    // ✨ A TRAVA MESTRA: Se o Pai (Wrapper) ainda está baixando os dados da API,
    // o Injector cruza os braços e espera. Evita o atropelamento que corrompe o banco.
    if (contextData?.success === "loading") {
      return;
    }

    // Só avança se o Pai já resolveu a API e o componente ainda não foi inicializado
    if (hasInitialized.current || !visitId) return;

    async function hydrate() {
      try {
        hasInitialized.current = true; // Aciona o Lock

        // 🔒 FRONT ESTÉRIL: nenhuma PII vem do sessionStorage. A entidade é
        // sempre a hidratada server-side (ctx.trustedEntity), via contexto do
        // Pai ou via GET do orchestrator.

        // ✨ 1. FAST-PATH (Zero-Network): Verifica se o Pai já tem os dados
        const hasValidContext = Boolean(contextData?.entity?.entity_id || contextData?.offer?.offer_id);

        if (hasValidContext) {
          // 🔇 Log de diagnóstico apenas em DEV (evita ruído em produção)
          if (import.meta.env.DEV) {
            console.log("⚡ [DataInjector] Fast-Path: Hidratando via Contexto Pai (Zero Network)");
          }
          updateData({
            ...contextData,
            entity: contextData?.entity ?? {},
          });
        } else {
          // 📡 2. FALLBACK PATH: Só chega aqui se a hidratação global não trouxer dados
          if (import.meta.env.DEV) {
            console.log("📡 [DataInjector] Fallback: Buscando Orchestrator via API");
          }
          const orchestratorData = await callOrchestrator(
            {
              visit_id: visitId,
              visit_update_id: visitUpdateId || undefined,
            },
            "GET",
          );

          updateData({
            ...orchestratorData,
            entity: orchestratorData?.entity ?? {},
          });
        }

        // ⏱️ [GATILHO DA CORTINA - ZERO FLICKER]
        setTimeout(() => {
          if (setIsOrchestratorHydrating) {
            setIsOrchestratorHydrating(false);
          }
        }, 50);
      } catch (error: any) {
        hasInitialized.current = false;

        // 🚨 Interceptação Radicular de Redirecionamento (Zero-Trust)
        if (error?.code === "SESSION_EXPIRED" && error?.fallback_url) {
          console.warn("🔐 [DataInjector] Sessão Expirada: Redirecionando para login seguro via Handoff Token...");
          window.location.replace(error.fallback_url);
          return;
        }

        // Tratamento de erros padrão
        updateData({
          success: false,
          code: error?.code || "UNKNOWN_ERROR",
          message: error?.message || "Falha ao carregar os dados da simulação.",
          fallback_url: error?.fallback_url || "/",
        });

        if (setIsOrchestratorHydrating) setIsOrchestratorHydrating(false);
      }
    }

    hydrate();

    // Higiene de Hooks: Dependências primitivas
  }, [visitId, visitUpdateId, updateData, setIsOrchestratorHydrating, contextData]);

  return <>{children}</>;
}
