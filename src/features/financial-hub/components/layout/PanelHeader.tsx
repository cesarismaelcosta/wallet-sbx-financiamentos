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
 * @version 8.1.0 (Correção de Crash de Roteamento Absoluto + Limpeza de Legado VL)
 */

import React, { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { LogOut, LogIn, AppWindow, Settings, Home } from "lucide-react";
import { callOrchestrator } from "@/features/financial-hub/core/services/gateway";
import type { BFFUserProfile } from "@/features/financial-hub/components/shared/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

// =========================================================================
// ✨ HELPER: Extrator de Iniciais (Nível Especialista)
// =========================================================================
export function getInitials(identifier?: string | null): string {
  if (!identifier) return "??";

  if (identifier.includes("@")) {
    return identifier.split("@")[0].substring(0, 2).toUpperCase();
  }

  const names = identifier.trim().split(/\s+/);
  if (names.length === 0) return "??";
  if (names.length === 1) return names[0].substring(0, 2).toUpperCase();
  
  const firstLetter = names[0].charAt(0);
  const lastLetter = names[names.length - 1].charAt(0);
  return `${firstLetter}${lastLetter}`.toUpperCase();
}

export interface HeaderLink {
  href: string;
  label: string;
}

interface PanelHeaderProps {
  showNav?: boolean;
  showAuth?: boolean;
  links?: HeaderLink[];
  sessionToken?: string | null;
  userData?: BFFUserProfile | null;
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // ✨ IDENTIDADE OMNI-AWARE & FAT JWT (100% STATELESS)
  const { userProfile } = useFinancialAuth();
  
  // O userData pode vir via props (se injetado por outro lugar)
  // ou via userProfile (que é o Fat JWT decodificado em memória no contexto)
  const hubName = userData?.name || userProfile?.name;
  const hubLogin = userData?.login || userProfile?.login;
  
  // ✨ FIX: Hierarquia limpa e estrita para Stateless.
  // Prioriza o Nome, e usa o login da Superbid como fallback.
  let identityString = "??";

  if (hubName && hubName !== "N/A" && hubName !== "Visitante Logado") {
    identityString = hubName;
  } else if (hubLogin) {
    identityString = hubLogin;
  }

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
  // ✨ [DETERMINISTIC ROUTING]: O Header toma o controle da volta para a Home
  // =========================================================================
  const handleLogoClick = async () => {
    if (isNavigating) return;
    setIsNavigating(true);

    try {
      const currentHref = window.location.href;
      const urlParams = new URLSearchParams(window.location.search);
      const existingVisitId = urlParams.get("visit_id");
      const existingVisitUpdateId = urlParams.get("visit_update_id");

      const visitPayload = {
        action: "VISIT",
        action_description: "HEADER_LOGO_CLICK",
        target_url: "/sbxpay",
        origin_url: currentHref,
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

      // ✨ FIX: Prevenção de Crash. O TanStack navigate quebra com URLs absolutas.
      // O Orquestrador devolve URLs absolutas. Precisamos extrair pathname + search.
      if (visitResponse?.url) {
        const urlObj = new URL(visitResponse.url, window.location.origin);
        navigate({ 
          to: urlObj.pathname as any,
          search: Object.fromEntries(urlObj.searchParams.entries()) as any
        });
      } else if (visitResponse?.fallback_url) {
        const urlObj = new URL(visitResponse.fallback_url, window.location.origin);
        navigate({ 
          to: urlObj.pathname as any,
          search: Object.fromEntries(urlObj.searchParams.entries()) as any
        });
      } else {
        navigate({ to: "/sbxpay" });
      }
    } catch (error: any) {
      console.error("[PanelHeader] Erro na orquestração ao clicar na Logo:", error);
      
      const fallbackUrl = 
        error?.fallback_url || 
        error?.response?.data?.fallback_url || 
        error?.data?.fallback_url;

      if (fallbackUrl) {
        const urlObj = new URL(fallbackUrl, window.location.origin);
        navigate({ 
          to: urlObj.pathname as any,
          search: Object.fromEntries(urlObj.searchParams.entries()) as any
        });
      } else {
        navigate({ to: "/sbxpay" }); 
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

      {/* 🔒 OVERLAY GLOBAL DE BLOQUEIO DE TOQUE DURANTE A NAVEGAÇÃO DO HEADER */}
      {isNavigating && (
        <div className="fixed inset-0 z-[9999] bg-transparent cursor-wait" />
      )}

      {/* HEADER FIXO: Altura h-16 (64px) */}
      <header className="fixed top-0 left-0 w-full z-50 glass border-b border-slate-100 shadow-xs h-16 flex items-center">
        <div className="max-w-7xl mx-auto w-full px-6 flex items-center justify-between">
          
          {/* Lado Esquerdo: Logo fixa com container block para preservar a tagline */}
          <div className="flex items-center shrink-0 h-full">
            <button 
              onClick={handleLogoClick}
              disabled={isNavigating}
              className={`flex items-center h-full outline-none border-none focus:outline-none focus:ring-0 bg-transparent cursor-pointer p-0 transition-opacity ${isNavigating ? 'opacity-50' : 'hover:opacity-80'}`}
              title="Voltar ao Início"
            >
              <div className="hidden sm:block">
                <WalletLogo size="md" withTagline />
              </div>
              <div className="flex sm:hidden items-center">
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
              <div className="flex items-center space-x-3">
                {sessionToken ? (
                  <div className="flex items-center gap-3">
                    
                    {/* =================================================== */}
                    {/* 1. DESKTOP: Popover com a Home no topo do menu */}
                    {/* =================================================== */}
                    <div className="hidden md:block">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button 
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 border-none outline-none ring-0 shadow-none hover:bg-slate-200 transition-colors cursor-pointer"
                            title={identityString}
                          >
                            <span className="text-[13px] font-normal tracking-tight text-[#B300FF]" style={{ fontWeight: 400 }}>
                              {getInitials(identityString)}
                            </span>
                          </button>
                        </PopoverTrigger>
                        
                        <PopoverContent className="w-48 p-1.5 shadow-md border-slate-100" align="end" sideOffset={8}>
                          {/* ✨ Atalho de Home no Popover Desktop (com roxo da marca) */}
                          <button
                            onClick={() => {
                              handleLogoClick();
                            }}
                            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-purple-50 hover:text-purple-600 transition-colors cursor-pointer group"
                          >
                            <Home className="h-4 w-4 text-[#B300FF] group-hover:text-purple-600" /> Início
                          </button>
                          <div className="h-px bg-slate-100 my-1 mx-1" />

                          {showEnvironmentLinks && (
                            <>
                              <a href="/backoffice" target="_blank" rel="noopener noreferrer" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 hover:text-purple-600 transition-colors">
                                <AppWindow className="h-4 w-4 text-slate-500" /> Backoffice
                              </a>
                              <a href="/sandbox" target="_blank" rel="noopener noreferrer" className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 hover:text-purple-600 transition-colors">
                                <Settings className="h-4 w-4 text-slate-500" /> Sandbox
                              </a>
                              <div className="h-px bg-slate-100 my-1 mx-1" />
                            </>
                          )}
                          <button onClick={onLogout} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-[13px] font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer">
                            <LogOut className="h-4 w-4 text-slate-500" /> Sair
                          </button>
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* =================================================== */}
                    {/* 2. MOBILE: Apenas o Avatar limpo acionando a Sheet   */}
                    {/* =================================================== */}
                    <div className="block md:hidden">
                      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                        <SheetTrigger asChild>
                          <button 
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 border-0 outline-none shadow-none ring-0 focus:ring-0 focus:ring-offset-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none data-[state=open]:ring-0 data-[state=open]:outline-none hover:bg-slate-200 transition-colors cursor-pointer select-none"
                            title={identityString}
                          >
                            <span className="text-[13px] tracking-tight text-[#B300FF]" style={{ fontWeight: 400 }}>
                              {getInitials(identityString)}
                            </span>
                          </button>
                        </SheetTrigger>

                        <SheetContent side="bottom" className="rounded-t-3xl p-6 bg-white border-t border-slate-100 z-50">
                          <SheetHeader className="text-left pb-4 border-b border-slate-100">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-50 text-[#B300FF] font-bold border border-purple-100 shrink-0">
                                {getInitials(identityString)}
                              </div>
                              <div className="overflow-hidden">
                                <SheetTitle className="text-sm font-bold text-slate-900 truncate">
                                  {identityString}
                                </SheetTitle>
                                {hubLogin && (
                                  <p className="text-xs text-slate-500 font-normal truncate">
                                    {hubLogin}
                                  </p>
                                )}
                              </div>
                            </div>
                          </SheetHeader>

                          <div className="flex flex-col gap-1.5 pt-4">
                            {/* ✨ Atalho de Home na Bottom Sheet Mobile (com roxo da marca) */}
                            <button
                              onClick={() => {
                                setIsMobileMenuOpen(false);
                                handleLogoClick();
                              }}
                              className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-700 hover:bg-purple-50 hover:text-purple-600 transition-colors text-left w-full cursor-pointer group"
                            >
                              <Home className="h-5 w-5 text-[#B300FF] group-hover:text-purple-600" /> Início
                            </button>
                            <div className="h-px bg-slate-100 my-1 mx-2" />

                            {showEnvironmentLinks && (
                              <>
                                <a
                                  href="/backoffice"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => setIsMobileMenuOpen(false)}
                                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-700 hover:bg-purple-50 hover:text-purple-600 transition-colors"
                                >
                                  <AppWindow className="h-5 w-5 text-slate-500" /> Backoffice
                                </a>
                                <a
                                  href="/sandbox"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => setIsMobileMenuOpen(false)}
                                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-700 hover:bg-purple-50 hover:text-purple-600 transition-colors"
                                >
                                  <Settings className="h-5 w-5 text-slate-500" /> Sandbox
                                </a>
                                <div className="h-px bg-slate-100 my-1 mx-2" />
                              </>
                            )}
                            
                            <div className="pt-2">
                              <button
                                onClick={() => {
                                  setIsMobileMenuOpen(false);
                                  onLogout?.();
                                }}
                                className="flex w-full items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-slate-700 bg-slate-50/80 border border-slate-100 hover:bg-purple-50 hover:text-purple-600 hover:border-purple-100 transition-all cursor-pointer"
                              >
                                <LogOut className="h-5 w-5 text-slate-500" /> 
                                <span>Sair da Conta</span>
                              </button>
                            </div>
                          </div>
                        </SheetContent>
                      </Sheet>
                    </div>

                  </div>
                ) : null}
              </div>
            )}
          </div>

        </div>
      </header>
    </>
  );
}