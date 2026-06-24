import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { WalletLogo } from "@/components/brand/WalletLogo"; // Se o componente existir no projeto
import { Button } from "@/components/ui/button";
import { orchestrateNavigation } from "@/features/financial-hub/core/hooks/useOrchestrator";

export const Route = createLazyFileRoute("/sandbox/cartao")({
  component: TesteSimulacao,
});

function TesteSimulacao() {
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
  // 1. ESTADO INICIAL (Sincronizado com visits e visit_offers)
  // =========================================================================
  const [form, setForm] = useState({
    entity_id: "9999", 
    name: "Cesar Ismael Pereira da Costa",
    document: "03817035764",
    phone: "(21) 988550999",
    email: "cesarismaelcosta@gmail.com",
    birth_date: "1974-07-02",
    gender: "M",
    source_type: 'offer', 
    product_id: 8,              // Cartão de crédito
    manager_name: "SOLD",
    seller_id: "999999",
    legal_name: "BANCO C6 S.A.",
    trade_name: "C6 Bank",
    economic_group: "C6",
    event_id: "779585",
    event_description: "Evento Máquinas - São Paulo",
    event_start_date: "2026-04-20T09:00:00Z",
    event_end_date: "2026-04-30T18:00:00Z",
    offer_id: "4674421",
    offer_description: "MÁQUINA AMARELA DO C6",
    category: "Máquinas Amarelas", 
    offer_value: "120000.00",
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const executarFluxo = async () => {
    if (loading) return;

    const urlParams = new URLSearchParams(window.location.search);
    const currentUrl = window.location.href;
    const previousUrl = document.referrer || "";

    setLoading(true);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      alert("Erro de Ambiente: Chaves do Supabase não encontradas no .env");
      setLoading(false);
      return;
    }

    const cleanOfferValue = parseFloat(String(form.offer_value).replace(/[^0-9.]/g, "")) || 0;
    const cleanFipeValue = parseFloat(String(form.fipe_value).replace(/[^0-9.]/g, "")) || 0;

    // PAYLOAD LIMPO E REAL: Envia a ação de SIMULATION direto com a entidade da tela
    const payload = {
      action: "CONSULT",
      product_id: form.product_id,
      entity: {
        entity_id: form.entity_id,
        name: form.name,
        document: form.document,
        phone: form.phone,
        email: form.email,
        birth_date: form.birth_date,
        gender: form.gender,
      },
      interaction_context: {
        utm_source: urlParams.get("utm_source") || "offer",
        utm_medium: urlParams.get("utm_medium") || "offer",
        utm_campaign: urlParams.get("utm_campaign") || "offer_cartao",
        origin_url: currentUrl,
      },
      origin_url: previousUrl.includes("/sandbox") ? previousUrl : currentUrl,
      target_url: currentUrl,
      offer: form.source_type === "offer" ? {
        offer_id: form.offer_id,
        offer_description: form.offer_description,
        offer_value: cleanOfferValue,
        category: form.category,
        vehicle_details: {
          manufacture_year: Number(form.manufacture_year),
          model_year: Number(form.model_year),
          fipe_code: form.fipe_code,
          fipe_value: cleanFipeValue,
        },
      } : undefined,
      manager: form.source_type === "offer" ? { manager_name: form.manager_name } : undefined,
      seller: form.source_type === "offer" ? {
        seller_id: form.seller_id,
        legal_name: form.legal_name,
        trade_name: form.trade_name,
        economic_group: form.economic_group,
      } : undefined,
      event: form.source_type === "offer" ? {
        event_id: form.event_id,
        event_description: form.event_description,
        event_start_date: form.event_start_date,
        event_end_date: form.event_end_date,
      } : undefined,
    };

    console.group("🚀 [sbX] Disparando Fluxo Real de Simulação");
    console.log("Payload Gerado:", payload);
    console.groupEnd();

    try {
        // 2. O hook apenas executa o transporte
        await orchestrateNavigation(
            'SIMULATE',
            payload
        );
    } catch (err) {
        console.error("Erro na orquestração:", err);
    } finally {
        setLoading(false);
    }
  };
  
  const Help = ({ title, node, items }: { 
    title: string, 
    node: string,
    items: { label: string, key: string, format: string, value: string, error: string }[] 
  }) => (
    <div className="group relative inline-block ml-2">
      <span className="cursor-help bg-slate-200 text-slate-500 w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold italic">?</span>
      <div className="absolute hidden group-hover:block bg-[#1e293b] text-white p-4 rounded-lg shadow-2xl text-[11px] w-[420px] z-50 -left-4 top-6 border border-slate-600">
        <p className="font-bold text-blue-400 mb-3 uppercase tracking-widest border-b border-slate-700 pb-1">{title}</p>
        <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
          {items.map((item, idx) => (
            <div key={idx} className="space-y-1">
              <div className="flex justify-between items-center">
                <span className="font-bold text-slate-200 uppercase text-[9px]">{item.label}</span>
                <code className="text-[9px] bg-slate-900 px-1 text-emerald-400">{node}.{item.key}</code>
              </div>
              <p className="text-slate-400 leading-tight">Formato: <span className="text-slate-300">{item.format}</span></p>
              <p className="text-slate-400 font-mono italic">Valor Atual: "{item.value}"</p>
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
          <button onClick={() => navigate({ to: '/sandbox' })} className="hover:opacity-80 transition-opacity">
            <WalletLogo size="md" withTagline />
          </button>
        </div>
      </header>

      {/* BLOCO DE PROTOCOLO RESTAURADO */}
      <details className="bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm overflow-hidden transition-all" open>
        <summary className="text-[10px] font-black text-slate-600 cursor-pointer uppercase tracking-widest">Protocolo de Comunicação & Persistência (Docs)</summary>
        <div className="mt-4 space-y-4 text-[10px] font-mono leading-tight">
          <div className="p-3 bg-white border border-slate-200 rounded text-slate-700 font-sans space-y-2 text-[11px]">
            <p className="text-blue-700 font-bold mb-1 italic">Estratégia de Persistência:</p>
            <p className="text-slate-600 leading-relaxed">
              1. Os dados em <code className="bg-slate-100 px-1 font-bold">entity</code> são salvos na tabela <code className="font-bold">visits</code>.<br/>
              2. Detalhes em <code className="bg-slate-100 px-1 font-bold">manager | seller | event | offer</code> são salvos na tabela <code className="font-bold">visit_offers</code>.<br/>
              3. O roteamento é buscado na tabela <code className="bg-slate-100 px-1 font-bold text-orange-600">simulation_partner_config</code> de acordo com a categoria.
            </p>
          </div>
          
          <div className="bg-slate-900 text-slate-300 p-4 rounded overflow-x-auto shadow-inner">
            <pre className="text-[9px] leading-tight font-mono">
              {`// BODY DA REQUISIÇÃO REAL (FULL PAYLOAD)
                {
                  "entity": ${JSON.stringify({
                    entity_id: form.entity_id,
                    name: form.name,
                    document: form.document,
                    phone: form.phone,
                    email: form.email,
                    birth_date: form.birth_date,
                    gender: form.gender
                  }, null, 2)},
                  "interaction_context": {
                    "utm_source": "${params.get('utm_source') || '...'}",
                    "utm_medium": "${params.get('utm_medium') || '...'}",
                    "utm_campaign": "${params.get('utm_campaign') || '...'}",
                    "source_url": "..."
                  },
                  "product_id": ${form.product_id ? Number(form.product_id) : 'undefined'},
                  "manager": ${form.source_type === 'offer' ? JSON.stringify({ manager_name: form.manager_name }) : 'undefined'},
                  "seller": ${form.source_type === 'offer' ? JSON.stringify({
                    seller_id: form.seller_id,
                    legal_name: form.legal_name,
                    trade_name: form.trade_name,
                    economic_group: form.economic_group
                  }, null, 2) : 'undefined'},
                  "event": ${form.source_type === 'offer' ? JSON.stringify({
                    event_id: form.event_id,
                    event_description: form.event_description,
                    event_start_date: form.event_start_date,
                    event_end_date: form.event_end_date
                  }, null, 2) : 'undefined'},
                  "offer": ${form.source_type === 'offer' ? JSON.stringify({
                    offer_id: form.offer_id,
                    offer_description: form.offer_description,
                    offer_value: parseFloat(form.offer_value),
                    category: form.category
                  }, null, 2) : 'undefined'}
                }`}
            </pre>
          </div>
        </div>
      </details>

      <div className="grid grid-cols-1 gap-4 p-6 bg-white border border-gray-200 rounded-xl shadow-md">
        
        {/* 1. ROTEAMENTO */}
        <div className="space-y-3 bg-yellow-50 p-4 rounded-lg border border-yellow-100">
          <h2 className="text-[10px] font-black uppercase text-yellow-700 tracking-wider font-bold">1. Configuração de Roteamento</h2>
          <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">Source Type</label>
                <select name="source_type" value={form.source_type} onChange={handleChange} className="border rounded p-2 text-xs bg-white outline-none">
                    <option value="offer">Offer (Leilão)</option>
                    <option value="banner">Banner</option>
                    <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-gray-400 uppercase">Product ID</label>
                <input name="product_id" value={form.product_id} onChange={handleChange} className="border rounded p-2 text-xs outline-none" placeholder="Ex: 6" />
              </div>
          </div>
        </div>

        {/* 2. IDENTIDADE */}
        <div className="space-y-4 p-6 bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="flex justify-between items-center border-b pb-3 mb-4">
            <div className="flex items-center">
              <h2 className="text-xs font-bold uppercase text-slate-500 tracking-wide">2. Identidade do Proponente</h2>
              <Help title="Mapeamento Objeto 'Entity'" node="entity"
                items={[
                  { label: "ID Entidade", key: "entity_id", format: "String", value: form.entity_id, error: "Required" },
                  { label: "Nome", key: "name", format: "String", value: form.name, error: "Required" },
                  { label: "CPF", key: "document", format: "String", value: form.document, error: "Invalid CPF" },
                  { label: "Email", key: "email", format: "Email", value: form.email, error: "Invalid Email" },
                  { label: "Nascimento", key: "birth_date", format: "YYYY-MM-DD", value: form.birth_date, error: "Required" },
                  { label: "Gênero", key: "gender", format: "M/F/O", value: form.gender, error: "Required" },
                ]}
              />
            </div>
            <div className="flex flex-col gap-1">
               <label className="text-[9px] font-bold text-slate-400 uppercase">Entity ID</label>
               <input name="entity_id" value={form.entity_id} onChange={handleChange} className="w-16 border border-slate-200 rounded p-1 text-[10px] font-mono text-center bg-slate-50" />
            </div>
          </div>
          
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-slate-400 uppercase">Nome Completo</label>
            <input name="name" value={form.name} onChange={handleChange} className="w-full border border-slate-200 rounded-lg p-2.5 text-sm outline-none focus:ring-2 focus:ring-slate-200" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase">CPF</label>
              <input name="document" value={form.document} onChange={handleChange} className="border border-slate-200 rounded-lg p-2.5 text-sm outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase">Celular</label>
              <input name="phone" value={form.phone} onChange={handleChange} className="border border-slate-200 rounded-lg p-2.5 text-sm outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase">E-mail</label>
              <input name="email" value={form.email} onChange={handleChange} className="border border-slate-200 rounded-lg p-2.5 text-sm outline-none" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase">Data de Nascimento</label>
              <input type="date" name="birth_date" value={form.birth_date} onChange={handleChange} className="border border-slate-200 rounded-lg p-2.5 text-sm outline-none" />
            </div>
          </div>
        </div>

        {/* 3. VENDEDOR */}
        <div className="space-y-4 p-5 bg-indigo-50 border border-indigo-100 rounded-xl">
          <div className="flex items-center mb-2">
            <h2 className="text-xs font-bold uppercase text-indigo-700 tracking-wide">3. Operador e Vendedor</h2>
            <Help title="Mapeamento 'Manager' & 'Seller'" node="payload"
              items={[
                { label: "Operador", key: "manager.manager_name", format: "String", value: form.manager_name, error: "Required" },
                { label: "Seller ID", key: "seller.seller_id", format: "String", value: form.seller_id, error: "Required" },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-indigo-400 uppercase">Manager Name</label>
              <input name="manager_name" value={form.manager_name} onChange={handleChange} className="border border-indigo-200 rounded-lg p-2.5 text-sm bg-white" placeholder="Ex: Sold" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-indigo-400 uppercase">Seller ID</label>
              <input name="seller_id" value={form.seller_id} onChange={handleChange} className="border border-indigo-200 rounded-lg p-2.5 text-sm bg-white" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-indigo-400 uppercase">Legal Name (Razão Social)</label>
            <input name="legal_name" value={form.legal_name} onChange={handleChange} className="w-full border border-indigo-200 rounded-lg p-2.5 text-sm bg-white" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-indigo-400 uppercase">Trade Name (Fantasia)</label>
              <input name="trade_name" value={form.trade_name} onChange={handleChange} className="border border-indigo-200 rounded-lg p-2.5 text-sm bg-white" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-indigo-400 uppercase">Economic Group</label>
              <input name="economic_group" value={form.economic_group} onChange={handleChange} className="border border-indigo-200 rounded-lg p-2.5 text-sm bg-white" />
            </div>
          </div>
        </div>

        {/* 5. OFERTA / BEM */}
        <div className="space-y-4 p-6 bg-[#fdf2ff] border border-[#f5d9ff] rounded-xl shadow-sm">
          <div className="flex justify-between items-center border-b border-emerald-100 pb-3 mb-4">
            <h2 className="text-xs font-bold uppercase text-[#8a008a] tracking-wide">5. Atributos do Bem (Offer)</h2>
            <span className="text-[10px] bg-[#f5d9ff] text-[#8a008a] px-2 py-0.5 rounded-full font-bold uppercase border border-[#e8b5ff]">JSONB Snapshot</span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-[#a300a3] uppercase">ID da Oferta</label>
            <input name="offer_id" value={form.offer_id} onChange={handleChange} className="w-full border border-emerald-200 rounded-lg p-2.5 text-sm bg-white outline-none" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-[#a300a3] uppercase">Categoria</label>
              <select name="category" value={form.category} onChange={handleChange} className="border border-emerald-200 rounded-lg p-2.5 text-sm bg-white">
                  <option value="Máquinas Amarelas">Máquinas Amarelas</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-[#a300a3] uppercase">Valor da Oferta</label>
              <input name="offer_value" value={form.offer_value} onChange={handleChange} className="border border-emerald-200 rounded-lg p-2.5 text-sm font-bold text-emerald-800" />
            </div>
          </div>
          
          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-[#a300a3] uppercase">Descrição do Lote</label>
            <input name="offer_description" value={form.offer_description} onChange={handleChange} className="w-full border border-emerald-200 rounded-lg p-2.5 text-sm bg-white outline-none" />
          </div>
        </div>

        <button 
          onClick={executarFluxo} 
          disabled={loading}
          className={`w-full text-white py-4 rounded-2xl font-bold transition-all shadow-md active:scale-95 text-sm uppercase tracking-widest ${
            loading 
              ? "bg-[#9c009c] cursor-not-allowed animate-pulse" 
              : "bg-[#d900d9] hover:bg-[#b800b8]"
          }`}
        >
          {loading ? "Processando..." : "Simular parcelamento em cartão"}
        </button>

      </div>
    </div>
  );
}