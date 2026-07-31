/**
 * @fileoverview Componente: FinancialHubDataInjector
 * @path src/features/financial-hub/components/shared/FinancialHubDataInjector.tsx
 * 
 * =========================================================================
 * [ARQUITETURA DE HIDRATAÇÃO BILATERAL]
 * =========================================================================
 * Responsável por gerenciar a entrada na rota do Hub Financeiro de forma resiliente:
 * 1. FLUXO NORMAL (GET): Se o `visit_id` estiver presente na URL, consome os dados 
 *    já persistidos no banco de dados para reidratar o estado do Wizard.
 * 2. ENTRADA DIRETA (POST): Se o usuário aterrissar seco na rota (sem `visit_id`), 
 *    o injector atua como o sandbox original, disparando um registro automático 
 *    de visita (`action: "VISIT"`) para gerar o contexto e os IDs de rastreio em tempo de execução.
 */

import { useEffect, useRef } from "react";
import { useSearch } from "@tanstack/react-router";
import { callOrchestrator } from "@/features/financial-hub/core/services/gateway";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { useProductConsult } from "@/features/financial-hub/core/contexts/FinancialHubContext";

export function FinancialHubDataInjector({ children }: { children: React.ReactNode }) {
  const { updateData } = useWizard();
  const search = useSearch({ strict: false });

  // Extração do controle de carregamento global da cortina/loading
  const { setIsOrchestratorHydrating } = useProductConsult();

  // Trava de execução: Garante que o ciclo de vida ocorra estritamente uma única vez por montagem
  const hasInitialized = useRef(false);

  useEffect(() => {
    // Se a inicialização já foi disparada, aborta chamadas duplicadas
    if (hasInitialized.current) return;

    async function hydrateOrInitialize() {
      try {
        hasInitialized.current = true; // Sela a trava antes da requisição de rede
        
        const visitId = (search as any)?.visit_id;
        let data;

        // =====================================================================
        // [PASSO 1]: DECISÃO DE FLUXO (Leitura vs. Geração de Visita Direta)
        // =====================================================================
        if (visitId) {
          // [CENÁRIO A]: Consumo via GET utilizando o visit_id fornecido na query string
          data = await callOrchestrator({ visit_id: visitId }, "GET");
        } else {
          // [CENÁRIO B]: Entrada Direta. Dispara POST para registrar o acesso inicial 
          // e estruturar a base de rastreabilidade (Comportamento original do Sandbox).
          data = await callOrchestrator({
            action: "VISIT",
            target_url: window.location.pathname,
            environment: import.meta.env.VITE_APP_ENV || "production",
            timestamp: new Date().toISOString(),
            origin_url: window.location.href
          }, "POST");

          // Se o orquestrador retornar a URL formatada com os novos IDs, 
          // atualiza a barra de endereços do navegador de forma fluida (sem recarregar a página)
          if (data?.url) {
            window.history.replaceState({}, "", data.url);
          }
        }

        // =====================================================================
        // [PASSO 2]: HIDRATAÇÃO DO ESTADO GLOBAL DO WIZARD
        // =====================================================================
        updateData({ 
          ...data
        });

        // =====================================================================
        // [PASSO 3]: LIBERAÇÃO DA INTERFACE (Gatilho da Cortina)
        // =====================================================================
        // Pequeno delay estratégico para garantir a renderização dos inputs com os dados injetados
        setTimeout(() => {
          if (setIsOrchestratorHydrating) {
             setIsOrchestratorHydrating(false);
          }
        }, 50);

      } catch (error: any) {
        // Em caso de falha, destrava a execução para permitir novas tentativas se necessário
        hasInitialized.current = false; 

        // Encaminha os parâmetros de erro padronizados para o escopo global do layout
        updateData({
          success: false,
          code: error.code || "UNKNOWN_ERROR",
          message: error.message || "Falha ao carregar simulação.",
          fallback_url: error.fallback_url || "/"
        });

        // Levanta a cortina para exibir o estado de erro tratado pela UI
        if (setIsOrchestratorHydrating) setIsOrchestratorHydrating(false);
      }
    }

    hydrateOrInitialize();
  }, [search, updateData, setIsOrchestratorHydrating]);

  return <>{children}</>;
}