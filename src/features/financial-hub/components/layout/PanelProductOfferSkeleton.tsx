/**
 * @fileoverview Skeleton: PanelProductOfferSkeleton
 * @path src/features/financial-hub/components/layout/PanelProductOfferSkeleton.tsx
 * 
 * =========================================================================
 * [PROPÓSITO DO COMPONENTE]
 * =========================================================================
 * @description Versão "fantasma" (Skeleton) do Painel de Ofertas.
 * Exibido durante o processo de hidratação e fetch da API para evitar
 * Layout Shift (CLS) e proporcionar uma percepção de carregamento mais rápida.
 * Mantém a exata geometria espacial do componente `PanelProductOffer`.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

export function PanelProductOfferSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      
      {/* =========================================================================
        * 1. SKELETON: HEADLINE & DESCRIÇÃO
        * ========================================================================= */}
      <div className="space-y-4">
        {/* Simula o título (h1) */}
        <div className="h-10 w-3/4 bg-slate-200/70 rounded-lg"></div>
        {/* Simula o parágrafo (p) */}
        <div className="space-y-2 mt-4">
          <div className="h-4 w-full bg-slate-200/70 rounded"></div>
          <div className="h-4 w-5/6 bg-slate-200/70 rounded"></div>
        </div>
      </div>

      {/* =========================================================================
        * 2. SKELETON: BENEFÍCIOS (Ícone + Textos)
        * ========================================================================= */}
      <ul className="flex flex-col gap-4">
        {[1, 2, 3].map((i) => (
          <li key={i} className="flex items-start gap-3">
            {/* Box do Ícone */}
            <div className="h-8 w-8 shrink-0 rounded-lg bg-slate-200/70"></div>
            {/* Textos (Title + Subtitle) */}
            <div className="space-y-2 flex-1 pt-1">
              <div className="h-3 w-1/3 bg-slate-200/70 rounded"></div>
              <div className="h-3 w-full bg-slate-200/70 rounded"></div>
            </div>
          </li>
        ))}
      </ul>

      {/* =========================================================================
        * 3. SKELETON: RODAPÉ DO PARCEIRO
        * ========================================================================= */}
      <div className="mt-8 h-16 w-full rounded-xl bg-slate-100/60 border border-slate-100"></div>
      
    </div>
  );
}