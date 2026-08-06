import { Calendar as CalendarIcon, MapPin, Smartphone, Globe } from "lucide-react";
import { formatDate } from "./formatters";

export function PanelVisit({ visitData }: { visitData: any }) {
  if (!visitData) return null;

  // Como o join da simulação traz a visita vinculada em 'visits', 
  // leimos diretamente a tabela mestre de visitas do nosso schema:
  const visit = visitData.visits || visitData;

  const created = formatDate(visit?.created_at);
  const visitId = visit?.id || visitData?.visit_id;
  const utmSource = visit?.utm_source || "—";
  const utmCampaign = visit?.utm_campaign || "—";
  const country = visit?.country || "BR";
  const state = visit?.state || "—";
  const city = visit?.city || "—";
  const ip = visit?.ip_address || "—";
  const os = visit?.operating_system || "—";
  const device = visit?.device_type || "Desktop";

  // URLs nativas da tabela visits do nosso schema
  const originUrl = visit?.origin_url;
  const targetUrl = visit?.target_url;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 break-inside-avoid">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
        <CalendarIcon className="h-3.5 w-3.5 text-primary" /> Origem & Visita
      </h4>
      
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <span className="text-muted-foreground block">Data de Acesso:</span>
          <strong className="text-slate-800">{created.d} às {created.h}</strong>
        </div>
        <div>
          <span className="text-muted-foreground block">UTM Source / Campaign:</span>
          <strong className="text-slate-800 font-mono truncate block">
            {utmSource} / {utmCampaign}
          </strong>
        </div>
      </div>

      <div className="pt-2 border-t border-slate-200 grid grid-cols-1 gap-2 text-xs">
        {visitId && (
          <div className="flex items-center gap-1.5 text-slate-700">
            <Globe className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="truncate"><strong>Visit ID:</strong> <span className="font-mono text-[11px]">{visitId}</span></span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-slate-700">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span><strong>Localização:</strong> {country} / {state} / {city}</span>
        </div>
        <div className="flex items-center gap-1.5 text-slate-700">
          <Smartphone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span><strong>IP / Device:</strong> {ip} / {os} ({device})</span>
        </div>
      </div>

      {(originUrl || targetUrl) && (
        <div className="pt-2 border-t border-slate-200 space-y-2 text-xs">
          {originUrl && (
            <div className="overflow-hidden">
              <span className="text-muted-foreground block">Origem (URL):</span>
              <span className="text-slate-800 font-mono truncate block" title={originUrl}>
                {originUrl}
              </span>
            </div>
          )}
          {targetUrl && (
            <div className="overflow-hidden">
              <span className="text-muted-foreground block">Destino (URL):</span>
              <span className="text-slate-800 font-mono truncate block" title={targetUrl}>
                {targetUrl}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}