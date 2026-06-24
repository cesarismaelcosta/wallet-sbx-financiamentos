/**
 * @fileoverview Componente: WizardLayout (Cartão)
 * @path src/components/cartao/WizardLayout.tsx
 * * * * ÁRVORE DE DEPENDÊNCIAS:
 * --------------------------------------------------------------------------------
 * src/components/cartao/
 * ├── FinancialHubDataInjector.tsx          # [INJECTOR] Hidratação de estado
 * ├── OfferPanel.tsx                  # [UI] Painel de Ofertas
 * └── cartao.manifest.ts              # [MAPA] Registro dos Steps
 * * * * INTEGRAÇÃO:
 * - Engine: WizardEngine (renderiza os passos dinamicamente).
 * - Injector: FinancialHubDataInjector (garante que os dados cheguem ao provider).
 * --------------------------------------------------------------------------------
 * * * * RESPONSABILIDADE:
 * 1. Grid Manager: Divide a tela com proporção estável (43% / 57%).
 * 2. Orquestração: Envolve a jornada no injetor de dados necessário.
 * 3. Integração: Une os componentes `OfferPanel` e `WizardEngine`.
 */

// src/components/cartao/WizardLayout.tsx

import { OfferPanel } from "./OfferPanel";
import { WizardEngine } from "@/features/financial-hub/components/shared/WizardEngine";
import { CardManifest } from "./card.manifest"; 

export function WizardLayout() {
  return (
    <div 
      id="simular" 
      className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] h-auto scroll-mt-20"
    >
      <aside className="p-8 lg:p-10 border-b lg:border-b-0 border-r border-slate-200 h-full">
        <OfferPanel />
      </aside>

      <section className="p-8 lg:p-10 flex flex-col">
        <div className="flex-1">
           <WizardEngine manifest={CardManifest} />
        </div>
      </section>
    </div>
  );
}