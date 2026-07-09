/**
 * @fileoverview Componente: OfferDetailsSandbox (Rota: /sandbox/offer)
 * * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Visualização de detalhes de uma oferta (ativo) na Sandbox.
 * Atua apenas como "vitrine". A responsabilidade de orquestração foi 
 * delegada para o Gateway (/financialEntry).
 * * [RESPONSABILIDADES]:
 * 1. Interface: Renderização do layout original (tabelas, carrossel, sem filtros).
 * 2. Visualização (BFF): Busca os dados da oferta apenas para exibição em tela.
 * 3. Delegação: Redireciona o usuário para o DMZ Gateway com os "documentos" (IDs e Token).
 */

import { useState, useMemo, useEffect, useContext, useRef } from "react";
import { useNavigate, createLazyFileRoute } from "@tanstack/react-router";
import { Loader2, CreditCard, DollarSign, ArrowLeft, LogOut } from "lucide-react";
import { WalletLogo } from "@/components/brand/WalletLogo";

import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { UserDataContext } from "./sandbox.lazy";
import { fetchOfferDetails } from "@/services/offer";
import { logSystemError } from "@/services/notification";

// =========================================================================
// [FORMATTERS]: Utilitários de Apresentação
// =========================================================================
const formatCPF = (cpf: string) => cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
const formatPhone = (phone: string) => {
  const cleaned = phone.replace(/^55/, "");
  return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
};

// =========================================================================
// [CONFIGURAÇÃO DE FLUXOS]: Mapeamento de Ambiente (Staging vs Production)
// =========================================================================
const FLOW_MAP: Record<string, { 
  name: string; 
  category: string; 
  product_id?: string; 
  offer_id: { staging: string; production: string }; 
  info: string; 
  link: "Box Financiamento" | "Box Parcelamento" | "Banner" 
}> = {
  Carros: { 
    name: "Financiamento de Carros", 
    offer_id: { staging: "4753216", production: "4753216" }, 
    category: "Carros & Motos", 
    info: "Entity, Event, Manager, Offer, Vehicle", 
    link: "Box Financiamento" 
  },
  Caminhões: { 
    name: "Financiamento de Caminhões", 
    offer_id: { staging: "4680825", production: "4680825" }, 
    category: "Caminhões & Ônibus", 
    info: "Entity, Event, Manager, Offer, Vehicle", 
    link: "Box Financiamento" 
  },
  Imóveis: { 
    name: "Financiamento de Imóveis", 
    offer_id: "4680825", 
    category: "Imóveis", 
    info: "Entity, Event, Manager, Offer, RealEstate", 
    link: "Box Financiamento" 
  },
  Cartão: { 
    name: "Parcelamento com Cartão", 
    offer_id: { staging: "4739764", production: "4739764" }, 
    category: "Informática", 
    product_id: "8", 
    info: "Entity, Event, Manager, Offer", 
    link: "Box Parcelamento" 
  },
  Vendedor: { 
    name: "Parcelamento do vendedor VRental", 
    offer_id: { staging: "4492361", production: "4492361" }, 
    category: "Máquinas Amarelas", 
    info: "Entity, Event, Manager, Offer", 
    link: "Box Financiamento" 
  },
  AutoEquity: { 
    name: "Auto Equity", 
    offer_id: { staging: "4753216", production: "4753216" }, 
    category: "Carros & Motos", 
    product_id: "7", 
    info: "Entity", 
    link: "Banner" 
  },
  SeguroAuto: { 
    name: "Seguro Auto", 
    offer_id: { staging: "4753216", production: "4753216" }, 
    category: "Carros & Motos", 
    product_id: "9", 
    info: "Entity", 
    link: "Banner" 
  },
};

const allFiles = import.meta.glob("/src/assets/sandbox/**/*.{jpg,jpeg,png,gif,asset.json}", { eager: true });
const formatarCaminho = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "").toLowerCase();

