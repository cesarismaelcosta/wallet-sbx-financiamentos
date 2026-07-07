/**
 * @fileoverview Componente: SandboxHome (Rota: /sandbox/)
 * * =========================================================================
 * [ARQUITETURA & CONTROLE DE AMBIENTE]
 * =========================================================================
 * Ponto de entrada do ambiente de homologação e testes do Financial Hub.
 * * [Responsabilidades]:
 * 1. Navegação Baseada em Fluxos: Mapeia as jornadas via links diretos ou cliques.
 * 2. Controle de Ambiente Reativo: Permite alternar a variável de ambiente (STG/PRD) 
 * no localStorage em tempo real, sem necessidade de reautenticação.
 * 3. Gestão de Sessão: Exibe os dados do utilizador logado e permite o logout.
 */

import React, { useState, JSX } from "react";
import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { CreditCard, Car, Home, UserSquare2, TrendingUp, ShieldCheck, ChevronRight, Loader2, LogOut } from "lucide-react";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";

// Interfaces para tipagem estrita de contratos de navegação
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
  
  // -----------------------------------------------------------------------
  // [STATE]: Controle de loading e Ambiente Reativo
  // -----------------------------------------------------------------------
  const [loading, setLoading] = useState(false);
  const [ambiente, setAmbiente] = useState<"staging" | "production">(
    (localStorage.getItem("sbx_environment") as "staging" | "production") || "production"
  );

  // Sincroniza a escolha visual com o cofre do navegador e DERRUBA a sessão
  const handleAmbienteChange = (novoAmbiente: "staging" | "production") => {
    if (ambiente === novoAmbiente) return;

    setAmbiente(novoAmbiente);
    localStorage.setItem("sbx_environment", novoAmbiente);
    logout();
  };

  // -----------------------------------------------------------------------
  // [HANDLERS]: Navegação de Jornadas
  // -----------------------------------------------------------------------
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

  // -----------------------------------------------------------------------
  // [CONFIG]: Mapa de Jornadas com Links Internos e Mapeamento de Sub-fluxos
  // -----------------------------------------------------------------------
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
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          
          <div className="flex items-center gap-4">
            <WalletLogo size="md" withTagline />
            <div className="h-6 w-px bg-slate-200 ml-2 hidden sm:block" />
            <div className="flex flex-col hidden sm:flex text-left">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Jornadas de Financiamentos & Seguros
              </span>
              <span className="text-[9px] font-mono text-slate-400 mt-0.5">
                SESSÃO ATIVA: {token ? token.slice(0, 8) + "..." : "N/A"}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="hidden md:flex h-9 p-0.5 bg-gray-100 rounded-full gap-0.5 border border-gray-200 w-40">
              <button
                type="button"
                onClick={() => handleAmbienteChange("staging")}
                className={`flex-1 text-[10px] font-bold rounded-full transition-all border ${
                  ambiente === "staging"
                    ? "bg-white text-[#B400FF] border-[#B400FF] shadow-sm"
                    : "text-gray-400 hover:text-gray-600 border-transparent"
                }`}
              >
                STAGE
              </button>
              <button
                type="button"
                onClick={() => handleAmbienteChange("production")}
                className={`flex-1 text-[10px] font-bold rounded-full transition-all border ${
                  ambiente === "production"
                    ? "bg-white text-[#B400FF] border-[#B400FF] shadow-sm"
                    : "text-gray-400 hover:text-gray-600 border-transparent"
                }`}
              >
                PRODUÇÃO
              </button>
            </div>

            <div className="flex items-center gap-4 border-l border-gray-200 pl-6">
              <div className="flex flex-col items-end text-right hidden sm:flex">
                <span className="text-[9px] font-mono text-slate-500">USER ID: {userId || "---"}</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase">Sandbox Hub</span>
              </div>
              <Link
                to="/backoffice"
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm hidden sm:block"
              >
                Backoffice
              </Link>
              <button
                onClick={logout}
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
            // Se o card está disabled, ele não deve renderizar links internos
            const hasLinks = !option.disabled && option.links && option.links.length > 0;
            
            // Renderização polimórfica controlada: 
            // - 'div': Card com links (não pode ser botão global)
            // - 'button': Card com clique direto ou Card Desabilitado (para aplicar opacity e not-allowed)
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

                  {/* Links internos escondidos quando disabled=true */}
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