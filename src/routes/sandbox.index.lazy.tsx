/**
 * @fileoverview Componente: SandboxHome (Rota: /sandbox/)
 * * =========================================================================
 * [ARQUITETURA & CONTROLE DE AMBIENTE]
 * =========================================================================
 * Ponto de entrada do ambiente de homologação e testes do Financial Hub.
 * * [Responsabilidades]:
 * 1. Navegação Baseada em Fluxos: Mapeia as jornadas via links diretos ou cliques.
 * 2. Visualização de Ambiente: Exibe o ambiente atual (Stage/Prod) em modo read-only.
 * 3. Gestão de Sessão: Exibe os dados do utilizador logado e permite o logout limpo.
 */

import React, { useState, JSX } from "react";
import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { CreditCard, Car, Home, UserSquare2, TrendingUp, ShieldCheck, ChevronRight, Loader2, LogOut } from "lucide-react";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";

interface JourneyLink {
  label: string;
  flowKey: string;
  disabled?: boolean;
}

interface MenuOption {
  title: string;
  subtitle: string;
  icon: JSX.Element;
  route: string;
  flowKey?: string;
  description: string;
  disabled?: boolean;
  links?: JourneyLink[];
}

const SandboxHome = () => {
  const navigate = useNavigate();
  const { logout, userId, token } = useFinancialAuth();
  
  // =========================================================================
  // [STATE]: Controle de loading e Leitura do Ambiente (Read-Only)
  // =========================================================================
  const [loading, setLoading] = useState(false);
  
  const [ambiente] = useState<"staging" | "production">(
    () => (localStorage.getItem("sbx_environment") as "staging" | "production") || "production"
  );

  // =========================================================================
  // [HANDLERS]: Ações do Usuário e Navegação
  // =========================================================================
  const handleLogout = async () => {
    localStorage.removeItem("sbx_environment");
    await logout();
  };

  const handleProductClick = async (route: string, flowKey?: string) => {
    setLoading(true);
    try {
      await navigate({ 
        to: route, 
        search: { 
          flow: flowKey,
          redirect_uri: window.location.pathname 
        } as any 
      });
    } catch (error) {
      console.error("Erro na navegação:", error);
      setLoading(false);
    }
  };

  // =========================================================================
  // [CONFIG]: Mapa de Jornadas com Links Internos
  // =========================================================================
  const menuOptions: MenuOption[] = [
    {
      title: "Cartão de Crédito",
      subtitle: "Parcelamento até 18x",
      icon: <CreditCard className="w-8 h-8 text-primary" />,
      route: "/sandbox/offer",
      description: "Simulação de parcelamento de lote para prazos e tarifas cadastradas no app.",
      disabled: false,
      links: [
        { label: "Consultar ofertas para parcelamento", flowKey: "Cartão" }
      ]
    },
    {
      title: "Veículos",
      subtitle: "Financiamento de carros e caminhões",
      icon: <Car className="w-8 h-8 text-primary" />,
      route: "/sandbox/offer",
      description: "Simulação de financiamentos de carros e caminhões da MeResolve integradas para PF e e-mail para PJ.",
      disabled: false,
      links: [
        { label: "Consultar carros com financiamento", flowKey: "Carros" },
        { label: "Consultar caminhões com financiamento", flowKey: "Caminhões" }
      ]
    },
    {
      title: "Imóveis",
      subtitle: "Financiamento de imóveis",
      icon: <Home className="w-8 h-8 text-primary" />,
      route: "/sandbox/offer",
      description: "Simulação de financiamento de imóveis integrada com a Creditas ou Flow.",
      disabled: true,
      links: [
        { label: "Consultar imóveis com financiamento", flowKey: "Imóveis" }
      ]
    },
    {
      title: "Vendedor",
      subtitle: "Financiamento próprio do vendedor",
      icon: <UserSquare2 className="w-8 h-8 text-primary" />,
      route: "/sandbox/offer",
      flowKey: "Vendedor",
      description: "Simulação do vendedor VRental enviada por e-mail para avaliação.",
      disabled: true,
    },
    {
      title: "Home/Auto Equity",
      subtitle: "Crédito para investir na Superbid",
      icon: <TrendingUp className="w-8 h-8 text-primary" />,
      route: "/sandbox/offer",
      flowKey: "AutoEquity",
      description: "Simulação integrada para jornadas auto e home equity da Creditas ou Flow (mock auto-equity).",
      disabled: false,
    },
    {
      title: "Seguros",
      subtitle: "Seguro auto",
      icon: <ShieldCheck className="h-8 w-8 text-primary" />,
      route: "/sandbox/offer",
      flowKey: "SeguroAuto",
      description: "Rota para LP de seguros de veículos MeResolve.",
      disabled: false,
    },
  ];

  // =========================================================================
  // [VIEW]: Renderização da Interface
  // =========================================================================
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col overflow-hidden relative">
      
      {/* HEADER: Central de Controle */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white shadow-sm">
        <div className="mx-auto flex h-24 max-w-7xl items-center justify-between px-6">
          
          {/* LADO ESQUERDO: Apenas ajuste da Logo */}
          <div className="flex items-center gap-6 shrink-0">
            <div className="h-6 w-px bg-slate-200 hidden sm:block" />
            <div className="hidden sm:block"><WalletLogo size="md" withTagline /></div>
            
            {/* Bloco da Sessão mantido */}
            <div className="flex flex-col gap-1 border-l border-slate-200 pl-6">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  Sessão Ativa
                </span>
                <div className="max-w-[200px]">
                  <span className="text-[8px] font-mono text-slate-500 truncate block">
                    {token || "N/A"}
                  </span>
                </div>
            </div>
          </div>
          
          {/* LADO DIREITO: Usuário e Ações mantidos */}
          <div className="flex items-center gap-6 border-l border-slate-200 pl-6 shrink-0">
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-end text-right">
                  <span className="text-[12px] font-bold text-slate-800 uppercase">cismael</span>
                  <span className="text-[10px] font-mono text-slate-500">USER ID: {userId || "---"}</span>
                </div>
                
                <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-sm border ${
                  ambiente === "staging" 
                    ? "bg-red-50 text-red-600 border-red-200" 
                    : "bg-emerald-50 text-emerald-700 border-emerald-200"
                }`}>
                  {ambiente === "staging" ? "STAGING" : "PRODUÇÃO"}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Link
                  to="/backoffice"
                  className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm hidden sm:block"
                >
                  Backoffice
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-2 rounded-lg text-xs font-bold transition-all"
                >
                  <LogOut className="w-3 h-3" />
                  <span className="hidden sm:inline">Sair</span>
                </button>
              </div>
          </div>
        </div>
      </header>

      {/* MAIN: Catálogo de Jornadas */}
      <main className="flex-grow max-w-6xl mx-auto px-4 sm:px-8 py-12 w-full">
        <div className="mb-10 text-left">
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">O que vamos testar?</h2>
          <p className="text-slate-500 mt-2 text-sm">
            Selecione uma jornada ativa para iniciar a <strong>simulação</strong>.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {menuOptions.map((option, index) => {
            const hasLinks = !option.disabled && option.links && option.links.length > 0;
            const CardContainer = hasLinks ? "div" : "button";

            return (
              <CardContainer
                key={index}
                {...(!hasLinks && {
                  onClick: () => !option.disabled && handleProductClick(option.route, option.flowKey),
                  disabled: option.disabled
                })}
                className={`group flex flex-col p-5 bg-white border-2 rounded-2xl transition-all duration-300 text-left 
                  ${
                    option.disabled
                      ? "opacity-50 cursor-not-allowed border-slate-200"
                      : "border-primary/20 hover:border-primary hover:shadow-lg " + (hasLinks ? "" : "hover:translate-y-[-2px]")
                  }`}
              >
                <div className="flex items-center gap-3 w-full">
                  <div
                    className={`p-2 rounded-lg transition-colors ${option.disabled ? "text-slate-400 bg-slate-100" : "text-primary bg-primary/5 group-hover:bg-primary/10"}`}
                  >
                    {option.icon}
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 tracking-tight flex-grow flex items-center justify-between">
                    {option.title}
                    {!option.disabled && !hasLinks && (
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-primary transition-colors" />
                    )}
                  </h3>
                </div>

                <div className="mt-4 w-full flex-grow flex flex-col justify-between">
                  <div>
                    <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${option.disabled ? "text-slate-400" : "text-primary/80"}`}>
                      {option.subtitle}
                    </p>
                    <p className="text-xs text-slate-500 leading-snug">{option.description}</p>
                  </div>

                  {hasLinks && (
                    <div className="mt-5 pt-3 border-t border-slate-100 flex flex-col gap-2">
                      {option.links?.map((link, linkIdx) => (
                        <button
                          key={linkIdx}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!link.disabled) handleProductClick(option.route, link.flowKey);
                          }}
                          disabled={link.disabled}
                          className="flex items-center justify-between text-xs font-bold text-[#B400FF] hover:text-purple-800 transition-colors bg-purple-50/50 hover:bg-purple-50 px-3 py-2.5 rounded-xl group/link border border-purple-100/50"
                        >
                          <span>{link.label}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-[#B400FF]/60 group-hover/link:translate-x-0.5 transition-transform" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </CardContainer>
            );
          })}
        </div>
      </main>

      {/* FOOTER */}
      <footer className="py-4 text-center text-slate-400 text-[9px] uppercase tracking-[0.3em] border-t border-slate-100 bg-white/50">
        Wallet sbX | Jornadas de Financiamentos & Seguros
      </footer>

      {/* OVERLAY DE LOADING */}
      {loading && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
          <Loader2 className="h-10 w-10 animate-spin mb-4 text-primary" />
          <p className="text-sm text-slate-500 font-medium animate-pulse">
            A preparar o ambiente de simulação...
          </p>
        </div>
      )}
    </div>
  );
};

export const Route = createLazyFileRoute("/sandbox/")({
  component: () => <SandboxHome />,
});