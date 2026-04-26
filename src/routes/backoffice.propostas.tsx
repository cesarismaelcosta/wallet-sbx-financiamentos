import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  RefreshCw,
  Search,
  Filter,
  SlidersHorizontal,
  Download,
  ChevronDown,
} from "lucide-react";
import { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/backoffice/propostas")({
  component: PropostasPage,
});

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

function PropostasPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [statusOptions, setStatusOptions] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>("Todos");
  const [dateRange, setDateRange] = useState<"30" | "90" | "all" | "custom">("30");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [search, setSearch] = useState("");

  async function load() {
    const [{ data: simData }, { data: statusData }] = await Promise.all([
      supabase.from("simulation").select(`
        *, 
        financial_institutions(name, logo_url),
        product_types(name),
        stage_types(name),
        status_types(name)
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
      const matchSearch = search.toLowerCase() === "" || (r.name_proponent ?? "").toLowerCase().includes(search.toLowerCase());
      const matchStatus = selectedStatus === "Todos" || statusName === selectedStatus;
      
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
      return matchSearch && matchStatus && matchDate;
    });
  }, [rows, search, selectedStatus, dateRange, customRange]);

  return (
    <div className="font-sans space-y-6">
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

      <div className="rounded-2xl border border-border bg-card overflow-x-auto">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por cliente..." className="h-10 rounded-xl pl-9" />
          </div>
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-xl bg-[#fdf2f8] text-[#d946ef] border-[#fbcfe8] hover:bg-[#fce7f3] transition-colors">
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
          
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="rounded-xl hover:bg-[#fce7f3] transition-colors">
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
          
          <Button variant="outline" size="sm" className="ml-auto rounded-xl"><SlidersHorizontal className="mr-2 h-3.5 w-3.5" /> Colunas</Button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-3 w-[90px]">Data</th>
              <th className="px-3 py-3 w-[250px]">Cliente</th>
              <th className="px-3 py-3 w-[180px]">Estágio/Produto</th>
              <th className="px-3 py-3 w-[200px]">Oferta</th>
              <th className="px-3 py-3 text-right">Financiado</th>
              <th className="px-3 py-3 w-[240px]">Situação</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const created = formatDate(r.created_at);
              const updated = formatDate(r.updated_at);
              const statusName = r.status_types?.name ?? "—";
              const stageName = r.stage_types?.name ?? "—";
              const productName = r.product_types?.name ?? "—";
              const parcela = r.installments_count && r.installment_value ? `${r.installments_count}x ${BRL(r.installment_value)}` : "—";
              
              const rawDoc = r.document_proponent?.replace(/\D/g, "") || "";
              const doc = rawDoc.length === 14 
                ? rawDoc.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
                : rawDoc.length === 11 
                ? rawDoc.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
                : r.document_proponent || "—";
              
              const phone = r.phone_proponent?.replace(/^(\d{2})(\d{4,5})(\d{4})$/, "($1) $2-$3") ?? "";
              
              const endEvent = r.event_end_date ? new Date(r.event_end_date).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";
              
              return (
                <tr key={r.id} className="border-b border-border/60 hover:bg-accent/40">
                  <td className="px-3 py-3"><div className="font-semibold">{created.d}</div><div className="text-xs text-muted-foreground">{created.h}</div></td>
                  
                  {/* COLUNA CLIENTE */}
                  <td className="px-3 py-3">
                    <div className="font-semibold text-[#d946ef] truncate">
                      {(r.name_proponent?.length > 45 ? r.name_proponent.slice(0, 45) + "..." : r.name_proponent) || "—"}
                    </div>
                    <div className="text-sm text-muted-foreground">{doc}</div>
                    <div className="text-sm text-muted-foreground mt-0.5">{phone || "—"}</div>
                  </td>
                  
                  <td className="px-3 py-3">
                    <div className="font-semibold">{stageName}</div>
                    <div className="text-xs text-muted-foreground">{productName}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 font-semibold uppercase tracking-tight">{r.partner_name}</div>
                  </td>

                  {/* COLUNA OFERTA */}
                  <td className="px-3 py-3">
                    <div className="font-semibold truncate">{r.offer_description || "—"}</div>
                    <div className="text-xs text-muted-foreground truncate">{r.id_event || "—"} - {r.event_description || "—"}</div>
                    <div className="text-[11px] text-muted-foreground font-medium mt-0.5">
                      {BRL(r.offer_value)} {endEvent ? `(Fim: ${endEvent})` : ""}
                    </div>
                  </td>

                  <td className="px-3 py-3 text-right">
                    <div className="font-semibold">{BRL(r.financed_amount)}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">Ent: {r.down_payment_percentage ? `${r.down_payment_percentage.toFixed(0)}%` : "0%"} = {BRL(r.down_payment_amount)}</div>
                    <div className="text-xs font-medium text-muted-foreground mt-0.5">{parcela}</div>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col items-start gap-1">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusClass(statusName)}`}>{statusName}</span>
                        <span className="text-[11px] text-muted-foreground">{updated.d} {updated.h}</span>
                      </div>
                      {r.financial_institutions?.logo_url && (<img src={r.financial_institutions.logo_url} className="h-8 w-8 object-contain" alt="Logo" />)}
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