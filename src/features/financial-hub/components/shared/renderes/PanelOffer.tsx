/**
 * @fileoverview Componente: PanelOffer (Shared Renderer para Backoffice)
 * @description Exibe os detalhes da oferta/lote e informações do leilão/evento.
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS & NEUTRAL PURITY
 * =========================================================================
 * [ATUALIZAÇÃO DE DESIGN SYSTEM]:
 * 1. Zero-Radius: Remoção do `rounded-xl`, substituído por `rounded-none`.
 * 2. Neutral Purity: Remoção completa do roxo (`#B300FF`). Títulos, rótulos e 
 *    valores adotam a escala tipográfica padrão do painel com `neutral-900` e `neutral-500`.
 * 3. Tipografia de Dados: Rótulos ajustados para `text-[10px] font-bold uppercase 
 *    tracking-wider` para alinhar com o design dos demais painéis de auditoria.
 * =========================================================================
 */

import { CreditCard } from "lucide-react";
import { BRL } from "@/features/financial-hub/components/shared/formatters";

export function PanelOffer({ offer, offerDetails, eventDetails }: any) {
  if (!offer?.offer_description && !offer?.offer_id) return null;

  return (
    <div className="rounded-none border border-neutral-200 bg-white p-4 space-y-3 break-inside-avoid shadow-xs">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5 border-b border-neutral-100 pb-2">
        <CreditCard size={14} className="text-neutral-900" /> Oferta / Lote
      </h4>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="col-span-2 flex flex-col">
          <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Descrição da Oferta:</span>
          <span className="text-sm text-neutral-900 font-medium mt-0.5">{offer.offer_description}</span>
        </div>
        
        <div className="flex flex-col">
          <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Categoria:</span>
          <div className="flex flex-col mt-0.5">
            <span className="text-neutral-900 font-medium truncate">
              {offerDetails?.category || offer?.category_types?.name || "—"}
            </span>
            {offer?.subcategory && (
              <span className="text-[11px] text-neutral-400 truncate mt-0.5">
                {offer.subcategory}
              </span>
            )}
          </div>
        </div>
        
        <div className="text-right flex flex-col items-end">
          <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Identificação:</span>
          <span className="font-mono text-neutral-900 font-medium mt-0.5">
            {offerDetails?.lot_number ? `Lote #${offerDetails.lot_number} / ` : ""}
            Oferta #{offer.offer_id || "—"}
          </span>
        </div>

        <div className="col-span-2 flex flex-col">
          <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Valor:</span>
          <span className="font-semibold text-neutral-900 text-sm mt-0.5">{BRL(offer.offer_value)}</span>
        </div>

        {(offer.event_description || eventDetails?.event_description) && (
          <div className="col-span-2 pt-2 border-t border-neutral-100 flex flex-col mt-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Evento / Leilão:</span>
            <span className="text-neutral-900 font-medium mt-0.5">
              [{offer.event_id}] {offer.event_description || eventDetails?.event_description}
            </span>
            <div className="text-[11px] text-neutral-400 mt-0.5">
              Início: {offer.event_start_date ? new Date(offer.event_start_date).toLocaleDateString("pt-BR") : "—"} | 
              Término: {offer.event_end_date ? new Date(offer.event_end_date).toLocaleDateString("pt-BR") : "—"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}