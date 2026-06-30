import { useState, useMemo, useEffect } from "react";
import { useNavigate, createLazyFileRoute } from "@tanstack/react-router";
import { Loader2, CreditCard, DollarSign, ArrowLeft } from "lucide-react";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { Label } from "@/components/ui/label";
import { orchestrateNavigation } from "@/features/financial-hub/core/hooks/useOrchestrator";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import {
  OrchestratorPayload,
  Entity as EntityType,
  InteractionContext,
  Seller,
  Event,
  Offer,
  Manager,
} from "@/features/financial-hub/shared/types";

// -------------------------------------------------------------------------
// IMPORT NOVO: Nosso serviço de consulta dos dados do usuário autenticado
// -------------------------------------------------------------------------
import { fetchMyProfile } from "@/services/user";

// --- CONFIGURAÇÃO DA ROTA ---
export const Route = createLazyFileRoute("/sandbox/offer")({
  component: () => {
    const search = Route.useSearch();
    const flow = (search as any).flow;

    // Se não tiver fluxo, não renderiza o componente com lixo
    if (!flow) return <div>Aguardando carregamento...</div>;

    // A KEY força a limpeza total ao mudar de fluxo
    return <OfferDetailsSandbox key={flow} flowKey={flow} />;
  },
});

// Layout dos campos
const commonInputClass = "h-10 text-sm transition-all duration-300 focus-visible:ring-2 focus-visible:ring-offset-0";
// 1. DADOS DE ENTIDADE (Chamado de Entity)
const Entity = {
  PF: {
    entity_id: "9999",
    name: "João da Silva",
    document: "435.770.590-87",
    phone: "(21) 98855-0999",
    email: "cesar.costa@superbid.net",
    birth_date: "2000-06-01",
    gender: "M",
  } as EntityType,
  PJ: {
    entity_id: "8888",
    name: "Sandbox Comercio LTDA",
    document: "15.898.094/0001-35",
    phone: "(21) 98855-0999",
    email: "cesar.costa@superbid.net",
    birth_date: "2010-06-01",
    gender: "",
  } as EntityType,
};

// 2. DADOS DE OFERTAS (Chamado de Offers)
const Offers = {
  Caminhões: {
    offer: {
      offer_id: "4680825",
      offer_description: "CAVALO MECÂNICO VOLKSWAGEN 25.360 CTC 6X2",
      offer_value: 330000,
      category: "Caminhões",
      vehicle_details: { manufacture_year: 2022, model_year: 2023, fipe_code: "515164-3", fipe_value: 461255 },
    },
    seller: {
      seller_id: "2487555",
      legal_name: "VOLKSWAGEN CAMINHOES E ONIBUS COMERCIO E SERVICOS LTDA",
      trade_name: "VW Caminhões",
      economic_group: "VW",
    },
    event: {
      event_id: "779585",
      event_description: "Volks|Confia. Caminhões pronta-entrega",
      event_start_date: "2026-03-27T14:29:00Z",
      event_end_date: "2026-07-31T19:00:00Z",
    },
    manager: { manager_name: "SOLD" },
  },
  Carros: {
    offer: {
      offer_id: "4728101",
      offer_description: "HYUNDAI CRETA 20A SPORT 2.0, 2018/2018",
      offer_value: 65500,
      category: "Carros",
      vehicle_details: { manufacture_year: 2018, model_year: 2018, fipe_code: "015153-0", fipe_value: 90038 },
    },
    seller: {
      seller_id: "1161",
      legal_name: "Coca-Cola - FEMSA Brasil",
      trade_name: "Coca-Cola - FEMSA Brasil",
      economic_group: "N/A",
    },
    event: {
      event_id: "782960",
      event_description: "Femsa",
      event_start_date: "2026-06-08T16:55:00Z",
      event_end_date: "2026-06-19T15:30:00Z",
    },
    manager: { manager_name: "SOLD" },
  },
  Informática: {
    offer: {
      offer_id: "4728044",
      offer_description: "SERVIDORES DIVERSOS",
      offer_value: 22000,
      category: "Informática",
    },
    seller: { seller_id: "1161", legal_name: "Lactec", trade_name: "Lactec", economic_group: "Lactec" },
    event: {
      event_id: "782952",
      event_description: "Leilão de SERVIDORES DIVERSOS",
      event_start_date: "2026-06-08T15:38:00Z",
      event_end_date: "2026-06-23T15:47:00Z",
    },
    manager: { manager_name: "SOLD" },
  },
  "Máquinas Amarelas": {
    offer: {
      offer_id: "4492361",
      offer_description: "PÁ CARREGADEIRA JOHN DEERE 524K 4x4, SÉRIE: 1BZ524KAPND003481",
      offer_value: 185000,
      category: "Máquinas Amarelas",
    },
    seller: {
      seller_id: "12345",
      legal_name: "VRental",
      trade_name: "VRental",
      economic_group: "VRental",
    },
    event: {
      event_id: "776209",
      event_description: "Semirreboque, Trator de Pneus, Pás Carregadeiras, Escavadeiras & Tratores de Esteiras",
      event_start_date: "2025-12-04T12:18:00Z",
      event_end_date: "2025-12-19T16:30:00Z",
    },
    manager: {
      manager_name: "SOLD",
    },
  },
};

