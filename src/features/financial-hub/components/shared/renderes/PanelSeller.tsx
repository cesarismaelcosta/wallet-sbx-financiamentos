/**
 * @fileoverview Componente: PanelSeller (Shared Renderer para Backoffice)
 * @description Exibe os detalhes do organizador do leilão/evento e do vendedor (seller).
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS & NEUTRAL PURITY
 * =========================================================================
 * [ATUALIZAÇÃO DE DESIGN SYSTEM]:
 * 1. Zero-Radius: Remoção do `rounded-xl`, substituído por `rounded-none`.
 * 2. Neutral Purity: Títulos, rótulos e valores adotam a escala tipográfica 
 *    padrão com `neutral-900` e `neutral-500`, abolindo qualquer `slate-800`.
 * 3. Tipografia de Dados: Rótulos ajustados para `text-[10px] font-bold uppercase 
 *    tracking-wider` para padronização de labels do painel de auditoria.
 * =========================================================================
 */

import { Briefcase } from "lucide-react";

export function PanelSeller({ offer, managerDetails }: { offer: any, managerDetails?: any }) {
  // Se não tiver nenhum dado de organizador ou vendedor, o painel nem é renderizado
  if (!offer?.manager_name && !offer?.legal_name && !offer?.seller_id) return null;

  // Busca o ID do organizador na raiz da oferta ou nos detalhes aninhados
  const managerId = offer?.manager_id || managerDetails?.manager_id;

  return (
    <div className="rounded-none border border-neutral-200 bg-white p-4 space-y-3 break-inside-avoid shadow-xs">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5 border-b border-neutral-100 pb-2">
        <Briefcase size={14} className="text-neutral-900" /> Organizador & Vendedor
      </h4>
      <div className="grid grid-cols-2 gap-3 text-xs">
        
        {offer.manager_name && (
          <div className="flex flex-col">
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Organizador:</span>
            <span className="text-neutral-900 font-medium mt-0.5">
              {offer.manager_name} 
              {managerId ? ` (${managerId})` : ""}
            </span>
          </div>
        )}
        
        {offer.seller_id && (
          <div className="flex flex-col items-end text-right">
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Seller ID:</span>
            <span className="text-neutral-900 font-medium font-mono mt-0.5">{offer.seller_id}</span>
          </div>
        )}
        
        {offer.legal_name && (
          <div className="col-span-2 flex flex-col pt-2 border-t border-neutral-100 mt-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Razão Social (Vendedor):</span>
            <span className="text-neutral-900 font-medium mt-0.5">
              {offer.legal_name} {offer.trade_name ? `(${offer.trade_name})` : ""}
            </span>
          </div>
        )}
        
      </div>
    </div>
  );
}