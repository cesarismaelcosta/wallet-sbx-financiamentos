/**
 * @fileoverview Componente de apresentação: CardOfferV (Vertical)
 * @path src/features/financial-hub/components/shared/renderers/CardOfferV.tsx
 *
 * =========================================================================
 * [DOCUMENTAÇÃO DO COMPONENTE & REGRAS DE NEGÓCIO]
 * =========================================================================
 * Este componente renderiza a vitrine individual de uma oferta (versão vertical).
 * Ele gerencia o estado local do carrossel de imagens e implementa as 
 * seguintes regras vitais de negócio baseadas na API da Superbid:
 * 
 * REGRAS DO SEMÁFORO DE MODALIDADE (ModalityTag):
 * 1. MERCADO BALCÃO / COMPRE JÁ (offerTypeId 8, 9, 10 e isShopping true):
 *    - Visual: Fundo rosado, ícone de aperto de mão/etiqueta.
 * 2. TOMADA DE PREÇO (modalityId 5):
 *    - Visual: Fundo azul gelo, ícone de envelope e "Tomada de preço".
 * 3. LEILÃO TRADICIONAL (offerTypeId 1):
 *    - Visual: Fundo laranja claro, ícone de martelo e data de encerramento.
 * 
 * REGRAS DE PRECIFICAÇÃO E MÉTRICA:
 * 1. Rótulo Dinâmico: 
 *    - Leilão: "Lance atual:"
 *    - Tomada de Preço: "VALOR DE REFERÊNCIA:"
 *    - Mercado Balcão/Shopping: "Valor de venda por unidade"
 * 2. Exibição de Métrica (/UN, /JG, /TON):
 *    - SÓ EXIBE em vendas de Varejo/Balcão.
 *    - OCULTA OBRIGATORIAMENTE em Leilão e Tomada de Preço (pois o lance/referência é no lote).
 */

import { useState } from "react";
import { MapPin, ChevronLeft, ChevronRight, ExternalLink, Gavel, Mail, Tag, Handshake, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

// =========================================================================
// [INTERFACES]
// =========================================================================
interface CardOfferVProps {
  item: any; // Objeto normalizado contendo offer, event, seller (Contrato BFF)
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
function ModalityTag({ modalityDesc, endDateStr, offerTypeId, modalityId, isShopping }: any) {
  const formattedDate = formatEventDate(endDateStr);
  
  // 1. REGRA DE SHOPPING (Mercado Balcão / Compre Já)
  if (isShopping === true) {
    // Tipo 10: Mercado Balcão ou Compre Já combinados
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
    
    // Tipo 8: Apenas Compre Já
    if (offerTypeId === 8) {
      return (
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-100 text-[#003B73]">
          <Tag size={13} className="text-slate-700" strokeWidth={2.5} />
          <span className="tracking-tight">Compre já</span>
        </div>
      );
    }
    
    // Tipo 9: Apenas Mercado Balcão
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

  // 3. LEILÃO PADRÃO (Exibe a data de encerramento)
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

  const city = offerData.location?.city || "";
  const state = offerData.location?.state || "";

  // city.includes(" - ") verifica se o estado já está na cidade (evita redundância).
  const locationDisplay = city.includes(" - ") ? city : [city, state].filter(Boolean).join(" - ");

  const offerDesc = offerData.offer_description || "Produto sem descrição";
  const sellerName = sellerData.trade_name;

  // =========================================================================
  // REGRAS DE EXIBIÇÃO: RÓTULO DE PREÇO E UNIDADE DE MEDIDA
  // =========================================================================
  
  // Identificadores de modalidade baseados no payload
  const isLeilao = offerData.offer_type_id === 1;
  const isTomadaDePreco = eventData.modality_id === 5 && offerData.is_shopping === false;

  // Lógica 1: Define o texto que aparece acima do preço
  let priceLabel = "Valor de venda:"; // Fallback
  if (isLeilao) {
    priceLabel = "Lance atual:"; 
  } else if (isTomadaDePreco) {
    priceLabel = "Valor de referência:"; 
  } else if (offerData.is_shopping === true) {
    priceLabel = "Valor de venda por unidade:"; 
  }

  // Lógica 2: Pega o preço formatado entregue pelo BFF (ex: "R$ 50.000,00")
  const priceFormatted = offerData.price_formatted || `R$ ${(offerData.offer_value || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;

  // Lógica 3: Regra restrita de exibição da Métrica (Sufixo /UN, /JG)
  // SÓ exibe se NÃO for leilão E NÃO for tomada de preço, E SE a métrica existir.
  const showMetric = !isLeilao && !isTomadaDePreco && !!offerData.system_metric;

  return (
    <div className="rounded-lg border border-slate-200 bg-white overflow-hidden shadow-xs hover:shadow-md transition-shadow flex flex-col justify-between group">
      <div className="flex flex-col h-full">
        
        {/* ÁREA DE MÍDIA (CARROSSEL) */}
        <div className="relative h-44 w-full bg-slate-100 overflow-hidden shrink-0 rounded-t-lg">
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
              <button onClick={handlePrevPhoto} className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 backdrop-blur-xs text-white p-1.5 rounded-full transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer border-none z-20">
                <ChevronLeft size={16} />
              </button>
              <button onClick={handleNextPhoto} className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 backdrop-blur-xs text-white p-1.5 rounded-full transition-all opacity-100 sm:opacity-0 sm:group-hover:opacity-100 cursor-pointer border-none z-20">
                <ChevronRight size={16} />
              </button>
            </>
          )}
        </div>

        {/* Linha divisória */}
        <div className="h-px w-full bg-slate-100" />

        {/* METADADOS E INFORMAÇÕES DO PRODUTO */}
        <div className="p-4 flex flex-col flex-grow justify-between space-y-3">
          <div className="space-y-3">
            
            {/* LINHA SUPERIOR: TAG DE MODALIDADE (SEMÁFORO) + LINK CANÔNICO */}
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

          {/* ÁREA DE PREÇO DINÂMICA (Com a fonte e cor ajustadas baseadas no print) */}
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

      {/* BOTÃO DE CHAMADA PARA AÇÃO (CTA) */}
      <div className="p-4 pt-0">
        <Button onClick={() => onSimulate(item)} disabled={loading} variant="outline" className="w-full rounded-md shadow-xs bg-white text-[#B300FF] border border-[#B300FF]/40 hover:bg-purple-50 font-medium text-xs py-2 cursor-pointer transition-colors">
          {isCartao ? "Simular parcelamento" : "Simular financiamento"}
        </Button>
      </div>
    </div>
  );
}