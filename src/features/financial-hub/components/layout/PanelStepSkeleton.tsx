/**
 * @fileoverview Skeleton: PanelStepSkeleton (Casca Estrutural do Formulário de Simulação)
 * @path src/features/financial-hub/components/layout/PanelStepSkeleton.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS, NEUTRAL PURITY & ANTI-CLS
 * =========================================================================
 * Casca esqueleto pré-renderizada do formulário de simulação (Step 1).
 * Implementa renderização puramente neutra e autocontida para mitigar
 * vazamentos de cor (lilás/lavanda) decorrentes de tokens globais herdados.
 * 
 * [MECÂNICA ARQUITETURAL V3 - BLINDAGEM NEUTRA AUTOCONTIDA]:
 * 1. {Bypass de Primitivo Contaminado}: Substitui o componente `<Skeleton />`
 *    global por marcação neutra explícita (`bg-neutral-200/80`, `bg-neutral-100`),
 *    assegurando cinza neutro real independente de tokens herdados no root.
 * 2. {Zero-Radius Strict Governance}: Aplica geometria de cantos retos
 *    rigorosa (`rounded-none`), eliminando qualquer curvatura residual.
 * 3. {Anti-CLS Spatial Fidelity}: Espelha com fidelidade 1:1 o grid de inputs,
 *    o slider de prazos e o painel seletor de parcelas do Step 1 real.
 * 4. {Hairline Neutral Borders}: Bordas estruturais calibradas com `border-neutral-200`
 *    sobre superfície branca pura (`bg-white`).
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 */

export function PanelStepSkeleton() {
  return (
    <div className="bg-white border border-neutral-200 rounded-none p-6 sm:p-8 space-y-8 animate-pulse shadow-xs">
      {/* Área do Título e Subtítulo */}
      <div className="space-y-3">
        <div className="h-7 sm:h-8 w-3/4 bg-neutral-200/80 rounded-none" />
        <div className="h-4 w-1/2 bg-neutral-100 rounded-none" />
      </div>

      {/* Inputs Simulados */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <div className="h-3.5 w-20 bg-neutral-200/80 rounded-none" />
          <div className="h-12 w-full bg-neutral-100 border border-neutral-200 rounded-none" />
        </div>
        <div className="space-y-2">
          <div className="h-3.5 w-20 bg-neutral-200/80 rounded-none" />
          <div className="h-12 w-full bg-neutral-100 border border-neutral-200 rounded-none" />
        </div>
      </div>

      {/* Slider Simulado */}
      <div className="space-y-3 pt-2">
        <div className="h-2 w-full bg-neutral-100 rounded-none" />
      </div>

      {/* Grid de Parcelas Simulado */}
      <div className="grid grid-cols-5 gap-2 pt-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-10 w-full bg-neutral-100 border border-neutral-200 rounded-none" />
        ))}
      </div>

      {/* Botão de Ação CTA */}
      <div className="pt-2">
        <div className="h-12 sm:h-14 w-full bg-neutral-200/80 rounded-none" />
      </div>
    </div>
  );
}