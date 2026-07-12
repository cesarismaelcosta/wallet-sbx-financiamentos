/**
 * @fileoverview Componente: SandboxHome (Rota: /sandbox/)
 * * =========================================================================
 * [ARQUITETURA & CONTROLE DE AMBIENTE]
 * =========================================================================
 * Ponto de entrada do ambiente de homologação e testes do Financial Hub.
 * * [RESPONSABILIDADES DA REFATORAÇÃO (SSR-Safe)]:
 * 1. Prevenção de ReferenceError: Isolamento de APIs do navegador (localStorage).
 * 2. Prevenção de Hydration Mismatch: Inicialização neutra de estado entre Servidor e Cliente.
 * 3. Navegação Baseada em Fluxos: Mapeia as jornadas via links diretos ou cliques.
 * 4. Gestão de Sessão: Exibe os dados do utilizador logado e permite o logout limpo.
 */

import React, { useState, useEffect, JSX } from "react";
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
  // [STATE]: Controle de loading e Leitura do Ambiente (SSR-Safe)
  // =========================================================================
  const [loading, setLoading] = useState(false);
  
  // [SECURITY CORE]: Inicialização Neutra (Anti-Hydration Mismatch)
  // O servidor Node.js e a primeira renderização do navegador DEVEM ser idênticas.
  // Assumimos "production" como padrão neutro. O 'typeof window' foi removido
  // pois causava divergência de árvores DOM entre servidor e cliente.
  const [ambiente, setAmbiente] = useState<"staging" | "production">("production");

  // [SECURITY CORE]: Hidratação Assíncrona no Cliente
  // O useEffect GARANTE que este bloco de código só rodará no Navegador (Client-side),
  // onde o objeto 'window' e o 'localStorage' estão disponíveis e são seguros para leitura.
  useEffect(() => {
    const savedEnv = localStorage.getItem("sbx_environment") as "staging" | "production";
    if (savedEnv) {
      setAmbiente(savedEnv); // Atualiza a UI de forma limpa e segura
    }
  }, []);

  // =========================================================================
  // [HANDLERS]: Ações do Usuário e Navegação
  // =========================================================================
  // Seguros para SSR: Handlers atrelados a eventos de clique (onClick)
  // só existem e são executados no navegador do usuário.
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
          
          <div className="flex items-center gap-6 shrink-0">
            <div className="h-6 w-px bg-slate-200 hidden sm:block" />
            <div className="hidden sm:block"><WalletLogo size="md" withTagline /></div>
            
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
          
          <div className="flex items-center gap-6 border-l border-slate-200 pl-6 shrink-0">
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-end text-right">
                  <span className="text-[12px] font-bold text-slate-800 uppercase">cismael</span>
                  <span className="text-[10px] font-mono text-slate-500">USER ID: {userId || "---"}</span>
                </div>
                
                {/* O valor de 'ambiente' está 100% seguro pois foi hidratado no useEffect */}
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
        <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
          <p className="text-slate-500 font-medium text-sm">
            Preparando o ambiente de simulação...
          </p>
        </div>        
      )}
    </div>
  );
};

export const Route = createLazyFileRoute("/sandbox/indexold")({
  component: () => <SandboxHome />,
});