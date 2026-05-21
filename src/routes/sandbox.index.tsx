/**
 * @page SandboxHome
 * @description Ponto de entrada do ambiente de homologação.
 * Implementa o "Passive Tracking" para registrar visitas automáticas (VISIT)
 * e gerenciar a reentrada de jornadas via visit_id e visit_update_id.
 */

import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, createFileRoute, Link } from '@tanstack/react-router';
import { WalletLogo } from "@/components/brand/WalletLogo";
import { 
  CreditCard, 
  Car, 
  Home, 
  UserSquare2, 
  TrendingUp, 
  ShieldCheck,
  ChevronRight
} from 'lucide-react';

const SandboxHome = () => {
  const navigate = useNavigate();
  

// ****************************************************************************
  // INÍCIO DO TRECHO WALLET sbXPAY DE CONTROLE DE VISITAS (CORE PROTOCOL)
  // ****************************************************************************
  /**
   * PROTOCOLO sbXPAY (Audit Mode - Multi-Stage)
   * ----------------------------
   * OBJETIVO: Gerenciar o rastro de auditoria (Trace ID) e garantir a herança de jornada.
   * * ESTRATÉGIA DE ESTADOS:
   * 1. CURRENT_PAGE_TYPE: Define o comportamento do pouso (Hidratação/VISIT OU SIMULATION).
   * 2. TARGET_ACTION_TYPE: Define o comportamento do clique/intenção (VISIT OU /SIMULATION).
   */

  /**
   * @state debugInfo
   * @description Centralizador de metadados da jornada. 
   * [AJUSTE]: Incluído simulationId para evitar duplicidade na transição de páginas.
   */
  const [debugInfo, setDebugInfo] = useState<{ 
    visitId: string; 
    updateId: string | null; 
    ref: string | null;
    productId?: number | null;
    simulationId?: string | null; // AJUSTE: Identificador da instância de negócio
  }>({
    visitId: 'Carregando...', 
    updateId: null,
    ref: null,
    simulationId: null // AJUSTE: Inicialização do estado
  });

  const CURRENT_PAGE_TYPE = 'VISIT'; 
  const TARGET_ACTION_TYPE = 'SIMULATION'; 

  /**
   * @function handleProductClick
   * @description Navegação com herança de rastro (Context Carry-over).
   * [AJUSTE]: Injetado simulation_id na URL de destino para hidratar a SimulacaoPage.
   */
  const handleProductClick = (route: string) => {
    const params = new URLSearchParams(window.location.search);
    
    const activeVisitId = params.get('visit_id') || sessionStorage.getItem('sbx_visit_id');
    const currentUpdateId = params.get('visit_update_id') || sessionStorage.getItem('sbx_last_update_id');
    // AJUSTE: Recupera ID da simulação se o usuário já tiver clicado em simular antes
    const activeSimulationId = params.get('simulation_id') || sessionStorage.getItem('sbx_simulation_id');

    navigate({ 
      to: route, 
      search: {
        visit_id: activeVisitId || undefined,
        visit_update_id: currentUpdateId || undefined, 
        simulation_id: activeSimulationId || undefined, // AJUSTE: Herança para o roteador
        utm_source: params.get('utm_source') || undefined,
        utm_medium: params.get('utm_medium') || undefined,
        utm_campaign: params.get('utm_campaign') || undefined,
        offer_id: params.get('offer_id') || undefined,
        lote: params.get('lote') || undefined
      } 
    });
  };

  const hasRegistered = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const idNaUrl = urlParams.get('visit_update_id');

    if (hasRegistered.current || (idNaUrl && idNaUrl === debugInfo.updateId)) {
      return;
    }

    const executarProtocoloSbX = async () => {
      if (hasRegistered.current) return;
      hasRegistered.current = true;

      try {
        const params = new URLSearchParams(window.location.search);
        const existingVisitId = params.get('visit_id') || sessionStorage.getItem('sbx_visit_id');
        
        const payload = {
          action: CURRENT_PAGE_TYPE, 
          visit_id: existingVisitId || undefined, 
          origin_visit_update_id: params.get('visit_update_id') || sessionStorage.getItem('sbx_last_update_id') || undefined,
          product_id: params.get('product_id') ? Number(params.get('product_id')) : undefined,
          interaction_context: {
            utm_source: params.get('utm_source') || 'direct',
            origin_url: window.location.href,
          },
          offer: params.get('offer_id') ? { offer_id: params.get('offer_id') } : undefined,
          target_url: window.location.href,
        };

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/orchestrator`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.visit_id) {
          sessionStorage.setItem('sbx_visit_id', data.visit_id);
          if (data.visit_update_id) {
            sessionStorage.setItem('sbx_last_update_id', data.visit_update_id);
          }
          // AJUSTE: Salva o simulation_id retornado pelo Orquestrador (se houver)
          if (data.simulation_id) {
            sessionStorage.setItem('sbx_simulation_id', data.simulation_id);
          }
          
          setDebugInfo({ 
            visitId: data.visit_id, 
            updateId: data.visit_update_id || null, 
            productId: data.product_id || undefined,
            simulationId: data.simulation_id || null, // AJUSTE: Sincronização reativa
            ref: params.get('offer_id') || params.get('lote') 
          });

          const newParams = new URLSearchParams(window.location.search);
          newParams.set('visit_id', data.visit_id);
          if (data.visit_update_id) newParams.set('visit_update_id', data.visit_update_id);
          // AJUSTE: "Carimba" a URL com o simulation_id para a próxima página herdar
          if (data.simulation_id) newParams.set('simulation_id', data.simulation_id);

          const newURL = window.location.pathname + '?' + newParams.toString();
          window.history.replaceState(null, '', newURL);
        }
      } catch (err) {
        console.error(`[sbX] Erro no Protocolo Dinâmico:`, err);
      }
    };

    executarProtocoloSbX();
  }, []);

  // ****************************************************************************
  // FIM DO TRECHO WALLET sbXPAY DE CONTROLE DE VISITAS
  // ****************************************************************************
  
  const menuOptions = [
    { title: 'Cartão de Crédito', icon: <CreditCard className="w-8 h-8 text-primary" />, route: '/sandbox/cartao', description: 'Simulações de parcelamento de lote.' },
    { title: 'Veículos', icon: <Car className="w-8 h-8 text-primary" />, route: '/sandbox/veiculos', description: 'Simulação de financiamento de veículos com a MeResolve.' },
    { title: 'Imóveis', icon: <Home className="w-8 h-8 text-primary" />, route: '/sandbox/imoveis', description: 'Simulação de financiamento de veículos com a Creditas.' },
    { title: 'Vendedor', icon: <UserSquare2 className="w-8 h-8 text-primary" />, route: '/sandbox/vendedor', description: 'Simulação de financiamento próprio de vendedor (VRental).' },
    { title: 'Home/Car Equity', icon: <TrendingUp className="w-8 h-8 text-primary" />, route: '/sandbox/equity', description: 'Rota para LP de home e car equity.' },
    { title: 'Seguros', icon: <ShieldCheck className="h-8 w-8 text-primary" />, route: '/sandbox/seguros', description: 'Rota para LP de seguros de veículos.' }
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col overflow-hidden">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Bloco esquerdo existente */}
          <div className="flex items-center gap-4">
            <WalletLogo size="md" withTagline />
            <div className="h-6 w-px bg-slate-200 ml-2 hidden sm:block" />
            <div className="flex flex-col hidden sm:flex text-left">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Sandbox Environment</span>
              <span className="text-[9px] text-primary font-bold uppercase">
                Trace ID: {debugInfo.updateId ? debugInfo.updateId.substring(0, 8) : 'Pending...'}
              </span>
            </div>
          </div>

          {/* ADICIONE O BOTÃO AQUI */}
          <Link 
            to="/backoffice"
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm"
          >
            Backoffice
          </Link>
        </div>
      </header>

      <main className="flex-grow max-w-6xl mx-auto px-8 py-6 w-full">
        <div className="mb-6">
          <h2 className="text-3xl font-black text-slate-800 tracking-tight text-left">O que vamos testar hoje?</h2>
          <p className="text-slate-500 mt-1 text-sm text-left">Selecione um produto para iniciar a simulação no ambiente de homologação.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {menuOptions.map((option, index) => (
            <button
              key={index}
              onClick={() => handleProductClick(option.route)}
              className="group flex flex-col items-start p-5 bg-white border-2 border-primary/20 rounded-2xl transition-all duration-300 hover:border-primary hover:shadow-lg hover:translate-y-[-2px] text-left"
            >
              <div className="p-2.5 bg-primary/5 rounded-xl group-hover:bg-primary/10 transition-colors">
                {option.icon}
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-800 tracking-tight flex items-center justify-between w-full">
                {option.title}
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-primary transition-colors" />
              </h3>
              <p className="mt-1.5 text-xs text-slate-500 leading-snug">
                {option.description}
              </p>
            </button>
          ))}
        </div>
      </main>

      <footer className="py-4 text-center text-slate-400 text-[9px] uppercase tracking-[0.3em] border-t border-slate-100 bg-white/50">
        Wallet sbX | Audit Mode Active
      </footer>
    </div>
  );
};

export const Route = createFileRoute('/sandbox/')({
  component: () => <SandboxHome />,
});