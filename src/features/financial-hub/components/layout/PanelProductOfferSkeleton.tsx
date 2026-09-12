/**
 * @fileoverview Skeleton: PanelProductOfferSkeleton (Casca Estrutural da Proposta de Valor)
 * @path src/features/financial-hub/components/layout/PanelProductOfferSkeleton.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS, NEUTRAL PURITY & ANTI-CLS
 * =========================================================================
 * Versão esqueleto pré-renderizada do Painel Lateral de Ofertas e Proposta de Valor.
 * Implementa renderização autocontida em escala de cinzas neutras estritas,
 * prevenindo coloração residual lilás/lavanda vinda de primitivos globais.
 * 
 * [MECÂNICA ARQUITETURAL V3 - BLINDAGEM NEUTRA AUTOCONTIDA]:
 * 1. {Bypass de Primitivo Contaminado}: Substitui o primitivo global `<Skeleton />`
 *    por marcação com classes neutras diretas (`bg-neutral-200/80`, `bg-neutral-100`),
 *    assegurando cinza neutro real imune aos tokens herdados do CSS raiz.
 * 2. {Zero-Radius Strict Governance}: Aplica cantos retos (`rounded-none`) em
 *    todos os blocos de carregamento, caixas de ícones e contêiner do parceiro.
 * 3. {Anti-CLS 1:1 Spatial Mirroring}: Preserva exatamente as alturas, larguras
 *    e paddings definidos no `PanelProductOffer.tsx` oficial.
 * 4. {Hairline Neutral Borders}: Bordas estruturais calibradas em `border-neutral-200`
 *    com superfície sutil de contraste (`bg-neutral-50`).
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 */

export function PanelProductOfferSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      
      {/* =========================================================================
       * 1. SKELETON: HEADLINE & DESCRIÇÃO
       * ========================================================================= */}
      <div className="space-y-4">
        {/* Simula o título (h1) */}
        <div className="h-10 w-3/4 bg-neutral-200/80 rounded-none" />
        
        {/* Simula o parágrafo explicativo (p) */}
        <div className="space-y-2 mt-3">
          <div className="h-4 w-full bg-neutral-100 rounded-none" />
          <div className="h-4 w-5/6 bg-neutral-100 rounded-none" />
        </div>
      </div>

      {/* =========================================================================
       * 2. SKELETON: BENEFÍCIOS (Ícone + Textos)
       * ========================================================================= */}
      <ul className="flex flex-col gap-4 pt-2">
        {[1, 2, 3].map((i) => (
          <li key={i} className="flex items-start gap-3">
            {/* Box do Ícone */}
            <div className="h-8 w-8 shrink-0 bg-neutral-100 border border-neutral-200 rounded-none" />
            
            {/* Textos (Title + Subtitle) */}
            <div className="space-y-1.5 flex-1 pt-0.5">
              <div className="h-3.5 w-1/3 bg-neutral-200/80 rounded-none" />
              <div className="h-3 w-full bg-neutral-100 rounded-none" />
            </div>
          </li>
        ))}
      </ul>

      {/* =========================================================================
       * 3. SKELETON: RODAPÉ DO PARCEIRO
       * ========================================================================= */}
      <div className="mt-8 rounded-none border border-neutral-200 bg-neutral-50 p-3 sm:p-4 space-y-2 shadow-xs">
        <div className="h-3 w-1/4 bg-neutral-200/80 rounded-none" />
        <div className="h-4 w-1/2 bg-neutral-100 rounded-none" />
      </div>
      
    </div>
  );
}