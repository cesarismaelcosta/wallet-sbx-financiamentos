/**
 * @fileoverview 🏠 Componente: sbXPAYHome (Rota: /sbxpay/)
 * @path src/routes/sbxpay/index.tsx
 * @description Ponto de entrada principal do ambiente de homologação e testes do Financial Hub.
 * Gerencia a listagem de jornadas de produtos, o roteamento inteligente e a pureza visual neutra (SBX DS).
 *
 * ============================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-TRUST NAVIGATION & NEUTRAL PURITY
 * ============================================================================
 * Este componente atua como um despachante de intenções "cego" para o Orquestrador.
 * Ele não calcula destinos, não trafega dados pessoais e não toma decisões de negócio.
 *
 * [MECÂNICA ARQUITETURAL V4 - BLINDAGEM NEUTRA & TIPOGRAFIA EDITORIAL SERIF]:
 * 1. {Thin Payload / Zero-Trust}: O Front-end não consome nem envia o perfil do
 *    usuário (PII) nos requests de navegação (`CONSULT` ou `VISIT`). O payload envia
 *    apenas a "intenção" (ex: Clicou no Produto X). A identificação do usuário é
 *    feita com exclusividade pelo Backend (Edge) lendo o JWT.
 * 2. {Telemetria Contínua (OLAP)}: Ao disparar um clique, o componente extrai ativamente
 *    o cursor atual (`visit_update_id`) da URL e o repassa ao Orquestrador. Isso diz ao
 *    backend exatamente de onde o usuário está saindo, permitindo o fechamento perfeito
 *    do funil de conversão antes da geração da próxima página.
 * 3. {Roteamento Determinístico}: O componente nunca faz "hard redirect" por conta própria
 *    para jornadas do ecossistema. Ele envia o POST e aguarda o Orquestrador devolver a
 *    URL assinada oficial.
 * 4. {Zero-Latency Fast Path}: Ao receber a resposta positiva do Orquestrador, o componente
 *    intercepta o pacote `state` e o injeta na memória RAM (Cofre) antes de executar o
 *    `navigate`. Isso permite que a próxima tela (ex: Formulário de Seguros) abra em 0ms,
 *    poupando um request GET redundante na inicialização.
 * 5. {Neutral Purity & Serif Focus Governance}: Aplicação rigorosa de tons institucionais
 *    monocromáticos (`neutral-900`, `neutral-50`, `border-neutral-200`) e introdução
 *    da tipografia editorial em destaque (`serif`) alinhada ao design system oficial da SBX.
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 */

import React, { useState, useEffect, useContext } from "react";
import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Loader2,
  Plus,
  UserPlus,
  ArrowRight,
} from "lucide-react";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { PanelHeader, HeaderLink } from "@/features/financial-hub/components/layout/PanelHeader";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { USE_COOKIE } from "@/services/session";
import { callOrchestrator } from "@/features/financial-hub/core/services/gateway";
import { setFastPathState } from "@/features/financial-hub/core/services/fastPathCache";
import { UserDataContext } from "@/routes/sbxpay.lazy";
import { useMediaQuery } from "@/hooks/use-media-query";

// ============================================================================
// [REGISTRO DA ROTA TANSTACK ROUTER]
// ============================================================================
export const Route = createLazyFileRoute("/sbxpay/")({
  component: sbXPAYHome,
});

// ============================================================================
// 🗺️ [CONFIGURAÇÕES DE FLUXOS E JORNADAS]
// ============================================================================
type ShowcaseConfig = {
  isDirect: false;
  route: string;
  flowKey: string;
  disabled: boolean;
  productId?: never;
};

type DirectConfig = {
  isDirect: true;
  productId: string;
  disabled: boolean;
  route?: never;
  flowKey?: never;
};

type FlowConfig = ShowcaseConfig | DirectConfig;

const flowsConfig: Record<string, FlowConfig> = {
  cartao: { isDirect: false, route: "/sbxpay/offer", flowKey: "Cartão", disabled: false },
  carros: { isDirect: false, route: "/sbxpay/offer", flowKey: "Carros", disabled: false },
  caminhoes: { isDirect: false, route: "/sbxpay/offer", flowKey: "Caminhões", disabled: false },
  imoveis: { isDirect: false, route: "/sbxpay/offer", flowKey: "Imóveis", disabled: true },
  floorPlan: { isDirect: false, route: "/sbxpay/offer", flowKey: "Vendedor", disabled: true },
  equityCarro: { isDirect: true, productId: "7", disabled: false },
  equityImovel: { isDirect: true, productId: "6", disabled: true },
  seguroResidencial: { isDirect: true, productId: "10", disabled: true },
  seguroAuto: { isDirect: true, productId: "9", disabled: false },
};

type AppJourney = HeaderLink & { ativo: boolean };

const homeLinks: AppJourney[] = [
  { href: "seguranca", label: "Segurança", ativo: true },
  { href: "cartao", label: "Cartão", ativo: true },
  { href: "veiculos", label: "Veículos", ativo: true },
  { href: "imoveis", label: "Imóveis", ativo: true },
  { href: "investidores", label: "Investidores", ativo: true },
  { href: "seguros", label: "Seguros", ativo: true },
  { href: "floorplan", label: "Floor Plan", ativo: false },
];

