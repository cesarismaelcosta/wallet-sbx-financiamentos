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

      } catch (error: any) { // Adicione o : any aqui para acessar as propriedades
        hasInitialized.current = false; 

        // Envia o erro para o estado global. 
        // O Layout vai detectar esse 'success: false' e exibir a tela de erro automaticamente.
        updateData({
          success: false,
          code: error.code || "UNKNOWN_ERROR",
          message: error.message || "Falha ao carregar simulação.",
          fallback_url: error.fallback_url || "/"
        });

        // Abre a cortina para mostrar a tela de erro
        if (setIsOrchestratorHydrating) setIsOrchestratorHydrating(false);
      }
    }

    hydrate();
  }, [search, updateData]);

  return <>{children}</>;
}