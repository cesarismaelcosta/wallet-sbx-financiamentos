/**
 * @fileoverview Painel de Auditoria LGPD e Consentimentos (Shared Renderer)
 * @path src/features/financial-hub/components/shared/renderes/PanelAcceptedConsents.tsx
 *
 * ============================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: ZERO-RADIUS & NEUTRAL PURITY
 * ============================================================================
 * Renderizador reativo para exibição dos termos de aceite LGPD capturados no banco.
 *
 * [ATUALIZAÇÃO DE DESIGN SYSTEM]:
 * 1. Zero-Radius: Substituição de todos os arredondamentos (ex: `rounded-xl`, 
 *    `rounded-[4px]`) por cantos estritamente retos (`rounded-none`).
 * 2. Neutral Purity: Remoção absoluta de cores da marca (ex: `#B300FF`, `text-primary`).
 *    Adoção restrita da paleta neutra (`neutral-900` para destaque, `neutral-500` 
 *    para backgrounds e textos descritivos) garantindo sobriedade na auditoria.
 * ============================================================================
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { CheckCircle2, FileText, MapPin, Smartphone } from "lucide-react";
import { formatDate } from "@/features/financial-hub/components/shared/formatters";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const safeArray = (data: any) => {
  if (!data) return [];
  return Array.isArray(data) ? data : [data];
};

export function PanelAcceptedConsents({ consents }: { consents: any | any[] }) {
  const normalizedConsents = safeArray(consents);
  if (normalizedConsents.length === 0) return null;

  const sortedConsents = [...normalizedConsents].sort(
    (a, b) => new Date(a.accepted_at).getTime() - new Date(b.accepted_at).getTime()
  );

  return (
    <div className="rounded-none border border-neutral-200 bg-white p-4 space-y-4 break-inside-avoid shadow-sm">
      <h4 className="text-[11px] font-bold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5 border-b border-neutral-100 pb-2">
        <FileText className="h-3.5 w-3.5" /> Auditoria de Aceite (LGPD)
      </h4>

      <div className="bg-white rounded-none border border-neutral-200 shadow-xs divide-y divide-neutral-100 overflow-hidden">
        {sortedConsents.map((consent: any, index: number) => {
          const acceptedAt = formatDate(consent.accepted_at);
          
          let snap = consent.page_snapshot;
          if (typeof snap === "string") {
            try { snap = JSON.parse(snap); } catch (e) { snap = {}; }
          }
          
          const legalTextSnapshot = snap?.legal_text || {};
          const templateText = legalTextSnapshot.template_text || "";
          const links = safeArray(legalTextSnapshot.links);

          const origin = consent.origin_details || {};
          const city = consent.city || origin.city || "N/A";
          const state = consent.state || origin.state || "N/A";
          const country = consent.country || origin.country || "N/A";
          const ipAddress = consent.ip_address || origin.ip_address || "N/A";
          const os = consent.operating_system || origin.operating_system || "N/A";
          const device = consent.device_type || origin.device_type || "N/A";

          return (
            <div key={consent.id || index} className="p-4 space-y-3 break-inside-avoid hover:bg-neutral-50 transition-colors">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 pb-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span className="text-[11px] font-bold text-neutral-900 uppercase tracking-wide break-words">
                    {consent.consent_id || "Termo de Aceite"}
                  </span>
                </div>
                <span className="text-[10px] text-neutral-500 font-bold pl-5 sm:pl-0">
                  {acceptedAt.d} às {acceptedAt.h}
                </span>
              </div>

              <div className="text-[11px] text-neutral-600 leading-relaxed flex gap-2 items-start py-1 bg-white p-3 border border-neutral-200 rounded-none">
                <div className="flex items-center mt-0.5">
                  <div className="h-4 w-4 shrink-0 rounded-none border border-neutral-400 bg-neutral-100 flex items-center justify-center text-[10px] text-neutral-900 font-bold">✓</div>
                </div>
                <div className="flex-1">
                  {templateText ? (
                    templateText.split(/(\{.*?\})/g).map((part: string, i: number) => {
                      if (part.startsWith("{") && part.endsWith("}")) {
                        const cleanText = part.replace(/[{}]/g, "");
                        const linkConfig = links.find((l: any) => l.text === cleanText);

                        if (!linkConfig) {
                          return <span key={i} className="underline font-bold inline mx-0.5 text-neutral-900">{cleanText}</span>;
                        }

                        if (linkConfig.type === "web" || linkConfig.url) {
                          return (
                            <a key={i} href={linkConfig.url} target="_blank" rel="noopener noreferrer" className="underline font-bold inline mx-0.5 text-neutral-900 hover:text-neutral-600 transition-colors">
                              {cleanText}
                            </a>
                          );
                        }

                        if (linkConfig.type === "tooltip" || linkConfig.tooltip_text) {
                          return (
                            <Popover key={i}>
                              <PopoverTrigger asChild>
                                <span className="underline font-bold cursor-pointer border-b border-dashed inline mx-0.5 text-neutral-900 border-neutral-900 hover:text-neutral-600">
                                  {cleanText}
                                </span>
                              </PopoverTrigger>
                              <PopoverContent side="bottom" align="start" className="max-w-xs p-3 bg-white text-neutral-700 text-[11px] rounded-none border border-neutral-200 shadow-xl leading-relaxed z-[100]">
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3 border-t border-neutral-100 text-[10px] text-neutral-500 font-medium">
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3 w-3 text-neutral-400 shrink-0" />
                  <span className="truncate">
                    {city} / {state} / {country}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Smartphone className="h-3 w-3 text-neutral-400 shrink-0" />
                  <span className="truncate">
                    {ipAddress} - {os} ({device})
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