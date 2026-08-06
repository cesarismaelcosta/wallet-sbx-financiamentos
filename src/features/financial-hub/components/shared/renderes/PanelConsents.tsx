import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TooltipProvider } from "@/components/ui/tooltip";
import { FileText } from "lucide-react";

export function PanelConsents({ configs }: { configs: any[] }) {
  if (!configs || configs.length === 0) return null;

  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm break-inside-avoid">
      <h4 className="text-[11px] font-bold uppercase text-[#B300FF] mb-3 flex items-center gap-1.5">
        <FileText size={14} /> Consentimentos da Rota (LGPD)
      </h4>
      
      <TooltipProvider delayDuration={200}>
        <div className="flex flex-col rounded-lg border border-border bg-muted/10 p-3 space-y-2.5">
          {[...configs]
            .sort((a, b) => (a.position || 0) - (b.position || 0))
            .map((opt) => (
              <div key={opt.id} className="flex gap-2 items-start py-0.5 text-xs">
                <div className="flex items-center mt-0.5">
                  <Checkbox disabled checked={false} className="h-4 w-4 shrink-0 rounded-[4px] border-slate-400" />
                </div>
                <label className="text-[11px] text-muted-foreground leading-snug flex-1">
                  {opt.template_text ? (
                    opt.template_text.split(/(\{.*?\})/g).map((part: string, i: number) => {
                      if (part.startsWith("{") && part.endsWith("}")) {
                        const cleanText = part.replace(/[{}]/g, "");
                        const linkConfig = opt.links?.find((l: any) => l.text === cleanText);

                        if (!linkConfig) return <span key={i} className="underline font-bold inline mx-0.5 text-[#B300FF]">{cleanText}</span>;

                        if (linkConfig.type === "web" || linkConfig.url) {
                          return (
                            <a
                              key={i}
                              href={linkConfig.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline font-bold inline mx-0.5 hover:opacity-80"
                              style={{ color: "var(--brand-primary)" }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {cleanText}
                            </a>
                          );
                        }

                        // CORREÇÃO: Popover para suporte perfeito a clique no Mobile
                        if (linkConfig.type === "tooltip" || linkConfig.tooltip_text) {
                          return (
                            <Popover key={i}>
                              <PopoverTrigger asChild>
                                <span
                                  className="underline font-bold cursor-pointer border-b border-dashed inline mx-0.5 hover:opacity-80"
                                  style={{ color: "var(--brand-primary)", borderColor: "var(--brand-primary)" }}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {cleanText}
                                </span>
                              </PopoverTrigger>
                              <PopoverContent
                                side="bottom"
                                align="start"
                                sideOffset={6}
                                className="max-w-xs p-3 bg-white text-slate-700 text-[11px] rounded-xl border border-slate-200 shadow-xl leading-relaxed z-[100]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <p className="font-normal">{linkConfig.tooltip_text}</p>
                              </PopoverContent>
                            </Popover>
                          );
                        }
                      }
                      return <span key={i}>{part}</span>;
                    })
                  ) : null}
                </label>
              </div>
            ))}
        </div>
      </TooltipProvider>
    </div>
  );
}