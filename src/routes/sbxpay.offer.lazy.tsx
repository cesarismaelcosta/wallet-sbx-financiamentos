/**
 * @fileoverview Componente: OfferDetailsSBXPAY (Rota: /sbxpay/offer)
 * @path src/routes/sbxpay/offer.tsx
 * 
 * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Visualização de detalhes de uma oferta (ativo) na sbxpay.
 * Atua apenas como "vitrine" (Mock da tela da Superbid). 
 * 
 * [RESPONSABILIDADES DA REFATORAÇÃO (BFF & Edge Gateway)]
 * 1. Interface: Renderização fiel do layout original (tabelas, carrossel, banners).
 * 2. Visualização (BFF): Busca os dados da oferta apenas para exibição local na tela.
 * 3. Delegação Segura: Submete via AJAX (fetch) para a Edge Function 
 *    (financial-gateway-gate), delegando a orquestração e autenticação à Borda.
 */

import { useState, useMemo, useEffect, useContext } from "react";
import { useNavigate, createLazyFileRoute } from "@tanstack/react-router";
import { CreditCard, DollarSign, ArrowLeft, LogOut } from "lucide-react";
import { WalletLogo } from "@/components/brand/WalletLogo";

import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { UserDataContext } from "./sbxpay.lazy";
import { fetchOfferDetails } from "@/services/offer";
import { logSystemError } from "@/services/systemNotification";
import { getDefaultSbxEnvironment, setSessionToken, getTokenForPayload } from "@/services/session";

// =========================================================================
// [FORMATTERS & UTILS]: Utilitários de Apresentação e Validação de Segurança
// =========================================================================

/** Formata uma string de CPF para o padrão brasileiro (000.000.000-00) */
const formatCPF = (cpf: string) => cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

/** Formata e limpa o número de telefone removendo DDI se presente */
const formatPhone = (phone: string) => {
  const cleaned = phone.replace(/^55/, "");
  return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
};

/** 
 * Validação segura contra Open Redirect. 
 * Bloqueia caminhos maliciosos do tipo protocolo-relativo (ex: //evil.com).
 */
const isInternal = (url: string) => 
  (url.startsWith('/') && !url.startsWith('//')) || url.startsWith(window.location.origin);

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
    category: "Carros & Motos", 
    offer_id: { staging: "2969794", production: "4952846" }, 
    info: "Entity, Event, Manager, Offer, Vehicle", 
    link: "Box Financiamento" 
  },
  Caminhões: { 
    name: "Financiamento de Caminhões", 
    category: "Caminhões & Ônibus", 
    offer_id: { staging: "4680825", production: "4680825" }, 
    info: "Entity, Event, Manager, Offer, Vehicle", 
    link: "Box Financiamento" 
  },
  Imóveis: { 
    name: "Financiamento de Imóveis", 
    category: "Imóveis", 
    offer_id: { staging: "4680825", production: "4680825" }, 
    info: "Entity, Event, Manager, Offer, RealEstate", 
    link: "Box Financiamento" 
  },
  Cartão: { 
    name: "Parcelamento com Cartão", 
    category: "Informática", 
    product_id: "8", 
    offer_id: { staging: "3064406", production: "4846218" }, 
    info: "Entity, Event, Manager, Offer", 
    link: "Box Parcelamento" 
  },
  Vendedor: { 
    name: "Parcelamento do vendedor VRental", 
    category: "Máquinas Amarelas", 
    offer_id: { staging: "4492361", production: "4492361" }, 
    info: "Entity, Event, Manager, Offer", 
    link: "Box Financiamento" 
  },
  AutoEquity: { 
    name: "Auto Equity", 
    category: "Carros & Motos", 
    product_id: "7", 
    offer_id: { staging: "4753216", production: "4753216" }, 
    info: "Entity", 
    link: "Banner" 
  },
  SeguroAuto: { 
    name: "Seguro Auto", 
    category: "Carros & Motos", 
    product_id: "9", 
    offer_id: { staging: "4753216", production: "4753216" }, 
    info: "Entity", 
    link: "Banner" 
  },
};

// Carregamento dinâmico de assets estáticos via glob import do Vite
const allFiles = import.meta.glob("/src/assets/sbxpay/**/*.{jpg,jpeg,png,gif}", { eager: true });
const formatarCaminho = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "").toLowerCase();

// =========================================================================
// CONFIGURAÇÃO DA ROTA (TanStack Router Wrapper)
// =========================================================================
function OfferDetailsSBXPage() {
  const search = Route.useSearch() as any;
  const flow = search.flow; 

  // Validação preventiva caso o parâmetro de query '?flow=' não seja informado na URL
  if (!flow) {
    console.warn("🚨 [ROUTER]: O parâmetro '?flow=' não chegou na URL!");
    return (
      <div className="flex min-h-screen items-center justify-center font-bold text-slate-500 font-['Inter']">
        Aguardando carregamento do fluxo... (Parâmetro ausente)
      </div>
    );
  }

  return <OfferDetailsSBXPAY flowKey={flow} />;
}

