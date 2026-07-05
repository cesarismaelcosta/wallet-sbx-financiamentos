/**
 * @fileoverview Componente: OfferDetailsSandbox (Rota: /sandbox/offer_new)
 * * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Visualização de detalhes de uma oferta (ativo) na Sandbox.
 * Atua apenas como "vitrine". A responsabilidade de orquestração foi 
 * delegada para o Gateway (/financialEntry).
 * * [RESPONSABILIDADES]:
 * 1. Interface: Renderização do layout original (tabelas, carrossel, filtros).
 * 2. Visualização (BFF): Busca os dados da oferta apenas para exibição em tela.
 * 3. Delegação: Redireciona o usuário para o DMZ Gateway com os "documentos" (IDs e Token).
 */

import { useState, useMemo, useEffect, useContext } from "react";
import { useNavigate, createFileRoute } from "@tanstack/react-router";
import { Loader2, CreditCard, DollarSign, ArrowLeft, LogOut } from "lucide-react";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { UserDataContext } from "./sandbox.lazy";
import { fetchOfferDetails } from "@/services/offer";

// =========================================================================
// [FORMATTERS]: Utilitários de Apresentação
// =========================================================================
const formatCPF = (cpf: string) => cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
const formatPhone = (phone: string) => {
  const cleaned = phone.replace(/^55/, "");
  return cleaned.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3");
};

const FLOW_MAP: Record<string, { name: string; entity: string; category: string; product_id?: string; offer_id: string; info: string; link: "Box Financiamento" | "Box Parcelamento" | "Banner" }> = {
  Veículos: { name: "Fin. Carros e Caminhões", offer_id: "4680825", entity: "PF | PJ", category: "Carros | Caminhões", info: "Entity, Event, Manager, Offer, Vehicle", link: "Box Financiamento" },
  Cartão: { name: "Parcelamento com Cartão", offer_id: "4739764", entity: "PF", category: "Informática", product_id: "8", info: "Entity, Event, Manager, Offer", link: "Box Parcelamento" },
  Vendedor: { name: "Parcelamento do vendedor VRental", offer_id: "4492361", entity: "PF", category: "Máquinas Amarelas", info: "Entity, Event, Manager, Offer", link: "Box Financiamento" },
  AutoEquity: { name: "Auto Equity", offer_id: "4728101", entity: "PF", category: "Carros", product_id: "7", info: "Entity", link: "Banner" },
  SeguroAuto: { name: "Seguro Auto", offer_id: "4728101", entity: "PF", category: "Carros", product_id: "9", info: "Entity", link: "Banner" },
};

const allFiles = import.meta.glob("/src/assets/sandbox/**/*.{jpg,jpeg,png,gif,asset.json}", { eager: true });
const formatarCaminho = (str: string) => str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "").toLowerCase();

// =========================================================================
// CONFIGURAÇÃO DA ROTA
// =========================================================================
export const Route = createFileRoute("/sandbox/offer_new")({
  component: () => {
    const search = Route.useSearch();
    const flow = (search as any).flow;
    if (!flow) return <div className="min-h-screen flex items-center justify-center font-bold text-slate-500">Aguardando carregamento do fluxo...</div>;
    return <OfferDetailsSandbox key={flow} flowKey={flow} />;
  },
});

