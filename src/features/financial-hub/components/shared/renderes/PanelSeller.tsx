import { Briefcase } from "lucide-react";

export function PanelSeller({ offer, managerDetails }: { offer: any, managerDetails?: any }) {
  // Se não tiver nenhum dado de organizador ou vendedor, o painel nem é renderizado
  if (!offer?.manager_name && !offer?.legal_name && !offer?.seller_id) return null;

  // Busca o ID do organizador na raiz da oferta ou nos detalhes aninhados
  const managerId = offer?.manager_id || managerDetails?.manager_id;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 break-inside-avoid">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
        <Briefcase size={14} className="text-slate-400" /> Organizador & Vendedor
      </h4>
      <div className="grid grid-cols-2 gap-4 text-xs">
        
        {offer.manager_name && (
          <div>
            <span className="text-slate-500 block">Organizador:</span>
            <strong className="text-slate-800">
              {offer.manager_name} 
              {managerId ? ` (${managerId})` : ""}
            </strong>
          </div>
        )}
        
        {offer.seller_id && (
          <div>
            <span className="text-slate-500 block">Seller ID:</span>
            <strong className="text-slate-800 font-mono">{offer.seller_id}</strong>
          </div>
        )}
        
        {offer.legal_name && (
          <div className="col-span-2">
            <span className="text-slate-500 block">Razão Social (Vendedor):</span>
            <strong className="text-slate-800">
              {offer.legal_name} {offer.trade_name ? `(${offer.trade_name})` : ""}
            </strong>
          </div>
        )}
        
      </div>
    </div>
  );
}