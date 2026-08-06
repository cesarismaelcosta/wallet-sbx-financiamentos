import { CheckCircle2, FileText, MapPin, Smartphone } from "lucide-react";
import { formatDate } from "./formatters";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function PanelAcceptedConsents({ consents }: { consents: any[] }) {
  if (!consents || consents.length === 0) return null;

  const sortedConsents = [...consents].sort(
    (a, b) => new Date(a.accepted_at).getTime() - new Date(b.accepted_at).getTime()
  );

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4 break-inside-avoid">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
        <FileText className="h-3.5 w-3.5 text-primary" /> Auditoria de Aceite (LGPD)
      </h4>

      {/* Caixa única geral */}
      <div className="bg-white rounded-xl border border-border shadow-sm divide-y divide-slate-100 overflow-hidden">
        {sortedConsents.map((consent: any, index: number) => {
          const acceptedAt = formatDate(consent.accepted_at);
          const legalTextSnapshot = consent.page_snapshot?.legal_text || {};
          const origin = consent.origin_details || consent;
          const templateText = legalTextSnapshot.template_text || "";
          const links = legalTextSnapshot.links || [];

          return (
            <div key={consent.id || index} className="p-3.5 space-y-3 break-inside-avoid">
              
              {/* Header com o nome do consentimento e data */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 pb-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wide break-words">
                    {consent.consent_id || "Termo de Aceite"}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground font-medium pl-5 sm:pl-0">
                  {acceptedAt.d} às {acceptedAt.h}
                </span>
              </div>

              {/* Texto do Termo limpo (sem caixas internas) */}
              <div className="text-[11px] text-muted-foreground leading-relaxed flex gap-2 items-start py-0.5">
                <div className="flex items-center mt-0.5">
                  <div className="h-4 w-4 shrink-0 rounded-[4px] border border-slate-400 bg-slate-50 flex items-center justify-center text-[10px] text-emerald-600 font-bold">✓</div>
                </div>
                <div className="flex-1">
                  {templateText ? (
                    templateText.split(/(\{.*?\})/g).map((part: string, i: number) => {
                      if (part.startsWith("{") && part.endsWith("}")) {
                        const cleanText = part.replace(/[{}]/g, "");
                        const linkConfig = links.find((l: any) => l.text === cleanText);

                        if (!linkConfig) {
                          return <span key={i} className="underline font-bold inline mx-0.5 text-[#B300FF]">{cleanText}</span>;
                        }

                        if (linkConfig.type === "web" || linkConfig.url) {
                          return (
                            <a key={i} href={linkConfig.url} target="_blank" rel="noopener noreferrer" className="underline font-bold inline mx-0.5 text-[#B300FF]">
                              {cleanText}
                            </a>
                          );
                        }

                        if (linkConfig.type === "tooltip" || linkConfig.tooltip_text) {
                          return (
                            <Popover key={i}>
                              <PopoverTrigger asChild>
                                <span className="underline font-bold cursor-pointer border-b border-dashed inline mx-0.5 text-[#B300FF] border-[#B300FF]">
                                  {cleanText}
                                </span>
                              </PopoverTrigger>
                              <PopoverContent side="bottom" align="start" className="max-w-xs p-3 bg-white text-slate-700 text-[11px] rounded-xl border border-slate-200 shadow-xl leading-relaxed z-[100]">
                                <p>{linkConfig.tooltip_text}</p>
                              </PopoverContent>
                            </Popover>
                          );
                        }
                      }
                      return <span key={i}>{part}</span>;
                    })
                  ) : "Termo aceito eletronicamente."}
                </div>
              </div>

              {/* Rodapé do item com IP e Localização */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-50 text-[10px] text-slate-600">
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate">
                    {origin.city || "N/A"} / {origin.state || "N/A"} / {origin.country || "N/A"}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Smartphone className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="truncate">
                    {origin.ip_address || "N/A"} - {origin.operating_system || "N/A"} ({origin.device_type || "N/A"})
                  </span>
                </div>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}