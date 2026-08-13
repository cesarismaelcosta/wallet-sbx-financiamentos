/**
 * @fileoverview Skeleton: PanelFooterSkeleton
 * @path src/features/financial-hub/components/layout/PanelFooterSkeleton.tsx
 * 
 * =========================================================================
 * [PROPÓSITO]
 * =========================================================================
 * @description Versão esqueleto do rodapé para evitar saltos visuais na base 
 * da página enquanto os dados de configuração são recuperados.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

export function PanelFooterSkeleton() {
  return (
    <footer className="py-10 px-6 bg-slate-50 border-t animate-pulse">
      <div className="max-w-5xl mx-auto space-y-2">
        <div className="h-3 w-full bg-slate-200/70 rounded"></div>
        <div className="h-3 w-3/4 bg-slate-200/70 rounded mx-auto"></div>
      </div>
    </footer>
  );
}