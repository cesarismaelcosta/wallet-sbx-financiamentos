/**
 * @fileoverview Componente: PanelFooter (Shared Renderer para Backoffice)
 * @module features/financial-hub/components/shared/renderes
 * @path src/features/financial-hub/components/shared/renderes/PanelFooter.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS & NEUTRAL PURITY
 * =========================================================================
 * @description Renderizador compartilhado do rodapé legal para modais de auditoria 
 * e preview no Backoffice (Consults, Simulations, Routes).
 * 
 * [ATUALIZAÇÃO DE DESIGN SYSTEM]:
 * 1. Zero-Radius: Remoção total de `rounded-xl`. As bordas agora são retas (`rounded-none`).
 * 2. Neutral Purity: Remoção completa do roxo (`#B300FF`). Adoção estrita de 
 *    `neutral-900` para títulos/links em destaque e `neutral-500` para o texto base,
 *    garantindo total sobriedade na interface de gestão.
 * =========================================================================
 */

import { FileText } from "lucide-react";

export function PanelFooter({ footer }: { footer: any }) {
  if (!footer?.template_text) return null;
  const { template_text, links = [] } = footer;

  const renderText = () => {
    // Quebra a string pela regex de chaves para identificar onde os links devem ir
    const parts = template_text.split(/\{([^}]+)\}/g);
    
    return parts.map((part: string, index: number) => {
      const linkMatch = links.find((l: any) => l.text === part);
      
      if (linkMatch) {
        return (
          <a
            key={index}
            href={linkMatch.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-bold text-neutral-900 hover:text-neutral-600 transition-colors"
          >
            {part}
          </a>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="space-y-2 pt-2 break-inside-avoid">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5">
        <FileText size={14} /> Rodapé Legal (Footer)
      </h4>
      <footer className="py-3 px-3 text-center text-[10px] text-neutral-500 bg-neutral-50 border border-neutral-200 rounded-none">
        <p className="leading-relaxed text-justify sm:text-center text-neutral-500">
          {renderText()}
        </p>
      </footer>
    </div>
  );
}