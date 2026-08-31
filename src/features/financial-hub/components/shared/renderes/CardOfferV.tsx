/**
 * @fileoverview Componente de apresentação: CardOfferV (Vertical)
 * @path src/features/financial-hub/components/shared/renderers/CardOfferV.tsx
 * @version 2.1.0
 *
 * ============================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: SWIPE & IMAGE ERROR HANDLING
 * ============================================================================
 *
 * [EVOLUÇÃO v2.1.0 - TOUCH SWIPE E PREVENÇÃO DE FALSOS POSITIVOS]:
 * 1. {Ref-based Swipe}: Substituição de `useState` por `useRef` (touchStartX/EndX)
 *    durante o evento de `onTouchMove`. Isso evita a re-renderização frenética
 *    a 60fps que abortava o I/O da tag <img> e causava falsos `onError`.
 * 2. {Unbreakable Arrows}: Os controles do carrossel (< e >) foram desvinculados
 *    do estado genérico de erro (`!hasError`). Se há >1 foto, as setas
 *    aparecem sempre, garantindo a navegabilidade mesmo se uma URL quebrar.
 * 3. {Error Reset}: O estado `imageError` é resetado para `false` a cada
 *    mudança de slide, permitindo que a próxima imagem tente renderizar limpa.
 * 4. {DOM Keying}: Adição do atributo `key={mainPhoto}` na <img> para forçar
 *    o reconciler do React a destruir e recriar a tag em cada troca de foto,
 *    evitando travamento do browser em imagens corrompidas.
 * 5. {Pan Lock}: Adição da classe Tailwind `touch-pan-y` no container do carrossel
 *    para evitar que a página inteira se mova indesejadamente durante o arrasto.
 *
 * REGRAS DO SEMÁFORO DE MODALIDADE (ModalityTag):
 * - MERCADO BALCÃO / COMPRE JÁ (offerTypeId 8, 9, 10 + isShopping): Fundo rosado.
 * - TOMADA DE PREÇO (modalityId 5): Fundo azul gelo.
 * - LEILÃO TRADICIONAL (offerTypeId 1): Fundo laranja claro + Data Fim.
 *
 * @author Cesar Ismael Pereira da Costa
 * @author Gemini Pro
 */

