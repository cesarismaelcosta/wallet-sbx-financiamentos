/**
 * @fileoverview Componente Unificado: PanelSimulation
 * @description Exibe as condições da simulação adaptando-se para oferta única ou múltiplas opções,
 * sem rótulos de "IF" ou ícones de logo nas opções múltiplas.
 */

import { Building2 } from "lucide-react";
import { BRL } from "@/features/financial-hub/components/shared/formatters";

export function PanelSimulation({ 
  simulation, 
  bank, 
  consults 
}: { 
  simulation: any; 
  bank?: any; 
  consults?: any[]; 
}) {
  if (!simulation && (!consults || consults.length === 0)) return null;

  const listConsults = consults || simulation?.simulation_consults || simulation?.consults || [];
  const hasMultiple = listConsults.length > 1;
  const hasInstallments = simulation?.installments && simulation?.installment_value;
  
  if (!bank?.name && !simulation?.financed_amount && !hasInstallments && !simulation?.result_partner_types?.description && listConsults.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4 break-inside-avoid shadow-xs">
      
      {/* CABEÇALHO DO PAINEL */}
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
          <Building2 size={14} className="text-purple-600" /> Condições da Simulação
        </h4>
        
        {/* Logo do banco apenas na visão de oferta única, se houver */}
        {!hasMultiple && bank?.logo_url && (
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-transparent overflow-hidden border border-slate-200/60 bg-white shadow-2xs">
            <img src={bank.logo_url} className="h-full w-full object-cover" alt={bank?.name || "Banco"} />
          </div>
        )}
      </div>

      {/* ROTEAMENTO: Múltiplas Opções vs Oferta Única */}
      {hasMultiple ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {listConsults.map((item: any, idx: number) => {
            const itemTotal = item.installments * item.installment_value;
            const cet = item.cet_rate ? Number(item.cet_rate).toFixed(2) : null;

            return (
              <div key={idx} className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2 hover:border-purple-300 transition-all shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-800">
                    {item.description || `Opção ${idx + 1}`}
                  </span>
                  {cet && (
                    <span className="text-[10px] font-semibold bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full">
                      {cet}% a.m.
                    </span>
                  )}
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <div>
                    <div className="text-base font-extrabold text-purple-600">
                      {item.installments}x <span className="text-slate-900">{BRL(item.installment_value)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      Total: {BRL(itemTotal)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs">
          <div className="flex flex-col">
            <span className="text-slate-500">Instituição Financeira:</span> 
            <strong className="text-slate-800 mt-0.5">{bank?.name || "—"}</strong>
          </div>
          
          <div className="flex flex-col">
            <span className="text-slate-500">Valor Financiado:</span> 
            <strong className="text-slate-900 text-sm mt-0.5">{BRL(simulation?.financed_amount)}</strong>
          </div>
          
          <div className="flex flex-col">
            <span className="text-slate-500">Parcelas e Taxa:</span> 
            <strong className="text-primary font-bold text-sm mt-0.5">
              {hasInstallments ? `${simulation.installments}x ${BRL(simulation.installment_value)}` : "—"}
            </strong>
            {simulation?.cet_rate && (
              <span className="text-[11px] font-medium text-slate-500 mt-0.5">
                Taxa: {Number(simulation.cet_rate).toFixed(2)}% a.m.
              </span>
            )}
          </div>
        </div>
      )}

      {/* RETORNO DO PARCEIRO */}
      {simulation?.result_partner_types?.description && (
        <div className="pt-3 border-t border-slate-200 text-xs space-y-1">
          <span className="text-slate-500 block font-bold uppercase text-[10px]">Retorno do Parceiro / Motivo:</span>
          <p className="text-slate-700 font-normal leading-relaxed bg-white p-2.5 rounded-lg border border-slate-200 shadow-2xs">
            {simulation.result_partner_types.description}
          </p>
        </div>
      )}
    </div>
  );
}