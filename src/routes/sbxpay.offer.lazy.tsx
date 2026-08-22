/**
 * @fileoverview 🛍️ Componente: OfferDetailsSBXPAY (Rota: /sbxpay/offer)
 * @path src/routes/sbxpay/offer.tsx
 *
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-TRUST & CART PRESERVATION (OLAP)
 * =========================================================================
 * Vitrine central de ofertas (Prateleira) atuando como "Mid-Funnel". 
 * Integrada diretamente ao BFF `sbx-offer-query` para performance máxima.
 *
 * [MECÂNICA ARQUITETURAL]:
 * 1. {BFF Bypass}: A vitrine não faz `GET` no Orquestrador. Ela consome dados
 *    diretamente do BFF de Ofertas para listagem. O Orquestrador só é invocado 
 *    na intenção de clique (POST).
 * 2. {Cart Preservation (OLAP)}: O método `handleSimulacao` atua como uma corrida 
 *    de bastão. Ele extrai o `visit_id` (sessão) e o `visit_update_id` (cursor 
 *    desta tela na linha do tempo) da URL e os injeta no payload `CONSULT`. 
 *    Isso garante que o backend registre que o usuário saiu "da Vitrine e foi
 *    para o Produto X", fechando a telemetria do funil sem criar visitas órfãs.
 * 3. {Zero-Trust Thin Payload}: O Front-end não manipula e nem envia dados 
 *    pessoais (PII) do usuário na transição. A validação de identidade é delegada 
 *    ao Orquestrador (Edge) através do JWT.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate, createLazyFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, SlidersHorizontal, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { PanelHeader } from "@/features/financial-hub/components/layout/PanelHeader";

import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
// Removida a importação inútil do UserDataContext
import { fetchOffersQuery } from "@/services/offer";
import { logSystemError } from "@/services/systemNotification";
import { getDefaultSbxEnvironment, clearSession } from "@/services/session";
import { callOrchestrator } from "@/features/financial-hub/core/services/gateway";
import { CardOfferV } from "@/features/financial-hub/components/shared/renderes/CardOfferV";
import { CardOfferVSkeleton } from "@/features/financial-hub/components/shared/renderes/CardOfferVSkeleton";

// =========================================================================
// [TAXONOMIA VISUAL]: Dicionário Estático de Ícones de Categorias
// =========================================================================
const SUPERBID_CATEGORY_FILTERS = [
  { name: "Todas", filterValue: null, active: true },
  { name: "Imóveis", filterValue: "imoveis", active: true },
  { name: "Carros & Motos", filterValue: "carros-motos", active: true },
  { name: "Caminhões & Ônibus", filterValue: "caminhoes-onibus", active: true },
  { name: "Máquinas Pesadas & Agrícolas", filterValue: "maquinas-pesadas-agricolas", active: true },
  { name: "Movimentação & Transporte", filterValue: "movimentacao-transporte", active: true },
  { name: "Industrial, Máquinas & Equipamentos", filterValue: "industrial-maquinas-equipamentos", active: true },
  { name: "Animais", filterValue: "animais", active: false },
  { name: "Tecnologia", filterValue: "tecnologia", active: true },
  { name: "Móveis e Decoração", filterValue: "moveis-e-decoracao", active: true },
  { name: "Bolsas, Canetas, Joias", filterValue: "bolsas-canetas-joias-e-relogios", active: true },
  { name: "Sucatas , Materiais & Resíduos", filterValue: "sucatas-materiais-residuos", active: true },
  { name: "Eletrodomésticos", filterValue: "eletrodomesticos", active: true },
  { name: "Materiais Para Construção Civil", filterValue: "materiais-para-construcao-civil", active: true },
];

const FILTER_OPTIONS = [
  { label: "Todas", value: "" },
  ...SUPERBID_CATEGORY_FILTERS.filter((c) => c.active && c.filterValue).map((c) => ({
    label: c.name,
    value: c.filterValue || "",
  })),
];

const SORT_OPTIONS = [
  { label: "Relevância", value: "relevancia" },
  { label: "Maior Valor", value: "maior_valor" },
  { label: "Menor Valor", value: "menor_valor" },
  { label: "Mais Visitados", value: "mais_visitados" },
  { label: "Encerramento", value: "encerramento_proximo" },
];

// =========================================================================
// [CONFIGURAÇÃO DE FLUXOS]
// =========================================================================
const FLOW_MAP: Record<string, { product_id: number }> = {
  Carros: { product_id: 2 },
  Caminhões: { product_id: 5 },
  Imóveis: { product_id: 1 },
  Cartão: { product_id: 8 },
  MaquinasAgricolas: { product_id: 3 },
  MaquinasAmarelas: { product_id: 4 },
};

function OfferDetailsSBXPage() {
  const params = new URLSearchParams(window.location.search);
  const flow = params.get("flow") || "Carros";
  return <OfferDetailsSBXPAY flowKey={flow} />;
}

export const Route = createLazyFileRoute("/sbxpay/offer")({
  component: OfferDetailsSBXPage,
  pendingComponent: OfferSkeletonLoader,
});

// =========================================================================
// [COMPONENTE DROPDOWN DESKTOP]
// =========================================================================
function DesktopDropdown({ icon: Icon, label, value, options, onChange, align = "left" }: any) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayLabel = options.find((o: any) => o.value === value)?.label || label;

  return (
    <div className="relative" ref={ref}>
      <div
        className="flex items-center justify-between gap-2 px-4 py-2.5 border border-[#B300FF] rounded-full cursor-pointer bg-white text-[#B300FF] min-w-[170px] shadow-sm transition-all hover:bg-purple-50/50"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon size={14} />}
          <span className="text-xs font-semibold select-none">{displayLabel}</span>
        </div>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </div>
      {isOpen && (
        <div
          className={`absolute top-[calc(100%+8px)] ${align === "right" ? "right-0" : "left-0"} min-w-full w-max bg-white border border-slate-200 rounded-lg shadow-xl py-2 z-50 overflow-hidden`}
        >
          {options.map((opt: any) => (
            <div
              key={opt.value}
              className={`px-4 py-2.5 text-sm cursor-pointer transition-colors ${value === opt.value ? "bg-purple-50 text-[#B300FF] font-bold" : "text-slate-700 hover:bg-slate-50"}`}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 1. Esqueleto de carregamento da página de oferta usando o card fantasma
function OfferSkeletonLoader() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-28 space-y-8">
      {/* Header da Página */}
      <div className="flex justify-between items-center animate-pulse">
        <div className="h-8 w-48 bg-slate-200 rounded-lg"></div>
        <div className="h-8 w-28 bg-slate-200 rounded-lg"></div>
      </div>

      {/* Grid preenchido com os cards fantasmas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 pt-6">
        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
          <CardOfferVSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

// =========================================================================
// [COMPONENTE PRINCIPAL]: OfferDetailsSBXPAY
// =========================================================================
export function OfferDetailsSBXPAY({ flowKey }: { flowKey?: string }) {
  const { userId, sessionToken } = useFinancialAuth();
  const navigate = useNavigate();
  const searchParams = Route.useSearch() as any;

  const currentFlow = FLOW_MAP[flowKey || "Carros"] || FLOW_MAP["Carros"];
  const isCartao = currentFlow.product_id === 8;
  
  // ✨ Remoção arquitetural: Contexto não é lido pois a Vitrine não consome dados do usuário

  const isMobile = useIsMobile();
  const isMobileRef = useRef(isMobile);
  isMobileRef.current = isMobile;

  const [loading, setLoading] = useState(true);
  const [simulatingIndex, setSimulatingIndex] = useState<number | null>(null);
  const [offersList, setOffersList] = useState<any[]>([]);
  const [totalElements, setTotalElements] = useState<number>(0);
  const [fetchError, setFetchError] = useState<"TECHNICAL_INSTABILITY" | null>(null);
  const [countdown, setCountdown] = useState(5);

  const [pageNumber, setPageNumber] = useState<number>(1);
  const pageSize = 24;

  const [currentSort, setCurrentSort] = useState<string>("relevancia");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [ambiente] = useState<"staging" | "production">(() => getDefaultSbxEnvironment());

  // Mobile Menu States
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const dynamicReturnUri = searchParams.redirect_uri || searchParams.return_uri || "/sbxpay";

  const totalPages = Math.max(Math.ceil(totalElements / pageSize), 1);

  const mainPaddingTop = isMobile && isCartao ? "pt-[136px]" : "pt-[80px]";

  // Troca de ordenação/categoria: reseta lista e página no próprio handler
  const handleSortChange = (value: string) => {
    setCurrentSort(value);
    setOffersList([]);
    setPageNumber(1);
  };
  const handleCategoryChange = (value: string) => {
    setSelectedCategory(value);
    setOffersList([]);
    setPageNumber(1);
  };

  // Fecha menus caso o usuário clique fora no mobile
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setFilterMenuOpen(false);
        setSortMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Garante que a página nunca inicie travada no loading de submissão ao montar ou voltar pelo histórico
  useEffect(() => {
    setSimulatingIndex(null);

    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted) {
        setSimulatingIndex(null);
        setLoading(false);
      }
    };

    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, []);

  // Busca os dados da listagem (BFF Integration)
  useEffect(() => {
    if (!sessionToken) {
      setLoading(false); // 👈 Destrava o carregamento se o token estiver hidratando
      return;
    }
    const controller = new AbortController();

    const loadOffers = async () => {
      setLoading(true);
      setFetchError(null);

      try {
        const data = await fetchOffersQuery(
          {
            productId: currentFlow.product_id,
            sort: currentSort,
            pageNumber,
            pageSize,
            categoryFilter: selectedCategory || null,
          },
          { signal: controller.signal },
        );

        if (!controller.signal.aborted) {
          const newOffers = data?.offers || [];
          // Mobile: scroll infinito acumula. Desktop: paginação clássica substitui a lista.
          setOffersList((prev) => (pageNumber === 1 || !isMobileRef.current ? newOffers : [...prev, ...newOffers]));
          setTotalElements(data?.total || 0);
          if (pageNumber === 1 || !isMobileRef.current) window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } catch (error: any) {
        if (error.name === "AbortError" || controller.signal.aborted) return;
        logSystemError({
          context: "sbxpay/offer.tsx",
          subject: `Erro na Busca de Ofertas (${flowKey})`,
          message: error?.message || "Erro desconhecido",
          payload: { user_id: userId || "UNAUTHENTICATED", flow_key: flowKey },
        });
        setFetchError("TECHNICAL_INSTABILITY");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    loadOffers();
    return () => controller.abort();
  }, [currentFlow.product_id, currentSort, pageNumber, sessionToken, ambiente, flowKey, selectedCategory]);

  // Fallback e Auto-Redirect em caso de erro crítico
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    if (fetchError) {
      if (countdown > 0) {
        timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
      } else {
        navigate({ to: dynamicReturnUri as any });
      }
    }
    return () => clearTimeout(timer);
  }, [fetchError, countdown, dynamicReturnUri, navigate]);

  // Scroll infinito: APENAS mobile (no desktop usamos paginação clássica)
  useEffect(() => {
    if (!isMobile) return;
    const handleScroll = () => {
      if (loading || pageNumber >= totalPages) return;
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 400) {
        setPageNumber((prev) => prev + 1);
      }
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [isMobile, loading, pageNumber, totalPages]);

  // Delegação de Negócio via Gateway
  const handleSimulacao = async (offerItem: any, idx: number) => {
    setSimulatingIndex(idx);

    try {
      const currentHref = window.location.href;

      // 1. Extraia o visit_id e visit_update_id da URL no instante do clique
      const urlParams = new URLSearchParams(window.location.search);
      const cartVisitId = urlParams.get("visit_id");
      const cartVisitUpdateId = urlParams.get("visit_update_id"); // ✨ Cursor da Vitrine (Mantém a linha OLAP)

      // Extrai o offer_id do item da oferta selecionada
      const rawOffer = offerItem?.offer || offerItem;
      const targetOfferId = rawOffer?.offer_id || rawOffer?.id;

      // 2. Montagem do payload seguro (THIN PAYLOAD)
      const payload = {
        action: "CONSULT",
        environment: ambiente,
        ...(currentFlow.product_id && { product_id: String(currentFlow.product_id) }),
        
        // ✨ [CART PRESERVATION]: Mantém a mesma visita e update ao trocar de oferta.
        ...(cartVisitId ? { visit_id: cartVisitId } : {}),
        ...(cartVisitUpdateId ? { visit_update_id: cartVisitUpdateId } : {}),
        
        // ✨ CORREÇÃO: Garante que o offer_id vá na raiz para o ThinPayload do Orquestrador
        ...(targetOfferId ? { offer_id: String(targetOfferId) } : {}),
        
        offer: rawOffer,
        seller: offerItem?.seller || {},
        event: offerItem?.event || {},
        manager: offerItem?.manager || {},
        origin_url: currentHref,
        
        // ✨ Remoção Arquitetural: `entity` não é mais enviada. Zero-Trust no Edge!
        interaction_context: {
          origin_url: currentHref,
          utm_source: "offer_list",
          utm_medium: "referral",
          utm_campaign: `flow_${flowKey?.toLowerCase()}`,
        },
      };

      const response = await callOrchestrator(payload, "POST");

      if (response?.url) {
        if (response.url.startsWith("http")) {
          window.location.href = response.url;
        } else {
          // Extraindo parâmetros da URL gerada pelo orquestrador para injetar via state do TanStack Router
          const urlObj = new URL(response.url, window.location.origin);
          navigate({ 
            to: urlObj.pathname as any,
            search: Object.fromEntries(urlObj.searchParams.entries()) as any,
          });
        }
      } else {
        throw new Error("URL de redirecionamento ausente.");
      }
    } catch (error: any) {
      if (error?.code === "SESSION_EXPIRED" || error?.status === 401 || error?.code === 401) {
        clearSession();
        const currentPath = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/sbxpay";
        window.location.href = error?.fallback_url || `/accounts/signin?redirect_uri=${encodeURIComponent(currentPath)}`;
        return;
      }
      setSimulatingIndex(null);
    }
  };

  // =========================================================================
  // RENDERIZAÇÃO: Estado Crítico (Catastrófico)
  // =========================================================================
  if (fetchError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6 text-center font-['Inter']">
        <p className="text-slate-800 font-bold text-lg mb-2">Ops! Falha ao carregar ofertas.</p>
        <p className="text-slate-500 font-medium text-sm mb-4">Redirecionando em {countdown}s...</p>
        <button
          onClick={() => navigate({ to: dynamicReturnUri as any })}
          className="flex items-center text-[#B400FF] font-semibold text-sm cursor-pointer bg-transparent border-none"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Retornar agora
        </button>
      </div>
    );
  }

  const formattedTotal = totalElements.toLocaleString("pt-BR");

  return (
    <div className="min-h-screen bg-slate-50 font-['Inter'] pb-20 relative">

      {/* 1. HEADER */}
      <PanelHeader showNav={false} showAuth={false} />

      {/* 2. BARRA FLUTUANTE MOBILE FIXA (Sempre visível) */}
      <div
        className="md:hidden fixed top-[60px] left-0 w-full h-[48px] bg-white border-b border-slate-200 shadow-sm z-40"
        ref={mobileMenuRef}
      >
        <div className="flex items-center w-full h-full divide-x divide-slate-200">
          {/* 2A. Filtrar (ESQUERDA - APENAS PARA CARTÃO) */}
          {isCartao && (
            <div
              className="flex-1 h-full flex items-center justify-center gap-2 cursor-pointer text-[#B300FF]"
              onClick={() => {
                setFilterMenuOpen(!filterMenuOpen);
                setSortMenuOpen(false);
              }}
            >
              <SlidersHorizontal size={16} />
              <span className="text-sm font-semibold select-none">Filtrar</span>
            </div>
          )}

          {/* 2B. Ordenar (DIREITA - VISÍVEL PARA TODOS) */}
          <div
            className="flex-1 h-full flex items-center justify-center gap-2 cursor-pointer text-[#B300FF]"
            onClick={() => {
              setSortMenuOpen(!sortMenuOpen);
              setFilterMenuOpen(false);
            }}
          >
            <ArrowUpDown size={16} />
            <span className="text-sm font-semibold select-none">Ordenar</span>
          </div>
        </div>

        {/* Menus Dropdown (Mobile) */}
        {isCartao && filterMenuOpen && (
          <div className="absolute top-[48px] left-0 w-full bg-white shadow-xl border-b border-slate-200 max-h-[75vh] overflow-y-auto z-40">
            {FILTER_OPTIONS.map((opt, idx) => (
              <div
                key={idx}
                className={`px-6 py-3.5 text-sm border-b border-slate-50 last:border-0 cursor-pointer ${selectedCategory === opt.value ? "text-[#B300FF] bg-purple-50/50 font-bold" : "text-slate-700 active:bg-slate-100"}`}
                onClick={() => {
                  handleCategoryChange(opt.value);
                  setFilterMenuOpen(false);
                }}
              >
                {opt.label}
              </div>
            ))}
          </div>
        )}

        {sortMenuOpen && (
          <div className="absolute top-[48px] left-0 w-full bg-white shadow-xl border-b border-slate-200 max-h-[60vh] overflow-y-auto z-40">
            {SORT_OPTIONS.map((opt, idx) => (
              <div
                key={idx}
                className={`px-6 py-4 text-sm border-b border-slate-50 last:border-0 cursor-pointer ${currentSort === opt.value ? "text-[#B300FF] bg-purple-50/50 font-bold" : "text-slate-700 active:bg-slate-100"}`}
                onClick={() => {
                  handleSortChange(opt.value);
                  setSortMenuOpen(false);
                }}
              >
                {opt.label}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ÁREA ÚTIL DE CONTEÚDO */}
      <main className={`max-w-7xl mx-auto px-4 ${mainPaddingTop} pb-8 font-['Inter']`}>
        {/* DESKTOP BARRA DE FILTRO E ORDENAÇÃO (Sempre visível) */}
        <div className="hidden md:flex w-full items-center justify-between gap-4 pt-2 pb-6">
          <div className="flex items-center">
            <p className="text-sm font-normal text-slate-800 m-0">{formattedTotal} anúncios</p>
          </div>

          <div className="flex items-center gap-3">
            {/* FILTRAR APENAS SE FOR CARTÃO */}
            {isCartao && (
              <DesktopDropdown
                icon={SlidersHorizontal}
                label="Filtrar"
                value={selectedCategory}
                options={FILTER_OPTIONS}
                onChange={handleCategoryChange}
                align="left"
              />
            )}

            {/* ORDENAR VISÍVEL PARA TODOS */}
            <DesktopDropdown
              icon={ArrowUpDown}
              label="Ordenar"
              value={currentSort}
              options={SORT_OPTIONS}
              onChange={handleSortChange}
              align="right"
            />
          </div>
        </div>

        {/* MOBILE: QUANTIDADE DE ANÚNCIOS (Esconde no desktop pois já está na barra acima) */}
        <div className="md:hidden mb-4">
          <p className="text-sm font-normal text-slate-800 m-0">{formattedTotal} anúncios</p>
        </div>

        {/* ENGINE DE CARDS UTILIZANDO OS COMPONENTES CardOfferV E CardOfferVScheleton*/}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <CardOfferVSkeleton key={i} />
            ))}
          </div>
        ) : offersList.length === 0 ? (
          <div className="bg-white rounded-lg p-12 text-center border border-slate-200 shadow-xs my-12">
            <p className="text-slate-600 font-medium text-sm">
              Nenhuma oferta encontrada para esta categoria no momento.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in duration-500">
            {offersList.map((item, idx) => (
              <CardOfferV
                key={item?.offer?.offer_id || idx}
                item={item}
                isCartao={isCartao}
                loading={simulatingIndex === idx}
                disabled={simulatingIndex !== null}
                onSimulate={() => handleSimulacao(item, idx)}
              />
            ))}
          </div>
        )}

        {/* RODAPÉ: paginação só no desktop; mobile usa scroll infinito */}
        {totalElements > 0 && (
          <>
            {totalPages > 1 && (
              <div className="hidden md:flex items-center justify-center gap-3 py-8 mt-6">
                <Button
                  variant="outline"
                  disabled={pageNumber === 1 || loading}
                  onClick={() => setPageNumber((p) => Math.max(p - 1, 1))}
                  className="rounded-xl border-slate-300 text-xs font-semibold"
                >
                  ← Anterior
                </Button>
                <span className="text-xs text-slate-600 px-2 font-medium">
                  Página {pageNumber} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  disabled={pageNumber >= totalPages || loading}
                  onClick={() => setPageNumber((p) => Math.min(p + 1, totalPages))}
                  className="rounded-xl border-slate-300 text-xs font-semibold"
                >
                  Próxima →
                </Button>
              </div>
            )}

            <div className="md:hidden py-8 text-center">
              {loading && pageNumber > 1 && (
                <span className="text-xs text-slate-500 font-medium">Carregando mais ofertas...</span>
              )}
              {!loading && pageNumber >= totalPages && (
                <span className="text-xs text-slate-400 font-medium">Você viu todas as ofertas.</span>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}