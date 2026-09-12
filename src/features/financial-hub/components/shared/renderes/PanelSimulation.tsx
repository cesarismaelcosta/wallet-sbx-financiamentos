/**
 * @fileoverview Componente Unificado: PanelSimulation (Shared Renderer Backoffice)
 * @description Exibe as condições da simulação adaptando-se para oferta única ou múltiplas opções.
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS & NEUTRAL PURITY
 * =========================================================================
 * [ATUALIZAÇÃO DE DESIGN SYSTEM]:
 * 1. Zero-Radius: Remoção total de `rounded-xl`, `rounded-full` e afins.
 *    Exceção: A logo do parceiro/banco mantém `rounded-[6px]`.
 * 2. Neutral Purity: Extinção de cores da marca (`text-purple-600`, `bg-purple-50`).
 *    Uso restrito da paleta `neutral-900` para destaque e `neutral-500` base.
 * =========================================================================
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
    <div className="rounded-none border border-neutral-200 bg-white p-4 space-y-3 break-inside-avoid shadow-xs">
      
      {/* CABEÇALHO DO PAINEL */}
      <div className="flex items-center justify-between border-b border-neutral-100 pb-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5">
          <Building2 size={14} className="text-neutral-900" /> Condições da Simulação
        </h4>
        
        {/* Logo do banco apenas na visão de oferta única, se houver. Exceção Zero-Radius: rounded-[6px] */}
        {!hasMultiple && bank?.logo_url && (
          <div className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-neutral-50 overflow-hidden border border-neutral-200 shrink-0">
            <img src={bank.logo_url} className="h-full w-full object-cover rounded-[6px]" alt={bank?.name || "Banco"} />
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
              <div key={idx} className="bg-white border border-neutral-200 rounded-none p-3 space-y-2 hover:bg-neutral-50 transition-colors shadow-xs">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-neutral-900">
                    {item.description || `Opção ${idx + 1}`}
                  </span>
                  {cet && (
                    <span className="text-[10px] font-medium bg-neutral-100 text-neutral-900 px-2 py-0.5 rounded-none border border-neutral-200">
                      {cet}% a.m.
                    </span>
                  )}
                </div>
                <div className="flex items-baseline justify-between pt-0.5">
                  <div>
                    <div className="text-sm font-semibold text-neutral-900">
                      {item.installments}x <span className="text-neutral-900">{BRL(item.installment_value)}</span>
                    </div>
                    <div className="text-[11px] text-neutral-400 mt-0.5">
                      Total: {BRL(itemTotal)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="flex flex-col">
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Instituição Financeira:</span> 
            <span className="text-neutral-900 font-medium mt-0.5">{bank?.name || "—"}</span>
          </div>
          
          <div className="flex flex-col">
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Valor Financiado:</span> 
            <span className="text-neutral-900 font-semibold text-sm mt-0.5">{BRL(simulation?.financed_amount)}</span>
          </div>
          
          <div className="flex flex-col">
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Parcelas e Taxa:</span> 
            <span className="text-neutral-900 font-semibold text-sm mt-0.5">
              {hasInstallments ? `${simulation.installments}x ${BRL(simulation.installment_value)}` : "—"}
            </span>
            {simulation?.cet_rate && (
              <span className="text-[11px] text-neutral-400 mt-0.5">
                Taxa: {Number(simulation.cet_rate).toFixed(2)}% a.m.
              </span>
            )}
          </div>
        </div>
      )}

      {/* RETORNO DO PARCEIRO */}
      {simulation?.result_partner_types?.description && (
        <div className="pt-2 border-t border-neutral-100 text-xs space-y-1">
          <span className="text-neutral-400 block font-medium uppercase tracking-wider text-[10px]">Retorno do Parceiro / Motivo:</span>
          <p className="text-neutral-700 font-normal leading-relaxed bg-neutral-50 p-2.5 rounded-none border border-neutral-200">
            {simulation.result_partner_types.description}
          </p>
        </div>
      )}
    </div>
  );
}