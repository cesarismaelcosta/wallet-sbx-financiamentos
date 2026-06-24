import { createLazyFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { WalletLogo } from "@/components/brand/WalletLogo"; // Se o componente existir no projeto
import { Button } from "@/components/ui/button";
import { orchestrateNavigation } from "@/features/financial-hub/core/hooks/useOrchestrator";

export const Route = createLazyFileRoute("/sandbox/veiculos")({
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
    entity_id: "",
    name: "",
    document: "",
    email: "",
    phone: "",
    birth_date: "",
    gender: "",
    source_type: "offer",
    product_id: "",
    manager_name: "Sold",
    seller_id: "5005",
    legal_name: "Logística TransBrasil LTDA",
    trade_name: "Transportes SBX",
    economic_group: "Grupo SBX",
    event_id: "779585",
    event_description: "Caminhões e carros com financiamento",
    event_start_date: "2026-04-20T09:00:00Z",
    event_end_date: "2026-04-30T18:00:00Z",
    offer_id: "4624999",
    offer_description: "TOYOTA HILUX CDLOWM4FD 2.8, 2022/2022, Placa FINAL 6 (MA)",
    category: "Carros",
    offer_value: "100000.00",
    manufacture_year: "2022",
    model_year: "2022",
    fipe_code: "002015-0",
    fipe_value: "150000.00",
  });

  // Controle reativo do tipo de proponente (PF ou PJ)
  const [tipoPessoa, setTipoPessoa] = useState<"PF" | "PJ">("PF");

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // [NOVO] Gatilho de mutação controlada para preenchimento automático PF/PJ
  useEffect(() => {
    if (tipoPessoa === "PF") {
      setForm((prev) => ({
        ...prev,
        entity_id: "9999",
        name: "Teste PF",
        document: "435.770.590-87",
        email: "cesar.costa@superbid.net",
        phone: "(21) 98855-0999",
        birth_date: "2000-06-01",
        gender: "M",
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        entity_id: "8888",
        name: "Teste PJ",
        document: "15.898.094/0001-35",
        email: "cesar.costa@superbid.net", // corrigido para manter string limpa de teste
        phone: "(21) 98855-0999",
        birth_date: "2010-06-01",
        gender: "",
      }));
    }
  }, [tipoPessoa]);

  // [NOVO] Gatilho de mutação controlada para preenchimento automático de Veículos por Categoria
  useEffect(() => {
    if (form.category === "Carros") {
      setForm((prev) => ({
        ...prev,
        offer_id: "4624999",
        offer_description: "TOYOTA HILUX CDLOWM4FD 2.8, 2022/2022, Placa FINAL 6 (MA)",
        offer_value: "100000.00",
        manufacture_year: "2022",
        model_year: "2022",
        fipe_code: "002015-0",
        fipe_value: "150000.00",
      }));
    } else if (form.category === "Caminhões") {
      setForm((prev) => ({
        ...prev,
        offer_id: "4624888", // Mantido o ID fornecido
        offer_description: "CAVALO MECÂNICO MERCEDES-BENZ ACTROS 2548S, 2023/2023, Placa FINAL 4 (RO)",
        offer_value: "508000.00",
        manufacture_year: "2023",
        model_year: "2023",
        fipe_code: "509321-0",
        fipe_value: "590000.00",
      }));
    }
  }, [form.category]);


  const executarFluxo = async () => {
    setLoading(true);
    
    const urlParams = new URLSearchParams(window.location.search);
    const currentUrl = window.location.href;
    const previousUrl = document.referrer || "";

    // Captura o product_id dinamicamente da URL. Se não existir, o Orquestrador trata no backend
    const dynamicProductId = urlParams.get("product_id") ? Number(urlParams.get("product_id")) : undefined;

    setLoading(true);

    const cleanOfferValue = parseFloat(String(form.offer_value).replace(/[^0-9.]/g, "")) || 0;
    const cleanFipeValue = parseFloat(String(form.fipe_value).replace(/[^0-9.]/g, "")) || 0;

    // PAYLOAD LIMPO E REAL: Envia a ação de SIMULATION direto com a entidade da tela
    const payload = {
      action: "CONSULT",
      product_id: dynamicProductId,
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
        utm_source: urlParams.get("utm_source") || "sandbox",
        utm_medium: urlParams.get("utm_medium") || "web_app",
        utm_campaign: urlParams.get("utm_campaign") || form.offer_id || "vdp_simulation",
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
    console.log("Payload Gerado Category:", payload.offer?.category);
    console.log("Payload Gerado Product ID:", payload.product_id);
    console.log("Payload Gerado:", payload);
    console.groupEnd();

    try {
        // 2. O hook apenas executa o transporte
        await orchestrateNavigation(
            'CONSULT',
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
                {/* O Trace ID é o nosso rastro de auditoria (visit_update_id) */}
                Trace ID: {debugInfo.updateId ? debugInfo.updateId.substring(0, 8) : "Sincronizando..."}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* BLOCO DE PROTOCOLO DE COMUNICAÇÃO (RESTAURADO) */}
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
                // Lógica: Se tiver UTM na URL, usa. Se não, assume que é uma 'offer'.
                utm_source: params.get('utm_source') || 'offer', 
                utm_medium: params.get('utm_medium') || 'web_app',
                utm_campaign: params.get('utm_campaign') || form.offer_id || 'vdp_simulation',
                origin_url: currentUrl 
              },
              "product_id": (form.product_id ? Number(form.product_id) : "undefined"),
              "manager": ${form.source_type === "offer" ? JSON.stringify({ manager_name: form.manager_name }) : "undefined"},
              "seller": ${
                form.source_type === "offer"
                  ? JSON.stringify(
                      {
                        seller_id: form.seller_id,
                        legal_name: form.legal_name,
                        trade_name: form.trade_name,
                        economic_group: form.economic_group,
                      },
                      null,
                      2,
                    )
                  : "undefined"
              },
              "event": ${
                form.source_type === "offer"
                  ? JSON.stringify(
                      {
                        event_id: form.event_id,
                        event_description: form.event_description,
                        event_start_date: form.event_start_date,
                        event_end_date: form.event_end_date,
                      },
                      null,
                      2,
                    )
                  : "undefined"
              },
              "offer": ${
                form.source_type === "offer"
                  ? JSON.stringify(
                      {
                        offer_id: form.offer_id,
                        offer_description: form.offer_description,
                        offer_value: parseFloat(String(form.offer_value).replace(/[^0-9.]/g, "") || "0"),
                        category: form.category,
                        vehicle_details: {
                          manufacture_year: Number(form.manufacture_year),
                          model_year: Number(form.model_year),
                          fipe_code: form.fipe_code,
                          fipe_value: parseFloat(String(form.fipe_value).replace(/[^0-9.]/g, "") || "0"),
                        },
                      },
                      null,
                      2,
                    )
                  : "undefined"
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

          {/* [NOVO] Alternador Visual de Tipo de Proponente (PF / PJ) */}
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
            {/* Label Dinâmico baseado na escolha do tipo de pessoa */}
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
              {/* Label Dinâmico baseado na escolha do tipo de pessoa */}
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

        {/* 3. VENDEDOR (SELLER) */}
        {form.source_type === "offer" && (
          <div className="space-y-4 p-5 bg-indigo-50 border border-indigo-100 rounded-xl">
            <div className="flex items-center">
              <h2 className="text-xs font-bold uppercase text-indigo-700 tracking-wide">3. Operador e Vendedor</h2>
              <Help
                title="Mapeamento 'Manager' & 'Seller'"
                node="payload"
                items={[
                  {
                    label: "Operador",
                    key: "manager.manager_name",
                    format: "String",
                    value: form.manager_name,
                    error: "Required",
                  },
                  {
                    label: "Seller ID",
                    key: "seller.seller_id",
                    format: "String",
                    value: form.seller_id,
                    error: "Required",
                  },
                  {
                    label: "Razão Social",
                    key: "seller.legal_name",
                    format: "String",
                    value: form.legal_name,
                    error: "Required",
                  },
                  {
                    label: "Fantasia",
                    key: "seller.trade_name",
                    format: "String",
                    value: form.trade_name,
                    error: "N/A",
                  },
                  {
                    label: "Grupo",
                    key: "seller.economic_group",
                    format: "String",
                    value: form.economic_group,
                    error: "N/A",
                  },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-indigo-400 uppercase">Manager Name</label>
                <input
                  name="manager_name"
                  value={form.manager_name}
                  onChange={handleChange}
                  className="border border-indigo-200 rounded-lg p-2.5 text-sm bg-white"
                  placeholder="Ex: Sold"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-indigo-400 uppercase">Seller ID</label>
                <input
                  name="seller_id"
                  value={form.seller_id}
                  onChange={handleChange}
                  className="border border-indigo-200 rounded-lg p-2.5 text-sm bg-white"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-indigo-400 uppercase">Legal Name (Razão Social)</label>
              <input
                name="legal_name"
                value={form.legal_name}
                onChange={handleChange}
                className="w-full border border-indigo-200 rounded-lg p-2.5 text-sm bg-white"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-indigo-400 uppercase">Trade Name (Fantasia)</label>
                <input
                  name="trade_name"
                  value={form.trade_name}
                  onChange={handleChange}
                  className="border border-indigo-200 rounded-lg p-2.5 text-sm bg-white"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-indigo-400 uppercase">Economic Group</label>
                <input
                  name="economic_group"
                  value={form.economic_group}
                  onChange={handleChange}
                  className="border border-indigo-200 rounded-lg p-2.5 text-sm bg-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* 4. EVENTO */}
        {form.source_type === "offer" && (
          <div className="space-y-4 p-5 bg-purple-50 border border-purple-100 rounded-xl">
            <div className="flex items-center">
              <h2 className="text-xs font-bold uppercase text-purple-700 tracking-wide">4. Contexto do Evento</h2>
              <Help
                title="Mapeamento 'Event'"
                node="event"
                items={[
                  { label: "ID Evento", key: "event_id", format: "String", value: form.event_id, error: "Required" },
                  {
                    label: "Descrição",
                    key: "event_description",
                    format: "String",
                    value: form.event_description,
                    error: "N/A",
                  },
                ]}
              />
            </div>
            <div className="grid grid-cols-4 gap-3">
              <div className="flex flex-col gap-1 col-span-1">
                <label className="text-[9px] font-bold text-purple-400 uppercase">ID Evento</label>
                <input
                  name="event_id"
                  value={form.event_id}
                  onChange={handleChange}
                  className="border border-purple-200 rounded-lg p-2.5 text-sm bg-white"
                />
              </div>
              <div className="flex flex-col gap-1 col-span-3">
                <label className="text-[9px] font-bold text-purple-400 uppercase">Descrição do Evento</label>
                <input
                  name="event_description"
                  value={form.event_description}
                  onChange={handleChange}
                  className="border border-purple-200 rounded-lg p-2.5 text-sm bg-white"
                />
              </div>
            </div>
          </div>
        )}

        {/* 5. OFERTA / BEM */}
        <div className="space-y-4 p-6 bg-[#fdf2ff] border border-[#f5d9ff] rounded-xl shadow-sm">
          <div className="flex justify-between items-center border-b border-emerald-100 pb-3 mb-4">
            <div className="flex items-center">
              <h2 className="text-xs font-bold uppercase text-[#8a008a] tracking-wide">5. Atributos do Bem (Offer)</h2>
              <Help
                title="Mapeamento 'Offer' & 'JSONB Details'"
                node="offer"
                items={[
                  { label: "ID Oferta", key: "offer_id", format: "String", value: form.offer_id, error: "Required" },
                  { label: "Valor", key: "offer_value", format: "Float", value: form.offer_value, error: "Required" },
                  {
                    label: "Categoria",
                    key: "category",
                    format: "String",
                    value: form.category,
                    error: "Roteamento Falhou",
                  },
                  {
                    label: "Ano Fab.",
                    key: "vehicle_details.manufacture_year",
                    format: "Number",
                    value: form.manufacture_year,
                    error: "N/A",
                  },
                  {
                    label: "Ano Modelo",
                    key: "vehicle_details.model_year",
                    format: "Number",
                    value: form.model_year,
                    error: "N/A",
                  },
                  {
                    label: "Cód. Fipe",
                    key: "vehicle_details.fipe_code",
                    format: "String",
                    value: form.fipe_code,
                    error: "N/A",
                  },
                ]}
              />
            </div>
            <span className="text-[10px] bg-[#f5d9ff] text-[#8a008a] px-2 py-0.5 rounded-full font-bold uppercase border border-[#e8b5ff]">
              JSONB Snapshot
            </span>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[9px] font-bold text-[#a300a3] uppercase">ID da Oferta</label>
            <input
              name="offer_id"
              value={form.offer_id}
              onChange={handleChange}
              className="w-full border border-emerald-200 rounded-lg p-2.5 text-sm bg-white mb-2 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4 mb-2">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-[#a300a3] uppercase">Categoria</label>
              {/* O select nativo dispara o handleChange, ativando o useEffect acima */}
              <select
                name="category"
                value={form.category}
                onChange={handleChange}
                className="border border-emerald-200 rounded-lg p-2.5 text-sm bg-white outline-none"
              >
                <option value="Caminhões">Caminhões</option>
                <option value="Carros">Carros</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-[#a300a3] uppercase">Valor da Oferta</label>
              <input
                name="offer_value"
                value={form.offer_value}
                onChange={handleChange}
                className="border border-emerald-200 rounded-lg p-2.5 text-sm font-bold text-emerald-800"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-[#a300a3] uppercase">Ano Fabricação</label>
              <input
                name="manufacture_year"
                value={form.manufacture_year}
                onChange={handleChange}
                className="border border-emerald-200 rounded-lg p-2.5 text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-[#a300a3] uppercase">Ano Modelo</label>
              <input
                name="model_year"
                value={form.model_year}
                onChange={handleChange}
                className="border border-emerald-200 rounded-lg p-2.5 text-sm bg-white"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mt-2">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-[#a300a3] uppercase">Código FIPE</label>
              <input
                name="fipe_code"
                value={form.fipe_code}
                onChange={handleChange}
                className="border border-emerald-200 rounded-lg p-2.5 text-sm bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-[#a300a3] uppercase">Valor FIPE / Avaliação</label>
              <input
                name="fipe_value"
                value={form.fipe_value}
                onChange={handleChange}
                className="border border-emerald-200 rounded-lg p-2.5 text-sm bg-white"
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
          {loading ? "Processando..." : "SIMULAR FINANCIAMENTO"}
        </button>
      </div>
    </div>
  );
}
