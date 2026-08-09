/**
 * @fileoverview Componente de apresentação: CardOfferV (Vertical)
 * @path src/features/financial-hub/components/shared/renderers/CardOfferV.tsx
 *
 * =========================================================================
 * [DOCUMENTAÇÃO DO COMPONENTE & REGRAS DE NEGÓCIO]
 * =========================================================================
 * Este componente renderiza a vitrine individual de uma oferta (versão vertical).
 * Ele gerencia o estado local do carrossel de imagens e implementa o 
 * "Semáforo de Modalidade" estrito da Superbid para a tag de encerramento/tipo:
 * 
 * 1. MERCADO BALCÃO / COMPRE JÁ:
 *    - Identificado pelas flags `is_shopping` ou `shopping_offer_type`.
 *    - Visual: Fundo rosado (`bg-rose-100`), ícone de etiqueta (`Tag`) e texto "Compre já".
 * 
 * 2. TOMADA DE PREÇO:
 *    - Identificado pela descrição da modalidade (`modality_desc === "Tomada de preço"`).
 *    - Visual: Fundo azul gelo (`bg-sky-100`), ícone de envelope (`Mail`) e data curta (`DD/MM - HH:mm`).
 * 
 * 3. LEILÃO (PADRÃO):
 *    - Qualquer outro fluxo que não se enquadre nas regras acima.
 *    - Visual: Fundo laranja claro (`bg-orange-100`), ícone de martelo (`Gavel`) e data curta (`DD/MM - HH:mm`).
 */

import { useState } from "react";
import { MapPin, ChevronLeft, ChevronRight, ExternalLink, Gavel, Mail, Tag, Handshake } from "lucide-react";
import { Button } from "@/components/ui/button";

// =========================================================================
// [INTERFACES]
// =========================================================================
interface CardOfferVProps {
  item: any; // Objeto normalizado contendo offer, event, seller, etc.
  isCartao: boolean;
  loading: boolean;
  onSimulate: (item: any) => void;
}

// =========================================================================
// [HELPERS LOCAIS]
// =========================================================================

/**
 * Gera a URL canônica da oferta diretamente para o portal da Superbid
 * com base no ID e no slug tratado da descrição do produto.
 */
const getSuperbidUrl = (offerData: any) => {
  if (!offerData?.offer_id) return "#";
  const slug = (offerData.offer_description || "")
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `https://www.superbid.net/oferta/${slug}-${offerData.offer_id}`;
};

/**
 * Formata datas brutas de término para o padrão visual curto exigido: "DD/MM - HH:mm"
 */
