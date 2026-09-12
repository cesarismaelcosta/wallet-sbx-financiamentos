/**
 * @fileoverview Componente Mestre: PanelHeader (Navegação Global & OLAP Trigger)
 * @module features/financial-hub/components/layout
 * @path src/features/financial-hub/components/layout/PanelHeader.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: DETERMINISTIC NAVIGATION & NEUTRAL PURITY
 * =========================================================================
 * @description Cabeçalho mestre unificado com fixação de viewport (h-16 / 64px)
 * e barreira determinística de rastreabilidade analítica (OLAP). Atua como
 * autoridade central de navegação, sincronização temporal e autenticação stateless.
 * 
 * [MECÂNICA ARQUITETURAL V3 - BLINDAGEM NEUTRA AUTOCONTIDA & SBX DESIGN SYSTEM]:
 * 1. {Deterministic Navigation (Fim do Phantom Visit)}: Intercepta o acionamento
 *    da Logo com handshake atômico (`action: "VISIT"`), aguardando a emissão do
 *    `visit_update_id` antes de acionar a transição de rota pelo TanStack Router.
 * 2. {Bypass de Tokens Globais Contaminados}: Estilização puramente neutra e
 *    autocontida (`bg-white`, `bg-neutral-100`, `border-neutral-200`, `text-neutral-900`),
 *    blindando o layout contra vazamentos de variáveis legadas com matiz lilás/lavanda.
 * 3. {Avatar Circular Preservado}: Mantém estritamente o formato circular (`rounded-full`)
 *    para o elemento de iniciais do usuário, tanto na barra desktop quanto na folha móvel.
 * 4. {Zero-Radius Strict Governance}: Aplica cantos retos (`rounded-none`) em todos
 *    os demais elementos estruturais (links de navegação, menu Popover e Sheet mobile).
 * 5. {Stateless Fat-JWT Awareness}: Derivação prioritária de identidade em memória
 *    via `FinancialAuthContext`, com fallback seguro para login alfanumérico e initials limpas.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 * @version 9.2.0 (Gemini Pro Architecture Enforcement & Neutral Shading)
 */

