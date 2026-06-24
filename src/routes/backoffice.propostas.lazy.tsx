/**
 * ============================================================================
 * @fileoverview Monitor de Propostas (Backoffice)
 * @route /backoffice/propostas
 * * @description
 * Tela de acompanhamento e esteira de trabalho operacional. Exibe todas as 
 * simulações criadas, permitindo cruzar filtros de parceiros, produtos, 
 * situação atual e datas.
 * ============================================================================
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Search,
  Filter,
  Download,
  ChevronDown,
  Camera, // <-- Importado para atuar como fallback de imagem ausente
} from "lucide-react";
import { DateRange } from "react-day-picker";

// Componentes da Interface (Design System)
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";

// Conexão com Banco de Dados
import { supabase } from "@/integrations/supabase/client";

export const Route = createLazyFileRoute("/backoffice/propostas")({
  component: PropostasPage,
});

// ============================================================================
// HELPERS E UTILITÁRIOS
// ============================================================================

const STATUS_STYLES: Record<string, string> = {
  simulacao: "bg-primary/10 text-primary",
  "em análise": "bg-amber-500/10 text-amber-600",
  analise: "bg-amber-500/10 text-amber-600",
  aprovada: "bg-success/15 text-success",
  recusada: "bg-destructive/10 text-destructive",
  "pendente docs": "bg-muted text-muted-foreground",
  default: "bg-muted text-muted-foreground",
};

function statusClass(status: string | null) {
  if (!status) return STATUS_STYLES.default;
  const key = status.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return STATUS_STYLES[key] ?? STATUS_STYLES.default;
}

const BRL = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

function formatDate(iso: string | null) {
  if (!iso) return { d: "—", h: "" };
  const dt = new Date(iso);
  return {
    d: dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
    h: dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  };
}

// ============================================================================
// COMPONENTE PRINCIPAL
// ============================================================================
function PropostasPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>("Todos");
  const [dateRange, setDateRange] = useState<"30" | "90" | "all" | "custom">("30");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();

  // Estados dos seletores de múltipla escolha
  const [partnersList, setPartnersList] = useState<any[]>([]);
  const [productsList, setProductsList] = useState<any[]>([]);
  const [selectedPartners, setSelectedPartners] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);

  useEffect(() => {
    async function loadDropdowns() {
      const { data: pData } = await supabase.from('partners').select('id, name').eq('is_active', true).order('name');
      if (pData) setPartnersList(pData);

      const { data: prData } = await supabase.from('product_types').select('id, name').order('name');
      if (prData) setProductsList(prData);
    }
    loadDropdowns();
  }, []);

  async function load() {
    const [{ data: simData }, { data: statusData }] = await Promise.all([
      supabase.from("simulations").select(`
        *, 
        financial_institutions(name, logo_url),
        product_types(name),
        stage_types(name),
        status_types(name),
        partners(name, logo_url), 
        simulation_offers (
          offer_description,
          event_id,
          event_description,
          offer_value,
          event_end_date
        )
      `),
      supabase.from("status_types").select("name")
    ]);

    if (simData) setRows(simData);
    if (statusData) setStatusOptions(statusData.map(s => s.name));
  }

  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    const t = { total: rows.length, simulacao: 0, analise: 0, aprovada: 0, volume: 0 };
    rows.forEach(r => {
      const s = (r.status_types?.name ?? "").toLowerCase();
      if (s.includes("simul")) t.simulacao++;
      else if (s.includes("anal")) t.analise++;
      else if (s.includes("aprov")) { t.aprovada++; t.volume += r.financed_amount ?? 0; }
    });
    return t;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const statusName = r.status_types?.name ?? "—";
      const matchStatus = selectedStatus === "Todos" || statusName === selectedStatus;
      
      const rawSearch = search.toLowerCase().trim();
      const rawDocSearch = search.replace(/\D/g, "");
      const rowDoc = r.document?.replace(/\D/g, "") || "";
      
      const matchSearch = 
        rawSearch === "" || 
        (r.name ?? "").toLowerCase().includes(rawSearch) || 
        (rawDocSearch !== "" && rowDoc.includes(rawDocSearch));

      const matchPartner = selectedPartners.length === 0 || selectedPartners.includes(String(r.partner_id));
      const matchProduct = selectedProducts.length === 0 || selectedProducts.includes(String(r.product_id));
      
      let matchDate = true;
      const rowDate = new Date(r.created_at);
      
      if (dateRange === "custom" && customRange?.from && customRange?.to) {
        matchDate = rowDate >= customRange.from && rowDate <= customRange.to;
      } else if (dateRange !== "all") {
        const days = parseInt(dateRange);
        const limitDate = new Date();
        limitDate.setDate(limitDate.getDate() - days);
        matchDate = rowDate >= limitDate;
      }
      
      return matchSearch && matchStatus && matchDate && matchPartner && matchProduct;
    });
  }, [rows, search, selectedStatus, dateRange, customRange, selectedPartners, selectedProducts]);

  return (
    <div className="font-sans space-y-6">
      
      {/* HEADER DA TELA */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Monitor de Propostas</h1>
          <p className="text-sm text-muted-foreground">Acompanhe simulações, análises e aprovações em tempo real.</p>
        </div>
        <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-xl"><Download className="mr-2 h-4 w-4" /> Exportar</Button>
            <Button onClick={load} className="rounded-xl"><RefreshCw className="mr-2 h-4 w-4" /> Atualizar</Button>
        </div>
      </div>

      {/* BLOCO DE KPIS */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
            { label: "Total de propostas", value: totals.total, highlight: false },
            { label: "Em simulação", value: totals.simulacao, highlight: false },
            { label: "Em análise", value: totals.analise, highlight: false },
            { label: "Aprovadas", value: totals.aprovada, highlight: false },
            { label: "Volume aprovado", value: BRL(totals.volume), highlight: true }
        ].map((t) => (
            <div key={t.label} className={`rounded-2xl border p-5 ${t.highlight ? "bg-[#fdf2f8] border-[#fbcfe8] text-[#d946ef]" : "border-border bg-card text-card-foreground"}`}>
                <div className={`text-xs font-semibold uppercase ${t.highlight ? "text-[#d946ef]" : "text-muted-foreground"}`}>{t.label}</div>
                <div className="mt-2 text-2xl font-bold">{t.value}</div>
            </div>
        ))}
      </div>

      {/* MÓDULO FILTROS E GRID */}
      <div className="rounded-2xl border border-border bg-card overflow-x-auto">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          
          {/* Busca unificada expansível (flex-1) */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome ou CPF..." className="h-10 rounded-xl pl-9" />
          </div>

          {/* Filtro Múltiplo: Parceiros */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 rounded-xl gap-2 bg-white hover:bg-muted/50 border border-border transition-colors">
                <Filter className="h-3.5 w-3.5 opacity-70" />
                Parceiro: {selectedPartners.length === 0 ? "Todos" : `${selectedPartners.length} selecionado(s)`}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="start">
              <Command>
                <CommandList>
                  <CommandGroup>
                    <CommandItem onSelect={() => setSelectedPartners([])} className="cursor-pointer">
                      <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${selectedPartners.length === 0 ? "bg-primary text-primary-foreground" : "opacity-50"}`}>
                        {selectedPartners.length === 0 && "✓"}
                      </div>
                      Todos Parceiros
                    </CommandItem>
                    {partnersList.map((p) => {
                      const isSelected = selectedPartners.includes(String(p.id));
                      return (
                        <CommandItem
                          key={p.id}
                          onSelect={() => {
                            if (isSelected) {
                              setSelectedPartners(selectedPartners.filter(id => id !== String(p.id)));
                            } else {
                              setSelectedPartners([...selectedPartners, String(p.id)]);
                            }
                          }}
                          className="cursor-pointer"
                        >
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? "bg-primary text-primary-foreground" : "opacity-50"}`}>
                            {isSelected && "✓"}
                          </div>
                          {p.name}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Filtro Múltiplo: Produtos */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 rounded-xl gap-2 bg-white hover:bg-muted/50 border border-border transition-colors">
                <Filter className="h-3.5 w-3.5 opacity-70" />
                Produto: {selectedProducts.length === 0 ? "Todos" : `${selectedProducts.length} selecionado(s)`}
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-0" align="start">
              <Command>
                <CommandList>
                  <CommandGroup>
                    <CommandItem onSelect={() => setSelectedProducts([])} className="cursor-pointer">
                      <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${selectedProducts.length === 0 ? "bg-primary text-primary-foreground" : "opacity-50"}`}>
                        {selectedProducts.length === 0 && "✓"}
                      </div>
                      Todos Produtos
                    </CommandItem>
                    {productsList.map((p) => {
                      const isSelected = selectedProducts.includes(String(p.id));
                      return (
                        <CommandItem
                          key={p.id}
                          onSelect={() => {
                            if (isSelected) {
                              setSelectedProducts(selectedProducts.filter(id => id !== String(p.id)));
                            } else {
                              setSelectedProducts([...selectedProducts, String(p.id)]);
                            }
                          }}
                          className="cursor-pointer"
                        >
                          <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary ${isSelected ? "bg-primary text-primary-foreground" : "opacity-50"}`}>
                            {isSelected && "✓"}
                          </div>
                          {p.name}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Filtro Simples: Situação */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 rounded-xl bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8] hover:bg-[#fce7f3] transition-colors">
                <Filter className="mr-2 h-3.5 w-3.5" /> Situação: {selectedStatus} <ChevronDown className="ml-2 h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-56 bg-[#fdf2f8] border-[#fbcfe8]" align="start">
              <Command>
                <CommandInput placeholder="Filtrar..." className="text-[#d946ef]" />
                <CommandList>
                  <CommandEmpty>Nenhum status encontrado.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem onSelect={() => setSelectedStatus("Todos")} className="text-[#d946ef] cursor-pointer">Todos</CommandItem>
                    {statusOptions.map((s) => (
                      <CommandItem key={s} onSelect={() => setSelectedStatus(s)} className="text-[#d946ef] cursor-pointer">{s}</CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          
          {/* Filtro: Período */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-10 rounded-xl hover:bg-[#fce7f3] transition-colors">
                <Filter className="mr-2 h-3.5 w-3.5" /> 
                Período: {dateRange === "custom" ? "Personalizado" : dateRange === "30" ? "30 dias" : dateRange === "90" ? "90 dias" : "Tudo"} 
                <ChevronDown className="ml-2 h-3 w-3" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="p-0 w-auto" align="start">
              <Command>
                <CommandList>
                  <CommandGroup>
                    <CommandItem onSelect={() => setDateRange("30")}>Últimos 30 dias</CommandItem>
                    <CommandItem onSelect={() => setDateRange("90")}>Últimos 90 dias</CommandItem>
                    <CommandItem onSelect={() => setDateRange("all")}>Todo o período</CommandItem>
                  </CommandGroup>
                  <div className="p-2 border-t">
                    <p className="text-xs font-semibold px-2 mb-2 text-muted-foreground">Personalizado:</p>
                    <Calendar mode="range" selected={customRange} onSelect={(range) => { setCustomRange(range); setDateRange("custom"); }} numberOfMonths={1} />
                  </div>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          
        </div>

        {/* ESTRUTURA DA TABELA */}
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-3 w-[80px]">Data</th>
              <th className="px-3 py-3 w-[150px]">Cliente</th>
              <th className="px-3 py-3 w-[150px]">Estágio/Produto</th>
              <th className="px-3 py-3 w-[200px]">Oferta</th>
              <th className="px-3 py-3 w-[140px] text-right">Financiado</th>
              <th className="px-3 py-3 w-[160px]">Situação</th>
              <th className="px-3 py-3 w-[140px]">Parceiro / Banco</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const created = formatDate(r.created_at);
              const updated = formatDate(r.updated_at);
              const statusName = r.status_types?.name ?? "—";
              const stageName = r.stage_types?.name ?? "—";
              const productName = r.product_types?.name ?? "—";
              const parcela = r.installments && r.installment_value ? `${r.installments}x ${BRL(r.installment_value)}` : "—";
              const offer = Array.isArray(r.simulation_offers) ? r.simulation_offers[0] : (r.simulation_offers || {});
              const endEvent = offer?.event_end_date ? new Date(offer.event_end_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";
              
              const rawDoc = r.document?.replace(/\D/g, "") || "";
              const doc = rawDoc.length === 14 
                ? rawDoc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
                : rawDoc.length === 11 
                ? rawDoc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
                : r.document || "—";
              
              const phone = r.phone?.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3") ?? "";
              
              return (
                <tr key={r.id} className="border-b border-border/60 hover:bg-accent/40">
                  <td className="px-3 py-3 w-[80px]"><div className="font-semibold">{created.d}</div><div className="text-xs text-muted-foreground">{created.h}</div></td>
                  
                  {/* CLIENTE */}
                  <td className="px-3 py-3 w-[220px]">
                    <div className="font-semibold text-[#d946ef] truncate" title={r.name}>{r.name || "—"}</div>
                    <div className="text-sm text-muted-foreground">{doc}</div>
                    <div className="text-sm text-muted-foreground">{phone || "—"}</div>
                  </td>

                  {/* PRODUTO */}
                  <td className="px-3 py-3 w-[150px]">
                    <div className="font-semibold">{stageName}</div>
                    <div className="text-xs text-muted-foreground">{productName}</div>
                    <div className="text-[10px] font-bold text-muted-foreground mt-0.5 uppercase tracking-tighter">{r.partners?.name || "—"}</div>
                  </td>

                  {/* OFERTA */}
                  <td className="px-3 py-3 max-w-[200px] sm:max-w-[250px]">
                    {/* Nome do veículo/oferta (Com truncate) */}
                    <div 
                      className="font-semibold truncate" 
                      title={offer?.offer_description}
                    >
                      {offer?.offer_description || "—"}
                    </div>

                    {/* Nome do Evento/Leilão (Com truncate) */}
                    <div 
                      className="text-xs text-muted-foreground truncate mt-0.5" 
                      title={offer?.event_description}
                    >
                      {offer?.event_id || "—"} - {offer?.event_description || "—"}
                    </div>

                    <div className="text-[11px] text-muted-foreground font-medium mt-0.5">
                      {BRL(offer?.offer_value)} {endEvent ? `(Fim: ${endEvent})` : ""}
                    </div>
                  </td>

                  {/* FINANCIAMENTO */}
                  <td className="px-3 py-3 w-[140px] text-right">
                    <div className="font-semibold">{BRL(r.financed_amount)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {r.down_payment_percentage === 0 
                        ? "Sem entrada" 
                        : r.down_payment_percentage != null 
                        ? `Entrada: ${r.down_payment_percentage.toFixed(0)}%` 
                        : "—"}
                    </div>
                    <div className="text-[10px] font-medium text-muted-foreground">{parcela}</div>
                  </td>

                  {/* SITUAÇÃO */}
                  <td className="px-3 py-3 w-[160px]">
                    <div className="flex flex-col items-start gap-1">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(statusName)}`}>{statusName}</span>
                      <span className="text-[10px] text-muted-foreground">{updated.d} {updated.h}</span>
                    </div>
                  </td>

                  {/* COLUNA: PARCEIRO / BANCO */}
                  <td className="px-3 py-3 w-[140px]">
                    <div className="flex items-center gap-1.5">
                      
                      {/* Parceiro */}
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-transparent overflow-hidden" title={r.partners?.name}>
                        {r.partners?.logo_url ? (
                          <img 
                            src={r.partners.logo_url} 
                            className="h-full w-full object-cover" 
                            alt={r.partners.name}
                          />
                        ) : (
                          <span className="flex items-center justify-center h-full w-full text-[10px] font-bold uppercase">
                            {r.partners?.name?.slice(0, 3)}
                          </span>
                        )}
                      </div>

                      {/* Renderiza Banco apenas se ele existir */}
                      {r.financial_institutions && (
                        <>
                          <span className="text-muted-foreground/20 text-xs">/</span>
                          
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-transparent overflow-hidden" title={r.financial_institutions?.name}>
                            {r.financial_institutions?.logo_url ? (
                              <img 
                                src={r.financial_institutions.logo_url} 
                                className="h-full w-full object-cover" 
                                alt={r.financial_institutions.name}
                              />
                            ) : (
                              <Camera className="h-5 w-5 text-muted-foreground/50" />
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}