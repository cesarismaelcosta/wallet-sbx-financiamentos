import { User } from "lucide-react";

export function PanelEntity({ entity, entityDetails }: { entity: any, entityDetails?: any }) {
  const data = { ...entityDetails, ...entity }; // Mescla para garantir que pegue de onde existir
  if (!data || Object.keys(data).length === 0) return null;

  const rawDoc = (data.document || "").replace(/\D/g, "");
  const isPJ = data.entity_type === "J" || rawDoc.length === 14;
  
  const docFormatted = rawDoc.length === 14 
    ? rawDoc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") 
    : rawDoc.length === 11 
    ? rawDoc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") 
    : data.document || "—";

  const addr = data.address || {};
  const fullAddress = [addr.street, addr.number, addr.complement, addr.neighborhood, addr.city, addr.state, addr.zip_code, addr.country].filter(Boolean).join(", ");

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2 break-inside-avoid">
      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center gap-2">
        <User size={14} className="text-slate-400" /> Dados do Lead ({isPJ ? "Pessoa Jurídica" : "Pessoa Física"})
      </h4>
      <div className="space-y-1 text-xs">
        <div><span className="text-slate-500">{isPJ ? "CNPJ:" : "CPF:"}</span> <strong className="font-mono ml-1">{docFormatted}</strong></div>
        <div>
          <span className="text-slate-500">{isPJ ? "Data de Fundação:" : "Data de Nascimento:"}</span> 
          <strong className="ml-1">{data.birth_date ? new Date(data.birth_date).toLocaleDateString("pt-BR") : "—"}</strong>
        </div>
        <div><span className="text-slate-500">Telefone:</span> <strong className="ml-1">{data.phone || "—"}</strong></div>
        <div><span className="text-slate-500">E-mail:</span> <strong className="ml-1">{data.email || "—"}</strong></div>
        {data.gender && <div><span className="text-slate-500">Gênero:</span> <strong className="ml-1">{data.gender}</strong></div>}
        {fullAddress && (
          <div className="mt-2 pt-2 border-t border-slate-100">
            <span className="text-slate-500 block">Endereço:</span> 
            <strong className="font-normal">{fullAddress}</strong>
          </div>
        )}
      </div>
    </div>
  );
}