/**
 * @fileoverview Skeleton: PanelFAQSkeleton (Casca Estrutural da FAQ)
 * @module features/financial-hub/components/layout
 * @path src/features/financial-hub/components/layout/PanelFAQSkeleton.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS, NEUTRAL PURITY & ANTI-CLS
 * =========================================================================
 * @description Versão esqueleto estrutural autocontida da seção de Dúvidas Frequentes.
 * Simula a geometria bilateral de acordeões e o cabeçalho institucional para
 * mitigar o Cumulative Layout Shift (CLS) durante o carregamento de metadados da oferta.
 * 
 * [MECÂNICA ARQUITETURAL V3 - BLINDAGEM NEUTRA AUTOCONTIDA]:
 * 1. {Bypass de Primitivo Contaminado}: Elimina o uso do componente `<Skeleton />`
 *    global, utilizando blocos neutros puros (`bg-neutral-100`, `bg-neutral-200/80`)
 *    para blindar contra vazamentos de variáveis roxas/lilases herdadas do root.
 * 2. {Zero-Radius Strict Governance}: Aplica cantos retos (`rounded-none`) em todas
 *    as cascas de itens de acordeão e no placeholder do título.
 * 3. {Purgação de Neutros Desalinhados}: Substitui `bg-background` e `border-border`
 *    por classes neutras explícitas (`bg-white`, `border-neutral-200`), mantendo
 *    fidelidade visual sem alterar os estilos globais compartilhados.
 * 4. {Anti-CLS Spatial Fidelity}: Espelha com precisão 1:1 o grid bilateral balanceado,
 *    as alturas de gatilho e as margens do `PanelFAQ.tsx`.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 * @version 9.2.0 (Neutral Purity & Self-Contained Shading)
 */

export function PanelFAQSkeleton() {
  return (
    <section className="py-16 md:py-24 border-t border-neutral-200 bg-white text-neutral-900 relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 animate-pulse">
        {/* Título Esqueleto Centralizado */}
        <div className="h-8 md:h-9 w-64 mx-auto mb-12 md:mb-16 bg-neutral-200/80 rounded-none" />
        
        {/* Grid Bilateral Balanceado */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-8 gap-y-4 items-start">
          
          {/* Coluna 1 Skeleton */}
          <div className="w-full space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 w-full bg-neutral-100 border border-neutral-200 rounded-none" />
            ))}
          </div>

          {/* Coluna 2 Skeleton */}
          <div className="w-full space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 w-full bg-neutral-100 border border-neutral-200 rounded-none" />
            ))}
          </div>
          
        </div>
      </div>
    </section>
  );
}