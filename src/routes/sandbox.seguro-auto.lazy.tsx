import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { WalletLogo } from "@/components/brand/WalletLogo"; 
import { Button } from "@/components/ui/button";
import { Offer, orchestrateNavigation } from "@/features/financial-hub/core/hooks/useOrchestrator";

export const Route = createLazyFileRoute("/sandbox/seguro-auto")({
  component: SeguroAuto,
});

/**
 * Payload Builder Padrão
 * Use esta função para padronizar todas as jornadas do Sandbox.
 */
const createOrchestratorPayload = (
  action: 'VISIT' | 'CONSULT' | 'REDIRECT' | 'SIMULATE' | 'CONTACT',
  productId: number,
  origin_url: string,
  target_url?: string | null,
  formData: any = {},
  options: {
    offer?: any;
    manager?: any;
    seller?: any;
    event?: any;
    collateral?: any;
  } = {}
) => {
  return {
    action,
    product_id: productId,
    visit_id: sessionStorage.getItem("sbx_visit_id") || undefined,
    visit_update_id: sessionStorage.getItem("sbx_last_update_id") || undefined,
    origin_url: origin_url,
    target_url: target_url, 
    
    interaction_context: {
      utm_source: formData.source_type || 'banner',
      utm_medium: formData.utm_medium || 'organic',
      utm_campaign: formData.utm_campaign || 'seguro_auto_simulation',
      origin_url: origin_url,
      target_url: target_url
    },
    
    entity: {
      entity_id: formData.entity_id,
      name: formData.name,
      document: formData.document,
      phone: formData.phone,
      email: formData.email,
      birth_date: formData.birth_date,
      gender: formData.gender,
    },
    
    // Injeção condicional inteligente (só envia se existir)
    ...(options.offer && { offer: options.offer }),
    ...(options.manager && { manager: options.manager }),
    ...(options.seller && { seller: options.seller }),
    ...(options.event && { event: options.event }),
    ...(options.collateral && { collateral: options.collateral })
  };
};