import React, { useState, useRef } from "react";
import { MapPin, ChevronLeft, ChevronRight, ExternalLink, Gavel, Mail, Tag, Handshake, Plus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// =========================================================================
// [INTERFACES E HELPERS]
// =========================================================================
interface CardOfferVProps {
  item: any;
  isCartao: boolean;
  loading: boolean;
  disabled?: boolean;
  onSimulate: (item: any) => void;
}

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
// [COMPONENTE SECUNDÁRIO]: ModalityTag
// =========================================================================
function ModalityTag({ modalityDesc, endDateStr, offerTypeId, modalityId, isShopping }: any) {
  const formattedDate = formatEventDate(endDateStr);
  
  if (isShopping === true) {
    if (offerTypeId === 10) {
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-100 text-[#003B73]">
          <Handshake size={13} className="text-slate-700" strokeWidth={2.5} />
          <Plus size={10} className="text-slate-700" strokeWidth={3} />
          <Tag size={13} className="text-slate-700" strokeWidth={2.5} />
          <span className="tracking-tight">Mercado Balcão ou Compre Já</span>
        </div>
      );
    }
    if (offerTypeId === 8) {
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-100 text-[#003B73]">
          <Tag size={13} className="text-slate-700" strokeWidth={2.5} />
          <span className="tracking-tight">Compre já</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-100 text-[#003B73]">
        <Handshake size={13} className="text-slate-700" strokeWidth={2.5} />
        <span className="tracking-tight">Mercado Balcão</span>
      </div>
    );
  }

  if (modalityId === 5 || modalityDesc === "Tomada de preço") {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-sky-100 text-[#003B73]">
        <Mail size={13} className="text-slate-700" strokeWidth={2.5} />
        <span className="tracking-tight">Tomada de preço</span>
      </div>
    );
  }

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
export function CardOfferV({ item, isCartao, loading, disabled, onSimulate }: CardOfferVProps) {
  const offerData = item.offer || {};
  const eventData = item.event || {};
  const sellerData = item.seller || {};

  // -------------------------------------------------------------------------
  // ESTADO LOCAL: CONTROLE DO CARROSSEL
  // -------------------------------------------------------------------------
  const [photoIndex, setPhotoIndex] = useState(0);
  const [imageError, setImageError] = useState(false);

  // ✨ [SWIPE CONTROL]: Referências para rastreio touch (Zero Re-render)
  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);

  const rawPhotos = offerData.photos || [];
  const sortedPhotos = [...rawPhotos]
    .sort((a: any, b: any) => (a.highlight === b.highlight ? 0 : a.highlight ? -1 : 1))
    .map((p: any) => p.link);

  const mainPhoto = sortedPhotos.length > 0 ? sortedPhotos[photoIndex % sortedPhotos.length] : "https://placehold.co/300x200?text=Sem+Foto";
  const hasError = imageError || !sortedPhotos.length;

  // ✨ [ACTION]: Avançar e Recuar limpando estado de erro anterior
  const handleNextPhoto = (e?: React.SyntheticEvent) => {
    if (e) e.stopPropagation();
    setPhotoIndex((prev) => (prev + 1) % sortedPhotos.length);
    setImageError(false);
  };

  const handlePrevPhoto = (e?: React.SyntheticEvent) => {
    if (e) e.stopPropagation();
    setPhotoIndex((prev) => (prev - 1 + sortedPhotos.length) % sortedPhotos.length);
    setImageError(false);
  };

  // -------------------------------------------------------------------------
  // MÓDULO DE INTERATIVIDADE TOUCH (SWIPE)
  // -------------------------------------------------------------------------
  const minSwipeDistance = 40; 

  const onTouchStart = (e: React.TouchEvent) => {
    touchEndX.current = null;
    touchStartX.current = e.targetTouches[0].clientX;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const onTouchEnd = () => {
    if (!touchStartX.current || !touchEndX.current) return;
    const distance = touchStartX.current - touchEndX.current;
    
    if (distance > minSwipeDistance) handleNextPhoto(); 
    else if (distance < -minSwipeDistance) handlePrevPhoto();
  };

  // -------------------------------------------------------------------------
  // PREPARAÇÃO DE DADOS VIZUAIS
  // -------------------------------------------------------------------------
  const city = offerData.location?.city || "";
  const state = offerData.location?.state || "";
  const locationDisplay = city.includes(" - ") ? city : [city, state].filter(Boolean).join(" - ");
  const offerDesc = offerData.offer_description || "Produto sem descrição";
  const sellerName = sellerData.trade_name;

  const isLeilao = offerData.offer_type_id === 1;
  const isTomadaDePreco = eventData.modality_id === 5 && offerData.is_shopping === false;

  let priceLabel = "Valor de venda:";
  if (isLeilao) priceLabel = "Lance atual:"; 
  else if (isTomadaDePreco) priceLabel = "Valor de referência:"; 
  else if (offerData.is_shopping === true) priceLabel = "Valor de venda por unidade:"; 

  const priceFormatted = offerData.price_formatted || `R$ ${(offerData.offer_value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
  const showMetric = !isLeilao && !isTomadaDePreco && !!offerData.system_metric;

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between group">
      <div className="flex flex-col h-full">
        
        {/* ================================================================ */}
        {/* RENDERIZAÇÃO DA MÍDIA (CARROSSEL)                                */}
        {/* ================================================================ */}
        <div 
          className="relative h-44 w-full bg-slate-100 overflow-hidden shrink-0 rounded-t-lg touch-pan-y"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {hasError ? (
            <div className="absolute inset-0 bg-[#f1f5f9] flex items-center justify-center text-slate-400 text-xs font-bold uppercase tracking-wider">
              Foto Indisponível
            </div>
          ) : (
            <img 
              key={mainPhoto} 
              src={mainPhoto} 
              alt={offerDesc} 
              loading="lazy"
              decoding="async"
              width="400"
              height="300"
              className="h-full w-full object-cover transition-opacity duration-300" 
              onError={() => setImageError(true)} 
            />
          )}
          
          <span className="absolute bottom-2 left-2 bg-black/75 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-md z-10 shadow">
            Lote #{offerData.lot_number || offerData.offer_id}
          </span>

          {item.is_simulated && (
            <span className="absolute bottom-2 right-2 bg-white text-slate-900 text-[10px] font-normal px-2.5 py-0.5 rounded-md z-10 shadow lowercase">
              com simulação
            </span>
          )}

          {/* ✨ [UNBREAKABLE ARROWS]: Mostra os botões se houver mais de uma foto, ignorando erros da imagem atual */}
          {sortedPhotos.length > 1 && (
            <>
              <button 
                onClick={handlePrevPhoto} 
                className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 backdrop-blur-xs text-white p-1.5 rounded-full transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer border-none z-20"
              >
                <ChevronLeft size={16} />
              </button>
              <button 
                onClick={handleNextPhoto} 
                className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 backdrop-blur-xs text-white p-1.5 rounded-full transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer border-none z-20"
              >
                <ChevronRight size={16} />
              </button>
            </>
          )}
        </div>

        <div className="h-px w-full bg-slate-100" />

        {/* ================================================================ */}
        {/* METADADOS E INFORMAÇÕES DA OFERTA                                */}
        {/* ================================================================ */}
        <div className="p-4 flex flex-col flex-grow justify-between space-y-3">
          <div className="space-y-3">
            <div className="flex items-center justify-between w-full">
              <ModalityTag 
                modalityDesc={eventData.modality_desc} 
                endDateStr={eventData.event_end_date}
                offerTypeId={offerData.offer_type_id}
                modalityId={eventData.modality_id}
                isShopping={offerData.is_shopping}
              />
                <a 
                  href={getSuperbidUrl(offerData)} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-[#B300FF] hover:text-[#9300cc] transition-colors p-1 ml-auto" 
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={20} />
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

          {/* ================================================================ */}
          {/* PAINEL DE PRECIFICAÇÃO                                           */}
          {/* ================================================================ */}
          <div className="pt-2 border-t border-slate-100 mt-auto">
            <div className="text-xs text-slate-400 font-normal mb-0.5">
              {priceLabel}
            </div>
            <div className="text-lg font-extrabold text-foreground">
              {priceFormatted}
              {showMetric && (
                <span className="text-xs font-normal text-slate-500 ml-1 uppercase">
                  /{offerData.system_metric}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* CALL TO ACTION (CTA)                                             */}
      {/* ================================================================ */}
      <div className="p-4 pt-0">
        <Button 
          onClick={() => onSimulate(item)} 
          disabled={loading || disabled}
          variant="outline" 
          className="w-full rounded-md shadow-xs bg-white text-[#B300FF] border border-[#B300FF]/40 hover:bg-purple-50 font-medium text-xs py-2 cursor-pointer transition-all"
        >
          {loading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Aguarde...</span>
            </div>
          ) : (
            item.is_simulated ? "Refazer Simulação" : (isCartao ? "Simular parcelamento" : "Simular financiamento")
          )}
        </Button>
      </div>
    </div>
  );
}