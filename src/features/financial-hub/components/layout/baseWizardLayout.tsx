/**
 * @fileoverview Componente: BaseWizardLayout (Casca Estrutural do Wizard de Simulação)
 * @module features/financial-hub/components/shared
 * @path src/features/financial-hub/components/shared/BaseWizardLayout.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-TRUST, ANTI-LAYOUT-SHIFT & NEUTRAL PURITY
 * =========================================================================
 * @description Layout base e contêiner estrutural para jornadas e funis de simulação.
 * Implementa proteção contra renderização prematura (Race Conditions) e Cumulative
 * Layout Shift (CLS), garantindo que o WizardEngine opere sob geometria estável e neutra.
 * 
 * [MECÂNICA ARQUITETURAL V3 - BLINDAGEM NEUTRA AUTOCONTIDA & SBX DESIGN SYSTEM]:
 * 1. {Bypass de Tokens Globais Contaminados}: Substitui `bg-background`, `border-border`
 *    e `text-foreground` por classes neutras explícitas (`bg-white`, `border-neutral-200`,
 *    `text-neutral-900`, `text-neutral-500`), eliminando qualquer vazamento arroxeado do CSS raiz.
 * 2. {Zero-Radius Strict Governance}: Estrutura perfeitamente alinhada à diretriz de
 *    cantos retos institucionais (`rounded-none`), sem arredondamentos estruturais.
 * 3. {Geometria Anti-CLS Persistente}: Preserva o grid proporcional especificado
 *    dinamicamente no manifesto da oferta (`desktopGrid`), com painel lateral (`aside`)
 *    aderente (`sticky top-8`) para manter a proposta de valor visível durante a jornada.
 * 4. {Loading Gate Resiliente}: Bloqueia a montagem do formulário interativo até a
 *    resolução integral de `page_configs` e `manifest`, prevenindo quebras de ciclo de vida.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 * @version 9.2.0 (Neutral Purity & Anti-CLS Wizard Scaffolding)
 */

import React from "react";
import { cn } from "@/lib/utils";
import { PanelProductOffer } from "@/features/financial-hub/components/layout/PanelProductOffer";
import { WizardEngine } from "@/features/financial-hub/components/shared/WizardEngine";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { Loader2 } from "lucide-react";

// =========================================================================
// [CONTRATOS E INTERFACES TIPADAS]
// =========================================================================
interface BaseWizardLayoutProps {
  manifest: any; 
  className?: string;
}

// =========================================================================
// [COMPONENTE PRINCIPAL: BASE WIZARD LAYOUT]
// =========================================================================
export function BaseWizardLayout({ manifest, className }: BaseWizardLayoutProps) {
  const { state } = useWizard();
  
  // =========================================================================
  // 1. BARREIRA DE ESTADO (Loading Gate)
  // =========================================================================
  const pageConfigs = state?.data?.page_configs;
  const isReady = !!pageConfigs && !!manifest;

  if (!isReady) {
    return (
      <div className="flex h-72 w-full flex-col items-center justify-center gap-3 bg-white text-neutral-500 animate-in fade-in duration-300 rounded-none">
        <Loader2 className="w-5 h-5 animate-spin text-neutral-900" />
        <span className="text-xs font-medium tracking-wide uppercase font-mono text-neutral-600">
          Carregando informações da simulação...
        </span>
      </div>
    );
  }
  
  // =========================================================================
  // 2. CONFIGURAÇÃO DE GRID (Geometria Estável do Manifesto)
  // =========================================================================
  // Layout persistente para evitar Cumulative Layout Shift. 
  // O manifesto fornece a classe de desktop; mobile é sempre coluna única.
  const desktopGrid = manifest?.meta?.layout?.gridTemplate || "lg:grid-cols-[1fr_1fr]";

  return (
    <div 
      id="simular" 
      className={cn(
        "grid h-auto scroll-mt-20 pt-12 bg-white text-neutral-900 rounded-none", 
        "grid-cols-1",         // Padrão mobile: empilhamento
        desktopGrid,           // Desktop: proporção vinda do Manifesto (ex: lg:grid-cols-[1fr_1.2fr])
        className
      )}
    >
      {/* Coluna lateral: Painel de ofertas (Pitch Comercial)
          'sticky' mantém o argumento de valor visível durante o preenchimento.
      */}
      <aside className="sticky top-8 p-8 lg:p-10 border-b lg:border-b-0 lg:border-r border-neutral-200 bg-white min-h-[50vh] rounded-none">
        <PanelProductOffer config={pageConfigs} />
      </aside>

      {/* Área principal: Motor de passos
          Recebe o manifesto blindado pelo 'isReady'.
      */}
      <main className="p-8 lg:p-10 flex flex-col bg-white rounded-none">
        <div className="flex-1">
          <WizardEngine manifest={manifest} />
        </div>
      </main>
    </div>
  );
}