/**
 * @fileoverview Componente: Footer
 * @path src/components/common/Footer.tsx
 * * ESTRUTURA DO PROJETO:
 * --------------------------------------------------------------------------------
 * src/
 * ├── components/
 * │   └── common/
 * │       └── Footer.tsx        # [AQUI] Rodapé global da aplicação
 * └── ...
 * --------------------------------------------------------------------------------
 * * PROPÓSITO:
 * Componente de rodapé padrão para a aplicação, exibindo textos legais (disclaimers) 
 * e direitos autorais. Tudo é customizável através da injeção de configurações (JSON).
 * Suporta transformação de palavras específicas em links (ex: {Minha Empresa}).
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

interface FooterProps {
  config?: FooterConfig;
}

export function Footer({ config }: FooterProps) {
  // Se não vier configuração (ex: a API falhou ou não carregou), não quebra a tela.
  if (!config?.template_text) return null;

  // Garantimos que links seja pelo menos um array vazio, evitando erros caso o JSON venha sem ele
  const { template_text, links = [] } = config;

  // Motor de renderização: transforma textos entre {chaves} em links clicáveis
  const renderText = () => {
    // Separa o texto normal do texto que está entre chaves
    const parts = template_text.split(/\{([^}]+)\}/g);

    return parts.map((part, index) => {
      // Procura se o trecho atual tem uma URL correspondente no array
      const linkMatch = links.find((l) => l.text === part);

      // Se encontrou no array de links, renderiza a tag <a>
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

      // Se não encontrou, ou se o array de links estiver vazio ([]), renderiza o texto normal
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