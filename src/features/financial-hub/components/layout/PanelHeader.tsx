/**
 * @fileoverview Componente Mestre: PanelHeader
 * @path src/features/financial-hub/components/layout/PanelHeader.tsx
 * 
 * =========================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: DETERMINISTIC NAVIGATION
 * =========================================================================
 * @description Header fixo e estático unificado para todo o ecossistema.
 * Além da UI, este componente atua como o Gatilho Ativo de Navegação OLAP.
 * 
 * [EVOLUÇÃO ARQUITETURAL v8.0.0 - FIM DO PHANTOM VISIT]:
 * 1. {Orquestração Ativa}: O clique na Logo deixou de ser um Link SPA "cego".
 *    Agora, o próprio Header intercepta o clique, isola as "race conditions"
 *    e dispara um `POST` com `action: VISIT` para o Orquestrador.
 * 2. {Navegação Determinística}: O Header aguarda o servidor responder com
 *    a URL oficial (contendo o novo `visit_update_id` atômico) e só então
 *    executa o roteamento (TanStack navigate).
 * 3. {Plug & Play}: Como o payload lê dinamicamente a `window.location.href`,
 *    qualquer tela que importar este Header ganha rastreabilidade completa
 *    de retorno à Home automaticamente.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 * @version 8.0.0 (Active Telemetry & Deterministic Routing)
 */