export const Route = createLazyFileRoute("/sbxpay/offer")({
  component: OfferDetailsSBXPage,
});

// =========================================================================
// [COMPONENTE PRINCIPAL]
// =========================================================================
export function OfferDetailsSBXPAY({ flowKey }: { flowKey?: keyof typeof FLOW_MAP }) {  
  // Contexto de autenticação para extração do ID e rastreio de sessão
  const { userId, sessionToken } = useFinancialAuth();
  const navigate = useNavigate();
  const searchParams = Route.useSearch() as any;

  // Mapeia o fluxo atual ou aplica fallback seguro para evitar crash
  const requestedFlow = FLOW_MAP[flowKey as any];
  const currentFlow = requestedFlow || FLOW_MAP["Carros"];

  // Contexto de dados do usuário logado na esteira
  const context = useContext(UserDataContext);
  const { userData, performLogout } = context || {};

  // Estados de controle visual da vitrine
  const [fotoAtiva, setFotoAtiva] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeOffer, setActiveOffer] = useState<any>(null);

  // [AMBIENTE & HIDRATAÇÃO]: Resolução via padrão centralizado do session.ts (Staging vs Production)
  const [ambiente] = useState<"staging" | "production">(() => {
    return getDefaultSbxEnvironment();
  });

  const targetOfferId = ambiente === "production" ? currentFlow.offer_id.production : currentFlow.offer_id.staging;
  const dynamicReturnUri = searchParams.redirect_uri || searchParams.return_uri || "/sbxpay";

  // Estados para tratamento de falhas e fallback de UX
  const [fetchError, setFetchError] = useState<'TECHNICAL_INSTABILITY' | null>(null);
  const [countdown, setCountdown] = useState(5);

  // =========================================================================
  // [FETCH VISUAL]: Busca de detalhes do ativo com AbortController nativo
  // =========================================================================
  useEffect(() => {
    if (!targetOfferId || !sessionToken) return;

    const controller = new AbortController();

    const loadOffer = async () => {
      setLoading(true);
      setFetchError(null);

      try {
        const data = await fetchOfferDetails(targetOfferId, { signal: controller.signal });
        if (!controller.signal.aborted) {
          setActiveOffer(data);
        }
      } catch (error: any) {
        // Ignora erros gerados pelo abortamento intencional do effect
        if (error.name === 'AbortError' || controller.signal.aborted) {
          return;
        }

        console.error("[OFFER_FETCH_ERROR]:", error);

        // [TELEMETRIA DE ERRO]: Disparo de email de log
        logSystemError({
          context: 'sbxpay/offer.lazy.tsx',
          subject: `Erro na Busca de Oferta (${flowKey || 'Geral'})`,
          message: error?.message || "Erro na busca de oferta",
          details: { name: error?.name, message: error?.message, stack: error?.stack },
          payload: { 
            user_id: userId || "UNAUTHENTICATED", 
            offer_id: targetOfferId, 
            flow_key: flowKey, 
            environment: ambiente,
            // [METADADOS ENRIQUECIDOS]: Página, Produto e Parceiro rastreados
            metadata: {
              page: window.location.pathname, // Caminho da página atual (ex: /sbxpay/offer)
              product: currentFlow?.name || flowKey || "Desconhecido", // Nome oficial do produto
              partner: activeOffer?.seller?.trade_name || "N/A", // Nome do parceiro/vendedor (se carregado)
              visit_id: null,
              simulation_id: null
            }
          },
          visit_id: null, 
          simulation_id: null
        });

        setFetchError('TECHNICAL_INSTABILITY');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    };

    loadOffer();

    // Cleanup: Aborta a requisição HTTP pendente caso o componente seja desmontado
    return () => {
      controller.abort();
    };
  }, [targetOfferId, sessionToken, ambiente]);

  // [UX FALLBACK]: Temporizador regressivo dinâmico para redirecionamento em caso de erro
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

  // Processamento e ordenação das fotos da oferta (destaque primeiro)
  const imagens = useMemo(() => {
    if (!activeOffer?.offer?.photos) return [];
    return [...activeOffer.offer.photos]
      .sort((a, b) => (a.highlight === b.highlight ? 0 : a.highlight ? -1 : 1))
      .map((p: any) => p.link);
  }, [activeOffer]);

  // Validação final de rota caso o fluxo solicitado não exista
  useEffect(() => {
    if (!requestedFlow) {
      navigate({ to: "/", replace: true });
    }
  }, [requestedFlow, navigate]);

  if (!requestedFlow) return null;

  // =========================================================================
  // [HANDLERS]: Ação de Delegação para o Gateway (AJAX com AbortController e Safety Timeout)
  // =========================================================================
  const handleSimulacao = async () => { 
    if (!activeOffer) return;
    setLoading(true);

    // Recupera o token de forma segura através do helper centralizado do session.ts
    const tokenForGateway = getTokenForPayload();
    if (!tokenForGateway) {
      setFetchError('TECHNICAL_INSTABILITY');
      setLoading(false);
      return;
    }

    // Configura controle de tempo limite (Timeout de 10s) para evitar travamento da UI
    const controller = new AbortController();
    const safetyTimeout = setTimeout(() => controller.abort(), 10000);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";

    // Montagem estrita do payload sanitizado para envio à Edge Function da Borda
    const searchPayload: Record<string, string> = {
      environment: ambiente,
      auth_token: tokenForGateway, 
      offer_id: String(targetOfferId),
      product_id: String(currentFlow.product_id || ''),
      // [SEGURANÇA]: Sanitizado para expor apenas origin e pathname (remove query params confidenciais)
      return_uri: window.location.origin + window.location.pathname,
      utm_source: currentFlow.link === "Banner" ? "banner" : "offer",
      utm_medium: "referral",
      utm_campaign: `flow_${flowKey?.toLowerCase()}`,
    };
    
    if (currentFlow.link !== "Banner" && activeOffer?.offer?.category_id) {
      searchPayload.category_id = String(activeOffer.offer.category_id);
    }

    try {
      // Disparo do POST AJAX híbrido para a Edge Function de gateway
      const response = await fetch(`${supabaseUrl}/functions/v1/financial-gateway-gate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(searchPayload),
        signal: controller.signal
      });

      clearTimeout(safetyTimeout);

      const data = await response.json();

      // Tratamento granular para sessões expiradas ou erros de autenticação na Borda (401)
      if (response.status === 401 || data.code === 'SESSION_EXPIRED') {
        sessionStorage.clear();
        navigate({ to: "/sbxpay" as any, replace: true });
        return;
      }

      // Se bem-sucedido, rotaciona o token opcionalmente e executa o redirecionamento
      if (data.success && data.redirect_url) {
        if (data.session_token) {
          setSessionToken(data.session_token); 
        }
        window.location.href = data.redirect_url;
      } else {
        setFetchError('TECHNICAL_INSTABILITY');
        setLoading(false);
      }
    } catch (err: any) {
      clearTimeout(safetyTimeout);
      if (err.name === 'AbortError') {
        console.error("[OFFER_SIMULATION_TIMEOUT]: Requisição abortada por tempo limite.");
      } else {
        console.error("[OFFER_SIMULATION_ERROR]:", err);
      }
      setFetchError('TECHNICAL_INSTABILITY');
      setLoading(false);
    }
  };

  // =========================================================================
  // [VIEWS]: Tratamento de Erros, Loading e Renderização de Sucesso
  // =========================================================================
  
  // VIEW 1: Estado de Erro Crítico
  if (fetchError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white p-6 text-center font-['Plus_Jakarta_Sans']">
        <img 
          src="/assets/error/error.png" 
          alt="Erro" 
          className="w-34 h-34 object-contain mb-6" 
        />
        <p className="text-slate-800 font-bold text-lg mb-2">Ops! Algo deu errado.</p>
        <p className="text-slate-500 font-medium text-sm text-center max-w-md px-4">
          Esta oferta não foi encontrada ou não está disponível.
        </p>
        <p className="text-slate-400 font-medium text-xs mt-4 mb-6">Redirecionando em {countdown}s...</p>
        
        <button 
          onClick={() => {
            if (isInternal(dynamicReturnUri)) {
              window.location.href = dynamicReturnUri;
            } else {
              navigate({ to: "/sbxpay" as any, replace: true });
            }
          }}
          className="flex items-center text-[#B400FF] font-semibold text-sm hover:opacity-80 transition-opacity cursor-pointer border-none bg-transparent"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retornar agora
        </button>
      </div>
    );
  }

  // VIEW 2: Estado de Carregamento Inicial
  if (loading || (!activeOffer && !fetchError)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-slate-500 font-medium text-sm">Carregando detalhes da oferta...</p>
      </div>
    );
  }

  // VIEW 3: Layout de Vitrine de Sucesso Completo
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

      {/* BANNER PROMOCIONAL (Exibido condicionalmente para fluxos do tipo Banner) */}
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

      {/* CONTEÚDO PRINCIPAL DA VITRINE */}
      <div style={{ maxWidth: "1160px", margin: "0 auto", padding: "40px 20px", fontFamily: "'Inter', sans-serif" }}>
        
        {/* TÍTULO E LOGOTIPO DO EVENTO NO TOPO */}
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
            
            {/* CARROSSEL DE FOTOS DO ATIVO */}
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
            
            {/* BOX DE AÇÃO PARA SIMULAÇÃO (Financiamento ou Parcelamento) */}
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

            {/* TABELA DE DADOS DETALHADA DO LOTE */}
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

          {/* ASIDE LATERAL: RESUMO DO LANCE E PERFIL DO USUÁRIO */}
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