/**
 * @fileoverview Componente: PanelFooter
 * @path src/features/financial-hub/components/layout/PanelFooter.tsx
 * 
 * =========================================================================
 * [DOCUMENTAÇÃO DO COMPONENTE]
 * =========================================================================
 * @description Rodapé global da aplicação customizável através de injeção de 
 * configurações (JSON). Suporta a transformação dinâmica de termos entre chaves 
 * em links externos protegidos.
 * 
 * @responsibilities
 * 1. Renderização Segura: Valida a existência do texto base antes da renderização.
 * 2. Motor de Parsing Textual: Converte marcações `{Empresa}` em hiperlinks funcionais.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import React from "react";

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

export function PanelFooter({ config }: PanelFooterProps) {
  // Fail-fast se não houver configuração
  if (!config?.template_text) return null;

  const { template_text, links = [] } = config;

  /**
   * @function renderText
   * @description Processa o texto com regex para identificar chaves e injetar links de forma segura.
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
            className="underline font-medium text-slate-500 hover:text-slate-800 transition-colors focus:outline-none focus-visible:text-slate-900 focus-visible:ring-1 focus-visible:ring-slate-300 rounded-sm"
          >
            {part}
          </a>
        );
      }

      return <React.Fragment key={index}>{part}</React.Fragment>;
    });
  };

  return (
    <footer className="py-10 px-6 text-center text-xs text-muted-foreground bg-slate-50 border-t">
      <div className="max-w-5xl mx-auto">
        <p className="leading-relaxed text-[10px] sm:text-[11px] text-justify sm:text-center text-slate-400">
          {renderText()}
        </p>
      </div>
    </footer>
  );
}