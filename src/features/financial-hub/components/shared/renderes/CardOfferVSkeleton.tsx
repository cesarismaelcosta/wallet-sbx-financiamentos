/**
 * @fileoverview Componente de esqueleto: CardOfferVSkeleton
 * @path src/features/financial-hub/components/shared/renderers/CardOfferVSkeleton.tsx
 * @description Replica exatamente a estrutura visual do CardOfferV em modo "fantasma" (pulse) 
 * para eliminar saltos visuais durante o carregamento de prateleiras.
 */

export function CardOfferVSkeleton() {
  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs flex flex-col justify-between animate-pulse">
      <div className="flex flex-col h-full">
        
        {/* ÁREA DE MÍDIA FANTASMA */}
        <div className="relative h-44 w-full bg-slate-200 overflow-hidden shrink-0 rounded-t-lg">
          <div className="absolute bottom-2 left-2 bg-slate-300 h-5 w-20 rounded-md"></div>
        </div>

        {/* Linha divisória */}
        <div className="h-px w-full bg-slate-100" />

        {/* METADADOS FANTASMAS */}
        <div className="p-4 flex flex-col flex-grow justify-between space-y-3">
          <div className="space-y-3">
            
            {/* TAG DE MODALIDADE + LINK FANTASMA */}
            <div className="flex items-center justify-between w-full">
              <div className="h-5 w-28 bg-rose-100 rounded-full"></div>
              <div className="h-5 w-5 bg-slate-200 rounded"></div>
            </div>

            {/* TÍTULO FANTASMA (2 LINHAS) */}
            <div className="space-y-1.5 min-h-[2.5rem]">
              <div className="h-4 w-full bg-slate-200 rounded"></div>
              <div className="h-4 w-3/4 bg-slate-200 rounded"></div>
            </div>
            
            {/* LOCALIZAÇÃO E LOJISTA */}
            <div className="space-y-1 pt-1">
              <div className="h-3 w-32 bg-slate-100 rounded"></div>
              <div className="h-3 w-24 bg-slate-100 rounded"></div>
            </div>
          </div>

          {/* ÁREA DE PREÇO FANTASMA */}
          <div className="pt-2 border-t border-slate-100 mt-auto space-y-1">
            <div className="h-3 w-24 bg-slate-100 rounded"></div>
            <div className="h-6 w-36 bg-slate-200 rounded"></div>
          </div>
        </div>
      </div>

      {/* BOTÃO DE CTA FANTASMA */}
      <div className="p-4 pt-0">
        <div className="h-9 w-full bg-slate-100 border border-slate-200 rounded-md"></div>
      </div>
    </div>
  );
}