/**
 * @fileoverview Componente: FinancialHubLayout
 * @path src/features/financial-hub/components/layout/FinancialHubLayout.tsx
 * 
 * =========================================================================
 * [DOCUMENTAÇÃO DO COMPONENTE]
 * =========================================================================
 * @description Esqueleto mestre e injetor de dados das jornadas financeiras. 
 * Responsável por gerenciar a hidratação do Orquestrador, injetar o contexto 
 * global, tratar erros críticos de sessão e orquestrar a exibição dos Skeletons
 * estruturais durante o carregamento inicial.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import React, { useState, useEffect } from "react";
import { useSearch } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { OrchestratorWrapper } from "@/features/financial-hub/components/shared/OrchestratorWrapper";
import { PanelHeader } from "./PanelHeader";
import { PanelFAQ } from "./PanelFAQ";
import { PanelFooter } from "./PanelFooter";
import { PanelProductOfferSkeleton } from "./PanelProductOfferSkeleton";
import { PanelStepSkeleton } from "./PanelStepSkeleton";
import { PanelFAQSkeleton } from "./PanelFAQSkeleton";
import { PanelFooterSkeleton } from "./PanelFooterSkeleton";
import { FinancialHubContext } from "@/features/financial-hub/core/contexts/FinancialHubContext";

interface FinancialHubLayoutProps {
  children: React.ReactNode;
}

/**
 * @component ErrorCountdown
 * @description Componente interno de fallback para erros críticos da jornada (401, 403, 404).
 */
function ErrorCountdown({ fallbackUrl, message, title }: { fallbackUrl: string; message?: string; title?: string }) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    if (countdown === 0) {
      window.location.href = fallbackUrl;
      return;
    }

    const timer = setInterval(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown, fallbackUrl]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans'] p-6 text-center">
      <img src="/assets/error/error.webp" alt="Erro na simulação" className="w-34 h-34 object-contain mb-6" />
      <h2 className="text-xl font-bold text-slate-800 mb-2">{title || "Ops! Tivemos um problema"}</h2>
      <p className="text-slate-500 font-medium text-sm mb-2 max-w-md px-4">
        {message || "Não foi possível carregar a simulação desta oferta."}
      </p>
      <p className="text-slate-400 font-medium text-xs mt-4 mb-6">Retornando em {countdown}s...</p>
      <button
        onClick={() => (window.location.href = fallbackUrl)}
        className="flex items-center text-[#B400FF] font-semibold text-sm hover:opacity-80 transition-opacity cursor-pointer"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Retornar agora
      </button>
    </div>
  );
}

export function FinancialHubLayout({ children }: FinancialHubLayoutProps) {
  const search = useSearch({ strict: false }) as { visit_id?: string; visit_update_id?: string };

  const [isOrchestratorHydrating, setIsOrchestratorHydrating] = useState(true);
  const [runtimeError, setRuntimeError] = useState<any>(null);

  // 1. FAILSAFE DE SEGURANÇA (10s)
  useEffect(() => {
    if (isOrchestratorHydrating) {
      const timeout = setTimeout(() => {
        setIsOrchestratorHydrating(false);
        console.warn(
          "⚠️ [Failsafe] A cortina global foi aberta à força por timeout (10s). Verifique se ocorreu algum erro silencioso nos componentes filhos.",
        );
      }, 10000);
      return () => clearTimeout(timeout);
    }
  }, [isOrchestratorHydrating]);

  // 2. Listener de erros globais
  useEffect(() => {
    const handleError = (e: any) => {
      setRuntimeError(e.detail);
    };

    window.addEventListener("app-error", handleError);
    return () => window.removeEventListener("app-error", handleError);
  }, []);

  return (
    <OrchestratorWrapper visitId={search.visit_id ?? ""} visitUpdateId={search.visit_update_id}>
      {(simData) => {
        // Redirecionamento seguro de target_url
        useEffect(() => {
          if (simData?.target_url && typeof window !== "undefined") {
            const currentPath = window.location.pathname.replace(/\/$/, "");
            let intendedPath = "";
            try {
              intendedPath = new URL(simData.target_url).pathname.replace(/\/$/, "");
            } catch (e) {
              intendedPath = simData.target_url.split("?")[0].replace(/\/$/, "");
            }

            if (currentPath !== intendedPath && intendedPath !== "") {
              window.location.replace(`${simData.target_url}${window.location.search}`);
            }
          }
        }, [simData?.target_url]);

        // Tratamento de Erros de Runtime
        if (runtimeError) {
          let uiTitle = "Ops! Tivemos um problema";
          if (runtimeError.code === "SESSION_EXPIRED") uiTitle = "Sessão Expirada";
          else if (runtimeError.code === "INVALID_RELATIONSHIP") uiTitle = "Acesso Restrito";
          else if (runtimeError.code === "OFFER_NOT_FOUND") uiTitle = "Oferta Indisponível";

          return (
            <ErrorCountdown
              title={uiTitle}
              message={runtimeError.message}
              fallbackUrl={runtimeError.fallback_url || "/"}
            />
          );
        }

        // Tratamento de Erros da API
        if (simData?.success === false) {
          let uiTitle = "Ops! Tivemos um problema";
          if (simData.code === "SESSION_EXPIRED") uiTitle = "Sessão Expirada";
          else if (simData.code === "INVALID_RELATIONSHIP") uiTitle = "Acesso Restrito";
          else if (simData.code === "OFFER_NOT_FOUND") uiTitle = "Oferta Indisponível";

          return <ErrorCountdown title={uiTitle} message={simData.message} fallbackUrl={simData.fallback_url || "/"} />;
        }

        const contextPayload = {
          ...simData,
          setIsOrchestratorHydrating,
        };

        return (
          <FinancialHubContext.Provider value={contextPayload}>
            <div className="min-h-screen bg-white text-foreground transition-colors duration-300 relative flex flex-col">
              {/* Header Padronizado Estático (64px) */}
              <PanelHeader />

              {/* =========================================================================
                * SKELETONS ESTRUTURAIS DE HIDRATAÇÃO (Substitui o spinner antigo)
                * ========================================================================= */}
              {isOrchestratorHydrating && (
                <>
                  <main className="flex-1 w-full flex flex-col pt-16">
                    <div className="max-w-7xl mx-auto px-6 py-12 w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
                      <PanelProductOfferSkeleton />
                      <PanelStepSkeleton />
                    </div>
                  </main>
                  <PanelFAQSkeleton />
                  <PanelFooterSkeleton />
                </>
              )}

              {/* =========================================================================
                * CONTEÚDO REAL DA APLICAÇÃO (Exibido após a hidratação)
                * ========================================================================= */}
              <main
                className={`flex-1 w-full flex flex-col transition-opacity duration-500 pt-16 ${
                  isOrchestratorHydrating ? "opacity-0 pointer-events-none h-0 overflow-hidden" : "opacity-100"
                }`}
              >
                {children}
              </main>

              {!isOrchestratorHydrating && (
                <>
                  <PanelFAQ items={simData?.page_faqs} />
                  <PanelFooter config={simData?.page_configs?.footer} />
                </>
              )}
            </div>
          </FinancialHubContext.Provider>
        );
      }}
    </OrchestratorWrapper>
  );
}