// Mapeamento dos fluxos
const FLOW_MAP: Record<
  string,
  {
    name: string;
    entity: string;
    category: string;
    product_id?: string;
    info: string;
    link: "Box Financiamento" | "Box Parcelamento" | "Banner";
  }
> = {
  Veículos: {
    name: "Fin. Carros e Caminhões",
    entity: "PF | PJ",
    category: "Carros | Caminhões",
    info: "Entity, Event, Manager, Offer, Vehicle",
    link: "Box Financiamento",
  },
  Cartão: {
    name: "Parcelamento com Cartão",
    entity: "PF",
    category: "Informática",
    product_id: "8",
    info: "Entity, Event, Manager, Offer",
    link: "Box Parcelamento",
  },
  Vendedor: {
    name: "Parcelamento do vendedor VRental",
    entity: "PF",
    category: "Máquinas Amarelas",
    info: "Entity, Event, Manager, Offer",
    link: "Box Financiamento",
  },
  AutoEquity: {
    name: "Auto Equity",
    entity: "PF",
    category: "Carros",
    product_id: "7",
    info: "Entity",
    link: "Banner",
  },
  SeguroAuto: {
    name: "Seguro Auto",
    entity: "PF",
    category: "Carros",
    product_id: "9",
    info: "Entity",
    link: "Banner",
  },
};

// Arquivos com imagens dos lotes e banners (Lê tanto os originais locais quanto os pointers do Lovable)
const allFiles = import.meta.glob("/src/assets/sandbox/**/*.{jpg,jpeg,png,gif,asset.json}", { eager: true });

// Função unificada: remove acentos, arranca espaços e força tudo para minúsculo
const formatarCaminho = (str: string) =>
  str
    .normalize("NFD") // Separa letra base (a) do acento flutuante (´). Ex: A string original entra "Máquinas" e normalize desmonta para "M a ´ q u i n a s"
    .replace(/[\u0300-\u036f]/g, "") // Remove acentros, tremas e cedilhas
    .replace(/\s+/g, "") // Remove todos os espaços
    .toLowerCase();

