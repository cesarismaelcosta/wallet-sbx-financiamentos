/**
 * @fileoverview Componente: PanelStepSkeleton
 * @path src/features/financial-hub/components/layout/PanelStepSkeleton.tsx
 * 
 * @description Skeleton de carregamento estrutural para o formulário de simulação (Step 1).
 * Replicar o design do formulário real para evitar deslocamento de layout (layout shift).
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

export function PanelStepSkeleton() {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-6 sm:p-8 animate-pulse space-y-8">
      {/* Área do Título */}
      <div className="space-y-3">
        <div className="h-8 w-3/4 bg-slate-100 rounded-lg"></div>
        <div className="h-4 w-1/2 bg-slate-100 rounded-md"></div>
      </div>

      {/* Inputs Simulados */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="h-4 w-20 bg-slate-100 rounded"></div>
          <div className="h-12 w-full bg-slate-50 rounded-xl border border-slate-100"></div>
        </div>
        <div className="space-y-2">
          <div className="h-4 w-20 bg-slate-100 rounded"></div>
          <div className="h-12 w-full bg-slate-50 rounded-xl border border-slate-100"></div>
        </div>
      </div>

      {/* Slider Simulado */}
      <div className="space-y-3">
        <div className="h-2 w-full bg-slate-100 rounded-full"></div>
      </div>

      {/* Grid de parcelas */}
      <div className="grid grid-cols-5 gap-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 w-full bg-slate-50 rounded-lg border border-slate-100"></div>
        ))}
      </div>

      {/* Botão de Ação */}
      <div className="h-14 w-full bg-slate-100 rounded-xl"></div>
    </div>
  );
}