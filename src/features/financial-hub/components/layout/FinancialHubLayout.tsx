/**
 * @fileoverview Componente: FinancialHubLayout
 * 
 * Esqueleto mestre e injetor de dados das jornadas financeiras. Ele é o responsável por:
 * 1. Envolver as rotas filhas com o OrchestratorWrapper, garantindo que os dados da API sejam injetados corretamente.
 * 2. Gerenciar o estado global de "hidratação" (isOrchestratorHydrating) para controlar a exibição do loader (cortina).
 * 
 * --------------------------------------------------------------------------------
 */

// Limpei o createContext e useContext daqui, pois agora vêm do arquivo neutro!
import React, { useState, useEffect } from "react";
import { useSearch } from "@tanstack/react-router";
import { OrchestratorWrapper } from "@/features/financial-hub/components/shared/OrchestratorWrapper";
import { SiteHeader } from "./SiteHeader";
import { FAQSection } from "./FAQSection"; 
import { Footer } from "./Footer";        
import { FinancialHubContext } from "@/features/financial-hub/core/contexts/FinancialHubContext";

interface FinancialHubLayoutProps {
  children: React.ReactNode; 
}

export function FinancialHubLayout({ children }: FinancialHubLayoutProps) {
  const search = useSearch({ strict: false });

  // 1. Estado da Cortina (grafia corrigida para Orchestrator)
  const [isOrchestratorHydrating, setIsOrchestratorHydrating] = useState(true);

  // 2. O FAILSAFE DE SEGURANÇA (Adicionado no lugar correto, FORA do return)
  // Garante que a cortina abra após 8s se a rota filha falhar silenciosamente
  useEffect(() => {
    if (isOrchestratorHydrating) {
      const timeout = setTimeout(() => {
        setIsOrchestratorHydrating(false);
        console.warn("⚠️ [Failsafe] A cortina global foi aberta à força por timeout (8s). Verifique se ocorreu algum erro silencioso nos componentes filhos.");
      }, 8000);
      return () => clearTimeout(timeout);
    }
  }, [isOrchestratorHydrating]);

  return (
    <OrchestratorWrapper visitId={(search as any).visit_id} visitUpdateId={(search as any).visit_update_id}>
      {(simData) => {
  
        // =========================================================================
        // TRAVA DE SEGURANÇA CONTRA MANIPULAÇÃO DE ROTAS (PATH MATCHING)
        // =========================================================================
        if (simData?.target_url) {
          const currentPath = window.location.pathname.replace(/\/$/, "");
          
          let intendedPath = "";
          try {
            intendedPath = new URL(simData.target_url).pathname.replace(/\/$/, "");
          } catch (e) {
            intendedPath = simData.target_url.split('?')[0].replace(/\/$/, "");
          }

          // Se o cara mudou a URL na mão para tentar ver outra jornada...
          if (currentPath !== intendedPath && intendedPath !== "") {
            console.warn(`[sbX Guard] Rota inválida para esta visita. Redirecionando para: ${intendedPath}`);
            
            // Corrige o caminho substituindo o histórico para limpar a trapaça do botão Voltar
            window.location.replace(`${simData.target_url}${window.location.search}`);
            
            // Retorna nulo para estancar a renderização dos filhos imediatamente
            return null;
          }
        }
        // =========================================================================

        // Empacotamos os dados da API junto com o controle da cortina.
        const contextPayload = {
          ...simData,
          setIsOrchestratorHydrating
        };
        
        return (
          <FinancialHubContext.Provider value={contextPayload}>
            <div className="min-h-screen bg-white text-foreground transition-colors duration-300 relative flex flex-col">
              <SiteHeader />
              
              {/* ---------------------------------------------------------------------------
                CORTINA (LOADER GLOBAL)
                Cobre a tela inteira abaixo do header enquanto isOrchestratorHydrating for true.
                --------------------------------------------------------------------------- */}
              {isOrchestratorHydrating && (
                <div className="absolute inset-0 top-[80px] z-50 flex flex-col items-center justify-center bg-white">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                  <p className="text-slate-500 font-medium">Preparando a sua simulação...</p>
                </div> 
              )}            
              
              {/* ---------------------------------------------------------------------------
              RENDERIZAÇÃO OCULTA (Anti-Flicker)
              O {children} DEVE estar no DOM para o FinancialHubDataInjector conseguir rodar.
              Usamos Tailwind para escondê-lo visualmente até a hidratação terminar.
              --------------------------------------------------------------------------- */}
              <main 
                className={`flex-1 w-full flex flex-col transition-opacity duration-500 ${
                  isOrchestratorHydrating 
                    ? "opacity-0 pointer-events-none h-0 overflow-hidden" 
                    : "opacity-100"
                }`}
              >
                {children}
              </main>
              
              {/* Ocultamos FAQ e Footer enquanto hidrata para manter a tela focada no Loader */}
              {!isOrchestratorHydrating && (
                <>
                  <FAQSection items={simData?.page_faqs} />
                  <Footer config={simData?.page_configs?.footer} />
                </>
              )}
            </div>
          </FinancialHubContext.Provider>
        );
      }}
    </OrchestratorWrapper>
  );
}