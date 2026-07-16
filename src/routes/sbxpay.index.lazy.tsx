/**
 * @fileoverview Componente: sbXPAYHome (Rota: /sbxpay/)
 * Ponto de entrada do ambiente de homologação e testes do Financial Hub.
 */

import React, { useState, useEffect } from 'react';
import { createLazyFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, LogOut, LogIn, CreditCard, Car, Home, TrendingUp, Truck, Building, UserPlus, AppWindow, Users, ShieldCheck, Lock, Plus } from 'lucide-react';
import { WalletLogo } from "@/components/brand/WalletLogo";
import { Button } from "@/components/ui/button";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";

export const Route = createLazyFileRoute('/sbxpay/')({
    component: sbXPAYHome,
});

// Configuração centralizada das jornadas
const flowsConfig = {
    // Fluxos de Vitrine (Passam por /sbxpay/offer)
    cartao: { route: "/sbxpay/offer", flowKey: "Cartão", disabled: false },
    carros: { route: "/sbxpay/offer", flowKey: "Carros", disabled: false },
    caminhoes: { route: "/sbxpay/offer", flowKey: "Caminhões", disabled: false },
    imoveis: { route: "/sbxpay/offer", flowKey: "Imóveis", disabled: true },
    floorPlan: { route: "/sbxpay/offer", flowKey: "Vendedor", disabled: true },
    
    // =========================================================================
    // [FLUXOS DIRETOS]: Redirecionam para o Gateway APENAS com o product_id
    // =========================================================================
    equityCarro: { 
        route: "/financialGatewayEntry", 
        flowKey: "AutoEquity", 
        isDirect: true, 
        productId: "7", // Produto: Car Equity
        disabled: false // Habilitado
    },
    equityImovel: { 
        route: "/financialGatewayEntry", 
        flowKey: "HomeEquity", 
        isDirect: true, 
        productId: "6", // Produto: Home Equity
        disabled: true  // Desativado
    },
    seguroResidencial: { 
        route: "/financialGatewayEntry", 
        flowKey: "SeguroResidencial", 
        isDirect: true, 
        productId: "10", // Produto: Seguro Residencial
        disabled: true   // Desativado
    },
    seguroAuto: { 
        route: "/financialGatewayEntry", 
        flowKey: "SeguroAuto", 
        isDirect: true, 
        productId: "9", // Produto: Seguro Auto
        disabled: false // Habilitado
    },
};