// =========================================================================
// CONFIGURAÇÃO DA ROTA (Isolada para evitar re-render destrutivo)
// =========================================================================
function OfferDetailsSandboxPage() {
  const search = Route.useSearch();
  const flow = search.flow; 

  if (!flow) {
    console.warn("🚨 [ROUTER]: O parâmetro '?flow=' não chegou na URL!");
    return (
      <div className="flex min-h-screen items-center justify-center font-bold text-slate-500 font-['Inter']">
        Aguardando carregamento do fluxo... (Parâmetro ausente)
      </div>
    );
  }

  return <OfferDetailsSandbox key={flow} flowKey={flow as any} />;
}

export const Route = createLazyFileRoute("/sandbox/offer")({
  validateSearch: (search: Record<string, unknown>) => ({
    flow: search.flow as string | undefined,
    return_uri: search.return_uri as string | undefined,
    redirect_uri: search.redirect_uri as string | undefined,
  }),
  component: OfferDetailsSandboxPage,
});

// =========================================================================
// [COMPONENTE PRINCIPAL]
// =========================================================================
export function OfferDetailsSandbox({ flowKey }: { flowKey?: keyof typeof FLOW_MAP }) {
  const { logout, userId, token } = useFinancialAuth();
  const navigate = useNavigate();
  const searchParams = Route.useSearch();
  
  const currentFlow = FLOW_MAP[flowKey as any] || FLOW_MAP["Carros"];
  const { userData } = useContext(UserDataContext) || {};

  // [SEGURANÇA]: Trava estrita contra loops de concorrência de renderização
  const hasInitialized = useRef(false);
  const isFetching = useRef(false);

  const [fotoAtiva, setFotoAtiva] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeOffer, setActiveOffer] = useState<any>(null);
  
  // [AMBIENTE]: Inicialização imediata síncrona para evitar race-condition no fetch inicial
  const [ambiente, setAmbiente] = useState<"staging" | "production">(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem("sbx_environment") as "staging" | "production") || "production";
    }
    return "production";
  });
  
  // [CONTROLE DE FALLBACK]: Estados de resiliência espelhados do Gateway
  const [fetchError, setFetchError] = useState<'TECHNICAL_INSTABILITY' | null>(null);
  const [countdown, setCountdown] = useState(5);

  // Resolvendo dinamicamente o ID do upstream alvo baseado no escopo do ambiente reativo
  const targetOfferId = ambiente === "production" ? currentFlow.offer_id.production : currentFlow.offer_id.staging;

  // [REDIRECIONAMENTO DINÂMICO]: Captura a URL de retorno preservando a origem
  const dynamicReturnUri = searchParams.redirect_uri || searchParams.return_uri || "/sandbox";

  // [FETCH VISUAL]: Busca dados com proteção rígida de concorrência baseada no ID resolvido
  useEffect(() => {
    // [GUARD CLAUSE]: Aborta imediatamente se já inicializado, buscando ou se houver erro terminal
    if (hasInitialized.current || isFetching.current || fetchError || !targetOfferId || !token) return;

    const loadOffer = async () => {
      isFetching.current = true;
      hasInitialized.current = true;
      setLoading(true);
      setFetchError(null);

      try {
        const data = await fetchOfferDetails(token, targetOfferId);
        setActiveOffer(data);
      } catch (error: any) {
        console.error("[OFFER_FETCH_ERROR]:", error);

        logSystemError(token || "NO_TOKEN", {
          context: 'SANDBOX-OFFER-FETCH',
          message: error?.message || "Erro desconhecido na busca de oferta na sandbox",
          details: {
            name: error?.name || "Error",
            message: error?.message,
            stack: error?.stack
          },
          payload: { 
            offer_id: targetOfferId,
            flow_key: flowKey,
            environment: ambiente
          },
          visit_id: null,
          simulation_id: null
        });

        setFetchError('TECHNICAL_INSTABILITY');
      } finally {
        setLoading(false);
        isFetching.current = false;
      }
    };

    loadOffer();
  }, [targetOfferId, token, ambiente]);

  // [UX FALLBACK]: Contador regressivo dinâmico para a Redirect URI
  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (fetchError) {
      if (countdown > 0) {
        timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      } else {
        if (dynamicReturnUri.startsWith("http")) {
          window.location.href = dynamicReturnUri;
        } else {
          navigate({ to: dynamicReturnUri as any, replace: true });
        }
      }
    }
    
    return () => clearTimeout(timer);
  }, [fetchError, countdown, navigate, dynamicReturnUri]);

  const entity = userData || { name: "João da Silva", document: "43577059087", email: "cesar.costa@superbid.net", phone: "21988550999" };
  
  const imagens = useMemo(() => {
    if (!activeOffer?.offer?.photos) return [];
    return [...activeOffer.offer.photos]
      .sort((a, b) => (a.highlight === b.highlight ? 0 : a.highlight ? -1 : 1))
      .map((p: any) => p.link);
  }, [activeOffer]);

  // =========================================================================
  // [HANDLERS]: Ação de Delegação para o Gateway
  // =========================================================================
  const handleSimulacao = () => {
    if (!activeOffer) return;
    setLoading(true);

    // O 'token' do contexto é o interno. Precisamos do sbx_token real.
    // Se o seu useFinancialAuth não expõe o sbx_token, use o localStorage diretamente.
    const sbxAcessToken = localStorage.getItem('sbx_access_token');
    console.log("[sandbox.offer | OfferDetailsSandbox] Delegando para o Gateway com sbx_access_token real:", sbxAcessToken);

    // 1. Construção do Payload base (Sem destruir IDs)
    const searchPayload: any = {
      environment: ambiente,
      sbx_access_token: sbxAcessToken,
      offer_id: encodeURIComponent(String(targetOfferId)),
      product_id: encodeURIComponent(String(currentFlow.product_id || '')),
      return_uri: window.location.pathname + window.location.search,
      utm_source: currentFlow.link === "Banner" ? "banner" : "offer",
      utm_medium: "referral",
      utm_campaign: `flow_${flowKey?.toLowerCase()}`,
    };
    // 2. Adição condicional: Só enviamos category_id se NÃO for Banner
    // Isso evita que o backend tente validar categorias para fluxos que não possuem categoria
    if (currentFlow.link !== "Banner") {
      // Supondo que você queira passar o category_id caso exista na activeOffer
      if (activeOffer?.offer?.category_id) {
        searchPayload.category_id = activeOffer.offer.category_id;
      }
    }

    navigate({
      to: "/financialGatewayEntry",
      search: searchPayload
    });
  };

  // =========================================================================
  // [VIEW 1]: Erro - Alinhado rigorosamente com financialGatewayEntry
  // =========================================================================
  if (fetchError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6 text-center font-['Inter']">
        <h2 className="text-xl font-bold text-gray-900 mb-4">
          Erro de Carregamento
        </h2>
        
        <p className="text-sm text-gray-600 mb-8 max-w-sm">
          Esta oferta não foi encontrada ou não está disponível.
        </p>
        
        <p className="text-xs text-gray-400 mb-8">
          Redirecionando em {countdown} segundos...
        </p>
        
        <button 
          onClick={() => {
            hasInitialized.current = false;
            window.location.reload();
          }}
          className="text-sm font-bold text-[#B300FF] hover:underline cursor-pointer border-none bg-transparent"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  // =========================================================================
  // [VIEW 2]: Carregamento - Spinner padrão do sistema
  // =========================================================================
  if (loading || (!activeOffer && !fetchError)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Inter']">
        <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-[#B300FF] mb-4"></div>
        <p className="text-slate-500 font-medium text-sm">Carregando detalhes da oferta...</p>
      </div>
    );
  }

  // =========================================================================
  // [VIEW 3]: Renderização de Sucesso
  // =========================================================================
  return (
    <div className="min-h-screen bg-white">
      <style>{`:root { --brand-primary: #B300FF; }`}</style>

      {/* HEADER PRINCIPAL */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => {
                if (dynamicReturnUri.startsWith("http")) {
                  window.location.href = dynamicReturnUri;
                } else {
                  navigate({ to: dynamicReturnUri as any });
                }
              }} 
              className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[var(--brand-primary)]"
            >
              <ArrowLeft size={16} /> Voltar
            </button>
            <div className="h-6 w-px bg-slate-200 hidden sm:block" />
            <div className="hidden sm:block"><WalletLogo size="md" withTagline /></div>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:block">Sandbox: Simulação de Oferta Superbid</div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-[9px] font-mono text-slate-500">ID: {userId || "---"}</p>
                <p className="text-[9px] font-mono text-slate-500 uppercase">AMB: {ambiente.toUpperCase()}</p>
              </div>
              <button onClick={logout} className="flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-lg text-[10px] font-bold"><LogOut className="w-3 h-3" /> SAIR</button>
            </div>
          </div>
        </div>
      </header>

      {/* BANNER PROMOCIONAL */}
      {currentFlow.link === "Banner" && (
        <div style={{ maxWidth: "1160px", margin: "20px auto", padding: "0 20px" }}>
            <button 
                onClick={handleSimulacao}
                disabled={loading}
                className="w-full text-left border-none bg-transparent p-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] transition-transform"
            >
              <img 
                  src={(() => { const flowBusca = formatarCaminho(String(flowKey)); const chave = Object.keys(allFiles).find((p) => formatarCaminho(p).includes(`/banner/${flowBusca}/banner`)); return chave ? (allFiles[chave] as any)?.default || "" : ""; })()}
                  alt="Banner" 
                  className="w-full rounded-xl"
              />
            </button>
        </div>
      )}

      {/* CONTEÚDO PRINCIPAL */}
      <div style={{ maxWidth: "1160px", margin: "0 auto", padding: "40px 20px", fontFamily: "'Inter', sans-serif" }}>
        
        {/* TÍTULO E LOGO NO TOPO */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              {activeOffer.event.event_image_url && (
              <img 
                  src={activeOffer.event.event_image_url} 
                  alt="Logo do Evento" 
                  style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover" }} 
              />
              )}
              <span style={{ fontSize: "14px", fontWeight: "700", color: "#333" }}>
              {activeOffer.event.event_description}
              </span>
          </div>
          <h1 style={{ fontSize: "18px", fontWeight: "900", textTransform: "uppercase", color: "#1A202C" }}>
              {activeOffer.offer.offer_description}
          </h1>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 items-start w-full">
          <div className="w-full lg:w-2/3 flex flex-col gap-8">
            <div className="relative w-full aspect-[825/502] bg-black rounded-md overflow-hidden">
                {currentFlow.link.trim() !== "Banner" && (
                    <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-2 bg-white rounded shadow-md z-10">
                        {currentFlow.link.trim() === "Box Parcelamento" ? (
                            <>
                                <CreditCard size={18} className="text-black" />
                                <p className="m-0 text-sm font-medium text-black">Use seu cartão em até 18x</p>
                            </>
                        ) : (
                            <>
                                <DollarSign size={18} className="text-black" />
                                <p className="m-0 text-sm font-medium text-black">Simule nosso financiamento</p>
                            </>
                        )}
                    </div>
                )}
              {imagens.length > 0 && <img src={imagens[fotoAtiva]} className="w-full h-full object-contain" alt="Ativo" />}
              <button onClick={() => setFotoAtiva(p => (p - 1 + imagens.length) % imagens.length)} className="absolute left-2 top-1/2 bg-black/50 text-white p-2">&lt;</button>
              <button onClick={() => setFotoAtiva(p => (p + 1) % imagens.length)} className="absolute right-2 top-1/2 bg-black/50 text-white p-2">&gt;</button>
            </div>
            
            <div className="w-full">
              {currentFlow.link === "Box Financiamento" && (
                <div className="p-5 border border-gray-200 bg-white rounded-md shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-6 h-6 rounded-full border border-gray-800 flex items-center justify-center text-sm font-bold text-gray-800">$</span>
                    <h5 className="m-0 text-base font-bold">Esta oferta pode ser financiada</h5>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed mb-4">
                    Faça uma simulação sem compromisso para conhecer nossas condições especiais de parcelamento e
                    negocie com nossos especialistas uma proposta personalizada. Sujeito à análise de
                    crédito.
                  </p>
                  <a
                    onClick={(e) => {
                      e.preventDefault();
                      if (!loading) handleSimulacao();
                    }}
                    className="text-[var(--brand-primary)] font-bold text-base cursor-pointer hover:underline"
                  >
                    {loading ? "Processando..." : "Simular financiamento"}
                  </a>
                </div>
              )}
              {currentFlow.link.includes("Parcelamento") && (
                <div className="p-5 border border-gray-200 bg-white rounded-md shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-6 h-6 rounded-full border border-gray-800 flex items-center justify-center">
                      <CreditCard size={14} className="text-gray-800" />
                    </div>
                    <h5 className="m-0 text-base font-bold">Parcele suas compras em até 18x</h5>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed mb-4">
                    Para pagamentos de lotes até R$ 120.000,00 neste evento você pode utilizar seu cartão de crédito
                    para pagar com toda a segurança da <strong>sbXPay</strong>.
                  </p>
                  <a
                    onClick={(e) => {
                      e.preventDefault();
                      if (!loading) handleSimulacao();
                    }}
                    className="text-[var(--brand-primary)] font-bold text-base cursor-pointer hover:underline"
                  >
                    {loading ? "Processando..." : "Simular parcelamento"}
                  </a>
                </div>
              )}
            </div>

            {/* TABELA DE DADOS DETALHADA */}
            <div className="w-full mt-4">
                <h2 className="text-lg font-bold uppercase border-b border-black pb-2">Informações do lote</h2>
                <table className="w-full mt-4 border-collapse text-sm">
                    <tbody>
                        {[
                            { label: "Descrição do Lote", value: activeOffer.offer.offer_description },
                            { label: "Categoria", value: activeOffer.offer.category },
                            { label: "Vendedor (Seller)", value: activeOffer.seller.trade_name },
                            { label: "Gestor (Manager)", value: activeOffer.manager?.manager_name || "N/A" },
                            { label: "Valor do Lote", value: `R$ ${activeOffer.offer.offer_value.toLocaleString("pt-BR")}` },
                            { label: "Evento", value: activeOffer.event.event_description },
                            { label: "Número do Evento", value: activeOffer.event.event_id },
                            { label: "Início do Evento", value: new Date(activeOffer.event.event_start_date).toLocaleDateString("pt-BR") },
                            { label: "Fim do Evento", value: new Date(activeOffer.event.event_end_date).toLocaleDateString("pt-BR") }
                        ].map((row, i) => (
                            <tr key={i} className="border-b border-gray-200">
                                <td className="py-3 font-bold w-1/3 align-top">{row.label}:</td>
                                <td className="py-3 align-top">{row.value}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
          </div>

          <aside className="w-full lg:w-1/3">
            <div className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden sticky top-24">
              <div className="p-5 border-b border-slate-100">
                <h2 className="text-[11px] font-bold uppercase text-gray-500 tracking-wider mb-2">ÚLTIMO LANCE</h2>
                <div className="text-3xl font-black text-gray-900 mb-4">R$ {activeOffer.offer.offer_value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</div>
                <div className="text-xs text-gray-600 space-y-1">
                  <p className="font-bold text-gray-900 mb-2">{entity.name}</p>
                  <p><span className="font-semibold text-gray-500">CPF:</span> {formatCPF(entity.document)}</p>
                  <p><span className="font-semibold text-gray-500">E-mail:</span> {entity.email}</p>
                  <p><span className="font-semibold text-gray-500">Celular:</span> {formatPhone(entity.phone)}</p>
                </div>
              </div>
              <div className="p-5 bg-slate-50 text-[11px] text-gray-600 leading-relaxed">
                  <p className="m-0 mb-1"><strong>Abertura:</strong> {new Date(activeOffer.event.event_start_date).toLocaleDateString("pt-BR")}</p>
                  <p className="m-0"><strong>Vendedor:</strong> {activeOffer.seller.trade_name}</p>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}