/**
 * @fileoverview Skeleton: PanelFAQSkeleton
 * @path src/features/financial-hub/components/layout/PanelFAQSkeleton.tsx
 * 
 * =========================================================================
 * [PROPÓSITO]
 * =========================================================================
 * @description Versão esqueleto do painel de FAQ para prevenir Layout Shift.
 * Simula a grade de duas colunas e o formato de acordeão fechado.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

export function PanelFAQSkeleton() {
  return (
    <section className="py-20 bg-white">
      <div className="mx-auto max-w-7xl px-2 sm:px-6 animate-pulse">
        {/* Título Skeleton */}
        <div className="h-10 w-64 bg-slate-200/70 rounded-lg mx-auto mb-16"></div>
        
        {/* Grid Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4">
          
          {/* Coluna 1 Skeleton */}
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 w-full bg-slate-100/60 rounded-xl border border-slate-100"></div>
            ))}
          </div>

          {/* Coluna 2 Skeleton */}
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-14 w-full bg-slate-100/60 rounded-xl border border-slate-100"></div>
            ))}
          </div>
          
        </div>
      </div>
    </section>
  );
}