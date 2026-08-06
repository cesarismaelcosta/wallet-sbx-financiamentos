import React from "react";
import { Layers, CheckCircle2 } from "lucide-react";
import { ICON_MAP } from "@/features/financial-hub/components/shared/icons-map";

export function PanelProduct({ config }: { config: any }) {
  const panel = config?.offer_panel || config;
  if (!panel?.headline?.parts || !panel?.description?.parts) return null;

  const brandColor = config?.theme?.primary_color || "var(--brand-primary)";

  const getTextStyle = (type: string) => {
    switch (type) {
      case "highlight": return "text-[var(--brand-primary)]";
      case "bold": return "font-bold text-foreground";
      default: return "text-foreground";
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 break-inside-avoid">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#B300FF] flex items-center gap-1.5 mb-3">
        <Layers size={14} /> Painel de Proposta (Offer Panel)
      </h4>
      
      <div className="space-y-3" style={{ "--brand-primary": brandColor } as React.CSSProperties}>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold leading-tight sm:text-xl">
            {panel.headline.parts.map((part: any, i: number) => (
              <span key={i} className={getTextStyle(part.type)}>{part.text}</span>
            ))}
          </h2>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {panel.description.parts.map((part: any, i: number) => (
              <span key={i} className={getTextStyle(part.type)}>{part.text}</span>
            ))}
          </p>
        </div>

        {panel.benefits && Array.isArray(panel.benefits) && (
          <ul className="flex flex-col gap-2 pt-1">
            {panel.benefits.map((b: any, i: number) => {
              const IconComponent = ICON_MAP[b.icon] || ICON_MAP[b.icon?.toLowerCase()] || CheckCircle2;
              return (
                <li key={i} className="flex items-start gap-2 text-xs">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                    <IconComponent className="h-3.5 w-3.5" />
                  </span>
                  <div>
                    <p className="font-medium text-foreground text-xs">{b.title}</p>
                    <p className="text-[10px] text-muted-foreground">{b.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {panel.partner?.name && (
          <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 flex flex-col items-start gap-0.5 overflow-hidden w-full">
            <span className="text-[11px] text-muted-foreground">{panel.partner.label}</span>
            <strong className="text-[clamp(8px,3.5vw,10px)] sm:text-xs text-foreground truncate w-full block">
              {panel.partner.name}
            </strong>
          </div>
        )}
      </div>
    </div>
  );
}