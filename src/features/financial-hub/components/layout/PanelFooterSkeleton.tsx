/**
 * @fileoverview Skeleton: PanelFooterSkeleton (Casca Estrutural do Rodapé Regulatório)
 * @module features/financial-hub/components/layout
 * @path src/features/financial-hub/components/layout/PanelFooterSkeleton.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS, NEUTRAL PURITY & ANTI-CLS
 * =========================================================================
 * @description Versão esqueleto estrutural autocontida do rodapé regulatório global.
 * Mitiga o Cumulative Layout Shift (CLS) na base da página durante o carregamento
 * assíncrono das configurações institucionais e diretrizes legais de compliance (BFF).
 * 
 * [MECÂNICA ARQUITETURAL V3 - BLINDAGEM NEUTRA AUTOCONTIDA]:
 * 1. {Bypass de Primitivo Contaminado}: Substitui a dependência do componente
 *    `<Skeleton />` do Shadcn por divs neutras explícitas (`bg-neutral-100`),
 *    anulando qualquer vazamento do matiz lilás/lavanda vindo de tokens globais.
 * 2. {Zero-Radius Strict Governance}: Aplica cantos retos estritos (`rounded-none`),
 *    em total conformidade com a geometria institucional do SBX Design System.
 * 3. {Purgação de Variáveis Legadas}: Ancoragem em superfícies limpas (`bg-white`)
 *    e bordas hairline neutras (`border-neutral-200`), independente do CSS raiz.
 * 4. {Anti-CLS Spatial Fidelity}: Espelha com fidelidade dimensional 1:1 as áreas
 *    de respiro, largura máxima e empilhamento de texto do `PanelFooter.tsx`.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 * @version 9.2.0 (Neutral Purity & Self-Contained Shading)
 */

export function PanelFooterSkeleton() {
  return (
    <footer className="py-10 px-6 bg-white border-t border-neutral-200">
      <div className="max-w-5xl mx-auto space-y-2 animate-pulse">
        <div className="h-3 w-full bg-neutral-100 rounded-none" />
        <div className="h-3 w-3/4 mx-auto bg-neutral-100 rounded-none" />
      </div>
    </footer>
  );
}