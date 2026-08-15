import { CreditCard } from "lucide-react";
import { BRL } from "@/features/financial-hub/components/shared/formatters";

export function PanelOffer({ offer, offerDetails, eventDetails }: any) {
  if (!offer?.offer_description && !offer?.offer_id) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4 break-inside-avoid">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
        <CreditCard size={14} className="text-slate-400" /> Oferta / Lote
      </h4>

      <div className="grid grid-cols-2 gap-4 text-xs">
        <div className="col-span-2">
          <span className="text-slate-500 block">Descrição da Oferta:</span>
          <strong className="text-sm text-[#B300FF]">{offer.offer_description}</strong>
        </div>
        
        <div>
          <span className="text-slate-500 block">Categoria:</span>
          <div className="flex flex-col">
            <strong className="text-slate-900 truncate">
              {offerDetails?.category || offer?.category_types?.name || "—"}
            </strong>
            {offer?.subcategory && (
              <span className="text-xs text-slate-600 font-medium truncate">
                {offer.subcategory}
              </span>
            )}
          </div>
        </div>
        
        <div className="text-right">
          <span className="text-slate-500 block">Identificação:</span>
          <strong className="font-mono">
            {offerDetails?.lot_number ? `Lote #${offerDetails.lot_number} / ` : ""}
            Oferta #{offer.offer_id || "—"}
          </strong>
        </div>

        <div className="col-span-2">
          <span className="text-slate-500 block">Valor:</span>
          <strong className="font-bold text-slate-900 text-sm">{BRL(offer.offer_value)}</strong>
        </div>

        {(offer.event_description || eventDetails?.event_description) && (
          <div className="col-span-2 pt-2 border-t mt-2">
            <span className="text-muted-foreground block">Evento / Leilão:</span>
            <strong className="text-slate-800">
              [{offer.event_id}] {offer.event_description || eventDetails?.event_description}
            </strong>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Início: {offer.event_start_date ? new Date(offer.event_start_date).toLocaleDateString("pt-BR") : "—"} | 
              Término: {offer.event_end_date ? new Date(offer.event_end_date).toLocaleDateString("pt-BR") : "—"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}