/**
 * @fileoverview Componente: OfferDetailsSandbox (Rota: /sandbox/offer)
 * * =========================================================================
 * [ARQUITETURA & CONTROLE DE AMBIENTE REATIVO]
 * =========================================================================
 * O seletor de ambiente foi promovido do Login para o Header Global da Sandbox.
 * Mudar o ambiente limpa o estado anterior, revalida os dados da oferta contra 
 * o novo destino (STAGE/PROD) através do BFF e altera o destino do handshake.
 */

import { useState, useMemo, useEffect, useContext } from "react";
import { useNavigate, createFileRoute } from "@tanstack/react-router";
import { Loader2, CreditCard, DollarSign, ArrowLeft, LogOut } from "lucide-react";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { UserDataContext } from "./sandbox.lazy";
import { fetchOfferDetails } from "@/services/offer";

// =========================================================================
// [FORMATTERS]: Utilitários de Apresentação
// =========================================================================
const formatCPF = (cpf: string) => cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

// =========================================================================
// CONFIGURAÇÃO DA ROTA (TANSTACK ROUTER)
// =========================================================================
export const Route = createFileRoute("/sandbox/offer_new")({
  component: () => {
    const search = Route.useSearch();
    const flow = (search as any).flow;

    if (!flow) return <div className="p-6 text-center text-sm text-slate-500">Aguardando definição de fluxo...</div>;
    return <OfferDetailsSandbox key={flow} flowKey={flow} />;
  },
});

const FLOW_MAP: Record<string, { name: string; offer_id?: string; product_id?: string; link: "Box Financiamento" | "Box Parcelamento" | "Banner" }> = {
  Veículos: { name: "Fin. Carros e Caminhões", offer_id: "4680825", link: "Box Financiamento" },
  Cartão: { name: "Parcelamento com Cartão", offer_id: "4728044", product_id: "8", link: "Box Parcelamento" },
  Vendedor: { name: "Parcelamento do vendedor VRental", offer_id: "4492361", link: "Box Financiamento" },
  AutoEquity: { name: "Auto Equity", product_id: "7", link: "Banner" },
  SeguroAuto: { name: "Seguro Auto", product_id: "9", link: "Banner" },
};

