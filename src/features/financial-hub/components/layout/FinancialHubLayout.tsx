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
 * Exibe um loader, o motivo contextual do erro e força o redirecionamento após o fim do contador.
 * 
 * @param {string} fallbackUrl - URL de destino para onde o usuário será redirecionado ao fim do timer ou no clique.
 * @param {string} [message] - Mensagem detalhada do erro (injetada direto da resposta da API).
 * @param {string} [title] - Título de destaque baseado no código do erro (ex: "Sessão Expirada").
 */
function ErrorCountdown({ fallbackUrl, message, title }: { fallbackUrl: string, message?: string, title?: string }) {
  // Estado que controla o cronômetro regressivo (inicia em 10 segundos)
  const [countdown, setCountdown] = useState(10);

  // Efeito que gerencia o ciclo de vida do timer
  useEffect(() => {
    // Quando o cronômetro zera, força o redirecionamento via BOM (Browser Object Model)
    if (countdown === 0) {
      window.location.href = fallbackUrl;
      return;
    }
    // Subtrai 1 segundo do contador atual
    const timer = setInterval(() => setCountdown((prev) => prev - 1), 1000);
    
    // Cleanup function: limpa o intervalo caso o componente desmonte antes de zerar
    return () => clearInterval(timer);
  }, [countdown, fallbackUrl]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans'] p-6 text-center">
      
      {/* Indicador visual de processamento/espera */}
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#B400FF] mb-6"></div>

      {/* TÍTULO DINÂMICO: Recebe o contexto mapeado ou usa um texto genérico caso venha vazio */}
      <h2 className="text-xl font-bold text-slate-800 mb-2">
        {title || "Ops! Tivemos um problema"}
      </h2>
      
      {/* MENSAGEM DINÂMICA: Renderiza a mensagem REAL que a API devolveu e o Wrapper repassou */}
      <p className="text-slate-500 font-medium text-sm mb-2">
        {message || "Falha ao carregar simulação..."}
      </p>
      
      {/* Feedback visual do timer para o usuário */}
      <p className="text-slate-400 font-medium text-sm mb-6">Retornando em {countdown}s...</p>
      
      {/* Botão de escape antecipado (bypass do timer) */}
      <button 
        onClick={() => window.location.href = fallbackUrl}
        className="flex items-center text-primary font-semibold text-sm hover:opacity-80 transition-opacity"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        retornar agora
      </button>
    </div>
  );
}

