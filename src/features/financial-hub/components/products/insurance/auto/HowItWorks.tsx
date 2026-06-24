/**
 * @fileoverview Guia Rápido Profissional - Visual Limpo e Compacto
 * Fonte: Inter (font-sans)
 */
import { useState } from 'react';
import { Umbrella, Calculator, CarFront } from 'lucide-react';

// Centralizamos os dados aqui. Se precisar mudar um texto, é aqui.
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
    <section className="py-16 bg-white font-sans">
      <div className="max-w-5xl mx-auto px-4">
        
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Como comparar cotações de seguro</h2>
          <p className="text-slate-600 max-w-2xl mx-auto">Entenda como personalizar o seu seguro e comparar as diversas opções disponíveis.</p>
        </div>

        {/* Abas com novo padrão: Borda e Texto na marca, Fundo cinza */}
        <div className="flex flex-wrap justify-center gap-3 mb-10">
          {TABS_CONFIG.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 rounded-full font-bold text-sm transition-all border ${
                  isActive 
                    ? 'bg-slate-100 text-[var(--brand-primary)] border-[var(--brand-primary)]' 
                    : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                }`}
              >
                <Icon size={18}/> {tab.label}
              </button>
            );
          })}
        </div>

        {/* Conteúdo Dinâmico */}
        <div className="bg-[#F8F9FA] p-8 md:p-10 rounded-3xl border border-slate-100 min-h-[420px]">
          <p className="text-slate-600 font-semibold mb-8 text-center max-w-3xl mx-auto">
            {activeData.desc}
          </p>
          
          <div className={`grid ${activeData.grid} gap-6`}>
            {activeData.items.map((item) => (
              <div key={item.title} className="bg-white p-6 rounded-2xl border border-slate-200 flex flex-col">
                <h4 className="text-lg font-semibold text-[var(--brand-primary)] mb-3">{item.title}</h4>
                <ul className="space-y-1.5">
                  {item.points.map((p, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-slate-600">
                      <span className="text-[var(--brand-primary)] font-bold">•</span>
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