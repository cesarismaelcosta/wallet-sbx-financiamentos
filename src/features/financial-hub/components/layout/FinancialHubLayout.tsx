/**
 * @fileoverview Componente: FinancialHubLayout
 *
 * Esqueleto mestre e injetor de dados das jornadas financeiras. Ele é o responsável por:
 * 1. Envolver as rotas filhas com o OrchestratorWrapper, garantindo que os dados da API sejam injetados corretamente.
 * 2. Gerenciar o estado global de "hidratação" (isOrchestratorHydrating) para controlar a exibição do loader (cortina).
 * 3. Tratar e exibir erros contextuais (ex: Sessão Expirada) vindos da API de forma amigável.
 *
 * --------------------------------------------------------------------------------
 */

import React, { useState, useEffect } from "react";
import { useSearch } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { OrchestratorWrapper } from "@/features/financial-hub/components/shared/OrchestratorWrapper";
import { SiteHeader } from "./SiteHeader";
import { FAQSection } from "./FAQSection";
import { Footer } from "./Footer";
import { FinancialHubContext } from "@/features/financial-hub/core/contexts/FinancialHubContext";

interface FinancialHubLayoutProps {
  children: React.ReactNode;
}

/**
 * @component ErrorCountdown
 * @description Componente interno de fallback para erros críticos da jornada (ex: 401, 403, 404).
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
        className="flex items-center text-[#B400FF] font-semibold text-sm hover:opacity-80 transition-opacity"
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
        // =========================================================================
        // TRATAMENTO DE TARGET_URL VIA USEEFFECT (Correção do SSR para evitar quebrar o Node)
        // =========================================================================
        // O window.location.replace foi movido para cá de forma segura:
        // Se a API mandar target_url, o efeito roda apenas no browser e redireciona sem crashar o SSR.
        // =========================================================================
        // eslint-disable-next-line react-hooks/rules-of-hooks
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

        // Se estiver redirecionando, retorna nulo momentaneamente para evitar flicker
        if (simData?.target_url && typeof window !== "undefined") {
          const currentPath = window.location.pathname.replace(/\/$/, "");
          let intendedPath = "";
          try {
            intendedPath = new URL(simData.target_url).pathname.replace(/\/$/, "");
          } catch (e) {
            intendedPath = simData.target_url.split("?")[0].replace(/\/$/, "");
          }
          if (currentPath !== intendedPath && intendedPath !== "") {
            return null;
          }
        }

        // =========================================================================
        // PRIORIDADE: Se houver erro de runtime, mostra o countdown
        // =========================================================================
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

        // =========================================================================
        // TRATAMENTO DE ERROS (API retornou success: false)
        // =========================================================================
        if (simData?.success === false) {
          let uiTitle = "Ops! Tivemos um problema";
          if (simData.code === "SESSION_EXPIRED") uiTitle = "Sessão Expirada";
          else if (simData.code === "INVALID_RELATIONSHIP") uiTitle = "Acesso Restrito";
          else if (simData.code === "OFFER_NOT_FOUND") uiTitle = "Oferta Indisponível";

          return <ErrorCountdown title={uiTitle} message={simData.message} fallbackUrl={simData.fallback_url || "/"} />;
        }

        // =========================================================================
        // INJEÇÃO DE CONTEXTO (Sucesso Absoluto)
        // =========================================================================
        const contextPayload = {
          ...simData,
          setIsOrchestratorHydrating,
        };

        return (
          <FinancialHubContext.Provider value={contextPayload}>
            <div className="min-h-screen bg-white text-foreground transition-colors duration-300 relative flex flex-col">
              <SiteHeader />

              {/* 1. CORTINA VISUAL (LOADER GLOBAL) */}
              {isOrchestratorHydrating && (
                <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                  <p className="text-slate-500 font-medium text-sm">Preparando sua simulação...</p>
                </div>
              )}

              {/* 2. RENDERIZAÇÃO OCULTA (DOM Anti-Flicker) */}
              {/* 
                * [LAYOUT ARCHITECTURE]: Padding-top de compensação (pt-20).
                * Como o SiteHeader utiliza 'fixed', o conteúdo principal é jogado para o topo.
                * Este padding garante o offset necessário para manter o conteúdo 
                * fora da zona de colisão do cabeçalho, mantendo o scroll fluido.
                */}
              <main
                className={`flex-1 w-full flex flex-col transition-opacity duration-500 pt-20 ${
                  isOrchestratorHydrating ? "opacity-0 pointer-events-none h-0 overflow-hidden" : "opacity-100"
                }`}
              >
                {children}
              </main>

              {/* 3. FOOTER E FAQS */}
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
