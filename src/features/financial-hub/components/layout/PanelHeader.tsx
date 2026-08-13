/**
 * @fileoverview Componente: PanelHeader
 * @path src/features/financial-hub/components/layout/PanelHeader.tsx
 * 
 * =========================================================================
 * [DOCUMENTAÇÃO DO COMPONENTE]
 * =========================================================================
 * @description Header fixo e estático unificado para todo o ecossistema.
 * Mantém altura absoluta rigorosa (64px) e alinhamento milimétrico da logo.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import React from "react";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { LogOut, LogIn } from "lucide-react";

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
  onLogout, 
  onNavigate,
  showEnvironmentLinks = true
}: PanelHeaderProps) {
  
  const handleScroll = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      console.warn(`[PanelHeader] Elemento com id="${id}" não encontrado no DOM.`);
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
            <a href="/sbxpay/" className="block outline-none border-none focus:outline-none focus:ring-0">
              <div className="hidden sm:block">
                <WalletLogo size="md" withTagline />
              </div>
              <div className="block sm:hidden">
                <WalletLogo size="sm" withTagline />
              </div>
            </a>
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