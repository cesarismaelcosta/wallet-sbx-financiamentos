/**
 * @fileoverview Componente: FinancialHubLayout (Esqueleto Mestre de Simulação)
 * @module features/financial-hub/components/layout
 * @path src/features/financial-hub/components/layout/FinancialHubLayout.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-TRUST, HYDRATION VEIL & NEUTRAL PURITY
 * =========================================================================
 * @description Esqueleto mestre e contêiner soberano de dados para jornadas financeiras.
 * Centraliza o ciclo de vida da simulação, barreira de hidratação do Orquestrador,
 * telemetria OLAP e fallbacks resilientes de sessão sob arquitetura neutra autocontida.
 * 
 * [MECÂNICA ARQUITETURAL V3 - BLINDAGEM NEUTRA AUTOCONTIDA & SBX DESIGN SYSTEM]:
 * 1. {Bypass de Tokens Globais Contaminados}: Substitui referências a `bg-background`,
 *    `text-foreground` e `text-muted-foreground` por classes utilitárias neutras diretas
 *    (`bg-white`, `text-neutral-900`, `text-neutral-600`, `border-neutral-200`), blindando
 *    o layout contra qualquer vazamento lilás/lavanda proveniente do CSS base intocável.
 * 2. {Hydration Veil (Cortina Zero-Flicker)}: Mantém os skeletons sincronizados e
 *    visíveis enquanto o Orquestrador processa a resposta da API, alternando para o conteúdo
 *    real via transição suave de opacidade e prevenindo Cumulative Layout Shift (CLS).
 * 3. {Zero-Radius Strict Governance}: Aplica cantos retos (`rounded-none`) em todos os
 *    elementos de controle, botões de ação e telas de fallback de erro.
 * 4. {Failsafe Guard (10s Hard Limit)}: Destrava a interface e abre a cortina caso ocorra
 *    latência anômala ou falha de hidratação em nós filhos, impedindo tela branca permanente.
 * 5. {Tratamento de Exceções Determinístico}: Mapeamento centralizado de códigos de erro
 *    (ex: `SESSION_EXPIRED`, `OFFER_NOT_FOUND`) com contagem regressiva e redirecionamento seguro.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 * @version 9.2.0 (Neutral Purity & Deterministic Hydration Gate)
 */

import React, { useState, useEffect } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router"; 
import { ArrowLeft } from "lucide-react";
import { OrchestratorWrapper } from "@/features/financial-hub/components/shared/OrchestratorWrapper";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext"; 
import { PanelHeader } from "./PanelHeader";
import { PanelFAQ } from "./PanelFAQ";
import { PanelFooter } from "./PanelFooter";
import { PanelProductOfferSkeleton } from "./PanelProductOfferSkeleton";
import { PanelStepSkeleton } from "./PanelStepSkeleton";
import { PanelFAQSkeleton } from "./PanelFAQSkeleton";
import { PanelFooterSkeleton } from "./PanelFooterSkeleton";
import { FinancialHubContext } from "@/features/financial-hub/core/contexts/FinancialHubContext";
import { useOrchestratorHistorySync } from "@/features/financial-hub/core/hooks/useOrchestratorHistorySync";

// =========================================================================
// [CONTRATOS E INTERFACES TIPADAS]
// =========================================================================
interface FinancialHubLayoutProps {
  children: React.ReactNode;
}

interface ErrorCountdownProps {
  // Agora opcional, pois nem todo erro precisa te chutar para outra página
  fallbackUrl?: string; 
  message?: string;
  title?: string;
  
  // Gatilho de resgate: Se existir, o componente executa essa função em vez de mudar de URL
  onRetry?: () => void;
}

