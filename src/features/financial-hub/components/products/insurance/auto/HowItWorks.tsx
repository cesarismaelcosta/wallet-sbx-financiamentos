/**
 * @fileoverview Componente: HowItWorks (Seguro Auto)
 * @description Guia Rápido Profissional com Fundo Preto Institucional (#1D1D1B) e Zero-Radius.
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS, CLEAN ICONS & WHITE HIGHLIGHTS
 * =========================================================================
 * 1. {Zero-Radius Strict Governance}: Eliminação total de arredondamentos (`rounded-none`).
 * 2. {Solid Black Region}: Fundo preto institucional explícito (`bg-[#1D1D1B]`) com 
 *    cartões e container interno em `bg-neutral-900` e bordas em `border-white/20`.
 * 3. {SBX Typography}: Títulos e Abas monoespaçados, uppercase e espaçados (tracking), 
 *    com ícones/bullets mutados (neutral-400) e descrições em branco puro para leitura fluida.
 */

import { useState } from 'react';
import { Umbrella, Calculator, CarFront, Check } from 'lucide-react';

const TABS_CONFIG = [
  {
    id: 'coberturas',
    label: 'Coberturas',
    icon: Umbrella,
    desc: 'Escolha o nível de proteção que faz sentido para o seu uso e orçamento. As coberturas definem o que a seguradora pagará em caso de sinistro.',
    grid: "md:grid-cols-3",
    items: [
      { title: "Compreensiva", points: ["A proteção mais completa.", "Cobre colisão, capotamento, roubo, furto, incêndio, explosão e danos da natureza."] },
      { title: "Roubo e Furto", points: ["A opção mais econômica.", "Indenização apenas se o veículo for roubado/furtado, sem as demais coberturas da compreensiva."] },
      { title: "RCF-V (Terceiros)", points: ["Responsabilidade Civil.", "Cobre danos materiais, corporais e morais causados a outras pessoas em acidentes."] }
    ]
  },
  {
    id: 'franquia',
    label: 'Franquia',
    icon: Calculator,
    desc: 'A franquia é sua coparticipação financeira em danos parciais. Você não paga franquia em casos de Perda Total, Roubo/Furto ou danos a terceiros.',
    grid: "md:grid-cols-3",
    items: [
      { title: "Franquia Normal", points: ["Equilíbrio entre o preço do seguro e o valor da franquia que você paga se precisar de reparo."] },
      { title: "Franquia Reduzida", points: ["Franquia para reparos cai pela metade, com um pequeno aumento no preço do seguro.", "Ideal para evitar surpresas."] },
      { title: "Franquia Majorada", points: ["Franquia mais alta, com o preço do seguro mais baixo.", "Indicada para motoristas com baixo histórico de acidentes."] }
    ]
  },
  {
    id: 'assistencias',
    label: 'Assistências',
    icon: CarFront,
    desc: 'Serviços extras que garantem conforto e tranquilidade em situações de emergência no dia a dia.',
    grid: "md:grid-cols-2",
    items: [
      { title: "Assistência 24h", points: ["Guincho, socorro mecânico/elétrico, chaveiro, troca de pneu e pane seca."] },
      { title: "Carro Reserva", points: ["Veículo alugado pago pela seguradora enquanto o seu estiver na oficina."] },
      { title: "Vidros e Faróis", points: ["Proteção específica para troca ou reparo de vidros, faróis, lanternas e retrovisores."] },
      { title: "Acessórios & APP", points: ["Proteção para itens extras (kit gás/som) e seguro para despesas médicas/morte de passageiros."] }
    ]
  }
];

export function HowItWorks() {
  const [activeTab, setActiveTab] = useState(TABS_CONFIG[0].id);
  const activeData = TABS_CONFIG.find(t => t.id === activeTab)!;

  return (
    <section id="como-funciona" className="scroll-mt-24 py-16 lg:py-16 bg-[#1D1D1B] text-white font-sans border-b border-white/20 rounded-none">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        
        <div className="text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-semibold text-white mb-4 tracking-tight">
            Como comparar cotações de seguro
          </h2>
          <p className="text-white/80 max-w-2xl mx-auto text-sm sm:text-base leading-relaxed">
            Entenda como personalizar o seu seguro e comparar as diversas opções disponíveis.
          </p>
        </div>

        {/* Abas com padrão Zero-Radius, Dark Theme e Tipografia SBX */}
        <div className="flex flex-wrap justify-center gap-2 sm:gap-3 mb-10">
          {TABS_CONFIG.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 rounded-none font-mono text-xs uppercase tracking-[0.1em] transition-all border ${
                  isActive 
                    ? 'bg-white text-neutral-900 border-white shadow-xs' 
                    : 'bg-neutral-900 text-neutral-400 border-white/20 hover:border-white/40 hover:text-white'
                }`}
              >
                <Icon size={16} strokeWidth={1.5} className={isActive ? 'text-neutral-900' : 'text-neutral-400'} /> 
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Conteúdo Dinâmico */}
        <div className="bg-neutral-900 p-6 md:p-10 rounded-none border border-white/20 min-h-[420px]">
          {/* Texto descritivo da aba */}
          <p className="text-white font-medium mb-8 text-center max-w-3xl mx-auto text-sm sm:text-base leading-relaxed">
            {activeData.desc}
          </p>
          
          <div className={`grid ${activeData.grid} gap-6`}>
            {activeData.items.map((item) => (
              <div key={item.title} className="bg-[#1D1D1B] p-6 sm:p-8 rounded-none border border-white/20 flex flex-col shadow-xs transition-all hover:bg-[#1D1D1B]/80">
                
                {/* Título SBX: Mono, Uppercase, Tracking largo, Branco puro */}
                <h4 className="font-mono text-sm uppercase tracking-[0.18em] text-white mb-5">
                  {item.title}
                </h4>
                
                <ul className="space-y-3">
                  {item.points.map((p, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm text-white leading-relaxed">
                      {/* Check icon atua como o "ícone mutado" (neutral-400) do nosso padrão */}
                      <Check className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" strokeWidth={2} />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
                
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}