function SeguroAuto() {

    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const isClient = typeof window !== "undefined";
    const params = isClient ? new URLSearchParams(window.location.search) : new URLSearchParams();
    const currentUrl = isClient ? window.location.href : "";
    const previousUrl = isClient ? document.referrer || "" : "";

    // Estado para debug
    const [debugInfo, setDebugInfo] = useState<{
        visitId: string;
        updateId: string | null;
        ref: string | null;
        productId?: number | null;
        simulationId?: string | null;
    }>({
        visitId: "Aguardando disparo...",
        updateId: null,
        ref: params.get("offer_id") || params.get("lote"),
        simulationId: null,
    });

    // =========================================================================
    // 1. ESTADO INICIAL
    // =========================================================================
    const [form, setForm] = useState({
        entity_id: "",
        name: "",
        document: "",
        email: "",
        phone: "",
        birth_date: "",
        gender: "",
        source_type: "banner",
        product_id: "9" // Produto Seguro Auto (ID: 9) - Ajuste conforme necessário
    });

    const [tipoPessoa, setTipoPessoa] = useState<"PF" | "PJ">("PF");

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    };

    // DADOS MOCK
    const PF_DATA = { entity_id: "9999", name: "Teste PF", document: "084.630.180-68", email: "cesar.costa@superbid.net", phone: "(21) 98855-0999", birth_date: "2000-06-01", gender: "M" };
    const PJ_DATA = { entity_id: "8888", name: "Teste PJ", document: "15.898.094/0001-35", email: "cesar.costa@superbid.net", phone: "(21) 98855-0999", birth_date: "2010-06-01", gender: "" };

    useEffect(() => {
    setForm((prev) => ({
        ...prev,
        ...(tipoPessoa === "PF" ? PF_DATA : PJ_DATA),
    }));
    }, [tipoPessoa]);

  // =========================================================================
  // 2. EXECUÇÃO DO FLUXO (ORCHESTRATOR V2)
  // =========================================================================
  const executarFluxo = async () => {
    setLoading(true);

    // Construtor centralizado
    const payload = createOrchestratorPayload(
        'CONSULT',
        Number(form.product_id),
        window.location.href,
        undefined,
        form
    );
    console.log("Payload construído para orquestração:", payload); // Log para debug do payload

    try {
        // 2. O hook apenas executa o transporte
        await orchestrateNavigation(
            'CONSULT', // Tipo de ação para o backend (ajuste conforme necessário)
            payload
        );
    } catch (err) {
        console.error("Erro na orquestração:", err);
    } finally {
        setLoading(false);
    }
    };

    const Help = ({
    title,
    node,
    items,
    }: {
    title: string;
    node: string;
    items: { label: string; key: string; format: string; value: string; error: string }[];
    }) => (
    <div className="group relative inline-block ml-2">
        <span className="cursor-help bg-slate-200 text-slate-500 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold italic">
        ?
        </span>
        <div className="absolute hidden group-hover:block bg-[#1e293b] text-white p-4 rounded-lg shadow-2xl text-[11px] w-[420px] z-50 -left-4 top-6 border border-slate-600">
        <p className="font-bold text-blue-400 mb-3 uppercase tracking-widest border-b border-slate-700 pb-1">{title}</p>
        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
            {items.map((item, idx) => (
            <div key={idx} className="space-y-1">
                <div className="flex justify-between items-center">
                <span className="font-bold text-slate-200 uppercase text-[9px]">{item.label}</span>
                <code className="text-[9px] bg-slate-900 px-1 text-emerald-400">
                    {node}.{item.key}
                </code>
                </div>
                <p className="text-slate-400 leading-tight">
                Formato: <span className="text-slate-300">{item.format}</span>
                </p>
                <p className="text-slate-400 font-mono italic">Valor Atual: "{item.value}"</p>
                <p className="text-red-400 text-[9px] font-mono">Erro 400: {item.error}</p>
                {idx < items.length - 1 && <hr className="border-slate-700 mt-2" />}
            </div>
            ))}
        </div>
        </div>
    </div>
    );

    return (
    <div className="p-10 max-w-2xl mx-auto space-y-6">
        <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-4">
            <WalletLogo size="md" withTagline />
            <div className="h-6 w-px bg-slate-200 ml-2 hidden sm:block" />
            <div className="flex flex-col hidden sm:flex text-left">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                Sandbox Environment
                </span>
                <span className="text-[9px] text-primary font-bold uppercase">
                Trace ID: {debugInfo.updateId ? debugInfo.updateId.substring(0, 8) : "Sincronizando..."}
                </span>
            </div>
            </div>
        </div>
        </header>

        <details
        className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm overflow-hidden transition-all"
        open
        >
        <summary className="text-[10px] font-black text-slate-600 cursor-pointer uppercase tracking-widest">
            Protocolo de Comunicação & Persistência (Docs)
        </summary>
        <div className="mt-4 space-y-4 text-[10px] font-mono leading-tight">
            <div className="p-3 bg-white border border-slate-200 rounded text-slate-700 font-sans space-y-2 text-[11px]">
            <p className="text-blue-700 font-bold mb-1 italic">Estratégia de Persistência:</p>
            <p className="text-slate-600 leading-relaxed">
                1. Os dados em <code className="bg-slate-100 px-1 font-bold">entity</code> são salvos na tabela{" "}
                <code className="font-bold">visits</code>.<br />
                2. Detalhes em <code className="bg-slate-100 px-1 font-bold">
                manager \| seller \| event \| offer
                </code>{" "}
                são salvos na tabela <code className="font-bold">visit_offers</code>.<br />
                3. O roteamento utiliza o <code className="font-bold">visit_update_id</code> para manter a integridade do
                rastro.
            </p>
            </div>

            <div
            className="bg-slate-900 text-slate-300 p-4 rounded overflow-x-auto shadow-inner"
            suppressHydrationWarning
            >
            <pre className="text-[9px] leading-tight font-mono">
                {`// BODY DA REQUISIÇÃO REAL (FULL PAYLOAD)
            {
                "visit_id": "${debugInfo.visitId}",
                "visit_update_id": "${debugInfo.updateId || "Pending..."}",
                "entity": ${JSON.stringify(
                {
                    entity_id: form.entity_id,
                    name: form.name,
                    document: form.document,
                    phone: form.phone,
                    email: form.email,
                    birth_date: form.birth_date,
                    gender: form.gender,
                },
                null,
                2,
                )},
                interaction_context: {
                utm_source: params.get('utm_source') || 'offer', 
                utm_medium: params.getutm_medium') || 'web_app',
                utm_campaign: params.get('utm_campaign') || form.offer_id || 'vdp_simulation',
                origin_url: currentUrl 
                },
                "product_id": ${debugInfo.productId || (form.product_id ? Number(form.product_id) : "undefined")}
                }
            }`}
            </pre>
            </div>
        </div>
        </details>

        <div className="grid grid-cols-1 gap-4 p-6 bg-white border border-gray-200 rounded-xl shadow-md">
        {/* 1. ROTEAMENTO */}
        <div className="space-y-3 bg-yellow-50 p-4 rounded-lg border border-yellow-100">
            <h2 className="text-[10px] font-black uppercase text-yellow-700 tracking-wider font-bold">
            1. Configuração de Roteamento
            </h2>
            <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">Source Type</label>
                <select
                name="source_type"
                value={form.source_type}
                onChange={handleChange}
                className="border rounded p-2 text-xs bg-white outline-none"
                >
                <option value="offer">Offer (Leilão)</option>
                <option value="banner">Banner</option>
                <option value="whatsapp">WhatsApp</option>
                </select>
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">Product ID</label>
                <input
                name="product_id"
                value={form.product_id}
                onChange={handleChange}
                className="border rounded p-2 text-xs outline-none"
                placeholder="Ex: 6"
                />
            </div>
            </div>
        </div>

        {/* 2. IDENTIDADE */}
        <div className="space-y-4 p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
            <div className="flex justify-between items-center border-b pb-3 mb-4">
            <div className="flex items-center">
                <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wide">2. Identidade do Proponente</h2>
                <Help
                title="Mapeamento Objeto 'Entity'"
                node="entity"
                items={[
                    {
                    label: "ID Entidade",
                    key: "entity_id",
                    format: "String",
                    value: form.entity_id,
                    error: "Required",
                    },
                    { label: "Nome", key: "name", format: "String", value: form.name, error: "Required" },
                    {
                    label: "CPF/CNPJ",
                    key: "document",
                    format: "String",
                    value: form.document,
                    error: "Invalid Document",
                    },
                    { label: "Email", key: "email", format: "Email", value: form.email, error: "Invalid Email" },
                    {
                    label: "Nascimento",
                    key: "birth_date",
                    format: "YYYY-MM-DD",
                    value: form.birth_date,
                    error: "Required",
                    },
                    { label: "Gênero", key: "gender", format: "M/F/O", value: form.gender, error: "Required" },
                ]}
                />
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Entity ID</label>
                <input
                name="entity_id"
                value={form.entity_id}
                onChange={handleChange}
                className="w-16 border border-slate-200 rounded p-1 text-[10px] font-mono text-center bg-slate-50"
                />
            </div>
            </div>

            <div className="flex gap-4 p-2 bg-slate-50 border border-slate-200 rounded-xl justify-center items-center mb-2">
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                <input
                type="radio"
                name="tipo_pessoa"
                checked={tipoPessoa === "PF"}
                onChange={() => setTipoPessoa("PF")}
                className="accent-[#d900d9] h-3.5 w-3.5"
                />
                Pessoa Física (PF)
            </label>
            <div className="w-px h-4 bg-slate-300" />
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
                <input
                type="radio"
                name="tipo_pessoa"
                checked={tipoPessoa === "PJ"}
                onChange={() => setTipoPessoa("PJ")}
                className="accent-[#d900d9] h-3.5 w-3.5"
                />
                Pessoa Jurídica (PJ)
            </label>
            </div>

            <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-slate-400 uppercase">
                {tipoPessoa === "PF" ? "Nome Completo" : "Nome / Razão Social"}
            </label>
            <input
                name="name"
                value={form.name}
                onChange={handleChange}
                className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-200"
            />
            </div>

            <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">
                {tipoPessoa === "PF" ? "CPF" : "Documento (CNPJ)"}
                </label>
                <input
                name="document"
                value={form.document}
                onChange={handleChange}
                className="border border-slate-200 rounded-lg p-2.5 text-sm outline-none"
                />
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Celular</label>
                <input
                name="phone"
                value={form.phone}
                onChange={handleChange}
                className="border border-slate-200 rounded-lg p-2.5 text-sm outline-none"
                />
            </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">E-mail</label>
                <input
                name="email"
                value={form.email}
                onChange={handleChange}
                className="border border-slate-200 rounded-lg p-2.5 text-sm outline-none"
                />
            </div>
            <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-400 uppercase">Data de Nascimento</label>
                <input
                type="date"
                name="birth_date"
                value={form.birth_date}
                onChange={handleChange}
                className="border border-slate-200 rounded-lg p-2.5 text-sm outline-none"
                />
            </div>
            </div>
        </div>

        <button
            onClick={executarFluxo}
            disabled={loading}
            className={`w-full text-white py-4 rounded-2xl font-bold transition-all shadow-md active:scale-95 text-sm uppercase tracking-widest font-['Inter',_sans-serif] ${
            loading ? "bg-[#9c009c] cursor-not-allowed animate-pulse" : "bg-[#d900d9] hover:bg-[#b800b8]"
            }`}
        >
            {loading ? "Processando..." : "Fazer cotação de seguro auto"}
        </button>
        </div>
    </div>
    );
}