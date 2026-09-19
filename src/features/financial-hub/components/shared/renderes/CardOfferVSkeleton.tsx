/**
 * @fileoverview Componente de esqueleto: CardOfferVSkeleton
 * @path src/features/financial-hub/components/shared/renderers/CardOfferVSkeleton.tsx
 * @description Replica exatamente a estrutura visual do CardOfferV em modo "fantasma" (pulse)
 * para eliminar saltos visuais durante o carregamento de prateleiras.
 *
 * ============================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: ZERO-RADIUS & NEUTRAL PURITY
 * ============================================================================
 * 1. {Design System Alignment}: a paleta fantasma usa os tokens do design
 *    system (`border`, `card`, `muted`, `muted-foreground`) em vez de tons
 *    fixos do Tailwind (`neutral-100/200/300`, `white`) -- assim ela também
 *    troca de tema junto com o CardOfferV real no modo escuro, sem o flash
 *    de um esqueleto claro sumindo pra dar lugar a um card escuro.
 * 2. {Zero-Radius Strict Governance}: Aplicação estrita de cantos retos (`rounded-none`)
 *    em substituição a todas as instâncias de `rounded-lg`, `rounded-md` e `rounded-full`,
 *    alinhando o esqueleto perfeitamente ao novo design system da SBX.
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

export function CardOfferVSkeleton() {
  return (
    <div className="rounded-none border border-border bg-card overflow-hidden shadow-xs flex flex-col justify-between animate-pulse">
      <div className="flex flex-col h-full">

        {/* ÁREA DE MÍDIA FANTASMA */}
        <div className="relative h-44 w-full bg-muted overflow-hidden shrink-0 rounded-none">
          <div className="absolute bottom-2 left-2 bg-muted-foreground/25 h-5 w-20 rounded-none"></div>
        </div>

        {/* Linha divisória */}
        <div className="h-px w-full bg-border" />

        {/* METADADOS FANTASMAS */}
        <div className="p-4 flex flex-col flex-grow justify-between space-y-3">
          <div className="space-y-3">

            {/* TAG DE MODALIDADE + LINK FANTASMA */}
            <div className="flex items-center justify-between w-full">
              <div className="h-5 w-28 bg-muted rounded-none border border-border"></div>
              <div className="h-5 w-5 bg-muted-foreground/15 rounded-none"></div>
            </div>

            {/* TÍTULO FANTASMA (2 LINHAS) */}
            <div className="space-y-1.5 min-h-[2.5rem]">
              <div className="h-4 w-full bg-muted-foreground/15 rounded-none"></div>
              <div className="h-4 w-3/4 bg-muted-foreground/15 rounded-none"></div>
            </div>

            {/* LOCALIZAÇÃO E LOJISTA */}
            <div className="space-y-1 pt-1">
              <div className="h-3 w-32 bg-muted rounded-none"></div>
              <div className="h-3 w-24 bg-muted rounded-none"></div>
            </div>
          </div>

          {/* ÁREA DE PREÇO FANTASMA */}
          <div className="pt-2 border-t border-border mt-auto space-y-1">
            <div className="h-3 w-24 bg-muted rounded-none"></div>
            <div className="h-6 w-36 bg-muted-foreground/15 rounded-none"></div>
          </div>
        </div>
      </div>

      {/* BOTÃO DE CTA FANTASMA */}
      <div className="p-4 pt-0">
        <div className="h-9 w-full bg-card border border-border rounded-none"></div>
      </div>
    </div>
  );
}
