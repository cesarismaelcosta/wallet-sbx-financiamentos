/**
 * @fileoverview Componente: OfferPanel
 * @path src/features/financial-hub/components/shared/OfferPanel.tsx
 * * @description Painel lateral de proposta de valor com proteção contra estados nulos.
 * * @responsibilities
 * - Renderização de headline, descrição e benefícios.
 * - Manutenção estrita da estrutura original do rodapé.
 * - Blindagem contra acesso a propriedades de objetos undefined.
 * * @dependencies
 * - ./icons-map (ICON_MAP)
 */

import { ICON_MAP } from "./icons-map";

export function OfferPanel({ config }: { config: any }) {

  // DEBUG EXPLICITO: Isso vai parar o erro e nos dizer o que é o 'config'
  if (!config) return <div className="p-4 text-red-500">ERRO: Config é nulo</div>;
  if (!config.offer_panel) return <div className="p-4 text-red-500">ERRO: offer_panel ausente no config</div>;
  if (!config.offer_panel.headline) return <div className="p-4 text-red-500">ERRO: headline ausente</div>;
  if (!config.offer_panel.headline.parts) return <div className="p-4 text-red-500">ERRO: parts ausente na headline</div>;
  
  // BLINDAGEM: Verifica a existência da hierarquia necessária antes de renderizar
  if (!config?.offer_panel?.headline?.parts || !config?.offer_panel?.description?.parts) {
    return null; 
  }

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

      {/* RODAPÉ MANTIDO CONFORME ESTRUTURA ORIGINAL */}
      {offer_panel.partner?.name && (
        <div className="mt-8 rounded-xl border border-border bg-muted/40 p-4 text-xs text-muted-foreground">
          {offer_panel.partner.label}{" "}
          <strong className="text-foreground">{offer_panel.partner.name}</strong>.
        </div>
      )}
    </div>
  );
}