/**
 * @fileoverview Componente: FinancialHubDataInjector
 * @module features/financial-hub/components/layout
 *
 * =========================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: DUMB INJECTOR (DOWNSTREAM ONLY)
 * =========================================================================
 * O FinancialHubDataInjector atua exclusivamente como o irrigador do 
 * React Hook Form (Wizard). 
 * 
 * [MUDANÇAS ARQUITETURAIS - OTIMIZAÇÃO EXTREMA]:
 * 1. {Single Source of Truth}: Ele não acessa mais a API e nem lê o cache da RAM.
 *    Quem faz o Fast-Path (0ms) ou a chamada de rede é o `useOrchestratorHydration` 
 *    (O Pai). 
 * 2. {Race Condition Shield}: O Injector cruza os braços até o `contextData` 
 *    sair do estado de "loading". Quando recebe, apenas injeta no Wizard.
 * 3. {Zero Flicker}: Aciona a cortina final (`setIsOrchestratorHydrating`) com um
 *    micro-delay de 50ms para garantir a montagem suave do formulário.
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import React, { useEffect, useRef } from "react";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { useProductConsult } from "@/features/financial-hub/core/contexts/FinancialHubContext";

export function FinancialHubDataInjector({ children }: { children: React.ReactNode }) {
  const { updateData } = useWizard();

  // 1. Acesso ao Contexto Global (O Pai já preparou tudo em 0ms ou via rede)
  const contextData = useProductConsult();
  const setIsOrchestratorHydrating = contextData?.setIsOrchestratorHydrating;

  // 🔒 Lock Idempotente: Garante injeção única por montagem
  const hasInitialized = useRef(false);

  // =========================================================================
  // 💧 [HYDRATION ENGINE]: PASSIVO (DOWNSTREAM ONLY)
  // =========================================================================
  useEffect(() => {
    // ✨ A TRAVA MESTRA: Espera o Pai (useOrchestrator) terminar o trabalho dele.
    if (!contextData || contextData.success === "loading") {
      return;
    }

    // Só avança se o componente ainda não foi inicializado
    if (hasInitialized.current) return;

    hasInitialized.current = true; // Aciona o Lock

    // 1. Injeta os dados no Wizard
    updateData({
      ...contextData,
      entity: contextData?.entity ?? {},
    });

    // 2. ⏱️ Gatilho da Cortina (Zero Flicker)
    setTimeout(() => {
      if (setIsOrchestratorHydrating) {
        setIsOrchestratorHydrating(false);
      }
    }, 50);

    // Higiene de Hooks: Dependências estritas
  }, [contextData, updateData, setIsOrchestratorHydrating]);

  return <>{children}</>;
}