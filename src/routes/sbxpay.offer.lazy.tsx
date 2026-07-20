/**
 * @fileoverview Componente: OfferDetailsSBXPAY (Rota: /sbxpay/offer)
 * * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Visualização de detalhes de uma oferta (ativo) na sbxpay.
 * Atua apenas como "vitrine" (Mock da tela da Superbid). 
 * 
 * * [RESPONSABILIDADES DA REFATORAÇÃO (BFF & Edge Gateway)]:
 * 1. Interface: Renderização do layout original (tabelas, carrossel).
 * 2. Visualização (BFF): Busca os dados da oferta apenas para exibição local.
 * 3. Delegação (O Pulo do Gato): Cria um Form POST invisível e submete para a 
 *    Edge Function (financial-gateway-gate), delegando 100% da orquestração para a Borda.
 */

import { useState, useMemo, useEffect, useContext, useRef } from "react";
import { useNavigate, createLazyFileRoute } from "@tanstack/react-router";
import { CreditCard, DollarSign, ArrowLeft, LogOut } from "lucide-react";
import { WalletLogo } from "@/components/brand/WalletLogo";

import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { UserDataContext } from "./sbxpay.lazy";
import { fetchOfferDetails } from "@/services/offer";
import { logSystemError } from "@/services/systemNotification";

// =========================================================================
// [FORMATTERS]: Utilitários de Apresentação
// =========================================================================
const formatCPF = (cpf: string) => cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
const formatPhone = (phone: string) => {
  const cleaned = phone.replace(/^55/, "");
  return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
};
const isInternal = (url: string) => url.startsWith('/') || url.startsWith(window.location.origin);

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
  Carros: { name: "Financiamento de Carros", offer_id: { staging: "4789138", production: "4789138" }, category: "Carros & Motos", info: "Entity, Event, Manager, Offer, Vehicle", link: "Box Financiamento" },
  Caminhões: { name: "Financiamento de Caminhões", offer_id: { staging: "4680825", production: "4680825" }, category: "Caminhões & Ônibus", info: "Entity, Event, Manager, Offer, Vehicle", link: "Box Financiamento" },
  Imóveis: { name: "Financiamento de Imóveis", offer_id: { staging: "4680825", production: "4680825" }, category: "Imóveis", info: "Entity, Event, Manager, Offer, RealEstate", link: "Box Financiamento" },
  Cartão: { name: "Parcelamento com Cartão", offer_id: { staging: "4739764", production: "4739764" }, category: "Informática", product_id: "8", info: "Entity, Event, Manager, Offer", link: "Box Parcelamento" },
  Vendedor: { name: "Parcelamento do vendedor VRental", offer_id: { staging: "4492361", production: "4492361" }, category: "Máquinas Amarelas", info: "Entity, Event, Manager, Offer", link: "Box Financiamento" },
  AutoEquity: { name: "Auto Equity", offer_id: { staging: "4753216", production: "4753216" }, category: "Carros & Motos", product_id: "7", info: "Entity", link: "Banner" },
  SeguroAuto: { name: "Seguro Auto", offer_id: { staging: "4753216", production: "4753216" }, category: "Carros & Motos", product_id: "9", info: "Entity", link: "Banner" },
};

const allFiles = import.meta.glob("/src/assets/sbxpay/**/*.{jpg,jpeg,png,gif}", { eager: true });
const formatarCaminho = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "").toLowerCase();

// =========================================================================
// CONFIGURAÇÃO DA ROTA
// =========================================================================
function OfferDetailsSBXPage() {
  const search = Route.useSearch() as any;
  const flow = search.flow; 

  if (!flow) {
    console.warn("🚨 [ROUTER]: O parâmetro '?flow=' não chegou na URL!");
    return (
      <div className="flex min-h-screen items-center justify-center font-bold text-slate-500 font-['Inter']">
        Aguardando carregamento do fluxo... (Parâmetro ausente)
      </div>
    );
  }

  return <OfferDetailsSBXPAY key={flow} flowKey={flow as any} />;
}

