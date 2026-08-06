import { Building2 } from "lucide-react";
import { BRL } from "./formatters";

export function PanelSimulation({ simulation, bank }: { simulation: any, bank?: any }) {
  if (!simulation) return null;

  const hasInstallments = simulation.installments && simulation.installment_value;
  
  // Se for uma visita sem dados de simulação, oculta o painel
  if (!bank?.name && !simulation.financed_amount && !hasInstallments && !simulation.result_partner_types?.description) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3 break-inside-avoid">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
        <Building2 size={14} className="text-slate-400" /> Condições da Simulação
      </h4>
      
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs">
        <div className="flex flex-col">
          <span className="text-slate-500">Instituição Financeira:</span> 
          <strong className="text-slate-800 mt-0.5">{bank?.name || "—"}</strong>
        </div>
        <div className="flex flex-col">
          <span className="text-slate-500">Valor Financiado:</span> 
          <strong className="text-slate-900 text-sm mt-0.5">{BRL(simulation.financed_amount)}</strong>
        </div>
        <div className="flex flex-col">
          <span className="text-slate-500">Parcelas:</span> 
          <strong className="text-primary font-bold text-sm mt-0.5">
            {hasInstallments ? `${simulation.installments}x ${BRL(simulation.installment_value)}` : "—"}
          </strong>
        </div>
      </div>

      {simulation.result_partner_types?.description && (
        <div className="pt-3 border-t border-slate-200 text-xs space-y-1">
          <span className="text-slate-500 block font-bold uppercase text-[10px]">Retorno do Parceiro / Motivo:</span>
          <p className="text-slate-700 font-normal leading-relaxed bg-white p-2.5 rounded-lg border border-slate-200 shadow-sm">
            {simulation.result_partner_types.description}
          </p>
        </div>
      )}
    </div>
  );
}