// =========================================================================
// [COMPONENTE PRINCIPAL]
// =========================================================================
export function OfferDetailsSandbox({ flowKey }: { flowKey?: keyof typeof FLOW_MAP }) {
  const { logout, userId, token } = useFinancialAuth();
  const navigate = useNavigate();
  const currentFlow = FLOW_MAP[flowKey as any];
  const { userData } = useContext(UserDataContext) || {};

  const [pessoa, setPessoa] = useState<"PF" | "PJ">("PF");
  const [categoria, setCategoria] = useState(currentFlow?.category?.split("|")[0].trim() || "Carros");
  const [fotoAtiva, setFotoAtiva] = useState(0);
  const [loading, setLoading] = useState(false);
  const [activeOffer, setActiveOffer] = useState<any>(null);
  const [ambiente, setAmbiente] = useState("production");

  useEffect(() => {
    const stored = localStorage.getItem("sbx_environment");
    if (stored) setAmbiente(stored);
  }, []);

  // [FETCH VISUAL]: Busca os dados apenas para desenhar a tela para o usuário
  useEffect(() => {
    const loadOffer = async () => {
      if (currentFlow?.offer_id && token) {
        setLoading(true);
        try {
          const data = await fetchOfferDetails(token, currentFlow.offer_id);
          setActiveOffer(data);
        } catch (e) { 
          console.error("[OFFER_FETCH_ERROR]:", e); 
        } finally { 
          setLoading(false); 
        }
      }
    };
    loadOffer();
  }, [currentFlow, token]);

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

    // DELEGAÇÃO PARA O GATEWAY DMZ:
    // Passamos todos os parâmetros exatos que o validateSearch do Gateway exige.
    navigate({
      to: "/financialEntry",
      search: {
        environment: ambiente,
        sbx_token: token,
        offer_id: currentFlow.offer_id,
        product_id: currentFlow.product_id,
        utm_source: currentFlow.link === "Banner" ? "banner" : "offer",
        utm_medium: "home",
        utm_campaign: `flow_${flowKey?.toLowerCase()}`,
      } as any 
    });
  };

  // =========================================================================
  // [UI/UX]: Renderização e Proteções de Estado
  // =========================================================================
  if (!activeOffer) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white">
        <Loader2 className="h-8 w-8 animate-spin text-[#B300FF] mb-4" />
        <span className="text-sm font-semibold text-slate-500 animate-pulse">Carregando detalhes do lote...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <style>{`:root { --brand-primary: #B300FF; }`}</style>

      {/* HEADER PRINCIPAL */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate({ to: "/sandbox" })} className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[var(--brand-primary)]">
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

      {/* FILTROS E SELETORES */}
      {(currentFlow.category.includes("|") || currentFlow.entity.includes("|")) && (
        <div className="p-4 bg-white border-b border-border flex flex-row items-center justify-center gap-6">
          {currentFlow.entity.includes("|") && (
            <div className="flex gap-2">
              <button onClick={() => setPessoa("PF")} className={`h-10 px-6 text-sm font-bold rounded-full border-2 ${pessoa === "PF" ? "bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]" : "bg-white text-[var(--brand-primary)] border-[var(--brand-primary)]"}`}>PF</button>
              <button onClick={() => setPessoa("PJ")} className={`h-10 px-6 text-sm font-bold rounded-full border-2 ${pessoa === "PJ" ? "bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]" : "bg-white text-[var(--brand-primary)] border-[var(--brand-primary)]"}`}>PJ</button>
            </div>
          )}
        </div>
      )}

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
                  <button 
                    onClick={handleSimulacao} 
                    disabled={loading}
                    className="text-[var(--brand-primary)] font-bold text-base cursor-pointer hover:underline border-none bg-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Redirecionando..." : "Simular financiamento"}
                  </button>
                </div>
              )}
              {currentFlow.link.includes("Parcelamento") && (
                <div className="p-5 border border-gray-200 bg-white rounded-md shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-6 h-6 rounded-full border border-gray-800 flex items-center justify-center"><CreditCard size={14} className="text-gray-800" /></div>
                    <h5 className="m-0 text-base font-bold">Parcele suas compras em até 18x</h5>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed mb-4">
                    Para pagamentos de lotes até R$ 120.000,00 neste evento você pode utilizar seu cartão de crédito para pagar com toda a segurança da <strong>sbXPay</strong>.
                  </p>
                  <button 
                    onClick={handleSimulacao} 
                    disabled={loading}
                    className="text-[var(--brand-primary)] font-bold text-base cursor-pointer hover:underline border-none bg-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "Redirecionando..." : "Simular parcelamento"}
                  </button>
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