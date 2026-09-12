/**
 * @fileoverview Componente: PanelFooter (Rodapé Institucional Regulatório)
 * @module features/financial-hub/components/layout
 * @path src/features/financial-hub/components/layout/PanelFooter.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: REGULATORY PARSING & NEUTRAL PURITY
 * =========================================================================
 * @description Rodapé global regulatório e institucional parametrizado via JSON/BFF.
 * Suporta parsing dinâmico de chaves e injeção de links de compliance,
 * termos de uso e políticas de privacidade sob arquitetura autocontida.
 * 
 * [MECÂNICA ARQUITETURAL V3 - BLINDAGEM NEUTRA AUTOCONTIDA & SBX DESIGN SYSTEM]:
 * 1. {Bypass de Tokens Globais Contaminados}: Substitui `bg-background`, `border-border`
 *    e `text-muted-foreground` por classes neutras explícitas (`bg-white`, `border-neutral-200`,
 *    `text-neutral-500`), expurgando qualquer vazamento arroxeado do CSS raiz.
 * 2. {Zero-Radius Strict Governance}: Elimina cantos curvos (`rounded-sm`), consolidando
 *    cantos retos institucionais (`rounded-none`) nos focos e links regulatórios.
 * 3. {Dynamic Token Interpolation}: Motor de parsing regex para conversão segura de marcações
 *    `{Empresa}` em hiperlinks externos com atributos de segurança (`rel="noopener noreferrer"`).
 * 4. {Tipografia Tabular & Legal}: Escala tipográfica compacta (`text-[10px] sm:text-[11px]`)
 *    com entrelinhamento otimizado para legibilidade de notas regulatórias do BACEN/CVM.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 * @version 9.2.0 (Neutral Purity & Self-Contained Regulatory Layout)
 */

import React from "react";

// =========================================================================
// [CONTRATOS E INTERFACES TIPADAS]
// =========================================================================
export interface FooterLink {
  text: string;
  url: string;
}

export interface FooterConfig {
  template_text?: string;
  links?: FooterLink[];
}

interface PanelFooterProps {
  config?: FooterConfig;
}

// =========================================================================
// [COMPONENTE PRINCIPAL: PANEL FOOTER]
// =========================================================================
export function PanelFooter({ config }: PanelFooterProps) {
  // Fail-fast se não houver texto base injetado
  if (!config?.template_text) return null;

  const { template_text, links = [] } = config;

  /**
   * Processa o texto com regex para identificar {tags} e injetar links de forma segura.
   */
  const renderText = () => {
    const parts = template_text.split(/\{([^}]+)\}/g);

    return parts.map((part, index) => {
      const linkMatch = links.find((l) => l.text === part);

      if (linkMatch) {
        return (
          <a
            key={index}
            href={linkMatch.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 font-medium text-neutral-800 hover:text-neutral-950 transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-neutral-400 rounded-none inline-block mx-0.5"
          >
            {part}
          </a>
        );
      }

      return <React.Fragment key={index}>{part}</React.Fragment>;
    });
  };

  return (
    <footer className="py-10 px-6 text-center text-xs bg-white text-neutral-500 border-t border-neutral-200">
      <div className="max-w-5xl mx-auto">
        <p className="leading-relaxed text-[10px] sm:text-[11px] text-justify sm:text-center text-neutral-500">
          {renderText()}
        </p>
      </div>
    </footer>
  );
}