const formatEventDate = (dateString?: string) => {
  if (!dateString) return "—";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "—";
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}/${month} - ${hours}:${minutes}`;
  } catch {
    return "—";
  }
};

// =========================================================================
// [COMPONENTE SECUNDÁRIO]: ModalityTag (O "Semáforo" de Modalidades)
// =========================================================================
function ModalityTag({ modalityDesc, endDateStr, acceptProposal, currentBidIncrement, modalityId, isShopping }: any) {
  const formattedDate = formatEventDate(endDateStr);
  
  // 1. REGRA DE SHOPPING (isShopping: true)
  if (isShopping === true) {
    // Compre Já estrito: Aceita proposta E o incremento é EXATAMENTE 0 (não pode ser null)
    if (acceptProposal && (currentBidIncrement === 0 || currentBidIncrement === null)) {
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-100 text-[#003B73]">
          <Tag size={13} className="text-slate-700" strokeWidth={2.5} />
          <span className="tracking-tight">Compre já</span>
        </div>
      );
    }
    
    // MERCADO BALCÃO: Qualquer outro caso de shopping (se for null, vazio, ou > 0)
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-100 text-[#003B73]">
        <Handshake size={13} className="text-slate-700" strokeWidth={2.5} />
        <span className="tracking-tight">Mercado Balcão</span>
      </div>
    );
  }

  // 2. TOMADA DE PREÇO
  if (modalityId === 5 || modalityDesc === "Tomada de preço") {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-100 text-[#003B73]">
        <Mail size={13} className="text-slate-700" strokeWidth={2.5} />
        <span className="tracking-tight">Tomada de preço</span>
      </div>
    );
  }

  // 3. LEILÃO PADRÃO
  if (formattedDate === "—") return <div />;
  
  return (
    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-orange-100 text-[#003B73]">
      <Gavel size={13} className="text-slate-700" strokeWidth={2.5} />
      <span className="tracking-tight">{formattedDate}</span>
    </div>
  );
}

// =========================================================================
// [COMPONENTE PRINCIPAL]: CardOfferV
// =========================================================================
export function CardOfferV({ item, isCartao, loading, onSimulate }: CardOfferVProps) {
  // Extração defensiva do contrato normalizado vindo do BFF
  const offerData = item.offer || {};
  const eventData = item.event || {};
  const sellerData = item.seller || {};

  // Estado local para controle do carrossel de fotos independente por card
  const [photoIndex, setPhotoIndex] = useState(0);
  const [imageError, setImageError] = useState(false);

  // Engine de tratamento e ordenação de mídias/fotos
  const rawPhotos = offerData.photos || [];
  const sortedPhotos = [...rawPhotos]
    .sort((a: any, b: any) => (a.highlight === b.highlight ? 0 : a.highlight ? -1 : 1))
    .map((p: any) => p.link);

  const mainPhoto = sortedPhotos.length > 0 ? sortedPhotos[photoIndex % sortedPhotos.length] : "https://placehold.co/300x200?text=Sem+Foto";
  const hasError = imageError || !sortedPhotos.length;

  const handleNextPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPhotoIndex((prev) => (prev + 1) % sortedPhotos.length);
  };

  const handlePrevPhoto = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPhotoIndex((prev) => (prev - 1 + sortedPhotos.length) % sortedPhotos.length);
  };

  // Formatações finais de exibição visual
  const valueFormatted = (offerData.offer_value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  const locationDisplay = [offerData.location?.city, offerData.location?.state].filter(Boolean).join(" - ") || "Brasil";
  const offerDesc = offerData.offer_description || "Produto sem descrição";
  const sellerName = sellerData.trade_name;

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between group">
      <div className="flex flex-col h-full">
        
        {/* ÁREA DE MÍDIA (CARROSSEL) */}
        <div className="relative h-44 w-full bg-black overflow-hidden shrink-0">
          {hasError ? (
            <div className="absolute inset-0 bg-[#B300FF] flex items-center justify-center text-white text-xs font-bold">Sem foto</div>
          ) : (
            <img src={mainPhoto} alt={offerDesc} className="h-full w-full object-cover transition-opacity duration-300" onError={() => setImageError(true)} />
          )}
          
          <span className="absolute bottom-2 left-2 bg-black/75 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-md z-10 shadow">
            Lote #{offerData.lot_number || offerData.offer_id}
          </span>
          
          {!hasError && sortedPhotos.length > 1 && (
            <>
              <button onClick={handlePrevPhoto} className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-full transition-all opacity-0 group-hover:opacity-100 cursor-pointer border-none z-20">
                <ChevronLeft size={16} />
              </button>
              <button onClick={handleNextPhoto} className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-full transition-all opacity-0 group-hover:opacity-100 cursor-pointer border-none z-20">
                <ChevronRight size={16} />
              </button>
            </>
          )}
        </div>

        {/* METADADOS E INFORMAÇÕES DO PRODUTO */}
        <div className="p-4 flex flex-col flex-grow justify-between space-y-3">
          <div className="space-y-3">
            
            {/* LINHA SUPERIOR: TAG DE MODALIDADE (SEMÁFORO) + LINK CANÔNICO */}
            <div className="flex items-center justify-between w-full">
              <ModalityTag 
                modalityDesc={eventData.modality_desc} 
                endDateStr={eventData.event_end_date}
                acceptProposal={offerData.acceptProposal}
                currentBidIncrement={offerData.currentBidIncrement}
                modalityId={eventData.modality_id} // Adiciona isso
                isShopping={offerData.is_shopping}  // Adiciona isso
              />
              <a href={getSuperbidUrl(offerData)} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-[#B300FF] transition-colors p-1 ml-auto" onClick={(e) => e.stopPropagation()}>
                <ExternalLink size={16} />
              </a>
            </div>

            <h3 className="font-bold text-sm text-foreground line-clamp-2 uppercase min-h-[2.5rem]">
              {offerDesc}
            </h3>
            
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-xs text-slate-500 truncate">
                <MapPin size={12} className="shrink-0" />
                <span className="truncate">{locationDisplay}</span>
              </div>
              <div className="text-xs text-muted-foreground truncate min-h-[1rem]">
                {sellerName || "\u00A0"}
              </div>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 mt-auto">
            <div className="text-lg font-extrabold text-foreground">
              R$ {valueFormatted}
            </div>
          </div>
        </div>
      </div>

      {/* BOTÃO DE CHAMADA PARA AÇÃO (CTA) */}
      <div className="p-4 pt-0">
        <Button onClick={() => onSimulate(item)} disabled={loading} variant="outline" className="w-full rounded-md shadow-xs bg-white text-[#B300FF] border border-[#B300FF]/40 hover:bg-purple-50 font-medium text-xs py-2 cursor-pointer transition-colors">
          {isCartao ? "Simular parcelamento" : "Simular financiamento"}
        </Button>
      </div>
    </div>
  );
}