function ErrorCountdown({ fallbackUrl, message, title, onRetry }: ErrorCountdownProps) {
  const [countdown, setCountdown] = useState(5);

  useEffect(() => {
    // DECISÃO AUTOMÁTICA: O que fazer quando o relógio zerar
    if (countdown === 0) {
      if (onRetry) {
        // Cenário Timeout: Executa a limpeza do erro. 
        // O usuário NÃO muda de página. O React apenas destrói essa tela de erro e exibe o form novamente.
        onRetry();
      } else if (fallbackUrl) {
        // Cenário Erro Grave (ex: Token vencido): Joga o usuário para o link definido (ex: Login ou Home).
        window.location.href = fallbackUrl;
      }
      return;
    }

    // Mantém o relógio rodando a cada segundo
    const timer = setInterval(() => setCountdown((prev) => prev - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown, fallbackUrl, onRetry]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white font-sans p-6 text-center text-neutral-900">
      <img src="/assets/error/error.webp" alt="Erro na simulação" className="w-32 h-32 object-contain mb-6 mix-blend-multiply saturate-[10%]" />
      
      <h2 className="text-xl font-semibold text-neutral-900 mb-2">{title || "Ops! Tivemos um problema"}</h2>
      <p className="text-neutral-600 font-normal text-sm mb-2 max-w-md px-4">
        {message || "Não foi possível carregar a simulação desta oferta."}
      </p>
      
      {/* MENSAGEM DINÂMICA: O texto muda para deixar claro para o usuário o que o sistema fará sozinho */}
      <p className="text-neutral-400 font-normal text-xs mt-4 mb-6 tabular-nums">
        {onRetry ? `Tentando novamente em ${countdown}s...` : `Retornando em ${countdown}s...`}
      </p>

      {/* AÇÃO MANUAL: Se o usuário não quiser esperar os 5 segundos, ele força a mesma lógica do useEffect */}
      <button
        onClick={() => {
          if (onRetry) onRetry();
          else if (fallbackUrl) window.location.href = fallbackUrl;
        }}
        className="flex items-center justify-center gap-2 px-5 py-2 font-normal rounded-none transition-colors text-sm w-full md:w-auto border border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50 shadow-xs"
      >
        <ArrowLeft className="w-4 h-4" strokeWidth={1.25} />
        <span className="font-jakarta tracking-tight text-center">
          {onRetry ? "Tentar Novamente Agora" : "Retornar agora"}
        </span>
      </button>
    </div>
  );
}

// =========================================================================
// [COMPONENTE PRINCIPAL: FINANCIAL HUB LAYOUT]
// =========================================================================
export function FinancialHubLayout({ children }: FinancialHubLayoutProps) {
  const search = useSearch({ strict: false }) as { visit_id?: string; visit_update_id?: string };
  
  const navigate = useNavigate();
  const { sessionToken, logout, userProfile } = useFinancialAuth();

  const [isOrchestratorHydrating, setIsOrchestratorHydrating] = useState(true);
  const [runtimeError, setRuntimeError] = useState<any>(null);

  // 1. FAILSAFE DE SEGURANÇA (10s Hard Timeout)
  useEffect(() => {
    if (isOrchestratorHydrating) {
      const timeout = setTimeout(() => {
        setIsOrchestratorHydrating(false);
        console.warn(
          "⚠️ [Failsafe] A cortina global foi aberta por timeout de 10s. Verifique integridade de dados nos filhos.",
        );
      }, 10000);
      return () => clearTimeout(timeout);
    }
  }, [isOrchestratorHydrating]);

  // 2. LISTENER DE EVENTOS DE ERRO DE RUNTIME
  useEffect(() => {
    const handleError = (e: any) => {
      setRuntimeError(e.detail);
    };

    window.addEventListener("app-error", handleError);
    return () => window.removeEventListener("app-error", handleError);
  }, []);

  // 🛡️ Sincronização do cursor temporal OLAP e mitigação de botões de navegação
  useOrchestratorHistorySync();

  return (
    <OrchestratorWrapper visitId={search.visit_id ?? ""} visitUpdateId={search.visit_update_id}>
      {(simData) => {
        // Redirecionamento determinístico caso target_url divirja da rota atual
        useEffect(() => {
          if (simData?.target_url && typeof window !== "undefined") {
            const currentPath = window.location.pathname.replace(/\/$/, "");
            let intendedPath = "";
            try {
              intendedPath = new URL(simData.target_url).pathname.replace(/\/$/, "");
            } catch {
              intendedPath = simData.target_url.split("?")[0].replace(/\/$/, "");
            }

            if (currentPath !== intendedPath && intendedPath !== "") {
              window.location.replace(`${simData.target_url}${window.location.search}`);
            }
          }
        }, [simData?.target_url]);

        // Tratamento de Erros de Runtime disparados por eventos globais
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

        // Tratamento de Respostas Negativas da API do Orquestrador
        if (simData?.success === false) {
          let uiTitle = "Ops! Tivemos um problema";
          if (simData.code === "SESSION_EXPIRED") uiTitle = "Sessão Expirada";
          else if (simData.code === "INVALID_RELATIONSHIP") uiTitle = "Acesso Restrito";
          else if (simData.code === "OFFER_NOT_FOUND") uiTitle = "Oferta Indisponível";

          return (
            <ErrorCountdown
              title={uiTitle}
              message={simData.message}
              fallbackUrl={simData.fallback_url || "/"}
            />
          );
        }

        const contextPayload = {
          ...simData,
          setIsOrchestratorHydrating,
        };

        return (
          <FinancialHubContext.Provider value={contextPayload}>
            <div className="min-h-screen bg-surface-alt text-neutral-900 relative flex flex-col">
              {/* Header Institucional Padronizado (64px) */}
              <PanelHeader 
                showNav={true}
                links={[
                  { href: "simulacao", label: "Simulação" },
                  { href: "como-funciona", label: "Como funciona" },
                  { href: "duvidas", label: "Dúvidas" }
                ]}
                showAuth={true} 
                sessionToken={sessionToken}
                userData={userProfile} 
                onLogout={() => logout({ purgeEnv: true })}
                onNavigate={(path) => navigate({ to: path as any })}
              />

              {/* Skeletons Estruturais durante Hidratação */}
              {isOrchestratorHydrating && (
                <>
                  <main className="flex-1 w-full flex flex-col pt-16 bg-white">
                    <div className="max-w-7xl mx-auto px-6 py-12 w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
                      <PanelProductOfferSkeleton />
                      <PanelStepSkeleton />
                    </div>
                  </main>
                  <PanelFAQSkeleton />
                  <PanelFooterSkeleton />
                </>
              )}

              {/* Conteúdo Renderizado da Jornada */}
              <main
                className={`flex-1 w-full flex flex-col transition-opacity duration-300 pt-16 bg-white ${
                  isOrchestratorHydrating ? "opacity-0 pointer-events-none h-0 overflow-hidden" : "opacity-100"
                }`}
              >
                {children}
              </main>

              {/* Rodapé e FAQ liberados pós-hidratação */}
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