import React, { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { LogOut, AppWindow, Settings, Home } from "lucide-react";
import { callOrchestrator } from "@/features/financial-hub/core/services/gateway";
import type { BFFUserProfile } from "@/features/financial-hub/components/shared/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

// =========================================================================
// [HELPERS: EXTRATOR DE INICIAIS SEMÂNTICO]
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

// =========================================================================
// [CONTRATOS E INTERFACES TIPADAS]
// =========================================================================
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

// =========================================================================
// [COMPONENTE PRINCIPAL: PANEL HEADER]
// =========================================================================
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

  // 1. Identidade Omni-Aware a partir do Fat-JWT em memória
  const { userProfile } = useFinancialAuth();
  
  const hubName = userData?.name || userProfile?.name;
  const hubLogin = userData?.login || userProfile?.login;
  
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
  // ⚡ [DETERMINISTIC ROUTING]: Disparo Transacional e Handshake OLAP
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

      // Tratamento anti-crash para URLs absolutas retornadas pelo Orquestrador
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
      {/* 🔒 [INTERACTION LOCK]: Bloqueia cliques concorrentes durante o handshake */}
      {isNavigating && (
        <div className="fixed inset-0 z-[9999] bg-black/10 backdrop-blur-[1px] cursor-wait" />
      )}

      {/* =====================================================================
          HEADER FIXO INSTITUCIONAL (Altura Estática: 64px / h-16)
         ===================================================================== */}
      <header className="fixed top-0 left-0 w-full z-50 bg-white/95 backdrop-blur-md border-b border-neutral-200 shadow-xs h-16 flex items-center">
        <div className="max-w-7xl mx-auto w-full px-6 flex items-center justify-between">
          
          {/* Lado Esquerdo: Logo Oficial Superbid */}
          <div className="flex items-center shrink-0 h-full">
            <button 
              onClick={handleLogoClick}
              disabled={isNavigating}
              className={`flex items-center outline-none border-none focus:outline-none focus:ring-0 bg-transparent cursor-pointer p-0 transition-opacity ${
                isNavigating ? "opacity-50" : "hover:opacity-80"
              }`}
              title="Voltar ao Início"
            >
              <div className="hidden sm:flex items-center [&_img]:h-6 [&_img]:w-auto">
                <WalletLogo size="md" withTagline />
              </div>
              <div className="flex sm:hidden items-center [&_img]:h-5 [&_img]:w-auto">
                <WalletLogo size="sm" withTagline />
              </div>
            </button>
          </div>

          {/* Lado Direito: Navegação e Controles de Sessão */}
          <div className="flex items-center gap-6">
            {showNav && links.length > 0 && (
              <nav className="hidden md:flex items-center gap-6">
                {links.map((link) => (
                  <a
                    key={link.href}
                    href={`#${link.href}`}
                    onClick={(e) => handleScroll(e, link.href)}
                    className="text-[13px] font-medium text-neutral-600 hover:text-neutral-900 focus-visible:text-neutral-900 focus-visible:outline-none transition-colors relative group"
                  >
                    {link.label}
                    {/* Linha animada que expande no Hover e no Focus (Tab) */}
                    <span className="absolute -bottom-1 left-0 h-px w-0 bg-neutral-900 group-hover:w-full group-focus-visible:w-full transition-all duration-500 ease-out"></span>
                  </a>
                ))}
              </nav>
            )}

            {showAuth && (
              <div className="flex items-center space-x-3">
                {sessionToken ? (
                  <div className="flex items-center gap-3">
                    
                    {/* =========================================================
                        1. DESKTOP: Popover com Avatar Circular
                       ========================================================= */}
                    <div className="hidden md:block">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button 
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 border border-neutral-200 outline-none ring-0 hover:bg-neutral-200 transition-colors cursor-pointer"
                            title={identityString}
                          >
                            <span className="text-[13px] font-medium tracking-tight text-neutral-800 font-mono">
                              {getInitials(identityString)}
                            </span>
                          </button>
                        </PopoverTrigger>
                        
                        <PopoverContent className="w-52 p-1.5 shadow-md border border-neutral-200 bg-white rounded-none" align="end" sideOffset={8}>
                          <button
                            onClick={() => handleLogoClick()}
                            className="flex w-full items-center gap-2.5 rounded-none px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-100 hover:text-neutral-950 transition-colors cursor-pointer"
                          >
                            <Home className="h-4 w-4 text-neutral-500" /> Início
                          </button>

                          <div className="h-px bg-neutral-200 my-1 mx-1" />

                          {showEnvironmentLinks && (
                            <>
                              <a 
                                href="/backoffice" 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="flex w-full items-center gap-2.5 rounded-none px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-100 hover:text-neutral-950 transition-colors"
                              >
                                <AppWindow className="h-4 w-4 text-neutral-500" /> Backoffice
                              </a>
                              <a 
                                href="/sandbox" 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="flex w-full items-center gap-2.5 rounded-none px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-100 hover:text-neutral-950 transition-colors"
                              >
                                <Settings className="h-4 w-4 text-neutral-500" /> Sandbox
                              </a>
                              <div className="h-px bg-neutral-200 my-1 mx-1" />
                            </>
                          )}

                          <button 
                            onClick={onLogout} 
                            className="flex w-full items-center gap-2.5 rounded-none px-3 py-2 text-xs font-medium text-neutral-800 hover:bg-neutral-100 hover:text-neutral-950 transition-colors cursor-pointer"
                          >
                            <LogOut className="h-4 w-4 text-neutral-500" /> Sair
                          </button>
                        </PopoverContent>
                      </Popover>
                    </div>

                    {/* =========================================================
                        2. MOBILE: Bottom Sheet com Avatar Circular
                       ========================================================= */}
                    <div className="block md:hidden">
                      <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                        <SheetTrigger asChild>
                          <button 
                            className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 border border-neutral-200 outline-none transition-colors cursor-pointer"
                            title={identityString}
                          >
                            <span className="text-[13px] font-medium tracking-tight text-neutral-800 font-mono">
                              {getInitials(identityString)}
                            </span>
                          </button>
                        </SheetTrigger>

                        <SheetContent side="bottom" className="rounded-none p-6 bg-white border-t border-neutral-200 z-50">
                          <SheetHeader className="text-left pb-4 border-b border-neutral-200">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-800 font-semibold border border-neutral-200 shrink-0 font-mono">
                                {getInitials(identityString)}
                              </div>
                              <div className="overflow-hidden">
                                <SheetTitle className="text-sm font-semibold text-neutral-900 truncate">
                                  {identityString}
                                </SheetTitle>
                                {hubLogin && (
                                  <p className="text-xs text-neutral-500 font-normal truncate">
                                    {hubLogin}
                                  </p>
                                )}
                              </div>
                            </div>
                          </SheetHeader>

                          <div className="flex flex-col gap-1 pt-4">
                            <button
                              onClick={() => {
                                setIsMobileMenuOpen(false);
                                handleLogoClick();
                              }}
                              className="flex items-center gap-3 px-3 py-2.5 rounded-none text-xs font-medium text-neutral-800 hover:bg-neutral-100 hover:text-neutral-950 transition-colors text-left w-full cursor-pointer"
                            >
                              <Home className="h-4 w-4 text-neutral-500" /> Início
                            </button>
                            
                            <div className="h-px bg-neutral-200 my-1 mx-1" />

                            {showEnvironmentLinks && (
                              <>
                                <a
                                  href="/backoffice"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => setIsMobileMenuOpen(false)}
                                  className="flex items-center gap-3 px-3 py-2.5 rounded-none text-xs font-medium text-neutral-800 hover:bg-neutral-100 hover:text-neutral-950 transition-colors"
                                >
                                  <AppWindow className="h-4 w-4 text-neutral-500" /> Backoffice
                                </a>
                                <a
                                  href="/sandbox"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={() => setIsMobileMenuOpen(false)}
                                  className="flex items-center gap-3 px-3 py-2.5 rounded-none text-xs font-medium text-neutral-800 hover:bg-neutral-100 hover:text-neutral-950 transition-colors"
                                >
                                  <Settings className="h-4 w-4 text-neutral-500" /> Sandbox
                                </a>
                                <div className="h-px bg-neutral-200 my-1 mx-1" />
                              </>
                            )}
                            
                            <div className="pt-2">
                              <button
                                onClick={() => {
                                  setIsMobileMenuOpen(false);
                                  onLogout?.();
                                }}
                                className="flex w-full items-center gap-3 px-3 py-2.5 rounded-none text-xs font-medium text-neutral-800 bg-neutral-50 border border-neutral-200 hover:bg-neutral-100 transition-colors cursor-pointer"
                              >
                                <LogOut className="h-4 w-4 text-neutral-500" /> 
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