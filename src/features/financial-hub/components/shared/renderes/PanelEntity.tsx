/**
 * @fileoverview Componente: PanelEntity (Shared Renderer para Backoffice)
 * @description Exibe os detalhes cadastrais do lead (Pessoa Física ou Jurídica).
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS & NEUTRAL PURITY
 * =========================================================================
 * [ATUALIZAÇÃO DE DESIGN SYSTEM]:
 * 1. Zero-Radius: Remoção do `rounded-xl`, substituído estritamente por `rounded-none`.
 * 2. Neutral Purity: Títulos, rótulos e valores adotam a paleta `neutral-900` e `neutral-500`, 
 *    abolindo os antigos tons de `slate` para alinhar-se perfeitamente aos outros painéis.
 * 3. Grid Semântico: Transição de uma lista empilhada simples para um `grid grid-cols-2` 
 *    com rótulos em micro-tipografia (`text-[10px] uppercase`), maximizando a clareza da auditoria.
 * =========================================================================
 */

import { User } from "lucide-react";
import { formatDocument, formatDate } from "@/features/financial-hub/components/shared/formatters";

export function PanelEntity({ entity, entityDetails }: { entity: any, entityDetails?: any }) {
  const data = { ...entityDetails, ...entity };
  if (!data || Object.keys(data).length === 0) return null;

  const rawDoc = (data.document || "").replace(/\D/g, "");
  const isPJ = data.entity_type === "J" || rawDoc.length === 14;

  const addr = data.address || {};
  const fullAddress = [
    addr.street, addr.number, addr.complement, addr.neighborhood, 
    addr.city, addr.state, addr.zip_code, addr.country
  ].filter(Boolean).join(", ");

  // Isola apenas o número formatado já que a label (CPF/CNPJ) fica na tag separada
  const docString = formatDocument(data.document);
  const docValueOnly = docString.replace(/^(CPF|CNPJ|Doc):\s*/, '');

  return (
    <div className="rounded-none border border-neutral-200 bg-white p-4 space-y-3 break-inside-avoid shadow-xs">
      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-900 flex items-center gap-1.5 border-b border-neutral-100 pb-2">
        <User size={14} className="text-neutral-900" /> Dados do Lead ({isPJ ? "Pessoa Jurídica" : "Pessoa Física"})
      </h4>
      
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="flex flex-col">
          <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
            {isPJ ? "CNPJ" : "CPF"}
          </span> 
          <span className="font-mono text-neutral-900 font-medium mt-0.5">{docValueOnly || "—"}</span>
        </div>
        
        <div className="flex flex-col">
          <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">
            {isPJ ? "Data de Fundação" : "Data de Nascimento"}
          </span> 
          <span className="text-neutral-900 font-medium mt-0.5">
            {data.birth_date ? formatDate(data.birth_date).d : "—"}
          </span>
        </div>
        
        <div className="flex flex-col">
          <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Telefone</span> 
          <span className="text-neutral-900 font-medium mt-0.5">{data.phone || "—"}</span>
        </div>
        
        <div className="flex flex-col overflow-hidden">
          <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">E-mail</span> 
          <span className="text-neutral-900 font-medium mt-0.5 truncate" title={data.email}>
            {data.email || "—"}
          </span>
        </div>
        
        {data.gender && (
          <div className="flex flex-col">
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Gênero</span> 
            <span className="text-neutral-900 font-medium mt-0.5">{data.gender}</span>
          </div>
        )}
        
        {fullAddress && (
          <div className="col-span-2 flex flex-col pt-2 border-t border-neutral-100 mt-1">
            <span className="text-[10px] font-medium uppercase tracking-wider text-neutral-400">Endereço</span> 
            <span className="text-neutral-900 font-normal mt-0.5">{fullAddress}</span>
          </div>
        )}
      </div>
    </div>
  );
}