export function FinancialHubLayout({ children }: FinancialHubLayoutProps) {
  // Captura parâmetros da URL (visit_id, visit_update_id) para enviar ao Orchestrator
  const search = useSearch({ strict: false });

  // 1. ESTADO DA CORTINA: Controla se o App está na fase de "preparação" (loading visual)
  const [isOrchestratorHydrating, setIsOrchestratorHydrating] = useState(true);

  // 2. Tratamento de erros de componentes
  const [runtimeError, setRuntimeError] = useState<any>(null);

  // 3. FAILSAFE DE SEGURANÇA: 
  // Garante que a cortina (tela de loading) seja removida à força após 10 segundos
  // Previne que o usuário fique preso em um "loading infinito" caso ocorra uma falha silenciosa nas rotas filhas.
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

  // Recebe erros de todos os componentes (step1 por exemplo que chama simulação...)
  useEffect(() => {
    // Listener global: Qualquer componente pode disparar o erro
    const handleError = (e: any) => {
      setRuntimeError(e.detail);
    };

    window.addEventListener('app-error', handleError);
    return () => window.removeEventListener('app-error', handleError);
  }, []);

  return (
    <OrchestratorWrapper visitId={(search as any).visit_id} visitUpdateId={(search as any).visit_update_id}>
      {(simData) => {
        // =========================================================================
        // PRIORIDADE: Se houver erro de runtime, mostra o countdown
        // =========================================================================
        if (runtimeError) {
          // Título padrão de fallback
          let uiTitle = "Ops! Tivemos um problema";
          
          // MAP DE CONTEXTO: Enriquecimento semântico baseado no código de erro da API.
          // Aqui garantimos que o usuário veja um título coerente com a falha ocorrida.
          if (runtimeError.code === 'SESSION_EXPIRED') uiTitle = "Sessão Expirada";
          else if (runtimeError.code === 'INVALID_RELATIONSHIP') uiTitle = "Acesso Restrito";
          else if (runtimeError.code === 'OFFER_NOT_FOUND') uiTitle = "Oferta Indisponível";

          return (
            <ErrorCountdown 
              title={uiTitle}
              message={runtimeError.message} 
              fallbackUrl={runtimeError.fallback_url || "/"} 
            />
          );
        }

        // =========================================================================
        // TRATAMENTO DE ERROS (API retornou success: false via OrchestratorWrapper)
        // =========================================================================
        if (simData?.success === false) {
            // Título padrão de fallback
            let uiTitle = "Ops! Tivemos um problema";
            
            // MAP DE CONTEXTO: Enriquecimento semântico baseado no código de erro da API.
            // Aqui garantimos que o usuário veja um título coerente com a falha ocorrida.
            if (simData.code === 'SESSION_EXPIRED') uiTitle = "Sessão Expirada";
            else if (simData.code === 'INVALID_RELATIONSHIP') uiTitle = "Acesso Restrito";
            else if (simData.code === 'OFFER_NOT_FOUND') uiTitle = "Oferta Indisponível";

            // Renderiza o componente de erro blindado, repassando o título, a mensagem da API e a rota
            return (
                <ErrorCountdown 
                    title={uiTitle}
                    message={simData.message} 
                    fallbackUrl={simData.fallback_url || "/"} 
                />
            );
        }
        
        // =========================================================================
        // SUCESSO & ROTEAMENTO (API mandou target_url)
        // =========================================================================
        if (simData?.target_url) {
          const currentPath = window.location.pathname.replace(/\/$/, "");

          let intendedPath = "";
          try {
            intendedPath = new URL(simData.target_url).pathname.replace(/\/$/, "");
          } catch (e) {
            intendedPath = simData.target_url.split("?")[0].replace(/\/$/, "");
          }

          // PROTEÇÃO ANTI-TRAPAÇA: 
          // Se o usuário tentar acessar uma jornada diferente do que o motor determinou,
          // forçamos o redirecionamento de volta para o destino correto e evitamos inconsistência de dados.
          if (currentPath !== intendedPath && intendedPath !== "") {
            window.location.replace(`${simData.target_url}${window.location.search}`);
            return null; // Retorna nulo para abortar a renderização da árvore de filhos imediatamente
          }
        }

        // =========================================================================
        // INJEÇÃO DE CONTEXTO (Sucesso Absoluto)
        // =========================================================================
        // Empacota os dados da API + a função de controle da cortina para uso global via Context Provider
        const contextPayload = {
          ...simData,
          setIsOrchestratorHydrating,
        };

        return (
          <FinancialHubContext.Provider value={contextPayload}>
            <div className="min-h-screen bg-white text-foreground transition-colors duration-300 relative flex flex-col">
              
              <SiteHeader />

              {/* ===========================================================================
                  1. CORTINA VISUAL (LOADER GLOBAL)
                  Sobrepõe a tela inteira enquanto a aplicação realiza chamadas vitais e injeta dados.
                  =========================================================================== */}
              {isOrchestratorHydrating && (
                <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
                  <p className="text-slate-500 font-medium text-sm">
                    Preparando sua simulação...
                  </p>
                </div>                 
              )}

              {/* ===========================================================================
                  2. RENDERIZAÇÃO OCULTA (DOM Anti-Flicker)
                  O {children} precisa existir no DOM para os hooks de injeção dispararem,
                  mas só deve aparecer visivelmente quando a hidratação estiver completa.
                  Usamos tailwind (opacity-0 h-0) para escondê-lo no DOM em vez de abortar a montagem.
                  =========================================================================== */}
              <main
                className={`flex-1 w-full flex flex-col transition-opacity duration-500 ${
                  isOrchestratorHydrating ? "opacity-0 pointer-events-none h-0 overflow-hidden" : "opacity-100"
                }`}
              >
                {children}
              </main>

              {/* ===========================================================================
                  3. FOOTER E FAQS
                  Só renderiza o rodapé após a cortina abrir, mantendo o foco visual no Loader inicial.
                  =========================================================================== */}
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