export function sbXPAYHome() {
    const navigate = useNavigate();
    const { sessionToken, logout } = useFinancialAuth();
    
    const [isScrolled, setIsScrolled] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activeKey, setActiveKey] = useState<string | null>(null);

    useEffect(() => {
        const handleScroll = () => setIsScrolled(window.scrollY > 20);
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    // =========================================================================
    // [HANDLERS]: Lógica Inteligente de Roteamento
    // =========================================================================
    const handleProductClick = async (configKey: keyof typeof flowsConfig) => {
        // [AJUSTE 1]: Define o botão que foi clicado para o componente saber qual mostrar o spinner
        setLoading(true);
        setActiveKey(configKey); 

        // [AJUSTE 2]: Pausa mínima de 200ms para o React renderizar o Loader na tela antes de navegar
        await new Promise(resolve => setTimeout(resolve, 200));

        const config = flowsConfig[configKey];

        // Trava de segurança (Mantida)
        if (!config) {
            console.error(`🚨 Erro Crítico: A chave "${String(configKey)}" não existe no flowsConfig!`);
            setLoading(false);
            setActiveKey(null); // Reset caso falhe aqui
            return;
        }

        try {
            if ('isDirect' in config && config.isDirect) {
                // [DELEGAÇÃO DIRETA]: O Orchestrator não deve validar offer_id aqui
                const sessionToken = localStorage.getItem('session_token') || "";
                const ambiente = localStorage.getItem('sbx_environment') || "production";
                
                // Payload limpo: Sem offer_id
                const searchPayload: any = {
                    environment: ambiente,
                    auth_token: sessionToken,
                    product_id: encodeURIComponent(config.productId),
                    return_uri: window.location.pathname + window.location.search,
                    utm_source: "landing",
                    utm_medium: "referral",
                    utm_campaign: `flow_${config.flowKey.toLowerCase()}`
                };

                await navigate({
                    to: config.route,
                    search: searchPayload
                });
            } else {
                // [FLUXO DE VITRINE]: Este ainda exige o fluxo com oferta
                await navigate({ 
                    to: config.route, 
                    search: { 
                        flow: config.flowKey,
                        return_uri: window.location.pathname 
                    } as any 
                });
            }
        } catch (error) {
            console.error("Erro na navegação:", error);
            setLoading(false);
            setActiveKey(null);
        } finally {
            // Garante que o loading é desfeito se algo falhar ou a navegação demorar
            setLoading(false); 
        }
    };

    // Estilos globais para botões
    const ghostBtn = "border-2 border-purple-600 text-purple-600 hover:bg-purple-600 hover:text-white transition-all rounded-lg px-4 py-2 text-xs font-bold transform hover:scale-[1.02]";
    
    // Função utilitária para renderizar os botões garantindo o padrão do Design System
    const renderButton = (
        label: string, 
        Icon: React.ElementType, 
        configKey: keyof typeof flowsConfig, 
        isSingle: boolean = false
    ) => {
        const config = flowsConfig[configKey];
        const isCurrentLoading = loading && activeKey === configKey;
        
        // [AJUSTE GEMINI]: Adicionado 'w-full md:w-auto' para o botão ocupar 100% no mobile e se ajustar no desktop
        const baseClasses = `flex items-center justify-center gap-3 px-6 py-3 font-medium rounded-xl transition-all w-full md:w-auto`;

        if (config.disabled) {
            return (
                <button disabled className={`${baseClasses} bg-slate-50 border border-slate-200 text-slate-400 cursor-not-allowed opacity-60`}>
                    {/* Wrapper de tamanho fixo com flex-shrink-0 para o ícone não amassar */}
                    <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                        <Icon className="w-full h-full" strokeWidth={1.5} />
                    </div>
                    {/* text-left adicionado para alinhamento correto em quebras de linha */}
                    <span className="font-jakarta tracking-tight text-left">{label}</span>
                </button>
            );
        }

        return (
            <button 
                disabled={loading} 
                onClick={() => handleProductClick(configKey)}
                className={`${baseClasses} bg-white border border-purple-600 text-purple-600 ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:bg-purple-50'}`}
            >
                {/* Wrapper de tamanho fixo com flex-shrink-0 para o ícone não amassar */}
                <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                    {isCurrentLoading ? (
                        <Loader2 className="w-full h-full animate-spin" strokeWidth={1.5} />
                    ) : (
                        <Icon className="w-full h-full" strokeWidth={1.5} />
                    )}
                </div>
                {/* text-left para alinhamento correto em quebras de linha */}
                <span className="font-jakarta tracking-tight text-left">
                    {isCurrentLoading ? "Aguarde..." : label}
                </span>
            </button>
        );
    };

    return (
        <div className="bg-white text-slate-900 antialiased font-sans overflow-x-hidden relative">
            <style>{`
                .glass { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
                @keyframes float-slow { 0%, 100% { transform: translateY(0px) rotate(0deg) scale(1); } 50% { transform: translateY(-10px) rotate(2deg) scale(1.01); } }
                @keyframes float-reverse { 0%, 100% { transform: translateY(0px) rotate(0deg) scale(1.01); } 50% { transform: translateY(10px) rotate(-2deg) scale(0.99); } }
                .animate-blob-float { animation: float-slow 7s ease-in-out infinite; }
                .animate-blob-float-reverse { animation: float-reverse 8s ease-in-out infinite; }
                .blob-shadow { filter: drop-shadow(0 20px 30px rgba(15, 23, 42, 0.05)); }
            `}</style>

            {/* HEADER ATUAL */}
            <header className={`fixed top-0 left-0 w-full z-50 glass border-b border-gray-100 transition-all duration-300 ${isScrolled ? 'shadow-sm py-2' : 'py-3'}`}>
                <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
                    <a href="#" className="flex items-center">
                        <WalletLogo size="md" withTagline />
                    </a>
                    
                    <nav className="hidden md:flex items-center space-x-6 text-[13px] font-semibold text-slate-600">
                        <a href="#seguranca" className="hover:text-purple-600 transition-colors">Segurança</a>
                        <a href="#cartao" className="hover:text-purple-600 transition-colors">Cartão</a>
                        <a href="#veiculos" className="hover:text-purple-600 transition-colors">Veículos</a>
                        <a href="#imoveis" className="hover:text-purple-600 transition-colors">Imóveis</a>
                        <a href="#investidores" className="hover:text-purple-600 transition-colors">Investidores</a>
                        <a href="#floorplan" className="hover:text-purple-600 transition-colors">Floor Plan</a>
                        <a href="#seguros" className="hover:text-purple-600 transition-colors">Seguros</a>
                    </nav>

                    <div className="hidden md:flex items-center space-x-3">
                        <a href="/backoffice" className={ghostBtn}>Backoffice</a>
                        {sessionToken ? (
                            <button onClick={logout} className={`flex items-center gap-2 ${ghostBtn}`}>
                                Sair <LogOut className="w-3 h-3" />
                            </button>
                        ) : (
                            <button onClick={() => navigate({ to: '/accounts/signin' })} className={`flex items-center gap-2 ${ghostBtn}`}>
                                Entrar <LogIn className="w-3 h-3" />
                            </button>
                        )}
                    </div>
                </div>
            </header>

            {/* HERO SECTION - Segurança */}
            <section id="seguranca" className="relative pt-28 pb-16 md:pt-32 md:pb-20 overflow-hidden bg-white border-b border-gray-100">
                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <div className="flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
                        <div className="w-full lg:w-6/12 space-y-5 text-center lg:text-left">
                            <div className="flex justify-center lg:justify-start">
                                <img 
                                    src="/assets/home/sbxpay_r.png" 
                                    alt="sbX PAY" 
                                    className="h-14 md:h-14 w-auto object-contain" 
                                />
                            </div>
                            
                            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 leading-[1.15]">
                                Segurança e agilidade para você comprar e vender na <span className="bg-gradient-to-r from-purple-600 to-purple-500 bg-clip-text text-transparent">Superbid.</span>
                            </h1>
                            
                            <p className="text-sm md:text-base text-slate-600 max-w-2xl mx-auto lg:mx-0 leading-relaxed">
                                A plataforma líder da América Latina é tem uma infraestrutura segura e inovadora, com a proteção que seu patrimônio exige.
                            </p>

                            <div className="border-t border-gray-100 pt-5 space-y-4 text-left max-w-xl mx-auto lg:mx-0">
                                <h3 className="text-xs font-bold text-purple-600 uppercase tracking-wider">Conta sbXPAY: Prática e Segura</h3>
                                
                                {/* Item 1 */}
                                <div className="flex items-start space-x-3">
                                    <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center mt-0.5">
                                        {/* Ícone de Mais estilizado */}
                                        <Plus className="w-4 h-4 text-purple-500" strokeWidth={3} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 text-sm">O seu dinheiro sempre protegido</h4>
                                        <p className="text-slate-600 text-xs mt-1 leading-relaxed">Fique tranquilo na hora de comprar. Os valores das suas negociações ficam guardados em contas pagamento de nossa Instituição de Pagamento regulada pelo BC.</p>
                                    </div>
                                </div>
                                
                                {/* Item 2 */}
                                <div className="flex items-start space-x-3">
                                    <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center mt-0.5">
                                        {/* Ícone de Mais estilizado */}
                                        <Plus className="w-4 h-4 text-purple-500" strokeWidth={3} />
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-slate-900 text-sm">Padrão máximo de segurança</h4>
                                        <p className="text-slate-600 text-xs mt-1 leading-relaxed">As liquidações das suas compras acontecem em um ambiente com auditoria rigorosa e proteção total dos seus dados.</p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start pt-2">
                                <a 
                                    href="https://accounts.superbid.net/signin?response_type=token&client_id=dzqC3VodSoXukD45BQKg3NQU6-faststore&redirect_uri=https://www.superbid.net/&authorization_uri=https://www.superbid.net/authorization/&language=pt-BR&portal_id=2&hostName=Superbid%20BR"
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center gap-2 px-6 py-3 bg-white border border-purple-600 text-purple-600 font-medium rounded-xl transition-all hover:bg-purple-50"
                                >
                                    <UserPlus className="w-5 h-5" strokeWidth={1.5} />
                                    <span className="font-jakarta tracking-tight">Entrar ou abrir conta</span>
                                </a>
                            </div>
                        </div>

                        <div className="w-full lg:w-5/12 relative flex justify-center mt-8 lg:mt-0">
                            <div className="relative w-full max-w-sm p-2 flex items-center justify-center z-0">
                                <div className="absolute inset-0 animate-blob-float blob-shadow flex items-center justify-center">
                                    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full fill-slate-100">
                                        <path d="M43,-62.1C55.3,-53.4,64.8,-40.4,70.9,-25.6C77,-10.8,79.7,5.8,74.7,19.6C69.7,33.5,57,44.7,43.5,52.9C29.9,61.1,15,66.4,-1.3,68.2C-17.6,70,-35.1,68.3,-48.1,59.7C-61.1,51.1,-69.5,35.6,-73,19.1C-76.5,2.7,-75.1,-14.8,-67.7,-29C-60.3,-43.3,-46.8,-54.2,-32.8,-62.1C-18.8,-70,-9.4,-74.8,3.2,-79.2C15.8,-83.7,30.7,-87.8,43,-62.1Z" transform="translate(100 100)" />
                                    </svg>
                                </div>
                                <img src="/assets/home/conta.png" alt="Segurança sbX Wallet" className="mix-blend-multiply w-[90%] h-auto mx-auto object-contain relative" />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* SEÇÃO CARTÃO */}
            <section id="cartao" className="py-16 md:py-20 bg-white border-b border-gray-100 overflow-hidden relative">
                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <div className="flex flex-col lg:flex-row-reverse items-center justify-between gap-8 lg:gap-12">
                        <div className="w-full lg:w-6/12 space-y-5">
                            <div className="inline-flex items-center space-x-2 bg-purple-100/80 px-3 py-1 rounded-full text-purple-700 text-[10px] font-bold uppercase tracking-wider">
                                <i className="fa-solid fa-credit-card"></i>
                                <span>Até R$ 120 mil</span>
                            </div>
                            <div className="space-y-3">
                                <h2 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">Parcele em até 18x com seu cartão.</h2>
                                <p className="text-sm md:text-base text-slate-600 leading-relaxed">Não deixe um bom negócio escapar. Amplie seu poder de compra usando o seu limite do cartão de crédito com total tranquilidade na hora de arrematar.</p>
                            </div>
                            {/* Dois quadros cinza lado a lado com diferenciais adicionais*/}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                                
                                {/* Card 1: PF e PJ */}
                                <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 flex flex-col gap-2 transition-colors hover:bg-slate-50">
                                    <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                                        <Plus className="w-4 h-4 text-purple-500" strokeWidth={3} />
                                        <span>Para PF e PJ</span>
                                    </div>
                                    <p className="text-slate-600 text-xs leading-relaxed">
                                        Condições válidas para pessoas físicas e jurídicas aproveitarem o parcelamento de aquisições no cartão.
                                    </p>
                                </div>

                                {/* Card 2: Segurança */}
                                <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-4 flex flex-col gap-2 transition-colors hover:bg-slate-50">
                                    <div className="flex items-center gap-2 text-slate-900 font-bold text-sm">
                                        <Plus className="w-4 h-4 text-purple-500" strokeWidth={3} />
                                        <span>Segurança 3DS</span>
                                    </div>
                                    <p className="text-slate-600 text-xs leading-relaxed">
                                        Protocolo avançado de autenticação (3D Secure) ativado para garantir transações protegidas e sem fraudes.
                                    </p>
                                </div>

                            </div>
                            <div className="pt-2">
                                {renderButton("Ofertas parceladas com cartão", CreditCard, "cartao", true)}
                            </div>
                        </div>
                        <div className="w-full lg:w-5/12 relative flex justify-center mt-8 lg:mt-0">
                            <div className="relative w-full max-w-sm p-2 flex items-center justify-center z-0">
                                <div className="absolute inset-0 animate-blob-float-reverse blob-shadow flex items-center justify-center">
                                    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full fill-slate-100">
                                        <path d="M54.5,-73.4C69.3,-64,79.1,-46.8,82,-28.9C84.9,-11,80.9,7.6,73.8,24.1C66.7,40.7,56.5,55.3,42.4,63.4C28.2,71.5,10.1,73,-6.9,71.2C-23.9,69.5,-39.8,64.4,-51.9,54.7C-64,45.1,-72.3,31,-75.4,15.4C-78.4,-0.2,-76.3,-17.3,-68.8,-32.1C-61.2,-46.9,-48.3,-59.4,-33.5,-68.8C-18.7,-78.2,-2.1,-84.5,14.9,-82.1C32,-79.7,46.8,-76.1,54.5,-73.4Z" transform="translate(100 100)" />
                                    </svg>
                                </div>
                                <img src="/assets/home/cartao.png" alt="Cartão" className="mix-blend-multiply w-[90%] h-auto mx-auto object-contain relative" />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* SEÇÃO VEÍCULOS */}
            <section id="veiculos" className="py-16 md:py-20 bg-white border-b border-gray-100 overflow-hidden relative">
                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <div className="flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
                        <div className="w-full lg:w-6/12 space-y-5 text-center lg:text-left">
                            <div className="inline-flex items-center space-x-2 bg-purple-50 px-3 py-1 rounded-full text-purple-700 text-[10px] font-bold uppercase tracking-wider">
                                <i className="fa-solid fa-truck-pickup"></i>
                                <span>PROCESSO DIGITAL COM APOIO DE ESPECIALISTAS</span>
                            </div>
                            <h2 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">Financie seu veículo em até 60x.</h2>
                            <p className="text-sm md:text-base text-slate-600 leading-relaxed max-w-2xl mx-auto lg:mx-0">Compre seu carro ou caminhão com as melhores taxas do mercado. Nós fazemos o trabalho pesado de assessoria e buscamos as melhores soluções nos maiores bancos do Brasil.</p>
                            {/* quebra responsiva */}
                            <div className="flex flex-col md:flex-row gap-4 w-full max-w-2xl">
                                {renderButton("Carros financiados", Car, "carros")}
                                {renderButton("Caminhões financiados", Truck, "caminhoes")}
                            </div>
                        </div>
                        <div className="w-full lg:w-5/12 flex justify-center mt-8 lg:mt-0 relative">
                            <div className="relative w-full max-w-sm p-2 flex items-center justify-center z-0">
                                <div className="absolute inset-0 animate-blob-float blob-shadow flex items-center justify-center">
                                    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full fill-slate-100">
                                        <path d="M55.6,-68.8C70.6,-58.5,80.4,-40.4,82,-21.8C83.7,-3.3,77.3,15.7,68.4,32.7C59.5,49.7,48.2,64.7,32.9,71.5C17.6,78.3,-1.7,76.9,-19.7,71.2C-37.7,65.5,-54.3,55.5,-65.4,40.7C-76.5,25.9,-82,6.3,-79.8,-11.9C-77.5,-30,-67.4,-46.8,-52.9,-57.1C-38.3,-67.3,-19.1,-71.1,0.5,-71.7C20.1,-72.3,40.3,-69.7,55.6,-68.8Z" transform="translate(100 100)" />
                                    </svg>
                                </div>
                                <img src="/assets/home/financiamentoveiculos.png" alt="Veículos" className="mix-blend-multiply w-[90%] h-auto mx-auto object-contain relative" />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* SEÇÃO IMÓVEIS */}
            <section id="imoveis" className="py-16 md:py-20 bg-white border-b border-gray-100 overflow-hidden relative">
                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <div className="flex flex-col lg:flex-row-reverse items-center justify-between gap-8 lg:gap-12">
                        <div className="w-full lg:w-6/12 space-y-5">
                            <div className="inline-flex items-center space-x-2 bg-purple-50 px-3 py-1 rounded-full text-purple-700 text-[10px] font-bold uppercase tracking-wider">
                                <i className="fa-solid fa-house-chimney"></i>
                                <span>INVISTA PAGANDO EM ATÉ 240x</span>
                            </div>
                            <h2 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">Financie seu imóvel em até 240x.</h2>
                            <p className="text-sm md:text-base text-slate-600 leading-relaxed">Realize o sonho do imóvel próprio com prazos e condições especiais. Buscamos as melhores taxas em parceria com os maiores bancos do país.</p>
                            <div className="pt-2">
                                {renderButton("Imóveis financiados", Home, "imoveis", true)}
                            </div>
                        </div>
                        <div className="w-full lg:w-5/12 flex justify-center mt-8 lg:mt-0 relative">
                            <div className="relative w-full max-w-sm p-2 flex items-center justify-center z-0">
                                <div className="absolute inset-0 animate-blob-float-reverse blob-shadow flex items-center justify-center">
                                    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full fill-slate-100">
                                        <path d="M48.2,-64.1C61.4,-53.4,70.1,-37.2,73.1,-20.1C76.1,-3,73.4,15,65,30.3C56.6,45.6,42.5,58.3,26,65.6C9.6,72.9,-9.2,74.8,-27.1,69.5C-45,64.3,-62.1,51.8,-70.6,35.1C-79.1,18.4,-79.1,-2.6,-73.2,-20.9C-67.4,-39.1,-55.8,-54.6,-40.8,-64.7C-25.8,-74.8,-7.4,-79.5,10.1,-78.9C27.6,-78.3,45.2,-72.4,48.2,-64.1Z" transform="translate(100 100)" />
                                    </svg>
                                </div>
                                <img src="/assets/home/financiamentoimoveis.png" alt="Imóveis" className="mix-blend-multiply w-[90%] h-auto mx-auto object-contain relative" />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* SEÇÃO INVESTIDORES */}
            <section id="investidores" className="py-16 md:py-20 bg-white border-b border-gray-100 overflow-hidden relative">
                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <div className="flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
                        <div className="w-full lg:w-6/12 space-y-5 text-center lg:text-left">
                            <div className="inline-flex items-center space-x-2 bg-purple-50 px-3 py-1 rounded-full text-purple-700 text-[10px] font-bold uppercase tracking-wider">
                                <i className="fa-solid fa-money-bill-trend-up"></i>
                                <span>TAXAS DIFERENCIADAS PARA VOCÊ INVESTIR</span>
                            </div>
                            <h2 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">Converta seu bem em investimento.</h2>
                            <p className="text-sm md:text-base text-slate-600 leading-relaxed max-w-2xl mx-auto lg:mx-0">Use seu próprio imóvel ou carro como garantia e consiga empréstimos com taxas reduzidas para comprar ativos únicos na sbX. Tenha prazos de até 240x para aproveitar nossas oportunidades.</p>
                            {/* quebra responsiva */}
                            <div className="flex flex-col md:flex-row gap-4 w-full max-w-2xl">
                                {renderButton("Crédito usando seu carro", Car, "equityCarro")}
                                {renderButton("Crédito usando seu imóvel", Home, "equityImovel")}
                            </div>
                        </div>
                        <div className="w-full lg:w-5/12 flex justify-center mt-8 lg:mt-0 relative">
                            <div className="relative w-full max-w-sm p-2 flex items-center justify-center z-0">
                                <div className="absolute inset-0 animate-blob-float blob-shadow flex items-center justify-center">
                                    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full fill-slate-100">
                                        <path d="M42.2,-61.7C55,-54.6,65.8,-42.6,71.7,-28.4C77.5,-14.2,78.3,2.2,74.5,17.4C70.7,32.6,62.3,46.5,49.9,55.9C37.5,65.3,21.1,70.2,4.4,70.9C-12.4,71.7,-29.4,68.3,-43.3,59.8C-57.2,51.3,-68,37.6,-72.7,21.9C-77.4,6.2,-76,-11.5,-68.8,-26.3C-61.6,-41.1,-48.5,-53.1,-34.4,-59.5C-20.2,-65.9,-5.1,-66.7,10.2,-66.3C25.5,-65.9,39.4,-68.8,42.2,-61.7Z" transform="translate(100 100)" />
                                    </svg>
                                </div>
                                <img src="/assets/home/carhomeequity.png" alt="Rentabilize Ativos" className="mix-blend-multiply w-[90%] h-auto mx-auto object-contain relative" />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* SEÇÃO FLOOR PLAN */}
            <section id="floorplan" className="py-16 md:py-20 bg-white border-b border-gray-100 overflow-hidden relative">
                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <div className="flex flex-col lg:flex-row-reverse items-center justify-between gap-8 lg:gap-12">
                        <div className="w-full lg:w-6/12 space-y-5">
                            <div className="inline-flex items-center space-x-2 bg-purple-50 px-3 py-1 rounded-full text-purple-700 text-[10px] font-bold uppercase tracking-wider">
                                <i className="fa-solid fa-store"></i>
                                <span>Lojistas AutoArremate</span>
                            </div>
                            <h2 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">Floor Plan com prazo de até 90 dias.</h2>
                            <p className="text-sm md:text-base text-slate-600 leading-relaxed">Você é lojista? Aproveite nossa linha de crédito exclusiva para a compra de veículos na nossa plataforma com pagamento em até 90 dias.</p>
                            <div className="pt-2">
                                {renderButton("Conheça as condições", () => <TrendingUp className="w-5 h-5 rotate-90" strokeWidth={1.5} />, "floorPlan", true)}
                            </div>
                        </div>
                        <div className="w-full lg:w-5/12 flex justify-center mt-8 lg:mt-0 relative">
                            <div className="relative w-full max-w-sm p-2 flex items-center justify-center z-0">
                                <div className="absolute inset-0 animate-blob-float-reverse blob-shadow flex items-center justify-center">
                                    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full fill-slate-100">
                                        <path d="M49.2,-65.8C62.7,-56.3,71.9,-39.9,75.1,-22.4C78.4,-4.9,75.7,13.7,68,30C60.3,46.3,47.5,60.2,31.7,68.4C15.8,76.6,-3.2,79.1,-21.8,75C-40.4,71,-58.6,60.3,-69.5,44.7C-80.4,29.1,-84,8.5,-80.7,-10.1C-77.4,-28.7,-67.2,-45.3,-52.9,-55.1C-38.6,-64.9,-20.2,-67.9,-1.2,-66.5C17.8,-65.1,35.6,-75.3,49.2,-65.8Z" transform="translate(100 100)" />
                                    </svg>
                                </div>
                                <img src="/assets/home/floorplan.png" alt="Floor Plan" className="mix-blend-multiply w-[90%] h-auto mx-auto object-contain relative" />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* SEÇÃO SEGUROS */}
            <section id="seguros" className="py-16 md:py-20 bg-white overflow-hidden relative">
                <div className="max-w-7xl mx-auto px-6 relative z-10">
                    <div className="flex flex-col lg:flex-row items-center justify-between gap-8 lg:gap-12">
                        <div className="w-full lg:w-6/12 space-y-5">
                            <div className="inline-flex items-center space-x-2 bg-purple-100/80 px-3 py-1 rounded-full text-purple-700 text-[10px] font-bold uppercase tracking-wider">
                                <i className="fa-solid fa-shield-heart"></i>
                                <span>SEGURE SEU VEÍCULO OU SUA RESIDÊNCIA</span>
                            </div>
                            <div className="space-y-3">
                                <h2 className="text-xl md:text-3xl font-bold text-slate-900 tracking-tight">Patrimônio protegido.</h2>
                                <p className="text-sm md:text-base text-slate-600">Use a Wallet sBX para desfrutar de condições diferenciadas e garantir seus bens com contra imprevistos.</p>
                            </div>
                            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-md shadow-purple-500/5 space-y-3">
                                <h3 className="text-xs font-bold text-purple-600 uppercase tracking-wider">Cotação 100% Online, em segundos, sem compromisso</h3>
                                <p className="text-slate-600 text-xs leading-relaxed">Simulação nas seguradoras líderes de mercado. Se você comprou ou já tem um imóvel ou veículo, conheça nossas condições, sem burocracias, sem cobranças, tudo online.</p>
                            </div>
                            {/* quebra responsiva */}
                            <div className="flex flex-col md:flex-row gap-4 w-full max-w-2xl">
                                {renderButton("Seguros residenciais", Building, "seguroResidencial")}
                                {renderButton("Seguros de veículos", Car, "seguroAuto")}
                            </div>
                        </div>
                        <div className="w-full lg:w-5/12 flex justify-center mt-8 lg:mt-0 relative">
                            <div className="relative w-full max-w-sm p-2 flex items-center justify-center z-0">
                                <div className="absolute inset-0 animate-blob-float blob-shadow flex items-center justify-center">
                                    <svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg" className="w-full h-full fill-slate-100">
                                        <path d="M41,-57C53.7,-49,64.9,-37.1,70.9,-22.4C76.9,-7.7,77.7,9.8,72.9,25.1C68.1,40.4,57.7,53.4,44.1,62C30.5,70.7,13.7,74.9,-1.9,77.5C-17.5,80.1,-35.1,81.1,-48.5,73.1C-61.9,65.1,-71.2,48.1,-75.4,30.3C-79.6,12.5,-78.7,-6.1,-72.6,-21.8C-66.5,-37.5,-55.2,-50.2,-41.2,-57.8C-27.2,-65.4,-10.6,-67.9,3,-72C16.6,-76.1,28.3,-65,41,-57Z" transform="translate(100 100)" />
                                    </svg>
                                </div>
                                <img src="/assets/home/seguros.png" alt="Proteção sbX" className="mix-blend-multiply w-[90%] h-auto mx-auto object-contain relative" />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* FOOTER - Logo aumentada */}
            <footer className="w-full pt-10 pb-40 md:py-10 mt-auto bg-black border-t border-gray-800">
                <div className="container mx-auto px-6 flex flex-col items-center gap-4 text-center">
                    
                    {/* Container maior (h-16 w-16) com o mesmo corte nas bordas */}
                    <div className="h-20 w-20 rounded-md bg-black overflow-hidden flex items-center justify-center">
                        <img 
                            src="/assets/home/sbxpay_p.png" 
                            alt="sbXPAY" 
                            className="h-full w-full object-cover scale-110"
                        />
                    </div>

                    <div className="flex flex-col gap-1 max-w-xl text-[11px] text-gray-400">
                        <p className="font-medium text-white">
                            &copy; 2026 sbXPAY. Todos os direitos reservados.
                        </p>
                        <p className="leading-relaxed">
                            sbXPAY Instituição de Pagamento Ltda. é uma instituição autorizada e regulada pelo Banco Central do Brasil.
                        </p>
                    </div>
                </div>
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

            {/* MOBILE TAB BAR (Visível apenas no celular) */}
            <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 z-50 flex justify-around items-center pt-2 pb-4 md:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
                
                {/* Botão Início (Ativo) */}
                <a href="#" className="flex flex-col items-center justify-center text-purple-600 min-w-[70px] gap-1">
                    <Home className="w-6 h-6" strokeWidth={1.5} />
                    <span className="text-[10px] font-bold">Início</span>
                </a>

                {/* Botão Backoffice */}
                <a href="/backoffice" className="flex flex-col items-center justify-center text-slate-400 hover:text-purple-600 transition-colors min-w-[70px] gap-1">
                    <AppWindow className="w-6 h-6" strokeWidth={1.5} />
                    <span className="text-[10px] font-medium">Backoffice</span>
                </a>

                {/* Botão Entrar / Sair dinâmico */}
                {sessionToken ? (
                    <button onClick={logout} className="flex flex-col items-center justify-center text-slate-400 hover:text-purple-600 transition-colors min-w-[70px] gap-1">
                        <LogOut className="w-6 h-6" strokeWidth={1.5} />
                        <span className="text-[10px] font-medium">Sair</span>
                    </button>
                ) : (
                    <button onClick={() => navigate({ to: '/accounts/signin' })} className="flex flex-col items-center justify-center text-slate-400 hover:text-purple-600 transition-colors min-w-[70px] gap-1">
                        <LogIn className="w-6 h-6" strokeWidth={1.5} />
                        <span className="text-[10px] font-medium">Entrar</span>
                    </button>
                )}
            </div>
        </div>
    );
}