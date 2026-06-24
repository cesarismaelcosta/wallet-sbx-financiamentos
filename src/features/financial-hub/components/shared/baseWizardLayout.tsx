/**
 * @fileoverview Componente: BaseWizardLayout
 * @path src/features/financial-hub/components/shared/BaseWizardLayout.tsx
 * * @description 
 * Layout base para jornadas de simulação. Implementa proteção contra 
 * renderização precoce (Race Conditions) para garantir que WizardEngine 
 * nunca receba manifest nulo ou indefinido.
 * * @responsibilities
 * - Gerencia a barreira de carregamento (Loading Gate) para dados assíncronos.
 * - Define a estrutura de grid estável com proporção configurável via Manifesto.
 * - Injeta dependências visuais (OfferPanel) e lógica de navegação (WizardEngine).
 */

import { cn } from "@/lib/utils";
import { OfferPanel } from "./OfferPanel";
import { WizardEngine } from "./WizardEngine";
import { useWizard } from "./WizardProvider";

interface BaseWizardLayoutProps {
  manifest: any; 
  className?: string;
}

export function BaseWizardLayout({ manifest, className }: BaseWizardLayoutProps) {
  const { state } = useWizard();
  
  // 1. BARREIRA DE ESTADO (Loading Gate)
  const pageConfigs = state?.data?.page_configs;
  const isReady = !!pageConfigs && !!manifest;

  if (!isReady) {
    return (
      <div className="flex h-64 w-full items-center justify-center text-muted-foreground">
        Carregando informações...
      </div>
    );
  }
  
  // 2. CONFIGURAÇÃO DE GRID:
  // Layout persistente para evitar Layout Shift. 
  // O manifesto fornece a classe de desktop; mobile é sempre coluna única.
  const desktopGrid = manifest?.meta?.layout?.gridTemplate || "lg:grid-cols-[1fr_1fr]";

  return (
    <div 
      id="simular" 
      className={cn(
        "grid h-auto scroll-mt-20 pt-12", 
        "grid-cols-1",         // Padrão mobile: empilhamento
        desktopGrid,           // Desktop: proporção vinda do Manifesto (ex: lg:grid-cols-[1fr_1.2fr])
        className
      )}
    >
      {/* Coluna lateral: Painel de ofertas (Pitch de Venda)
        'sticky' mantém o argumento de venda visível durante o preenchimento.
      */}
      <aside className="sticky top-8 p-8 lg:p-10 border-b lg:border-b-0 border-r border-slate-100 bg-white min-h-[50vh]">
        <OfferPanel config={pageConfigs} />
      </aside>

      {/* Área principal: Motor de passos
        Recebe o manifesto blindado pelo 'isReady'.
      */}
      <main className="p-8 lg:p-10 flex flex-col">
        <div className="flex-1">
          <WizardEngine manifest={manifest} />
        </div>
      </main>
    </div>
  );
}