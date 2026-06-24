/**
 * @fileoverview Componente: FinancialHubDataInjector
 * * * * PROPÓSITO:
 * Hidratar a jornada uma única vez. 
 * Bloqueia chamadas repetidas e avisa o Layout Pai para remover a tela de loading.
 */

import { useEffect, useRef, useState } from "react";
import { useSearch } from "@tanstack/react-router";
import { callOrchestrator } from "@/features/financial-hub/core/services/gateway";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { useProductConsult } from "@/features/financial-hub/core/contexts/FinancialHubContext";

export function FinancialHubDataInjector({ children}: { children: React.ReactNode }) {
  const { updateData } = useWizard();
  const search = useSearch({ strict: false });

  // Extrair a função de contexto
  const { setIsOrchestratorHydrating } = useProductConsult();

  // A trava: garante que o useEffect rode apenas uma vez
  const hasInitialized = useRef(false);
  const visitId = (search as any)?.visit_id;
  
  // Proteção: Se não houver visitId na rota, levanta a cortina de imediato
  useEffect(() => {
    if (!visitId && setIsOrchestratorHydrating) {
      setIsOrchestratorHydrating(false);
    }
  }, [visitId, setIsOrchestratorHydrating]);

  useEffect(() => {
    // Se já foi inicializado ou não tem visit_id, interrompe
    if (hasInitialized.current) return;
    
    const visitId = (search as any)?.visit_id;
    if (!visitId) return;

    async function hydrate() {
      try {
        hasInitialized.current = true; // Marca como iniciado antes do fetch
        
        const data = await callOrchestrator({ visit_id: visitId }, "GET");

        // Hidratação única
        updateData({ 
          ...data
        });

        // O GATILHO DA CORTINA
        // Dá-se uma margem de segurança para o React renderizar os inputs preenchidos
        setTimeout(() => {
          if (setIsOrchestratorHydrating) {
             setIsOrchestratorHydrating(false);
          }
        }, 50);

      } catch (error) {
        console.error("[FinancialHubDataInjector] Falha na hidratação:", error);
        hasInitialized.current = false; // Permite tentar novamente se falhar

        // Se a API falhar, a cortina abre para não bloquear a experiência do utilizador
        if (setIsOrchestratorHydrating) setIsOrchestratorHydrating(false);
      }
    }

    hydrate();
  }, [search, updateData]);

  return <>{children}</>;
}