export const Route = createLazyFileRoute("/sbxpay/offer")({
  component: OfferDetailsSBXPage,
});

// =========================================================================
// [COMPONENTE PRINCIPAL]
// =========================================================================
export function OfferDetailsSBXPAY({ flowKey }: { flowKey?: keyof typeof FLOW_MAP }) {  
  const { userId, sessionToken } = useFinancialAuth();
  const navigate = useNavigate();
  const searchParams = Route.useSearch() as any;

  // [CORREÇÃO]: REGRA DOS HOOKS - Garantir um fluxo seguro para evitar crash nos hooks abaixo
  const requestedFlow = FLOW_MAP[flowKey as any];
  const currentFlow = requestedFlow || FLOW_MAP["Carros"]; // Fallback silencioso apenas para os hooks

  const context = useContext(UserDataContext);
  const { userData, performLogout } = context || {};

  // [SEGURANÇA]: Trava estrita contra loops de concorrência de renderização
  const hasInitialized = useRef(false);
  const isFetching = useRef(false);

  const [fotoAtiva, setFotoAtiva] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeOffer, setActiveOffer] = useState<any>(null);
  
  // =========================================================================
  // [AMBIENTE & HIDRATAÇÃO]: Proteção contra Erros de SSR
  // =========================================================================
  const [ambiente, setAmbiente] = useState<"staging" | "production">("production");

  useEffect(() => {
    const savedEnv = localStorage.getItem("sbx_environment") as "staging" | "production";
    if (savedEnv) {
      setAmbiente(savedEnv);
    }
  }, []);
  
  const [fetchError, setFetchError] = useState<'TECHNICAL_INSTABILITY' | null>(null);
  const [countdown, setCountdown] = useState(5);

  const targetOfferId = ambiente === "production" ? currentFlow.offer_id.production : currentFlow.offer_id.staging;
  const dynamicReturnUri = searchParams.redirect_uri || searchParams.return_uri || "/sbxpay";

  // =========================================================================
  // [FETCH VISUAL]: Busca dados com proteção rígida de concorrência
  // =========================================================================
  useEffect(() => {
    // [CORREÇÃO]: Removido o "reset" inútil de isFetching aqui que destruía a trava

    if (!targetOfferId || !sessionToken) return;

    // A trava verdadeira
    if (hasInitialized.current || isFetching.current || fetchError) return;

    const loadOffer = async () => {
      // [CORREÇÃO]: Ativa a trava ANTES de fazer a requisição
      isFetching.current = true;
      hasInitialized.current = true;
      setLoading(true);
      setFetchError(null);

      try {
        const data = await fetchOfferDetails(sessionToken, targetOfferId);
        setActiveOffer(data);
      } catch (error: any) {
        // [CORREÇÃO]: Usar userId em vez de sessionToken no log (Vazamento de Credencial)
        console.error("[OFFER_FETCH_ERROR]:", error);
        logSystemError(userId || "UNAUTHENTICATED", {
          context: 'sbxpay-OFFER-FETCH',
          message: error?.message || "Erro na busca de oferta",
          details: { name: error?.name, message: error?.message, stack: error?.stack },
          payload: { offer_id: targetOfferId, flow_key: flowKey, environment: ambiente },
          visit_id: null, simulation_id: null
        });

        setFetchError('TECHNICAL_INSTABILITY');
      } finally {
        setLoading(false);
        isFetching.current = false;
      }
    };

    loadOffer();
  }, [targetOfferId, sessionToken, ambiente, fetchError, userId]);

  // [UX FALLBACK]: Contador regressivo dinâmico para a Redirect URI
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    
    if (fetchError) {
      if (countdown > 0) {
        timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      } else {
        if (isInternal(dynamicReturnUri)) {
          window.location.href = dynamicReturnUri;
        } else {
          navigate({ to: "/sbxpay" as any, replace: true });
        }
      }
    }
    
    return () => clearTimeout(timer);
  }, [fetchError, countdown, navigate, dynamicReturnUri]);

  const imagens = useMemo(() => {
    if (!activeOffer?.offer?.photos) return [];
    return [...activeOffer.offer.photos]
      .sort((a, b) => (a.highlight === b.highlight ? 0 : a.highlight ? -1 : 1))
      .map((p: any) => p.link);
  }, [activeOffer]);

  // =========================================================================
  // [CORREÇÃO]: EARLY RETURN SEGURO (Abaixo de todos os hooks)
  // =========================================================================
  useEffect(() => {
    if (!requestedFlow) {
      navigate({ to: "/", replace: true });
    }
  }, [requestedFlow, navigate]);

  if (!requestedFlow) return null; // Evita quebrar a tela enquanto redireciona

  // =========================================================================
  // [HANDLERS]: Ação de Delegação para o Gateway
  // =========================================================================
  const handleSimulacao = () => {
    if (!activeOffer) return;
    setLoading(true);

    const tokenForGateway = localStorage.getItem('session_token') || sessionToken;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";

    // 1. Montamos o Payload de roteamento
    const searchPayload: Record<string, string> = {
      environment: ambiente,
      auth_token: tokenForGateway || "", 
      // offer_id: String(targetOfferId),
      offer_id: '11111111',
      product_id: String(currentFlow.product_id || ''),
      return_uri: window.location.origin + window.location.pathname + window.location.search,
      utm_source: currentFlow.link === "Banner" ? "banner" : "offer",
      utm_medium: "referral",
      utm_campaign: `flow_${flowKey?.toLowerCase()}`,
    };
    
    if (currentFlow.link !== "Banner" && activeOffer?.offer?.category_id) {
      searchPayload.category_id = String(activeOffer.offer.category_id);
    }

    // 2. Criamos o Formulário Invisível (Abordagem B / Form POST)
    const form = document.createElement('form');
    form.method = 'POST';
    // Apontamos diretamente para a nova Edge Function na Borda
    form.action = `${supabaseUrl}/functions/v1/financial-gateway-gate`;

    // 3. Populamos os inputs com os dados do Payload de forma segura
    Object.entries(searchPayload).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = value;
      form.appendChild(input);
    });

    // 4. Submetemos (O navegador assume a viagem e o redirecionamento 302 faz o resto)
    document.body.appendChild(form);
    form.submit();
  };

  // =========================================================================
  // [VIEW 1]: Erro
  // =========================================================================
  if (fetchError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6 text-center font-['Inter']">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Erro de Carregamento</h2>
        <p className="text-sm text-gray-600 mb-8 max-w-sm">Esta oferta não foi encontrada ou não está disponível.</p>
        <p className="text-xs text-gray-400 mb-8">Redirecionando em {countdown} segundos...</p>
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
  // [VIEW 2]: Carregamento
  // =========================================================================
  if (loading || (!activeOffer && !fetchError)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
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
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:block">sbxpay: Simulação de Oferta Superbid</div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-[9px] font-mono text-slate-500">ID: {userId || "---"}</p>
                <p className="text-[9px] font-mono text-slate-500 uppercase">AMB: {ambiente.toUpperCase()}</p>
              </div>
              <button 
                onClick={() => performLogout?.()} 
                className="flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-lg text-[10px] font-bold"
              >
                <LogOut className="w-3 h-3" /> SAIR
              </button>
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
                    <p className="font-bold text-gray-900 mb-2">{userData?.name || "Carregando perfil..."}</p>
                    <p><span className="font-semibold text-gray-500">CPF:</span> {userData ? formatCPF(userData.document) : "---"}</p>
                    <p><span className="font-semibold text-gray-500">E-mail:</span> {userData?.email || "---"}</p>
                    <p><span className="font-semibold text-gray-500">Celular:</span> {userData ? formatPhone(userData.phone) : "---"}</p>
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