// ============================================================================
// 🏠 [COMPONENTE PRINCIPAL: SBX PAY HOME]
// ============================================================================
export function sbXPAYHome() {
  const navigate = useNavigate();
  const { sessionToken, logout, userProfile } = useFinancialAuth(); // EXTRAÍDO O USERPROFILE DO JWT
  const { userData, isVerifying } = useContext(UserDataContext) || {}; // EXTRAÍDO O USERDATA DO CONTEXTO DE REDE

  // 🚀 [PERFORMANCE]: substitui a duplicação estática (mobile+desktop sempre no DOM,
  // só escondida por classe CSS) por renderização condicional — cada seção passa a
  // baixar UMA imagem, não duas. Breakpoint = `sm` do Tailwind (640px), mesmo usado
  // pelas classes `sm:hidden` / `hidden sm:flex` abaixo.
  const isDesktop = useMediaQuery("(min-width: 640px)");

  const [isMounted, setIsMounted] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  // Sincronização de montagem em ambiente cliente
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Limpeza de estados transacionais e blindagem contra persistência de cache de navegador
  useEffect(() => {
    setLoading(false);
    setLoginLoading(false);
    setActiveKey(null);

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setLoading(false);
        setLoginLoading(false);
        setActiveKey(null);
      }
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  // Telemetria de scroll para comportamentos visuais de header se necessário
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Função de navegação determinística preservando o túnel SPA do TanStack Router
  const performNavigation = (url: string) => {
    try {
      const targetUrlObj = new URL(url, window.location.origin);

      // Se for do mesmo domínio, mesmo com "https://", vai via SPA e PRESERVA A RAM
      if (targetUrlObj.origin === window.location.origin) {
        const originalParams = new URLSearchParams(window.location.search);
        targetUrlObj.searchParams.forEach((val, key) => originalParams.set(key, val));

        navigate({
          to: targetUrlObj.pathname as any,
          search: Object.fromEntries(originalParams.entries()) as any,
        });
      } else {
        // Apenas se for domínio externo real
        window.location.href = url;
      }
    } catch {
      // Fallback caso venha uma URL relativa pura
      navigate({ to: url as any });
    }
  };

  // Gerenciador central de cliques em produtos (Handshake com Orquestrador e OLAP)
  const handleProductClick = async (configKey: keyof typeof flowsConfig) => {
    setLoading(true);
    setActiveKey(configKey);

    const config = flowsConfig[configKey];
    if (!config) {
      setLoading(false);
      setActiveKey(null);
      return;
    }

    try {
      const currentHref = window.location.href;
      const urlParams = new URLSearchParams(window.location.search);
      const existingVisitId = urlParams.get("visit_id");
      const existingVisitUpdateId = urlParams.get("visit_update_id");

      // =========================================================================
      // 🚀 FLUXO DIRETO (Ex: Seguros, Equity). Pula a vitrine, vai direto pro Form.
      // =========================================================================
      if (config.isDirect) {
        const payload = {
          action: "CONSULT",
          product_id: config.productId,
          origin_url: currentHref,
          ...(existingVisitId && { visit_id: existingVisitId }),
          ...(existingVisitUpdateId && { visit_update_id: existingVisitUpdateId }),
          interaction_context: {
            origin_url: currentHref,
            utm_source: "sbxpay_direct",
            utm_medium: "referral",
            utm_campaign: `flow_${configKey.toLowerCase()}`,
          },
        };

        const consultResponse = await callOrchestrator(payload, "POST");

        if (consultResponse?.url) {
          if (consultResponse.state) {
            setFastPathState(consultResponse.state);
          }

          // ✨ FIX APLICADO AQUI: Passamos a URL inteira para evitar quebrar parceiros
          performNavigation(consultResponse.url);
          return;
        } else {
          throw new Error("URL de redirecionamento ausente na resposta do orquestrador.");
        }
      }

      // =========================================================================
      // 🛒 FLUXO INDIRETO (Ex: Carros). Vai para a Vitrine de Ofertas.
      // =========================================================================
      const visitPayload = {
        action: "VISIT",
        target_url: config.route,
        origin_url: currentHref,
        ...(existingVisitId && { visit_id: existingVisitId }),
        ...(existingVisitUpdateId && { visit_update_id: existingVisitUpdateId }),
        interaction_context: {
          origin_url: currentHref,
          utm_source: "sbxpay_direct",
          utm_medium: "referral",
          utm_campaign: `flow_${configKey.toLowerCase()}`,
        },
      };

      const visitResponse = await callOrchestrator(visitPayload, "POST");

      if (visitResponse?.url) {
        if (visitResponse.state) {
          setFastPathState(visitResponse.state);
        }

        const targetUrlObj = new URL(visitResponse.url, window.location.origin);
        targetUrlObj.searchParams.set("flow", config.flowKey);

        setLoading(false);
        // ✨ FIX APLICADO AQUI: Passamos a URL stringificada completa para o parser
        performNavigation(targetUrlObj.toString());
        return;
      } else {
        throw new Error("URL de visita ausente na resposta do orquestrador.");
      }
    } catch (error: any) {
      if (error && error.code === "SESSION_EXPIRED" && error.fallback_url) {
        const safeUrl = new URL(error.fallback_url, window.location.origin);
        window.location.href = safeUrl.pathname + safeUrl.search;
        return;
      }

      setLoading(false);
      setActiveKey(null);
    } finally {
      if (!config.isDirect) setLoading(false);
    }
  };

  // 1. Unificamos o esqueleto do botão para evitar diferenças de espessura (anti-aliasing)
  const baseButtonClasses =
    "flex items-center justify-center gap-2 px-5 py-2 font-normal rounded-none transition-colors text-sm w-full md:w-auto";

  // 2. Renderizador atômico: Aplica as cores via condicional, preservando o esqueleto
  const renderButton = (
    label: string,
    configKey: keyof typeof flowsConfig
  ) => {
    const config = flowsConfig[configKey];
    const isLocked = loading || isVerifying;
    const isCurrentLoading = loading && activeKey === configKey;

    if (config.disabled) {
      return (
        <button 
          disabled 
          // Mantém a mesma base, apenas muda a cor para o padrão "desabilitado"
          className={`${baseButtonClasses} border border-neutral-200 text-neutral-400 bg-neutral-50 cursor-not-allowed`}
        >
          <span className="font-jakarta tracking-tight text-center">{label}</span>
          <ArrowRight className="w-4 h-4" strokeWidth={1.25} />
        </button>
      );
    }

    return (
      <button
        disabled={isLocked}
        onClick={() => handleProductClick(configKey)}
        // Mantém a mesma base, aplica as cores "ativas" e lida com o lock de loading
        className={`${baseButtonClasses} border border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 shadow-xs ${isLocked ? "opacity-50 cursor-not-allowed shadow-none" : ""}`}
      >
        {isCurrentLoading && (
          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.25} />
        )}
        
        <span className="font-jakarta tracking-tight text-center">
          {isVerifying ? "Carregando..." : isCurrentLoading ? "Aguarde..." : label}
        </span>

        {!isCurrentLoading && !isVerifying && (
          <ArrowRight className="w-4 h-4" strokeWidth={1.25} />
        )}
      </button>
    );
  };

  const linksAtivos = homeLinks.filter((link) => link.ativo);
  const productLinks = linksAtivos.filter((link) => link.href !== "seguranca");

  return (
    <div className="bg-white text-neutral-900 antialiased font-sans overflow-x-hidden relative rounded-none">
      <style>{`
        .glass { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
        @keyframes float-slow { 0%, 100% { transform: translateY(0px) rotate(0deg) scale(1); } 50% { transform: translateY(-10px) rotate(2deg) scale(1.01); } }
        @keyframes float-reverse { 0%, 100% { transform: translateY(0px) rotate(0deg) scale(1.01); } 50% { transform: translateY(10px) rotate(-2deg) scale(0.99); } }
        .animate-blob-float { animation: float-slow 7s ease-in-out infinite; }
        .animate-blob-float-reverse { animation: float-reverse 8s ease-in-out infinite; }
        .blob-shadow { filter: drop-shadow(0 20px 30px rgba(15, 23, 42, 0.05)); }
      `}</style>

      {/* Cabeçalho Mestre Consolidado */}
      <PanelHeader
        showNav={true}
        showAuth={true}
        links={linksAtivos}
        sessionToken={isMounted ? sessionToken : undefined}
        userData={userData || userProfile}
        onLogout={() => logout({ purgeEnv: true })}
        onNavigate={(path) => navigate({ to: path as any })}
      />

      {/* Renderização Dinâmica das Seções da Vitrine Institucional */}
      {linksAtivos.map((link) => {
        if (link.href === "seguranca") {
          return (
            <section
              key="seguranca"
              id="seguranca"
              className="relative pt-28 pb-10 md:pt-32 md:pb-12 overflow-hidden bg-white border-b border-neutral-200 scroll-mt-16 rounded-none"
            >
              <div className="max-w-7xl mx-auto px-6 relative z-10">
                <div className="flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
                  <div className="w-full lg:w-6/12 space-y-5">
                    <div className="flex flex-row items-center gap-4 -ml-2 sm:block sm:ml-0">
                      {/* 🚀 [PERFORMANCE]: era duas cópias (esta + a do bloco desktop mais abaixo)
                          sempre no DOM, uma delas só escondida via `sm:hidden`/`hidden sm:flex`.
                          O navegador baixava as duas de qualquer forma. Agora só a versão relevante
                          para `isDesktop` é renderizada — uma única imagem por vez. Mesmo padrão
                          aplicado nas outras 6 seções de produto abaixo. */}
                      {!isDesktop && (
                        <div className="w-24 flex-shrink-0 relative flex justify-start">
                          <div className="absolute inset-0 bg-neutral-100 rounded-none filter blur-xs transform scale-90"></div>
                          <div className="relative w-full p-0 flex items-center justify-center z-0">
                            <img
                              src="/assets/home/conta.webp"
                              alt="Segurança sbX Wallet"
                              fetchPriority="high"
                              decoding="async"
                              className="mix-blend-multiply w-full h-auto object-contain relative"
                            />
                          </div>
                        </div>
                      )}

                      <div className="space-y-2 flex-1 text-left">
                        <div className="inline-flex items-center space-x-2 bg-brand-accent px-3 py-1 rounded-full text-brand-accent-foreground text-[10px] font-bold uppercase tracking-wider">
                          <span>Conta sbXPAY</span>
                        </div>
                        <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-neutral-900 leading-[1.15]">
                          Segurança para <span className="serif font-normal text-neutral-900">comprar e vender.</span>
                        </h1>
                      </div>
                    </div>

                    <p className="text-sm md:text-base text-neutral-600 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                      A plataforma líder da América Latina tem uma infraestrutura segura e inovadora, com a proteção que
                      seu patrimônio exige.
                    </p>

                    <div className="border-t border-neutral-200 pt-5 space-y-4 text-left max-w-xl mx-auto lg:mx-0">
                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center mt-0.5">
                          <Plus className="w-3.5 h-3.5 md:w-4 md:h-4 text-neutral-400" strokeWidth={2} />
                        </div>
                        <div>
                          <h4 className="font-mono text-[10px] md:text-xs uppercase tracking-[0.18em] text-neutral-900 mt-1.5 md:mt-1">
                            Seu dinheiro sempre protegido
                          </h4>
                          <p className="text-neutral-600 text-xs mt-2 leading-relaxed">
                            Fique tranquilo na hora de comprar. Os valores das suas negociações ficam guardados em
                            contas pagamento de nossa Instituição de Pagamento regulada pelo Banco Central.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start space-x-3">
                        <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center mt-0.5">
                          <Plus className="w-3.5 h-3.5 md:w-4 md:h-4 text-neutral-400" strokeWidth={2} />
                        </div>
                        <div>
                          <h4 className="font-mono text-[10px] md:text-xs uppercase tracking-[0.18em] text-neutral-900 mt-1.5 md:mt-1">
                            Padrão máximo de segurança
                          </h4>
                          <p className="text-neutral-600 text-xs mt-2 leading-relaxed">
                            As liquidações das suas compras acontecem em um ambiente com auditoria rigorosa e proteção
                            total dos seus dados.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start pt-2">
                      <button
                        disabled={loginLoading || loading}
                        onClick={() => {
                          setLoginLoading(true);
                          setTimeout(() => {
                            window.open(
                              "https://accounts.superbid.net/signin?response_type=token&client_id=dzqC3VodSoXukD45BQKg3NQU6-faststore&redirect_uri=https://www.superbid.net/&authorization_uri=https://www.superbid.net/authorization/&language=pt-BR&portal_id=2&hostName=Superbid%20BR",
                              "_blank",
                            );
                            setLoginLoading(false);
                          }, 400);
                        }}
                        // AQUI ESTÁ A CORREÇÃO: Usando baseButtonClasses e as cores do botão ativo
                        className={`${baseButtonClasses} border border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-900 hover:text-white hover:border-neutral-900 shadow-xs ${(loginLoading || loading) ? "opacity-50 cursor-not-allowed shadow-none" : ""}`}
                      >
                        {loginLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.25} />
                        ) : (
                          <UserPlus className="w-4 h-4" strokeWidth={1.25} />
                        )}
                        <span className="font-jakarta tracking-tight">
                          {loginLoading ? "Aguarde..." : "Entrar na conta"}
                        </span>
                      </button>
                    </div>
                  </div>

                  {isDesktop && (
                    <div className="flex w-full lg:w-5/12 relative justify-center mt-8 lg:mt-0">
                      <div className="relative w-full max-w-sm p-2 flex items-center justify-center z-0">
                        <div className="absolute inset-0 animate-blob-float blob-shadow flex items-center justify-center">
                          <svg
                            viewBox="0 0 200 200"
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-full h-full fill-neutral-100"
                          >
                            <path
                              d="M43,-62.1C55.3,-53.4,64.8,-40.4,70.9,-25.6C77,-10.8,79.7,5.8,74.7,19.6C69.7,33.5,57,44.7,43.5,52.9C29.9,61.1,15,66.4,-1.3,68.2C-17.6,70,-35.1,68.3,-48.1,59.7C-61.1,51.1,-69.5,35.6,-73,19.1C-76.5,2.7,-75.1,-14.8,-67.7,-29C-60.3,-43.3,-46.8,-54.2,-32.8,-62.1C-18.8,-70,-9.4,-74.8,3.2,-79.2C15.8,-83.7,30.7,-87.8,43,-62.1Z"
                              transform="translate(100 100)"
                            />
                          </svg>
                        </div>
                        <img
                          src="/assets/home/conta.webp"
                          alt="Segurança sbX Wallet"
                          fetchPriority="high"
                          decoding="async"
                          className="mix-blend-multiply w-[90%] h-auto mx-auto object-contain relative"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          );
        }

        const indexDoProduto = productLinks.findIndex((p) => p.href === link.href);
        const isPar = indexDoProduto % 2 === 0;
        const layoutDirecao = isPar ? "lg:flex-row-reverse" : "lg:flex-row";
        const animacao = isPar ? "animate-blob-float-reverse" : "animate-blob-float";

        if (link.href === "cartao") {
          return (
            <section
              key="cartao"
              id="cartao"
              className="py-10 md:py-12 bg-white border-b border-neutral-200 overflow-hidden relative scroll-mt-16 rounded-none"
            >
              <div className="max-w-7xl mx-auto px-6 relative z-10">
                <div className={`flex flex-col ${layoutDirecao} items-center justify-between gap-8 lg:gap-12`}>
                  <div className="w-full lg:w-6/12 space-y-5">
                    <div className="flex flex-row items-center gap-4 -ml-2 sm:block sm:ml-0">
                      {!isDesktop && (
                        <div className="w-24 flex-shrink-0 relative flex justify-start">
                          <div className="absolute inset-0 bg-neutral-100 rounded-none filter blur-xs transform scale-90"></div>
                          <div className="relative w-full p-0 flex items-center justify-center z-0">
                            <img
                              src="/assets/home/cartao.webp"
                              alt="Cartão"
                              loading="lazy"
                              decoding="async"
                              className="mix-blend-multiply w-full h-auto object-contain relative"
                            />
                          </div>
                        </div>
                      )}
                      <div className="space-y-2 flex-1">
                        <div className="inline-flex items-center space-x-2 bg-brand-accent px-3 py-1 rounded-full text-brand-accent-foreground text-[10px] font-bold uppercase tracking-wider">
                          <span>Até R$ 120 mil</span>
                        </div>
                        <h2 className="text-lg md:text-3xl font-bold text-neutral-900 tracking-tight leading-snug">
                          Parcele em <span className="serif font-normal text-neutral-900">até 18x com seu cartão.</span>
                        </h2>
                      </div>
                    </div>
                    <p className="text-sm md:text-base text-neutral-600 leading-relaxed">
                      Não deixe um bom negócio escapar. Amplie seu poder de compra usando o limite do seu cartão de
                      crédito com total tranquilidade na hora de pagar.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                      <div className="bg-neutral-50 border border-neutral-200 rounded-none p-4 flex flex-col gap-2 transition-colors hover:bg-neutral-100/50">
                        <div className="flex items-center gap-2">
                          <Plus className="w-3.5 h-3.5 md:w-4 md:h-4 text-neutral-400" strokeWidth={2} />
                          <span className="font-mono text-[10px] md:text-xs uppercase tracking-[0.18em] text-neutral-900 mt-0.5">
                            Para PF e PJ
                          </span>
                        </div>
                        <p className="text-neutral-600 text-xs leading-relaxed mt-1">
                          Condições válidas para pessoas físicas e jurídicas aproveitarem o parcelamento com cartão.
                        </p>
                      </div>
                      <div className="bg-neutral-50 border border-neutral-200 rounded-none p-4 flex flex-col gap-2 transition-colors hover:bg-neutral-100/50">
                        <div className="flex items-center gap-2">
                          <Plus className="w-3.5 h-3.5 md:w-4 md:h-4 text-neutral-400" strokeWidth={2} />
                          <span className="font-mono text-[10px] md:text-xs uppercase tracking-[0.18em] text-neutral-900 mt-0.5">
                            Segurança com 3DS
                          </span>
                        </div>
                        <p className="text-neutral-600 text-xs leading-relaxed mt-1">
                          Protocolo avançado de autenticação (3D Secure) ativado para garantir transações protegidas e
                          sem fraudes.
                        </p>
                      </div>
                    </div>
                    <div className="pt-2">
                      {renderButton("Ofertas parceladas", "cartao")}
                    </div>
                  </div>
                  {isDesktop && (
                    <div className="flex w-full lg:w-5/12 relative justify-center mt-8 lg:mt-0">
                      <div className="relative w-full max-w-sm p-2 flex items-center justify-center z-0">
                        <div className={`absolute inset-0 ${animacao} blob-shadow flex items-center justify-center`}>
                          <svg
                            viewBox="0 0 200 200"
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-full h-full fill-neutral-100"
                          >
                            <path
                              d="M54.5,-73.4C69.3,-64,79.1,-46.8,82,-28.9C84.9,-11,80.9,7.6,73.8,24.1C66.7,40.7,56.5,55.3,42.4,63.4C28.2,71.5,10.1,73,-6.9,71.2C-23.9,69.5,-39.8,64.4,-51.9,54.7C-64,45.1,-72.3,31,-75.4,15.4C-78.4,-0.2,-76.3,-17.3,-68.8,-32.1C-61.2,-46.9,-48.3,-59.4,-33.5,-68.8C-18.7,-78.2,-2.1,-84.5,14.9,-82.1C32,-79.7,46.8,-76.1,54.5,-73.4Z"
                              transform="translate(100 100)"
                            />
                          </svg>
                        </div>
                        <img
                          src="/assets/home/cartao.webp"
                          alt="Cartão"
                          loading="lazy"
                          decoding="async"
                          className="mix-blend-multiply w-[90%] h-auto mx-auto object-contain relative"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          );
        }

        if (link.href === "veiculos") {
          return (
            <section
              key="veiculos"
              id="veiculos"
              className="py-10 md:py-12 bg-white border-b border-neutral-200 overflow-hidden relative scroll-mt-16 rounded-none"
            >
              <div className="max-w-7xl mx-auto px-6 relative z-10">
                <div className={`flex flex-col ${layoutDirecao} items-center justify-between gap-8 lg:gap-12`}>
                  <div className="w-full lg:w-6/12 space-y-5">
                    <div className="flex flex-row items-center gap-4 -ml-2 sm:block sm:ml-0">
                      {!isDesktop && (
                        <div className="w-24 flex-shrink-0 relative flex justify-start">
                          <div className="absolute inset-0 bg-neutral-100 rounded-none filter blur-xs transform scale-90"></div>
                          <div className="relative w-full p-0 flex items-center justify-center z-0">
                            <img
                              src="/assets/home/financiamentoveiculos.webp"
                              alt="Veículos"
                              loading="lazy"
                              decoding="async"
                              className="mix-blend-multiply w-full h-auto object-contain relative"
                            />
                          </div>
                        </div>
                      )}
                      <div className="space-y-2 flex-1">
                        <div className="inline-flex items-center space-x-2 bg-brand-accent px-3 py-1 rounded-full text-brand-accent-foreground text-[10px] font-bold uppercase tracking-wider">
                          <span>EM ATÉ 60x</span>
                        </div>
                        <h2 className="text-lg md:text-3xl font-bold text-neutral-900 tracking-tight leading-snug">
                          Financie seu <span className="serif font-normal text-neutral-900">carro ou caminhão.</span>
                        </h2>
                      </div>
                    </div>
                    <p className="text-sm md:text-base text-neutral-600 leading-relaxed max-w-2xl">
                      Compre seu carro ou caminhão com as melhores taxas do mercado. Nós fazemos o trabalho pesado de
                      assessoria, buscando as melhores opções nos maiores bancos do país.
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 w-full max-w-2xl">
                      <div className="bg-neutral-50 border border-neutral-200 rounded-none p-4 flex flex-col gap-2 transition-colors hover:bg-neutral-100/50">
                        <div className="flex items-center gap-2">
                          <Plus className="w-3.5 h-3.5 md:w-4 md:h-4 text-neutral-400" strokeWidth={2} />
                          <span className="font-mono text-[10px] md:text-xs uppercase tracking-[0.18em] text-neutral-900 mt-0.5">
                            Para PF e PJ
                          </span>
                        </div>
                        <p className="text-neutral-600 text-xs leading-relaxed mt-1">
                          Nossos especialistas conseguem buscar financiamentos para pessoas físicas e jurídicas e guiar
                          você por toda a jornada.
                        </p>
                      </div>
                      <div className="bg-neutral-50 border border-neutral-200 rounded-none p-4 flex flex-col gap-2 transition-colors hover:bg-neutral-100/50">
                        <div className="flex items-center gap-2">
                          <Plus className="w-3.5 h-3.5 md:w-4 md:h-4 text-neutral-400" strokeWidth={2} />
                          <span className="font-mono text-[10px] md:text-xs uppercase tracking-[0.18em] text-neutral-900 mt-0.5">
                            Facilidade
                          </span>
                        </div>
                        <p className="text-neutral-600 text-xs leading-relaxed mt-1">
                          Escolha o valor da entrada e parcelas, negocie pelo Whatsapp, e assine seu contrato
                          digitalmente.
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col md:flex-row gap-4 w-full max-w-2xl mt-6">
                      {renderButton("Carros financiados", "carros")}
                      {renderButton("Caminhões financiados", "caminhoes")}
                    </div>
                  </div>
                  {isDesktop && (
                    <div className="flex w-full lg:w-5/12 relative justify-center mt-8 lg:mt-0">
                      <div className="relative w-full max-w-sm p-2 flex items-center justify-center z-0">
                        <div className={`absolute inset-0 ${animacao} blob-shadow flex items-center justify-center`}>
                          <svg
                            viewBox="0 0 200 200"
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-full h-full fill-neutral-100"
                          >
                            <path
                              d="M55.6,-68.8C70.6,-58.5,80.4,-40.4,82,-21.8C83.7,-3.3,77.3,15.7,68.4,32.7C59.5,49.7,48.2,64.7,32.9,71.5C17.6,78.3,-1.7,76.9,-19.7,71.2C-37.7,65.5,-54.3,55.5,-65.4,40.7C-76.5,25.9,-82,6.3,-79.8,-11.9C-77.5,-30,-67.4,-46.8,-52.9,-57.1C-38.3,-67.3,-19.1,-71.1,0.5,-71.7C20.1,-72.3,40.3,-69.7,55.6,-68.8Z"
                              transform="translate(100 100)"
                            />
                          </svg>
                        </div>
                        <img
                          src="/assets/home/financiamentoveiculos.webp"
                          alt="Veículos"
                          loading="lazy"
                          decoding="async"
                          className="mix-blend-multiply w-[90%] h-auto mx-auto object-contain relative"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          );
        }

        if (link.href === "imoveis") {
          return (
            <section
              key="imoveis"
              id="imoveis"
              className="py-10 md:py-12 bg-white border-b border-neutral-200 overflow-hidden relative scroll-mt-16 rounded-none"
            >
              <div className="max-w-7xl mx-auto px-6 relative z-10">
                <div className={`flex flex-col ${layoutDirecao} items-center justify-between gap-8 lg:gap-12`}>
                  <div className="w-full lg:w-6/12 space-y-5">
                    <div className="flex flex-row items-center gap-4 -ml-2 sm:block sm:ml-0">
                      {!isDesktop && (
                        <div className="w-24 flex-shrink-0 relative flex justify-start">
                          <div className="absolute inset-0 bg-neutral-100 rounded-none filter blur-xs transform scale-90"></div>
                          <div className="relative w-full p-0 flex items-center justify-center z-0">
                            <img
                              src="/assets/home/financiamentoimoveis.webp"
                              alt="Imóveis"
                              loading="lazy"
                              decoding="async"
                              className="mix-blend-multiply w-full h-auto object-contain relative"
                            />
                          </div>
                        </div>
                      )}
                      <div className="space-y-2 flex-1">
                        <div className="inline-flex items-center space-x-2 bg-brand-accent px-3 py-1 rounded-full text-brand-accent-foreground text-[10px] font-bold uppercase tracking-wider">
                          <span>EM ATÉ 240 MESES</span>
                        </div>
                        <h2 className="text-lg md:text-3xl font-bold text-neutral-900 tracking-tight leading-snug">
                          Financie <span className="serif font-normal text-neutral-900">seu imóvel.</span>
                        </h2>
                      </div>
                    </div>
                    <p className="text-sm md:text-base text-neutral-600 leading-relaxed">
                      Realize o sonho do imóvel próprio com negociações bem abaixo do valor de mercado, agora também com
                      prazos e condições especiais. Buscamos das melhores taxas em parceria com os maiores bancos do
                      país.
                    </p>
                    <div className="pt-2">{renderButton("Imóveis financiados", "imoveis")}</div>
                  </div>
                  {isDesktop && (
                    <div className="flex w-full lg:w-5/12 relative justify-center mt-8 lg:mt-0">
                      <div className="relative w-full max-w-sm p-2 flex items-center justify-center z-0">
                        <div className={`absolute inset-0 ${animacao} blob-shadow flex items-center justify-center`}>
                          <svg
                            viewBox="0 0 200 200"
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-full h-full fill-neutral-100"
                          >
                            <path
                              d="M48.2,-64.1C61.4,-53.4,70.1,-37.2,73.1,-20.1C76.1,-3,73.4,15,65,30.3C56.6,45.6,42.5,58.3,26,65.6C9.6,72.9,-9.2,74.8,-27.1,69.5C-45,64.3,-62.1,51.8,-70.6,35.1C-79.1,18.4,-79.1,-2.6,-73.2,-20.9C-67.4,-39.1,-55.8,-54.6,-40.8,-64.7C-25.8,-74.8,-7.4,-79.5,10.1,-78.9C27.6,-78.3,45.2,-72.4,48.2,-64.1Z"
                              transform="translate(100 100)"
                            />
                          </svg>
                        </div>
                        <img
                          src="/assets/home/financiamentoimoveis.webp"
                          alt="Imóveis"
                          loading="lazy"
                          decoding="async"
                          className="mix-blend-multiply w-[90%] h-auto mx-auto object-contain relative"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          );
        }

        if (link.href === "investidores") {
          return (
            <section
              key="investidores"
              id="investidores"
              className="py-10 md:py-12 bg-white border-b border-neutral-200 overflow-hidden relative scroll-mt-16 rounded-none"
            >
              <div className="max-w-7xl mx-auto px-6 relative z-10">
                <div className={`flex flex-col ${layoutDirecao} items-center justify-between gap-8 lg:gap-12`}>
                  <div className="w-full lg:w-6/12 space-y-5">
                    <div className="flex flex-row items-center gap-4 -ml-2 sm:block sm:ml-0">
                      {!isDesktop && (
                        <div className="w-24 flex-shrink-0 relative flex justify-start">
                          <div className="absolute inset-0 bg-neutral-100 rounded-none filter blur-xs transform scale-90"></div>
                          <div className="relative w-full p-0 flex items-center justify-center z-0">
                            <img
                              src="/assets/home/carhomeequity.webp"
                              alt="Rentabilize Ativos"
                              loading="lazy"
                              decoding="async"
                              className="mix-blend-multiply w-full h-auto object-contain relative"
                            />
                          </div>
                        </div>
                      )}
                      <div className="space-y-2 flex-1">
                        <div className="inline-flex items-center space-x-2 bg-brand-accent px-3 py-1 rounded-full text-brand-accent-foreground text-[10px] font-bold uppercase tracking-wider">
                          <span>TAXAS DIFERENCIADAS</span>
                        </div>
                        <h2 className="text-lg md:text-3xl font-bold text-neutral-900 tracking-tight leading-snug">
                          Transforme <span className="serif font-normal text-neutral-900">ativos em investimentos.</span>
                        </h2>
                      </div>
                    </div>
                    <p className="text-sm md:text-base text-neutral-600 leading-relaxed max-w-2xl">
                      Use seu próprio imóvel ou carro como garantia e consiga empréstimos com taxas reduzidas para
                      comprar ativos únicos na sbX. Tenha prazos de até 240x para aproveitar nossas oportunidades.
                    </p>
                    <div className="flex flex-col md:flex-row gap-4 w-full max-w-2xl">
                      {renderButton("Crédito usando seu carro", "equityCarro")}
                      {renderButton("Crédito usando seu imóvel", "equityImovel")}
                    </div>
                  </div>
                  {isDesktop && (
                    <div className="flex w-full lg:w-5/12 relative justify-center mt-8 lg:mt-0">
                      <div className="relative w-full max-w-sm p-2 flex items-center justify-center z-0">
                        <div className={`absolute inset-0 ${animacao} blob-shadow flex items-center justify-center`}>
                          <svg
                            viewBox="0 0 200 200"
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-full h-full fill-neutral-100"
                          >
                            <path
                              d="M42.2,-61.7C55,-54.6,65.8,-42.6,71.7,-28.4C77.5,-14.2,78.3,2.2,74.5,17.4C70.7,32.6,62.3,46.5,49.9,55.9C37.5,65.3,21.1,70.2,4.4,70.9C-12.4,71.7,-29.4,68.3,-43.3,59.8C-57.2,51.3,-68,37.6,-72.7,21.9C-77.4,6.2,-76,-11.5,-68.8,-26.3C-61.6,-41.1,-48.5,-53.1,-34.4,-59.5C-20.2,-65.9,-5.1,-66.7,10.2,-66.3C25.5,-65.9,39.4,-68.8,42.2,-61.7Z"
                              transform="translate(100 100)"
                            />
                          </svg>
                        </div>
                        <img
                          src="/assets/home/carhomeequity.webp"
                          alt="Rentabilize Ativos"
                          loading="lazy"
                          decoding="async"
                          className="mix-blend-multiply w-[90%] h-auto mx-auto object-contain relative"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          );
        }

        if (link.href === "floorplan") {
          return (
            <section
              key="floorplan"
              id="floorplan"
              className="py-10 md:py-12 bg-white border-b border-neutral-200 overflow-hidden relative rounded-none"
            >
              <div className="max-w-7xl mx-auto px-6 relative z-10">
                <div className={`flex flex-col ${layoutDirecao} items-center justify-between gap-8 lg:gap-12`}>
                  <div className="w-full lg:w-6/12 space-y-5">
                    <div className="flex flex-row items-center gap-4 -ml-2 sm:block sm:ml-0">
                      {!isDesktop && (
                        <div className="w-24 flex-shrink-0 relative flex justify-start">
                          <div className="absolute inset-0 bg-neutral-100 rounded-none filter blur-xs transform scale-90"></div>
                          <div className="relative w-full p-0 flex items-center justify-center z-0">
                            <img
                              src="/assets/home/floorplan.webp"
                              alt="Floor Plan"
                              loading="lazy"
                              decoding="async"
                              className="mix-blend-multiply w-full h-auto object-contain relative"
                            />
                          </div>
                        </div>
                      )}
                      <div className="space-y-2 flex-1">
                        <div className="inline-flex items-center space-x-2 bg-brand-accent px-3 py-1 rounded-full text-brand-accent-foreground text-[10px] font-bold uppercase tracking-wider">
                          <span>Lojistas AutoArremate</span>
                        </div>
                        <h2 className="text-lg md:text-3xl font-bold text-neutral-900 tracking-tight leading-snug">
                          Floor plan <span className="serif font-normal text-neutral-900">com prazo de 90 dias.</span>
                        </h2>
                      </div>
                    </div>
                    <p className="text-sm md:text-base text-neutral-600 leading-relaxed">
                      Você é lojista? Aproveite nossa linha de crédito exclusiva para a compra de veículos na nossa
                      plataforma com pagamento em até 90 dias.
                    </p>
                    <div className="pt-2">{renderButton("Conheça as condições", "floorPlan")}</div>
                  </div>
                  {isDesktop && (
                    <div className="flex w-full lg:w-5/12 relative justify-center mt-8 lg:mt-0">
                      <div className="relative w-full max-w-sm p-2 flex items-center justify-center z-0">
                        <div className={`absolute inset-0 ${animacao} blob-shadow flex items-center justify-center`}>
                          <svg
                            viewBox="0 0 200 200"
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-full h-full fill-neutral-100"
                          >
                            <path
                              d="M49.2,-65.8C62.7,-56.3,71.9,-39.9,75.1,-22.4C78.4,-4.9,75.7,13.7,68,30C60.3,46.3,47.5,60.2,31.7,68.4C15.8,76.6,-3.2,79.1,-21.8,75C-40.4,71,-58.6,60.3,-69.5,44.7C-80.4,29.1,-84,8.5,-80.7,-10.1C-77.4,-28.7,-67.2,-45.3,-52.9,-55.1C-38.6,-64.9,-20.2,-67.9,-1.2,-66.5C17.8,-65.1,35.6,-75.3,49.2,-65.8Z"
                              transform="translate(100 100)"
                            />
                          </svg>
                        </div>
                        <img
                          src="/assets/home/floorplan.webp"
                          alt="Floor Plan"
                          loading="lazy"
                          decoding="async"
                          className="mix-blend-multiply w-[90%] h-auto mx-auto object-contain relative"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          );
        }

        if (link.href === "seguros") {
          return (
            <section
              key="seguros"
              id="seguros"
              className="py-10 md:py-12 bg-white overflow-hidden relative scroll-mt-16 rounded-none"
            >
              <div className="max-w-7xl mx-auto px-6 relative z-10">
                <div className={`flex flex-col ${layoutDirecao} items-center justify-between gap-8 lg:gap-12`}>
                  <div className="w-full lg:w-6/12 space-y-5">
                    <div className="flex flex-row items-center gap-4 -ml-2 sm:block sm:ml-0">
                      {!isDesktop && (
                        <div className="w-24 flex-shrink-0 relative flex justify-start">
                          <div className="absolute inset-0 bg-neutral-100 rounded-none filter blur-xs transform scale-90"></div>
                          <div className="relative w-full p-0 flex items-center justify-center z-0">
                            <img
                              src="/assets/home/seguros.webp"
                              alt="Proteção sbX"
                              loading="lazy"
                              decoding="async"
                              className="mix-blend-multiply w-full h-auto object-contain relative"
                            />
                          </div>
                        </div>
                      )}
                      <div className="space-y-2 flex-1">
                        <div className="inline-flex items-center space-x-2 bg-brand-accent px-3 py-1 rounded-full text-brand-accent-foreground text-[10px] font-bold uppercase tracking-wider">
                          <span>9 SEGURADORAS</span>
                        </div>
                        <h2 className="text-lg md:text-3xl font-bold text-neutral-900 tracking-tight leading-snug">
                          Seu patrimônio <span className="serif font-normal text-neutral-900">protegido.</span>
                        </h2>
                      </div>
                    </div>
                    <p className="text-sm md:text-base text-neutral-600">
                      Use a Wallet sBX para desfrutar de condições diferenciadas e garantir seus bens contra
                      imprevistos.
                    </p>
                    <div className="bg-neutral-50 p-5 rounded-none border border-neutral-200 flex flex-col gap-2 transition-colors hover:bg-neutral-100/50">
                      <div className="flex items-center gap-2">
                        <Plus className="w-3.5 h-3.5 md:w-4 md:h-4 text-neutral-400 shrink-0" strokeWidth={2} />
                        <h3 className="font-mono text-[10px] md:text-xs uppercase tracking-[0.18em] text-neutral-900 mt-0.5">
                          Cotação Online, sem compromisso
                        </h3>
                      </div>
                      <p className="text-neutral-600 text-xs leading-relaxed mt-1">
                        Simulação nas seguradoras líderes de mercado. Se você comprou ou já tem um imóvel ou veículo,
                        conheça nossas condições, sem burocracias, sem cobranças, tudo online.
                      </p>
                    </div>
                    <div className="flex flex-col md:flex-row gap-4 w-full max-w-2xl">
                      {renderButton("Seguros residenciais", "seguroResidencial")}
                      {renderButton("Seguros de veículos", "seguroAuto")}
                    </div>
                  </div>
                  {isDesktop && (
                    <div className="flex w-full lg:w-5/12 relative justify-center mt-8 lg:mt-0">
                      <div className="relative w-full max-w-sm p-2 flex items-center justify-center z-0">
                        <div className={`absolute inset-0 ${animacao} blob-shadow flex items-center justify-center`}>
                          <svg
                            viewBox="0 0 200 200"
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-full h-full fill-neutral-100"
                          >
                            <path
                              d="M41,-57C53.7,-49,64.9,-37.1,70.9,-22.4C76.9,-7.7,77.7,9.8,72.9,25.1C68.1,40.4,57.7,53.4,44.1,62C30.5,70.7,13.7,74.9,-1.9,77.5C-17.5,80.1,-35.1,81.1,-48.5,73.1C-61.9,65.1,-71.2,48.1,-75.4,30.3C-79.6,12.5,-78.7,-6.1,-72.6,-21.8C-66.5,-37.5,-55.2,-50.2,-41.2,-57.8C-27.2,-65.4,-10.6,-67.9,3,-72C16.6,-76.1,28.3,-65,41,-57Z"
                              transform="translate(100 100)"
                            />
                          </svg>
                        </div>
                        <img
                          src="/assets/home/seguros.webp"
                          alt="Proteção sbX"
                          loading="lazy"
                          decoding="async"
                          className="mix-blend-multiply w-[90%] h-auto mx-auto object-contain relative"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>
          );
        }

        return null;
      })}

      {/* Rodapé Institucional Preto Grupo (#1D1D1B) */}
      <footer className="w-full py-10 mt-auto bg-[#1D1D1B] border-t border-neutral-800 text-white rounded-none">
        <div className="container mx-auto px-6 flex flex-col items-center gap-4 text-center">
          <div className="h-16 w-16 md:h-20 md:w-20 rounded-none bg-[#1D1D1B] overflow-hidden flex items-center justify-center">
            <img
              src="/assets/home/sbx-etrade-mark-dark-D2r_Tkea.png"
              alt="SBX e-trade"
              loading="lazy"
              decoding="async"
              className="h-full w-full object-contain"
            />
          </div>
          <div className="flex flex-col gap-1 max-w-xl text-[11px] font-mono text-neutral-400">
            <p className="font-medium text-white">&copy; 2026 sbXPAY. Todos os direitos reservados.</p>
            <p className="leading-relaxed">
              sbXPAY Instituição de Pagamento Ltda. é uma instituição autorizada e regulada pelo Banco Central do
              Brasil.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}