// =========================================================================
// COMPONENTE PRINCIPAL
// =========================================================================
export function OfferDetailsSandbox({ flowKey }: { flowKey?: keyof typeof FLOW_MAP }) {
  const { logout, userId, token } = useFinancialAuth();
  const navigate = useNavigate();
  const currentFlow = FLOW_MAP[flowKey as any];
  const { userData } = useContext(UserDataContext) || {};

  // -----------------------------------------------------------------------
  // [STATE]: Controle centralizado do ambiente reativo
  // -----------------------------------------------------------------------
  const [ambiente, setAmbiente] = useState<"staging" | "production">(
    (localStorage.getItem("sandbox_env") as "staging" | "production") || "production"
  );
  const [activeOffer, setActiveOffer] = useState<any>(null);
  const [loadingBff, setLoadingBff] = useState(false);
  const [fotoAtiva, setFotoAtiva] = useState(0);

  // Sincroniza a escolha visual com o cofre do navegador e DERRUBA a sessão
  const handleAmbienteChange = (novoAmbiente: "staging" | "production") => {
    // Se clicar no mesmo ambiente que já está ativo, não faz nada
    if (ambiente === novoAmbiente) return;

    // 1. Atualiza o estado e o cofre do navegador
    setAmbiente(novoAmbiente);
    localStorage.setItem("sandbox_env", novoAmbiente);
    
    // 2. FORÇA O LOGOUT IMEDIATO
    // Isso vai limpar o token e fazer o sandbox.lazy jogar o usuário
    // de volta para a tela de autenticação do ambiente selecionado.
    logout();
  };

  // -----------------------------------------------------------------------
  // [CICLO DE VIDA]: Inclusão do 'ambiente' como dependência reativa do fetch
  // -----------------------------------------------------------------------
  useEffect(() => {
    const loadOfferFromBff = async () => {
      if (currentFlow?.offer_id && token) {
        setLoadingBff(true);
        try {
          // O ambiente é repassado ao BFF para buscar o lote na base correta (HML vs PROD)
          const response = await fetchOfferDetails(token, currentFlow.offer_id);
          setActiveOffer(response);
          setFotoAtiva(0);
        } catch (error) {
          console.error("[SANDBOX BFF FETCH ERROR]:", error);
          setActiveOffer(null);
        } finally { 
          setLoadingBff(false);
        }
      } else {
        setActiveOffer(null);
      }
    };

    loadOfferFromBff();
  }, [currentFlow, token, ambiente]); // Adicionado ambiente aqui para disparar novo fetch se mudar o toggle

  const imagens = useMemo(() => activeOffer?.offer?.photos || [], [activeOffer]);
  const logoPath = useMemo(() => activeOffer?.seller?.logo_url || "", [activeOffer]);

  const avancar = () => setFotoAtiva((prev) => (prev + 1) % (imagens.length || 1));
  const retroceder = () => setFotoAtiva((prev) => (prev - 1 + (imagens.length || 1)) % (imagens.length || 1));

  // -----------------------------------------------------------------------
  // [HANDSHAKE]: Tradução do ambiente interno para o formato esperado pelo gateway
  // -----------------------------------------------------------------------
  const handleSimulacao = () => {
    if (!currentFlow) return;

    navigate({
      to: "/sandbox/financialEntry",
      search: {
        // Mapeia "staging" -> "hml" e "production" -> "prd" para conformidade com a rota entry
        environment: ambiente === "staging" ? "hml" : "prd",
        sbx_token: token,
        offer_id: activeOffer?.offer?.offer_id || currentFlow.offer_id,
        product_id: currentFlow.product_id,
        utm_source: currentFlow.link === "Banner" ? "banner" : currentFlow.link === "Box Parcelamento" ? "box_parcelamento" : "box_financiamento",
        utm_medium: currentFlow.link === "Banner" ? "home_page" : "offer_detail_page",
        utm_campaign: `flow_${String(flowKey).toLowerCase()}`,
      },
    });
  };

  if (loadingBff) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
        <Loader2 className="h-10 w-10 animate-spin mb-4" style={{ color: "#B300FF" }} />
        <p className="text-sm text-slate-500 font-medium animate-pulse">Sincronizando canais Superbid ({ambiente.toUpperCase()})...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <style>{`:root { --brand-primary: #B300FF; }`}</style>

      {/* HEADER CENTRALIZADO COM SELETOR DE AMBIENTE */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate({ to: "/sandbox" })} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[var(--brand-primary)]">
              <ArrowLeft size={16} /> Voltar
            </button>
            <div className="h-6 w-px bg-slate-200 hidden sm:block" />
            <WalletLogo size="md" withTagline />
          </div>

          {/* CONTROLES DA SANDBOX */}
          <div className="flex items-center gap-6">
            {/* COMPONENTE COPIADO DE SIGNIN: TOGGLE DE AMBIENTE REATIVO */}
            <div className="h-9 p-0.5 bg-gray-100 rounded-full flex gap-0.5 border border-gray-200 w-40">
              <button
                type="button"
                onClick={() => handleAmbienteChange("staging")}
                className={`flex-1 text-[10px] font-bold rounded-full transition-all border ${
                  ambiente === "staging"
                    ? "bg-white text-[#B400FF] border-[#B400FF] shadow-sm"
                    : "text-gray-400 hover:text-gray-600 border-transparent"
                }`}
              >
                STAGE
              </button>
              <button
                type="button"
                onClick={() => handleAmbienteChange("production")}
                className={`flex-1 text-[10px] font-bold rounded-full transition-all border ${
                  ambiente === "production"
                    ? "bg-white text-[#B400FF] border-[#B400FF] shadow-sm"
                    : "text-gray-400 hover:text-gray-600 border-transparent"
                }`}
              >
                PRODUÇÃO
              </button>
            </div>

            <div className="flex items-center gap-4 border-l border-gray-200 pl-6">
              <div className="flex flex-col items-end text-right">
                <span className="text-[9px] font-mono text-slate-500">USER ID: {userId || "---"}</span>
                <span className="text-[9px] font-bold text-purple-600 tracking-wider">MODO SIMULAÇÃO</span>
              </div>
              <button onClick={logout} className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1 rounded-lg text-[10px] font-bold transition-all">
                <LogOut className="w-3 h-3" /> SAIR
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* RENDERIZAÇÃO DO CONTEÚDO */}
      {currentFlow.link === "Banner" ? (
        <div className="min-h-screen bg-slate-50 p-6 flex flex-col items-center">
          <div className="w-full max-w-5xl mt-12">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Ambiente Ativo: {ambiente.toUpperCase()}</p>
            <button onClick={handleSimulacao} className="w-full bg-gradient-to-r from-purple-600 to-indigo-700 h-48 rounded-2xl flex flex-col items-center justify-center text-white shadow-md transition-all hover:opacity-95">
              <h3 className="text-2xl font-black mb-2">Simular {currentFlow.name}</h3>
              <p className="text-sm text-purple-100 opacity-90">Disparar intenção apontando para o Gateway</p>
            </button>
          </div>
        </div>
      ) : !activeOffer ? (
        <div className="min-h-screen flex flex-col items-center justify-center text-sm p-6">
          <p className="text-slate-600 font-medium mb-2">Lote {currentFlow.offer_id} não localizado em {ambiente.toUpperCase()}.</p>
          <p className="text-xs text-slate-400">Alterne o ambiente no cabeçalho ou verifique a existência do lote.</p>
        </div>
      ) : (
        <div style={{ maxWidth: "1160px", margin: "0 auto", padding: "40px 20px" }}>
          {/* ... [O RESTANTE DA VIEW MANTÉM-SE EXATAMENTE IGUAL AO SCRIPT ANTERIOR] ... */}
          <div style={{ marginBottom: "24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
              {logoPath && <img src={logoPath} alt="Logo" style={{ width: "32px", height: "32px", borderRadius: "50%" }} />}
              <span style={{ fontSize: "14px", fontWeight: "700", color: "#333" }}>{activeOffer.event?.event_description}</span>
            </div>
            <h1 className="text-xl font-black text-slate-900 uppercase">{activeOffer.offer.offer_description}</h1>
          </div>
          <div className="flex flex-col lg:flex-row gap-6 items-start w-full">
            <div className="w-full lg:w-2/3 flex flex-col gap-8">
              <div className="relative w-full aspect-[825/502] bg-black border border-gray-400 flex items-center justify-center overflow-hidden rounded-md">
                {imagens.length > 0 && <img src={imagens[fotoAtiva]} className="w-full h-full object-contain" alt="Ativo" />}
                {imagens.length > 1 && (
                  <>
                    <button onClick={retroceder} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded">&lt;</button>
                    <button onClick={avancar} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded">&gt;</button>
                  </>
                )}
              </div>
              <div className="p-5 border border-purple-200 bg-purple-50/50 rounded-md">
                <h5 className="font-bold text-purple-900 mb-1">Simulador Conectado ({ambiente.toUpperCase()})</h5>
                <p className="text-sm text-slate-600 mb-4">O gateway transferirá este contexto tipado para processamento de regras.</p>
                <button onClick={handleSimulacao} className="h-10 rounded-lg bg-[var(--brand-primary)] px-6 font-bold text-sm text-white hover:bg-purple-800 transition-colors">
                  {currentFlow.link === "Box Parcelamento" ? "Simular parcelamento" : "Simular financiamento"}
                </button>
              </div>
            </div>
            <aside className="w-full lg:w-1/3">
              <div className="border border-slate-200 rounded-lg bg-white p-5 shadow-sm">
                <h2 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-2">VALOR DO LOTE</h2>
                <div className="text-3xl font-black text-gray-900 mb-4">R$ {activeOffer.offer.offer_value.toLocaleString("pt-BR")}</div>
                {userData && (
                  <div className="text-xs text-gray-600 bg-slate-50 p-3 rounded border border-slate-100 space-y-1">
                    <p className="font-bold text-gray-900 mb-1 uppercase tracking-wide text-[9px]">Sessão:</p>
                    <p>{userData.name}</p>
                    <p>{userData.email}</p>
                  </div>
                )}
              </div>
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}