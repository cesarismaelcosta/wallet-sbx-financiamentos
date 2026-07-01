/**
 * @fileoverview Componente: SandboxHome (Rota: /sandbox/)
 * @description Ponto de entrada do ambiente de homologação.
 */

import React, { useState, JSX } from "react";
import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { CreditCard, Car, Home, UserSquare2, TrendingUp, ShieldCheck, ChevronRight, Loader2, LogOut } from "lucide-react";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";

// Interface para tipar as opções do menu
interface MenuOption {
  title: string;
  subtitle: string;
  icon: JSX.Element;
  route: string;
  flowKey?: string;
  description: string;
  disabled?: boolean;
}

const SandboxHome = () => {
  const navigate = useNavigate();
  const { logout, userId } = useFinancialAuth(); // Acessando userId aqui
  const [loading, setLoading] = useState(false);

  const handleProductClick = async (route: string, flowKey?: string) => {
    setLoading(true);
    try {
      await navigate({ to: route, search: { flow: flowKey } });
    } catch (error) {
      console.error("Erro na navegação:", error);
      setLoading(false);
    }
  };

  const menuOptions: MenuOption[] = [
    {
      title: "Cartão de Crédito",
      subtitle: "Parcelamento até 18x",
      icon: <CreditCard className="w-8 h-8 text-primary" />,
      route: "/sandbox/offer",
      flowKey: "Cartão",
      description: "Simulação de parcelamento de lote para prazos e tarifas cadastradas no app.",
      disabled: false,
    },
    {
      title: "Veículos",
      subtitle: "Financiamento de carros e caminhões",
      icon: <Car className="w-8 h-8 text-primary" />,
      route: "/sandbox/offer",
      flowKey: "Veículos",
      description: "Simulação de financiamentos de carros e caminhões da MeResolve integradas para PF e e-mail para PJ.",
      disabled: false,
    },
    {
      title: "Imóveis",
      subtitle: "Financiamento de imóveis",
      icon: <Home className="w-8 h-8 text-primary" />,
      route: "/sandbox/offer",
      flowKey: "Imóveis",
      description: "Simulação de financiamento de imóveis integrada com a Creditas ou Flow.",
      disabled: true,
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
      title: "Home/Auto Equit",
      subtitle: "Crédito para investir na Superbid",
      icon: <TrendingUp className="w-8 h-8 text-primary" />,
      route: "/sandbox/offer",
      flowKey: "AutoEquity",
      description: "Simulação integrada para jornadas auto e home equity da Creditas dou Flow (mock auto-equity).",
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

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col overflow-hidden relative">
      {/* HEADER */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <WalletLogo size="md" withTagline />
            <div className="h-6 w-px bg-slate-200 ml-2 hidden sm:block" />
            <div className="flex flex-col hidden sm:flex text-left">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Jornadas de Financiamentos & Seguros
              </span>
              
              {/* Exibição do UserId */}
              <span className="text-[9px] font-mono text-slate-400 mt-0.5">
                ID DO USUÁRIO LOGADO: {userId || "Não identificado"}
              </span>

              {/* Exibição do Ambiente */}
              <span className="text-[9px] font-mono text-slate-400">
                AMBIENTE: {localStorage.getItem("sandbox_env")?.toUpperCase() || "STAGE"}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Link
              to="/backoffice"
              className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm"
            >
              Backoffice
            </Link>
            <button
              onClick={logout}
              className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-4 py-2 rounded-lg text-xs font-bold transition-all"
            >
              <LogOut className="w-3 h-3" />
              Sair
            </button>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-grow max-w-6xl mx-auto px-8 py-12 w-full">
        <div className="mb-10 text-left">
          <h2 className="text-3xl font-black text-slate-800 tracking-tight">O que vamos testar hoje?</h2>
          <p className="text-slate-500 mt-2 text-sm">Selecione uma jornada ativa para iniciar a orquestração.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {menuOptions.map((option, index) => (
            <button
              key={index}
              onClick={() => !option.disabled && handleProductClick(option.route, option.flowKey)}
              disabled={option.disabled}
              className={`group flex flex-col p-5 bg-white border-2 rounded-2xl transition-all duration-300 text-left 
                ${
                  option.disabled
                    ? "opacity-50 cursor-not-allowed border-slate-200"
                    : "border-primary/20 hover:border-primary hover:shadow-lg hover:translate-y-[-2px]"
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
                  {!option.disabled && (
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-primary transition-colors" />
                  )}
                </h3>
              </div>

              <div className="mt-4 w-full">
                <p className="text-[10px] font-bold text-primary/80 uppercase tracking-widest mb-1.5">
                  {option.subtitle}
                </p>
                <p className="text-xs text-slate-500 leading-snug">{option.description}</p>
              </div>
            </button>
          ))}
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
          <p className="text-sm text-slate-500 font-medium animate-pulse">Carregando oferta...</p>
        </div>
      )}
    </div>
  );
};

export const Route = createLazyFileRoute("/sandbox/")({
  component: () => <SandboxHome />,
});