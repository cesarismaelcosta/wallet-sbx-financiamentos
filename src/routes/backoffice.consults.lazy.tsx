/**
 * ============================================================================
 * @fileoverview Monitor de Consultas e Visitas (Backoffice)
 * @route /backoffice/consults
 * @description
 * Tela de acompanhamento da esteira de visitas, rastreando ações de consulta,
 * redirecionamentos para sites parceiros e conversões em simulações.
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

export const Route = createLazyFileRoute("/backoffice/consults")({
  component: ConsultsPage,
});

// ============================================================================
// HELPERS E UTILITÁRIOS
// ============================================================================

const STATUS_STYLES: Record<string, string> = {
  "simulacao": "bg-primary/10 text-primary",
  "consulta": "bg-blue-500/10 text-blue-600",
  "site parceiro": "bg-amber-500/10 text-amber-600",
  "default": "bg-muted text-muted-foreground",
};

function statusClass(status: string) {
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
function ConsultsPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [search, setSearch] = useState("");
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
    try {
      // 1. Busca visits utilizando os relacionamentos oficiais por FK do banco
      const { data: visitsData, error: visitError } = await supabase
        .from("visits")
        .select(`
          *,
          product_types(name),
          partners(name, logo_url),
          visit_entities(name, document, phone, email),
          visit_offers(offer_description, offer_value, event_id, event_description, event_end_date)
        `)
        .order('created_at', { ascending: false });

      if (visitError) {
        console.error("Erro ao carregar visits:", visitError.message);
        setRows([]);
        return;
      }

      if (!visitsData || visitsData.length === 0) {
        setRows([]);
        return;
      }

      const visitIds = visitsData.map(v => v.id);

      // 2. Busca simulações e todos os visit_updates (1 para N) em paralelo
      const [
        { data: simsData, error: simError },
        { data: updatesData, error: updateError }
      ] = await Promise.all([
        supabase.from("simulations").select("id, visit_id").in("visit_id", visitIds),
        supabase.from("visit_updates").select("visit_id, action, created_at").in("visit_id", visitIds)
      ]);

      if (simError) console.error("Erro ao carregar simulations:", simError.message);
      if (updateError) console.error("Erro ao carregar visit_updates:", updateError.message);

      // Mapeia se possui simulação
      const simSet = new Set(simsData?.map(s => s.visit_id).filter(Boolean) || []);
      
      // Mapeia a relação 1 para N: se QUALQUER update da visita tiver "CONTACT", marca como verdadeiro
      const contactSet = new Set(
        updatesData
          ?.filter(u => (u.action || "").toUpperCase().includes("CONTACT"))
          .map(u => u.visit_id)
          .filter(Boolean) || []
      );

      // 3. Normaliza os dados e injeta as flags nas linhas
      const normalized = visitsData.map(v => ({
        ...v,
        has_simulation: simSet.has(v.id),
        has_contact: contactSet.has(v.id),
        visit_entities: Array.isArray(v.visit_entities) ? v.visit_entities[0] || null : v.visit_entities,
        visit_offers: Array.isArray(v.visit_offers) ? v.visit_offers[0] || null : v.visit_offers,
      }));

      setRows(normalized);
    } catch (err) {
      console.error("Erro crítico ao carregar dados:", err);
      setRows([]);
    }
  }

  useEffect(() => { load(); }, []);

  // Determina a situação com base na regra de negócio solicitada
  function getVisitStatus(r: any): string {
    if (r.has_simulation) return "SIMULAÇÃO";

    const act = (r.action ?? "").toUpperCase();
    if (act.includes("CONSULT")) return "CONSULTA";
    if (act.includes("REDIRECT")) return "SITE PARCEIRO";
    
    return r.action || "CONSULTA";
  }

  const statusOptions = ["SIMULAÇÃO", "CONSULTA", "SITE PARCEIRO"];

  const totals = useMemo(() => {
    const t = { total: rows.length, simulacao: 0, consulta: 0, siteParceiro: 0 };
    rows.forEach(r => {
      const s = getVisitStatus(r);
      if (s === "SIMULAÇÃO") t.simulacao++;
      else if (s === "CONSULTA") t.consulta++;
      else if (s === "SITE PARCEIRO") t.siteParceiro++;
    });
    return t;
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      const statusName = getVisitStatus(r);
      const matchStatus = selectedStatus === "Todos" || statusName === selectedStatus;
      
      const entity = Array.isArray(r.visit_entities) ? r.visit_entities[0] : (r.visit_entities || {});
      const clientName = entity?.name ?? "";
      const rowDoc = entity?.document?.replace(/\D/g, "") || "";
      const rawSearch = search.toLowerCase().trim();
      const rawDocSearch = search.replace(/\D/g, "");
      
      const matchSearch = 
        rawSearch === "" || 
        clientName.toLowerCase().includes(rawSearch) || 
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
          <h1 className="text-2xl font-bold tracking-tight">Monitor de Consultas e Visitas</h1>
          <p className="text-sm text-muted-foreground">Acompanhe acessos, consultas, redirecionamentos e conversões em tempo real.</p>
        </div>
        <div className="flex items-center gap-2">
            <Button variant="outline" className="rounded-xl"><Download className="mr-2 h-4 w-4" /> Exportar</Button>
            <Button onClick={load} className="rounded-xl"><RefreshCw className="mr-2 h-4 w-4" /> Atualizar</Button>
        </div>
      </div>

      {/* BLOCO DE KPIS */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
            { label: "Total de visitas", value: totals.total, highlight: false },
            { label: "Consultas", value: totals.consulta, highlight: false },
            { label: "Sites parceiros", value: totals.siteParceiro, highlight: false },
            { label: "Simulações geradas", value: totals.simulacao, highlight: true }
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
          
          {/* Busca unificada */}
          <div className="relative flex-1 min-w-[240px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente ou CPF/CNPJ..." className="h-10 rounded-xl pl-9" />
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
              <th className="px-3 py-3 w-[180px]">Cliente</th>
              <th className="px-3 py-3 w-[150px]">Produto</th>
              <th className="px-3 py-3 w-[220px]">Oferta</th>
              <th className="px-3 py-3 w-[160px]">Situação</th>
              <th className="px-3 py-3 w-[140px]">Parceiro</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const created = formatDate(r.created_at);
              const entity = Array.isArray(r.visit_entities) ? r.visit_entities[0] : (r.visit_entities || {});
              const offer = Array.isArray(r.visit_offers) ? r.visit_offers[0] : (r.visit_offers || {});
              const productName = r.product_types?.name ?? "—";
              const statusName = getVisitStatus(r);
              
              const rawDoc = entity?.document?.replace(/\D/g, "") || "";
              const doc = rawDoc.length === 14 
                ? rawDoc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
                : rawDoc.length === 11 
                ? rawDoc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
                : entity?.document || "—";
              
              const phone = entity?.phone?.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3") ?? "";
              const endEvent = offer?.event_end_date ? new Date(offer.event_end_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";

              return (
                <tr key={r.id} className="border-b border-border/60 hover:bg-accent/40">
                  <td className="px-3 py-3 w-[80px]"><div className="font-semibold">{created.d}</div><div className="text-xs text-muted-foreground">{created.h}</div></td>
                  
                  {/* CLIENTE */}
                  <td className="px-3 py-3 w-[180px]">
                    <div className="font-semibold text-[#d946ef] truncate" title={entity?.name}>{entity?.name || "—"}</div>
                    <div className="text-sm text-muted-foreground">{doc}</div>
                    <div className="text-sm text-muted-foreground">{phone || "—"}</div>
                  </td>

                  {/* PRODUTO */}
                  <td className="px-3 py-3 w-[150px]">
                    {/* Nome do Produto */}
                    <div className="font-semibold">{productName}</div>

                    {/* UTM Source em maiúscula */}
                    <div className="text-[10px] text-muted-foreground font-medium uppercase mt-0.5">
                      ORIGEM: {r.utm_source ? r.utm_source : "—"}
                    </div>

                    {/* State em maiúscula */}
                    <div className="text-[10px] text-muted-foreground font-medium uppercase mt-0.5">
                      {r.state ? r.state : "—"}
                    </div>

                    {/* Contato com parceiro como o último item */}
                    {r.has_contact && (
                      <div className="text-[10px] text-emerald-600 font-semibold uppercase mt-0.5">
                        CONTATO C/ PARCEIRO
                      </div>
                    )}
                  </td>

                  {/* OFERTA */}
                  <td className="px-3 py-3 max-w-[220px]">
                    <div className="font-semibold truncate" title={offer?.offer_description}>
                      {offer?.offer_description || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground truncate mt-0.5" title={offer?.event_description}>
                      {offer?.event_id ? `${offer.event_id} - ` : ""} {offer?.event_description || "—"}
                    </div>
                    <div className="text-[11px] text-muted-foreground font-medium mt-0.5">
                      {BRL(offer?.offer_value)} {endEvent ? `(Fim: ${endEvent})` : ""}
                    </div>
                  </td>

                  {/* SITUAÇÃO */}
                  <td className="px-3 py-3 w-[160px]">
                    <div className="flex flex-col items-start gap-1">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(statusName)}`}>
                        {statusName}
                      </span>
                      <span className="text-[10px] text-muted-foreground">{created.d} {created.h}</span>
                    </div>
                  </td>

                  {/* PARCEIRO */}
                  <td className="px-3 py-3 w-[140px]">
                    <div className="flex items-center gap-1.5">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-transparent overflow-hidden" title={r.partners?.name}>
                        {r.partners?.logo_url ? (
                          <img 
                            src={r.partners.logo_url} 
                            className="h-full w-full object-cover" 
                            alt={r.partners.name}
                          />
                        ) : (
                          <span className="flex items-center justify-center h-full w-full text-[10px] font-bold uppercase">
                            {r.partners?.name?.slice(0, 3) || "—"}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-medium text-foreground truncate" title={r.partners?.name}>
                        {r.partners?.name || "—"}
                      </span>
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