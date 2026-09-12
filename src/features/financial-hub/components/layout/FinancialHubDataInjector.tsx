/**
 * @fileoverview Componente: FinancialHubDataInjector (Irrigador Downstream de Estado)
 * @module features/financial-hub/components/layout
 * @path src/features/financial-hub/components/layout/FinancialHubDataInjector.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: DUMB INJECTOR & ZERO-FLICKER HYDRATION
 * =========================================================================
 * @description Componente headless irrigador de estado downstream para o formulário.
 * Atua como a ponte passiva entre o `FinancialHubContext` (Orquestrador) e o
 * `WizardProvider` (React Hook Form), garantindo hidratação idempotente e sem flicker.
 * 
 * [MECÂNICA ARQUITETURAL V3 - BLINDAGEM NEUTRA AUTOCONTIDA & SBX DESIGN SYSTEM]:
 * 1. {Single Source of Truth}: Opera estritamente no fluxo downstream. Não realiza
 *    chamadas de rede nem acessa caches locais de forma autônoma; consome exclusivamente
 *    o estado provido pelo nó pai via `FinancialHubContext`.
 * 2. {Race Condition Shield}: Mantém a barreira de hidratação fechada enquanto o
 *    `contextData` estiver em estado transitório de carregamento (`success === "loading"`).
 * 3. {Idempotent Initialization Lock}: Utiliza `hasInitialized` via `useRef` para
 *    assegurar injeção atômica única por ciclo de montagem do componente.
 * 4. {Zero-Flicker Micro-Delay}: Aplica delay transicional de 50ms antes de desativar
 *    a cortina global (`setIsOrchestratorHydrating(false)`), garantindo estabilidade
 *    completa do DOM antes da transição de opacidade da casca do layout.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 * @version 9.2.0 (Gemini Pro Architecture & Headless State Irrigation)
 */

import React, { useEffect, useRef } from "react";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { useProductConsult } from "@/features/financial-hub/core/contexts/FinancialHubContext";

// =========================================================================
// [CONTRATOS E INTERFACES TIPADAS]
// =========================================================================
interface FinancialHubDataInjectorProps {
  children: React.ReactNode;
}

// =========================================================================
// [COMPONENTE PRINCIPAL: FINANCIAL HUB DATA INJECTOR]
// =========================================================================
export function FinancialHubDataInjector({ children }: FinancialHubDataInjectorProps) {
  const { updateData } = useWizard();

  // 1. Acesso ao Contexto Global derivado do Orquestrador
  const contextData = useProductConsult();
  const setIsOrchestratorHydrating = contextData?.setIsOrchestratorHydrating;

  // 🔒 Lock Idempotente: Garante injeção atômica única por montagem
  const hasInitialized = useRef(false);

  // =========================================================================
  // 💧 [HYDRATION ENGINE]: PASSIVO (DOWNSTREAM ONLY)
  // =========================================================================
  useEffect(() => {
    // ✨ A TRAVA MESTRA: Aguarda o nó pai (Orquestrador) concluir a resolução
    if (!contextData || contextData.success === "loading") {
      return;
    }

    // Aborta se a carga de dados já foi processada
    if (hasInitialized.current) return;

    hasInitialized.current = true; // Ativa o lock idempotente

    // 1. Injeta os dados estruturados no motor do Wizard (React Hook Form)
    updateData({
      ...contextData,
      entity: contextData?.entity ?? {},
    });

    // 2. ⏱️ Desativação da Cortina com Micro-Delay (Zero-Flicker Layout Transition)
    const timeoutId = setTimeout(() => {
      if (setIsOrchestratorHydrating) {
        setIsOrchestratorHydrating(false);
      }
    }, 50);

    return () => clearTimeout(timeoutId);
  }, [contextData, updateData, setIsOrchestratorHydrating]);

  return <>{children}</>;
}