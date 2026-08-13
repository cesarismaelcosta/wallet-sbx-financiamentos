/**
 * @fileoverview Componente: PanelProductOffer
 * @path src/features/financial-hub/components/layout/PanelProductOffer.tsx
 * 
 * =========================================================================
 * [DOCUMENTAÇÃO DO COMPONENTE & REGRAS DE NEGÓCIO]
 * =========================================================================
 * @description Painel lateral principal de proposta de valor da jornada.
 * Renderiza dinamicamente a promessa comercial (headline), os benefícios 
 * atrelados (com ícones) e o selo do parceiro (footer).
 * 
 * @responsibilities
 * 1. Consumo Seguro: Exibe um Skeleton elegante se os dados ainda estiverem hidratando.
 * 2. Renderização Dinâmica: Interpreta o JSON do Orquestrador para estilizar 
 *    trechos específicos do texto (ex: `highlight`, `bold`).
 * 3. Identidade Visual: Consome a cor primária (brand) do tema injetado.
 */

import { ICON_MAP } from "../shared/icons-map";

export function PanelProductOffer({ config }: { config: any }) {
  // =========================================================================
  // [ESTADO DE CARREGAMENTO / SKELETON]: Renderiza esqueleto se o dado não chegou
  // =========================================================================
  if (!config?.offer_panel?.headline?.parts || !config?.offer_panel?.description?.parts) {
    return (
      <div className="space-y-6 animate-pulse">
        {/* Simulação do Título e Descrição */}
        <div className="space-y-4">
          <div className="h-10 bg-slate-100 rounded-xl w-3/4"></div>
          <div className="h-6 bg-slate-100 rounded-lg w-full"></div>
          <div className="h-6 bg-slate-100 rounded-lg w-5/6"></div>
        </div>

        {/* Simulação da Lista de Benefícios */}
        <div className="space-y-4 pt-4">
          {[1, 2, 3].map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-slate-100 shrink-0"></div>
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-slate-100 rounded w-1/2"></div>
                <div className="h-3 bg-slate-100 rounded w-5/6"></div>
              </div>
            </div>
          ))}
        </div>

        {/* Simulação do Rodapé do Parceiro */}
        <div className="mt-8 rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-2">
          <div className="h-3 bg-slate-100 rounded w-1/4"></div>
          <div className="h-4 bg-slate-100 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  // Desestruturação segura e extração do tema dinâmico
  const { offer_panel, theme } = config;
  const brandColor = theme?.primary_color || "var(--brand-primary)";

  const getTextStyle = (type: string) => {
    switch (type) {
      case "highlight": return "text-[var(--brand-primary)]";
      case "bold": return "font-bold text-foreground";
      default: return "text-foreground";
    }
  };

  return (
    <div className="space-y-6" style={{ '--brand-primary': brandColor } as React.CSSProperties}>
      
      {/* 1. HEADLINE E DESCRIÇÃO */}
      <div className="space-y-4">
        <h1 className="text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
          {offer_panel.headline.parts.map((part: any, i: number) => (
            <span key={i} className={getTextStyle(part.type)}>{part.text}</span>
          ))}
        </h1>
        <p className="mt-4 text-base text-muted-foreground">
          {offer_panel.description.parts.map((part: any, i: number) => (
            <span key={i} className={getTextStyle(part.type)}>{part.text}</span>
          ))}
        </p>
      </div>

      {/* 2. LISTA DE BENEFÍCIOS */}
      {offer_panel.benefits && Array.isArray(offer_panel.benefits) && (
        <ul className="flex flex-col gap-4">
          {offer_panel.benefits.map((b: any, i: number) => {
            const Icon = ICON_MAP[b.icon];
            return (
              <li key={i} className="flex items-start gap-3">
                <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                  {Icon && <Icon className="h-4 w-4" />}
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{b.title}</p>
                  <p className="text-xs text-muted-foreground">{b.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* 3. RODAPÉ DO PARCEIRO */}
      {offer_panel.partner?.name && (
        <div className="mt-8 rounded-xl border border-border bg-muted/40 p-3 sm:p-4 flex flex-col items-start gap-0.5 overflow-hidden w-full">
          <span className="text-xs text-muted-foreground">
            {offer_panel.partner.label}
          </span>
          <strong className="text-[clamp(8px,3.5vw,10px)] sm:text-xs text-foreground truncate w-full block">
            {offer_panel.partner.name}
          </strong>
        </div>
      )}
    </div>
  );
}