/**
 * @fileoverview 🛍️ Componente: OfferDetailsSBXPAY (Vitrine Central de Ofertas / Prateleira Mid-Funnel)
 * @module routes
 * @path src/routes/sbxpay/offer.tsx
 *
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-TRUST, OLAP & NEUTRAL PURITY
 * =========================================================================
 * @description Vitrine central de ofertas atuando como Mid-Funnel institucional.
 * Integrada diretamente ao BFF de queries de ofertas (`sbx-offer-query`) para performance
 * máxima, filtros dinâmicos de categorias e preservação de cursor OLAP para simulação.
 *
 * [MECÂNICA ARQUITETURAL V3 - BLINDAGEM NEUTRA AUTOCONTIDA & SBX DESIGN SYSTEM]:
 * 1. {Bypass de Tokens Globais Contaminados}: Substitui tokens genéricos do tema
 *    (`bg-background`, `border-border`, `text-foreground`, `bg-muted`, `bg-popover`)
 *    por classes utilitárias neutras puras (`bg-white`, `border-neutral-200`,
 *    `text-neutral-900`, `bg-neutral-100`, `bg-neutral-50`), assegurando pureza visual.
 * 2. {Zero-Radius Strict Governance}: Aplica cantos retos estritos (`rounded-none`)
 *    em todos os elementos interativos: dropdowns de filtro/ordenação, botões de paginação,
 *    barras móveis, contêineres de aviso e cascas estruturais.
 * 3. {Primitivo Skeleton Autocontido}: O `OfferSkeletonLoader` descarta o componente
 *    global `<Skeleton />`, utilizando marcação crua neutra (`bg-neutral-100`, `bg-neutral-200/80`)
 *    para anular vazamentos de tons lavanda/lilás herdados do root.
 * 4. {Cart & Telemetry Preservation (OLAP)}: O método `handleSimulacao` mantém
 *    o repasse estrito de `visit_id` e `visit_update_id` no payload `CONSULT`,
 *    garantindo continuidade da jornada sem duplicar instâncias de visita.
 * 5. {Zero-Latency Fast Path}: Hidrata o cofre efêmero da RAM (`setFastPathState`)
 *    antes da transição SPA pelo TanStack Router, permitindo montagem instantânea do Wizard.
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 * @version 9.2.1 (Neutral Purity & Self-Contained Shelf Architecture)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, createLazyFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ChevronDown, SlidersHorizontal, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { PanelHeader } from "@/features/financial-hub/components/layout/PanelHeader";

import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { fetchOffersQuery } from "@/services/offer";
import { logSystemError } from "@/services/systemNotification";
import { clearSession } from "@/services/session";
import { callOrchestrator } from "@/features/financial-hub/core/services/gateway";
import { setFastPathState } from "@/features/financial-hub/core/services/fastPathCache";
import { CardOfferV } from "@/features/financial-hub/components/shared/renderes/CardOfferV";
import { CardOfferVSkeleton } from "@/features/financial-hub/components/shared/renderes/CardOfferVSkeleton";

// =========================================================================
// [TAXONOMIA VISUAL]: Dicionário Estático de Categorias Oficiais
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
// [CONFIGURAÇÃO DE FLUXOS E PRODUTOS]
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
// [COMPONENTE DROPDOWN DESKTOP - SBX DESIGN SYSTEM]
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
        className="flex items-center justify-between gap-2 px-3.5 py-2 border border-neutral-200 bg-white text-neutral-900 min-w-[160px] rounded-none shadow-xs cursor-pointer transition-colors hover:bg-neutral-50"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon size={14} className="text-neutral-500" />}
          <span className="text-xs font-medium select-none">{displayLabel}</span>
        </div>
        <ChevronDown size={14} className={`text-neutral-500 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
      </div>

      {isOpen && (
        <div
          className={`absolute top-[calc(100%+4px)] ${
            align === "right" ? "right-0" : "left-0"
          } min-w-full w-max bg-white border border-neutral-200 rounded-none shadow-md py-1 z-50 overflow-hidden`}
        >
          {options.map((opt: any) => (
            <div
              key={opt.value}
              className={`px-3.5 py-2 text-xs cursor-pointer transition-colors ${
                value === opt.value
                  ? "bg-neutral-100 text-neutral-900 font-semibold"
                  : "text-neutral-700 hover:bg-neutral-50"
              }`}
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

// =========================================================================
// [ESQUELETO ESTRUTURAL DA PRATELEIRA: NEUTRAL BYPASS]
// =========================================================================
function OfferSkeletonLoader() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-28 space-y-8 animate-pulse bg-white">
      <div className="flex justify-between items-center">
        <div className="h-8 w-48 bg-neutral-200/80 rounded-none" />
        <div className="h-8 w-28 bg-neutral-100 rounded-none" />
      </div>

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
  const { userId, sessionToken, userProfile, logout } = useFinancialAuth();
  const navigate = useNavigate();
  const searchParams = Route.useSearch() as any;

  const currentFlow = FLOW_MAP[flowKey || "Carros"] || FLOW_MAP["Carros"];
  const isCartao = currentFlow.product_id === 8;

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

  // Mobile Menu States
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  const dynamicReturnUri = searchParams.redirect_uri || searchParams.return_uri || "/sbxpay";
  const totalPages = Math.max(Math.ceil(totalElements / pageSize), 1);
  const mainPaddingTop = isMobile && isCartao ? "pt-[136px]" : "pt-[80px]";

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

  useEffect(() => {
    if (!sessionToken) {
      setLoading(false);
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
  }, [currentFlow.product_id, currentSort, pageNumber, sessionToken, flowKey, selectedCategory]);

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

  // 🚀 [PERFORMANCE]: useCallback — precisa chegar estável em CardOfferV pra
  // que o React.memo do card funcione (ver CardOfferV.tsx). Sem isso, cada
  // render do pai criava uma função nova e o memo nunca "pegava".
  const handleSimulacao = useCallback(async (offerItem: any, idx: number) => {
    setSimulatingIndex(idx);

    try {
      const currentHref = window.location.href;

      const urlParams = new URLSearchParams(window.location.search);
      const cartVisitId = urlParams.get("visit_id");
      const cartVisitUpdateId = urlParams.get("visit_update_id");

      const rawOffer = offerItem?.offer || offerItem;
      const targetOfferId = rawOffer?.offer_id || rawOffer?.id;

      const payload = {
        action: "CONSULT",
        ...(currentFlow.product_id && { product_id: String(currentFlow.product_id) }),
        ...(cartVisitId ? { visit_id: cartVisitId } : {}),
        ...(cartVisitUpdateId ? { visit_update_id: cartVisitUpdateId } : {}),
        ...(targetOfferId ? { offer_id: String(targetOfferId) } : {}),
        origin_url: currentHref,
        interaction_context: {
          origin_url: currentHref,
          utm_source: "offer_list",
          utm_medium: "referral",
          utm_campaign: `flow_${flowKey?.toLowerCase()}`,
        },
      };

      const response = await callOrchestrator(payload, "POST");

      if (response?.url) {
        if (response.state) {
          setFastPathState(response.state);
        }

        const urlObj = new URL(response.url, window.location.origin);

        if (urlObj.origin === window.location.origin) {
          navigate({ 
            to: urlObj.pathname as any,
            search: Object.fromEntries(urlObj.searchParams.entries()) as any,
          });
        } else {
          window.location.href = response.url;
        }
      } else {
        throw new Error("URL de redirecionamento ausente.");
      }
    } catch (error: any) {
      if (error?.code === "SESSION_EXPIRED" || error?.status === 401 || error?.code === 401) {
        clearSession();
        const currentPath = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/sbxpay";
        const rawFallback = error?.fallback_url || `/accounts/signin?redirect_uri=${encodeURIComponent(currentPath)}`;
        const safeUrl = new URL(rawFallback, window.location.origin);
        window.location.href = safeUrl.pathname + safeUrl.search;
        return;
      }
      setSimulatingIndex(null);
    }
  }, [currentFlow.product_id, flowKey, navigate]);

  // =========================================================================
  // RENDERIZAÇÃO: Estado Crítico (Catastrófico)
  // =========================================================================
  if (fetchError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6 text-center text-neutral-900 rounded-none">
        <p className="text-neutral-900 font-semibold text-lg mb-2">Ops! Falha ao carregar ofertas.</p>
        <p className="text-neutral-500 font-normal text-sm mb-4">Redirecionando em {countdown}s...</p>
        <Button
          variant="outline"
          onClick={() => navigate({ to: dynamicReturnUri as any })}
          className="border-neutral-200 text-neutral-900 hover:bg-neutral-100 rounded-none"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Retornar agora
        </Button>
      </div>
    );
  }

  const formattedTotal = totalElements.toLocaleString("pt-BR");

  return (
    <div className="min-h-screen bg-white text-neutral-900 pb-20 relative rounded-none">

      {/* 1. HEADER */}
      <PanelHeader 
        showNav={false} 
        showAuth={true} 
        sessionToken={sessionToken}
        userData={userProfile}
        onLogout={() => logout({ purgeEnv: true })}
        onNavigate={(path) => navigate({ to: path as any })}
      />

      {/* 2. BARRA FLUTUANTE MOBILE FIXA */}
      <div
        className="md:hidden fixed top-[60px] left-0 w-full h-[48px] bg-white border-b border-neutral-200 shadow-xs z-40 rounded-none"
        ref={mobileMenuRef}
      >
        <div className="flex items-center w-full h-full divide-x divide-neutral-200">
          {/* 2A. Filtrar (Mobile) */}
          {isCartao && (
            <div
              className="flex-1 h-full flex items-center justify-center gap-2 cursor-pointer text-neutral-900 transition-colors hover:bg-neutral-50"
              onClick={() => {
                setFilterMenuOpen(!filterMenuOpen);
                setSortMenuOpen(false);
              }}
            >
              <SlidersHorizontal size={15} className="text-neutral-500" />
              <span className="text-xs font-medium select-none">Filtrar</span>
            </div>
          )}

          {/* 2B. Ordenar (Mobile) */}
          <div
            className="flex-1 h-full flex items-center justify-center gap-2 cursor-pointer text-neutral-900 transition-colors hover:bg-neutral-50"
            onClick={() => {
              setSortMenuOpen(!sortMenuOpen);
              setFilterMenuOpen(false);
            }}
          >
            <ArrowUpDown size={15} className="text-neutral-500" />
            <span className="text-xs font-medium select-none">Ordenar</span>
          </div>
        </div>

        {/* Menus Dropdown (Mobile) */}
        {isCartao && filterMenuOpen && (
          <div className="absolute top-[48px] left-0 w-full bg-white shadow-lg border-b border-neutral-200 max-h-[75vh] overflow-y-auto z-40 rounded-none">
            {FILTER_OPTIONS.map((opt, idx) => (
              <div
                key={idx}
                className={`px-5 py-3 text-xs border-b border-neutral-100 last:border-0 cursor-pointer ${
                  selectedCategory === opt.value
                    ? "text-neutral-900 bg-neutral-100 font-semibold"
                    : "text-neutral-600 hover:bg-neutral-50"
                }`}
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
          <div className="absolute top-[48px] left-0 w-full bg-white shadow-lg border-b border-neutral-200 max-h-[60vh] overflow-y-auto z-40 rounded-none">
            {SORT_OPTIONS.map((opt, idx) => (
              <div
                key={idx}
                className={`px-5 py-3.5 text-xs border-b border-neutral-100 last:border-0 cursor-pointer ${
                  currentSort === opt.value
                    ? "text-neutral-900 bg-neutral-100 font-semibold"
                    : "text-neutral-600 hover:bg-neutral-50"
                }`}
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
      <main className={`max-w-7xl mx-auto px-4 ${mainPaddingTop} pb-8`}>
        {/* DESKTOP BARRA DE FILTRO E ORDENAÇÃO */}
        <div className="hidden md:flex w-full items-center justify-between gap-4 pt-2 pb-6">
          <div className="flex items-center">
            <p className="text-xs font-medium text-neutral-500 m-0 tabular-nums">{formattedTotal} anúncios</p>
          </div>

          <div className="flex items-center gap-3">
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

        {/* MOBILE: QUANTIDADE DE ANÚNCIOS */}
        <div className="md:hidden mb-4">
          <p className="text-xs font-medium text-neutral-500 m-0 tabular-nums">{formattedTotal} anúncios</p>
        </div>

        {/* ENGINE DE CARDS */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <CardOfferVSkeleton key={i} />
            ))}
          </div>
        ) : offersList.length === 0 ? (
          <div className="bg-neutral-50 text-neutral-900 p-12 text-center border border-neutral-200 rounded-none shadow-xs my-12">
            <p className="text-neutral-500 font-normal text-sm">
              Nenhuma oferta encontrada para esta categoria no momento.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in duration-300">
            {offersList.map((item, idx) => (
              <CardOfferV
                key={item?.offer?.offer_id || idx}
                item={item}
                idx={idx}
                isCartao={isCartao}
                loading={simulatingIndex === idx}
                disabled={simulatingIndex !== null}
                onSimulate={handleSimulacao}
              />
            ))}
          </div>
        )}

        {/* PAGINAÇÃO DESKTOP / SCROLL MOBILE */}
        {totalElements > 0 && (
          <>
            {totalPages > 1 && (
              <div className="hidden md:flex items-center justify-center gap-3 py-8 mt-6">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pageNumber === 1 || loading}
                  onClick={() => setPageNumber((p) => Math.max(p - 1, 1))}
                  className="group border-neutral-200 text-neutral-900 hover:bg-primary hover:text-primary-foreground hover:border-primary text-xs rounded-none"
                >
                  <span className="inline-block transition-transform duration-300 group-hover:-translate-x-1">←</span> Anterior
                </Button>
                <span className="text-xs text-neutral-500 px-2 font-normal tabular-nums">
                  Página {pageNumber} de {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pageNumber >= totalPages || loading}
                  onClick={() => setPageNumber((p) => Math.min(p + 1, totalPages))}
                  className="group border-neutral-200 text-neutral-900 hover:bg-primary hover:text-primary-foreground hover:border-primary text-xs rounded-none"
                >
                  Próxima <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">→</span>
                </Button>
              </div>
            )}

            <div className="md:hidden py-8 text-center">
              {loading && pageNumber > 1 && (
                <span className="text-xs text-neutral-500">Carregando mais ofertas...</span>
              )}
              {!loading && pageNumber >= totalPages && (
                <span className="text-xs text-neutral-400">Você viu todas as ofertas.</span>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}