import React, { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { LogOut, LogIn, Loader2 } from "lucide-react";
import { callOrchestrator } from "@/features/financial-hub/core/services/gateway";
import { getDefaultSbxEnvironment, getTokenForPayload } from "@/services/session";

export interface HeaderLink {
  href: string;
  label: string;
}

interface PanelHeaderProps {
  showNav?: boolean;
  showAuth?: boolean;
  links?: HeaderLink[];
  sessionToken?: string | null;
  onLogout?: () => void;
  onNavigate?: (path: string) => void;
  showEnvironmentLinks?: boolean;
}

export function PanelHeader({ 
  showNav = true, 
  showAuth = false, 
  links = [], 
  sessionToken,
  userData,
  onLogout, 
  onNavigate,
  showEnvironmentLinks = true
}: PanelHeaderProps) {
  
  const navigate = useNavigate();
  const [isNavigating, setIsNavigating] = useState(false);

  const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      console.warn(`[PanelHeader] Elemento com id="${id}" não encontrado no DOM.`);
    }
  };
  
  // =========================================================================
  // =========================================================================
  // ✨ [DETERMINISTIC ROUTING]: O Header toma o controle da volta para a Home
  // =========================================================================
  const handleLogoClick = async () => {
    if (isNavigating) return;
    setIsNavigating(true);

    try {
      const currentHref = window.location.href;
      const ambiente = getDefaultSbxEnvironment();
      const currentSessionToken = sessionToken || getTokenForPayload() || "";
      const urlParams = new URLSearchParams(window.location.search);
      const existingVisitId = urlParams.get("visit_id");
      const existingVisitUpdateId = urlParams.get("visit_update_id");

      const visitPayload = {
        action: "VISIT",
        environment: ambiente,
        target_url: "/sbxpay",
        origin_url: currentHref,
        auth_token: currentSessionToken,
        ...(existingVisitId && { visit_id: existingVisitId }),
        ...(existingVisitUpdateId && { visit_update_id: existingVisitUpdateId }),        
        interaction_context: {
          origin_url: currentHref,
          utm_source: "sbxpay_logo",
          utm_medium: "navigation",
          utm_campaign: "header_home_click",
        },
      };

      const visitResponse = await callOrchestrator(visitPayload, "POST");

      if (visitResponse?.url) {
        // Sucesso: Roteia com o novo visit_update_id gerado atomicamente no Edge
        navigate({ to: visitResponse.url as any });
      } else if (visitResponse?.fallback_url) {
        // ✨ CORREÇÃO: O backend não lançou erro técnico, mas retornou fallback controlado (ex: 401)
        navigate({ to: visitResponse.fallback_url as any });
      } else {
        // Fallback genérico caso a resposta venha realmente vazia
        navigate({ to: "/sbxpay" });
      }
    } catch (error: any) {
      console.error("[PanelHeader] Erro na orquestração ao clicar na Logo:", error);
      
      // ✨ CORREÇÃO: Se o callOrchestrator disparou um throw, temos que caçar o fallback_url.
      // Dependendo do seu wrapper de fetch/axios, ele pode estar em lugares diferentes.
      const fallbackUrl = 
        error?.fallback_url || 
        error?.response?.data?.fallback_url || 
        error?.data?.fallback_url;

      if (fallbackUrl) {
        navigate({ to: fallbackUrl as any });
      } else {
        navigate({ to: "/sbxpay" }); // Somente em último caso chuta pra home cega
      }
    } finally {
      setIsNavigating(false);
    }
  };

  return (
    <>
      <style>{`
        .glass { background: rgba(255, 255, 255, 0.90); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
      `}</style>

      {/* HEADER FIXO: Altura h-16 (64px) */}
      <header className="fixed top-0 left-0 w-full z-50 glass border-b border-slate-100 shadow-xs h-16 flex items-center">
        <div className="max-w-7xl mx-auto w-full px-6 flex items-center justify-between">
          
          {/* Lado Esquerdo: Logo fixa com container block para preservar a tagline */}
          <div className="flex items-center shrink-0">
            {/* 
              ✨ [ACTIVE TELEMETRY]
              O componente visual agora controla a orquestração formal.
              Ao desabilitar o botão durante isNavigating, anulamos race conditions.
            */}
            <button 
              onClick={handleLogoClick}
              disabled={isNavigating}
              className={`block outline-none border-none focus:outline-none focus:ring-0 bg-transparent cursor-pointer p-0 transition-opacity ${isNavigating ? 'opacity-50' : 'hover:opacity-80'}`}
              title="Voltar ao Início"
            >
              <div className="hidden sm:block">
                <WalletLogo size="md" withTagline />
              </div>
              <div className="block sm:hidden">
                <WalletLogo size="sm" withTagline />
              </div>
            </button>
          </div>

          {/* Lado Direito: Navegação e Controles */}
          <div className="flex items-center gap-6">
            {showNav && links.length > 0 && (
              <nav className="hidden md:flex items-center space-x-1 text-[13px] font-semibold text-slate-600">
                {links.map((link) => (
                  <a
                    key={link.href}
                    href={`#${link.href}`}
                    onClick={(e) => handleScroll(e, link.href)}
                    className="px-3 py-2 rounded-xl outline-none hover:bg-purple-50 hover:text-purple-600 transition-all"
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
            )}

            {showAuth && (
              <div className="hidden md:flex items-center space-x-3">
                {sessionToken ? (
                  <button 
                    onClick={onLogout} 
                    className="flex items-center gap-2 px-4 py-1.5 text-xs font-normal rounded-lg border border-purple-600 text-purple-600 hover:bg-purple-50 transition-all cursor-pointer"
                  >
                    Sair <LogOut className="w-3 h-3" />
                  </button>
                ) : (
                  <button 
                    onClick={() => onNavigate?.("/accounts/signin")} 
                    className="flex items-center gap-2 px-4 py-1.5 text-xs font-normal rounded-lg border border-purple-600 text-purple-600 hover:bg-purple-50 transition-all cursor-pointer"
                  >
                    Entrar <LogIn className="w-3 h-3" />
                  </button>
                )}

                {showEnvironmentLinks && (
                  <div className="flex flex-col space-y-1">
                    <a href="/backoffice" target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 rounded-md hover:bg-purple-50 text-[11px] font-bold text-purple-600 transition-colors">backoffice</a>
                    <a href="/sandbox" target="_blank" rel="noopener noreferrer" className="px-2 py-0.5 rounded-md hover:bg-purple-50 text-[11px] font-bold text-purple-600 transition-colors">sandbox</a>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </header>
    </>
  );
}