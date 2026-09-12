/**
 * @fileoverview Componente: PanelVisit (Shared Renderer para Backoffice)
 * @description Exibe os dados de origem, rastreamento UTM, IP e device da visita.
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS & NEUTRAL PURITY
 * =========================================================================
 * [ATUALIZAÇÃO DE DESIGN SYSTEM]:
 * 1. Zero-Radius: Remoção do `rounded-xl`, substituído estritamente por `rounded-none`.
 * 2. Neutral Purity: Títulos, rótulos e valores adotam a paleta `neutral-900` e `neutral-500`, 
 *    abolindo os antigos tons de `slate` e `primary`.
 * 3. Grid Semântico: Transição das linhas empilhadas com ícones para um 
 *    `grid grid-cols-2` com rótulos em micro-tipografia (`text-[10px] uppercase`), 
 *    maximizando a escaneabilidade técnica da auditoria.
 * =========================================================================
 */

import { Calendar as CalendarIcon } from "lucide-react";
import { formatDate } from "@/features/financial-hub/components/shared/formatters";

export function PanelVisit({ visitData, updateData }: { visitData: any; updateData?: any }) {
  if (!visitData) return null;

  // Como o join da simulação traz a visita vinculada em 'visits', 
  // lemos diretamente a tabela mestre de visitas do nosso schema:
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
    <div className="rounded-none border border-neutral-200 bg-white p-4 space-y-3 break-inside-avoid shadow-xs">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5 border-b border-neutral-100 pb-2">
        <CalendarIcon size={14} className="text-neutral-900" /> Origem & Visita
      </h4>
      
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="flex flex-col">
          <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Data de Acesso</span>
          <span className="text-neutral-900 font-medium mt-0.5">{created.d} às {created.h}</span>
        </div>
        
        <div className="flex flex-col overflow-hidden">
          <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">UTM Source / Campaign</span>
          <span className="text-neutral-900 font-mono truncate mt-0.5" title={`${utmSource} / ${utmCampaign}`}>
            {utmSource} / {utmCampaign}
          </span>
        </div>

        {visitId && (
          <div className="flex flex-col overflow-hidden">
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Visit ID</span>
            <span className="font-mono text-neutral-900 mt-0.5 truncate" title={visitId}>{visitId}</span>
          </div>
        )}
        
        <div className="flex flex-col">
          <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Localização</span>
          <span className="text-neutral-900 mt-0.5">{country} / {state} / {city}</span>
        </div>
        
        <div className="col-span-2 flex flex-col pt-2 border-t border-neutral-100 mt-1">
          <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">IP & Device</span>
          <span className="text-neutral-900 mt-0.5">{ip} / {os} ({device})</span>
        </div>

        {(originUrl || targetUrl) && (
          <>
            {originUrl && (
              <div className="col-span-2 flex flex-col overflow-hidden pt-2 border-t border-neutral-100 mt-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Origem (URL)</span>
                <span className="text-neutral-900 font-mono text-[11px] truncate mt-0.5" title={originUrl}>
                  {originUrl}
                </span>
              </div>
            )}
            {targetUrl && (
              <div className="col-span-2 flex flex-col overflow-hidden pt-2 border-t border-neutral-100 mt-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Destino (URL)</span>
                <span className="text-neutral-900 font-mono text-[11px] truncate mt-0.5" title={targetUrl}>
                  {targetUrl}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}