export function OfferDetailsSandbox({ flowKey }: { flowKey?: keyof typeof FLOW_MAP }) {
  
  const [isStorageReady, setIsStorageReady] = useState(false);
  const navigate = useNavigate();

  // =========================================================================
  // LIMPEZA DE SESSÃO E PORTEIRO (Gatekeeper Seguro)
  // =========================================================================
  useEffect(() => {
    const savedToken = localStorage.getItem('session_token');
    const savedUserId = localStorage.getItem('user_id');

    // Se não tem token, redireciona AGORA, sem quebrar o ciclo de hooks
    if (!savedToken) {
      window.location.href = '/accounts/signin';
      return;
    }

    sessionStorage.clear();
    localStorage.clear();

    if (savedToken) localStorage.setItem('session_token', savedToken);
    if (savedUserId) localStorage.setItem('user_id', savedUserId);
    
    setIsStorageReady(true);
  }, []);
  
  const sessionToken = typeof window !== 'undefined' ? localStorage.getItem("session_token") : null;

  const currentFlow = FLOW_MAP[flowKey as any];

  // 1. TODOS OS HOOKS (Sempre no topo, sem interrupção)
  const [pessoa, setPessoa] = useState<"PF" | "PJ">("PF");
  const [categoria, setCategoria] = useState(currentFlow?.category?.split("|")[0].trim() || "Carros");
  const [fotoAtiva, setFotoAtiva] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (currentFlow) setCategoria(currentFlow.category.split("|")[0].trim());
  }, [flowKey, currentFlow]);

  // =========================================================================
  // ESTADOS DE INTEGRAÇÃO (API PARA BUSCAR DADOS DO USUÁRIO)
  // =========================================================================
  const [apiEntity, setApiEntity] = useState<EntityType | null>(null);

  // =========================================================================
  // EFEITO: BUSCA DE DADOS DO USUÁRIO LOGADO
  // =========================================================================
  const fetchEntity = async () => {
    if (!sessionToken) return;

    try {
      // Toda aquela lógica de URL e Headers sumiu. O Proxy resolve.
      const data = await fetchMyProfile(sessionToken);
      
      const mappedData = {
        entity_id: data.id,
        name: data.name,
        document: data.taxIdentifier,
        phone: data.cellphone,
        email: data.email,
        birth_date: data.birthDate?.split('T')[0],
        gender: data.gender === 1 ? "M" : "F"
      };

      setApiEntity(mappedData);
    } catch (error: any) {
      console.error("Erro na requisição via proxy:", error);
      
      // Se o token venceu no banco, ejeta o usuário
      if (error.message === "SESSION_EXPIRED") {
        navigate({ to: "/accounts/signin" });
      }
    }
  };

  // Dispara a busca assim que o token estiver validado na memória
  useEffect(() => {
    if (sessionToken && isStorageReady) {
      fetchEntity();
    }
  }, [sessionToken, isStorageReady]);

  // LOGICA DE BUSCA DE IMAGENS NOS DIRETÓRIOS DAS CATEGORIAS
  const imagens = useMemo(() => {
    // Seus nomes completos e exatos
    const fotosPrincipais: any = {
      Carros: "7c131a08-471e-4547-bc58-2ca185380f81",
      Caminhões: "b14801d4-bace-46d9-ac5a-c9b08595a913",
      Informática: "51dd4f87-876e-4e64-b024-5714564703a2",
      "Máquinas Amarelas": "5e3142d2-cdab-488e-b6a4-6f3291623ca5",
    };

    const categoriaBusca = formatarCaminho(categoria);

    const chaves = Object.keys(allFiles).filter((p: any) => {
      const caminhoLimpo = formatarCaminho(p);
      return caminhoLimpo.includes(categoriaBusca) && !caminhoLimpo.includes("/seller/");
    });

    // Pegamos a foto principal da categoria
    const idPrincipal = fotosPrincipais[categoria];

    // Blindamos a busca forçando os dois lados para minúsculo
    const index = chaves.findIndex((p: any) => {
      return idPrincipal ? formatarCaminho(p).includes(formatarCaminho(idPrincipal)) : false;
    });

    if (index > -1) {
      chaves.unshift(chaves.splice(index, 1)[0]);
    }

    return chaves.map((chave) => (allFiles[chave] as any)?.default || "");
  }, [categoria]);

  // LOGO DO VENDEDOR
  const logoPath = useMemo(() => {
    const categoriaBusca = formatarCaminho(categoria);

    const chave = Object.keys(allFiles).find((p: any) => {
      const caminhoLimpo = formatarCaminho(p);
      return caminhoLimpo.includes("/seller/") && caminhoLimpo.includes(categoriaBusca);
    });

    return chave ? (allFiles[chave] as any)?.default || "" : "";
  }, [categoria]);

  const activeOffer = Offers[categoria as keyof typeof Offers];
  const entity = Entity[pessoa];

  const avancar = () => setFotoAtiva((prev) => (prev + 1) % (imagens.length || 1));
  const retroceder = () => setFotoAtiva((prev) => (prev - 1 + (imagens.length || 1)) % (imagens.length || 1));

  // 2. PROTEÇÃO (Somente aqui permitimos o retorno antecipado)
  if (!activeOffer || !activeOffer.offer) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  const data = {
    titulo: activeOffer.offer.offer_description,
    marca: activeOffer.offer.category,
    ano: `${activeOffer.offer.vehicle_details?.manufacture_year || ""}/${activeOffer.offer.vehicle_details?.model_year || ""}`,
    lance: activeOffer.offer.offer_value,
    abertura: activeOffer.event.event_start_date,
    vendedor: activeOffer.seller.trade_name,
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
        {/* Usando estilo inline para garantir que a cor seja aplicada */}
        <Loader2 className="h-10 w-10 animate-spin mb-4" style={{ color: "#B300FF" }} />

        {/* Texto usando a classe text-slate-500 */}
        <p className="text-sm text-slate-500 font-medium animate-pulse">Processando solicitação...</p>
      </div>
    );
  }

  // Função centralizada de disparo
  const handleSimulacao = async () => {
    setLoading(true);

    // 1. Payload base sempre com action e entity
    const payload: any = {
      action: "SIMULATE",
      timestamp: new Date().toISOString(),
      entity: Entity[pessoa],
    };

    // 2. Se o fluxo tem o produto definido, injeta
    if (currentFlow.product_id) {
      payload.product_id = currentFlow.product_id;
    }

    // 3. Contexto de interação tipado
    // Mapeamento de 'link' para 'utm_source' conforme a interface permitida
    const getUtmSource = (linkType: string): InteractionContext["utm_source"] => {
      if (linkType === "Banner") return "banner";
      return "offer"; // Mapeia 'Box Financiamento' e 'Box Parcelamento' para 'offer'
    };

    const interactionContext: InteractionContext = {
      utm_source: getUtmSource(currentFlow.link),
      utm_medium: "home",
      utm_campaign: `flow_${flowKey.toLowerCase()}`,
      origin_url: window.location.href,
    };
    payload.interaction_context = interactionContext;
    payload.origin_url = window.location.href;
    
    // 3. Regra de Negócio: Se tem oferta, carrega TUDO que a oferta exige (Offer, Seller, Event, Manager)
    if (currentFlow.info.includes("Offer")) {
      payload.offer = activeOffer.offer;
      payload.seller = activeOffer.seller;
      payload.event = activeOffer.event;
      payload.manager = activeOffer.manager;
    }

    try {
      await orchestrateNavigation("SIMULATE", payload);
    } catch (err) {
      console.error("Erro na orquestração:", err);
      // Só tiramos a tela de loading se a orquestração falhar,
      // para o usuário não ficar preso e poder tentar clicar de novo.
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Definição local da variável CSS */}
      <style>{`:root { --brand-primary: #B300FF; }`}</style>

      <header className="sticky top-0 z-40 border-b border-border/60 bg-white shadow-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Lado Esquerdo: Botão Voltar + Divisor + Logo */}
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate({ to: "/sandbox" })}
              className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-[var(--brand-primary)] transition-colors"
            >
              <ArrowLeft size={16} />
              Voltar
            </button>

            <div className="h-6 w-px bg-slate-200 hidden sm:block" />

            {/* Esconde a Tagline no mobile para poupar espaço */}
            <div className="hidden sm:block">
              <WalletLogo size="md" withTagline />
            </div>
            <div className="block sm:hidden">
              <WalletLogo size="sm" />
            </div>
          </div>

          {/* Lado Direito: Identificador do Ambiente */}
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest hidden sm:block">
            Sandbox: Simulação de Oferta Superbid
          </div>
        </div>
      </header>

      {/* Se a categoria tiver o pipe '|' OU se o fluxo de entidade tiver '|', 
        então renderizamos a linha inteira dos seletores.
        Se não tiver nenhum dos dois, o React simplesmente não renderiza essa div.
      */}
      {(currentFlow.category.includes("|") || currentFlow.entity.includes("|")) && (
        <div className="p-4 bg-white border-b border-border flex flex-row items-center justify-center gap-6">
          {/* Seletor de Categoria (Aparece SÓ se tiver '|') */}
          {currentFlow.category.includes("|") && (
            <div className="relative w-48">
              <Select value={categoria} onValueChange={(v) => setCategoria(v as any)}>
                <SelectTrigger
                  className={`${commonInputClass} border-[var(--brand-primary)] text-[var(--brand-primary)]`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {currentFlow.category.split("|").map((cat) => (
                    <SelectItem key={cat.trim()} value={cat.trim()}>
                      {cat.trim()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Seletor PF/PJ (Aparece SÓ se tiver '|') */}
          {currentFlow.entity.includes("|") && (
            <div className="flex gap-2">
              <button
                onClick={() => setPessoa("PF")}
                className={`h-10 px-6 text-sm font-bold rounded-full border-2 transition-all ${
                  pessoa === "PF"
                    ? "bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]"
                    : "bg-white text-[var(--brand-primary)] border-[var(--brand-primary)]"
                }`}
              >
                PF
              </button>
              <button
                onClick={() => setPessoa("PJ")}
                className={`h-10 px-6 text-sm font-bold rounded-full border-2 transition-all ${
                  pessoa === "PJ"
                    ? "bg-[var(--brand-primary)] text-white border-[var(--brand-primary)]"
                    : "bg-white text-[var(--brand-primary)] border-[var(--brand-primary)]"
                }`}
              >
                PJ
              </button>
            </div>
          )}
        </div>
      )}

      {/* Banner com link, se flow exigir */}
      {/* Posição nobre: Logo após seletores, antes dos detalhes do ativo */}
      {currentFlow.link === "Banner" && (
        <div style={{ maxWidth: "1160px", margin: "20px auto", padding: "0 20px" }}>
          <button
            onClick={handleSimulacao}
            className="w-full transition-transform hover:scale-[1.01] active:scale-[0.99]"
            style={{ border: "none", background: "none", padding: 0, cursor: "pointer" }}
          >
            <img
              src={(() => {
                // Limpa o acento e joga para minúsculo (ex: "SeguroAuto" -> "seguroauto")
                const flowBusca = formatarCaminho(String(flowKey));

                const chave = Object.keys(allFiles).find((p) => {
                  const caminhoLimpo = formatarCaminho(p);
                  // Procura pela string 100% minúscula e sem acento
                  return caminhoLimpo.includes(`/banner/${flowBusca}/banner`);
                });

                return chave ? (allFiles[chave] as any)?.default || "" : "";
              })()}
              alt="Banner Promocional"
              style={{ width: "100%", borderRadius: "12px", objectFit: "cover" }}
              suppressHydrationWarning
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </button>
        </div>
      )}

      {/* Conteúdo principal */}
      <div style={{ maxWidth: "1160px", margin: "0 auto", padding: "40px 20px", fontFamily: "'Inter', sans-serif" }}>
        {/* Logo e Nome do Lote */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
            {logoPath && (
              <img
                src={logoPath}
                alt="Logo"
                style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover" }}
              />
            )}
            <span style={{ fontSize: "14px", fontWeight: "700", color: "#333" }}>
              {activeOffer.event.event_description}
            </span>
          </div>
          <h1 style={{ fontSize: "18px", fontWeight: "900", textTransform: "uppercase", color: "#1A202C" }}>
            {data.titulo}
          </h1>
        </div>

        {/* Galeria e Detalhes */}
        <div className="flex flex-col lg:flex-row gap-6 items-start w-full">
          {/* Coluna Principal (Esquerda no PC, Topo no Mobile) */}
          <div className="w-full lg:w-2/3 flex flex-col gap-8">
            {/* CONTAINER DA GALERIA BLINDADO PARA NÃO SUMIR */}
            <div className="relative w-full aspect-[825/502] bg-black border border-gray-400 flex items-center justify-center overflow-hidden rounded-md">
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
              {imagens.length > 0 && (
                <img
                  src={imagens[fotoAtiva]}
                  alt="Ativo"
                  className="w-full h-full object-contain block"
                  suppressHydrationWarning
                />
              )}
              <button
                onClick={retroceder}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white border-none p-3 cursor-pointer text-2xl rounded transition-colors"
              >
                &lt;
              </button>
              <button
                onClick={avancar}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white border-none p-3 cursor-pointer text-2xl rounded transition-colors"
              >
                &gt;
              </button>
            </div>

            {/* Ações (Box Financiamento ou Parcelamento) */}
            <div className="w-full">
              {currentFlow.link === "Box Financiamento" && (
                <div className="p-5 border border-gray-200 bg-white rounded-md shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="w-6 h-6 rounded-full border border-gray-800 flex items-center justify-center text-sm font-bold text-gray-800">
                      $
                    </span>
                    <h5 className="m-0 text-base font-bold">Esta oferta pode ser financiada</h5>
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed mb-4">
                    Faça uma simulação sem compromisso para conhecer nossas condições especiais de parcelamento e
                    negocie com nossos especialistas se quiser receber uma proposta personalizada. Sujeito à análise de
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

            {/* Informações do Lote */}
            <div className="w-full">
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
                    {
                      label: "Início do Evento",
                      value: new Date(activeOffer.event.event_start_date).toLocaleDateString("pt-BR"),
                    },
                    {
                      label: "Fim do Evento",
                      value: new Date(activeOffer.event.event_end_date).toLocaleDateString("pt-BR"),
                    },
                  ].map((row, idx) => (
                    <tr key={idx} className="border-b border-gray-200">
                      <td className="py-3 font-bold text-gray-800 w-2/5 pr-4 align-top">{row.label}:</td>
                      <td className="py-3 text-gray-600 align-top">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Coluna Lateral (Direita no PC, Fica embaixo no Mobile) */}
          <aside className="w-full lg:w-1/3">
            <div className="border border-slate-200 rounded-lg bg-white shadow-sm overflow-hidden sticky top-24">
              {/* Seção 1: Lance */}
              <div className="p-5 border-b border-slate-100">
                <h2 className="text-[11px] font-bold uppercase text-gray-500 tracking-wider mb-2">ÚLTIMO LANCE</h2>
                <div className="text-3xl font-black text-gray-900 mb-4">
                  R$ {data.lance.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <p className="text-xs text-gray-600 m-0 mb-1">Cliente: {entity.name}</p>
                <p className="text-xs text-gray-400 m-0">{entity.document}</p>
              </div>

              {/* Seção 2: Info */}
              <div className="p-5 bg-slate-50">
                <div className="text-[11px] text-gray-600 leading-relaxed">
                  <p className="m-0 mb-1">
                    <strong>Abertura:</strong> {new Date(data.abertura).toLocaleDateString("pt-BR")}
                  </p>
                  <p className="m-0">
                    <strong>Vendedor:</strong> {data.vendedor}
                  </p>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
