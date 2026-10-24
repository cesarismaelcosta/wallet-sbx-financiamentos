Substitua todo o conteúdo de o arquivo `src/features/financial-hub/components/shared/flowcredi/DetailSheet.tsx` com exatamente o conteúdo abaixo. Não altere nada além deste arquivo e não rode formatação.

```
/**
 * @fileoverview Gaveta "Detalhar" (Financiamento Imobiliário · FlowCredi)
 * @path src/features/financial-hub/components/products/flowcredi/DetailSheet.tsx
 *
 * Abre a partir de um bloco de ofertas, sem chamada ao gateway: as parcelas mês a mês
 * (`installment_schedule`) já vêm na resposta da simulação para a condição do card.
 * O cliente pode consultar as outras condições do banco: o resumo muda na hora (vem da
 * simulação) e as parcelas são buscadas no gateway (ação DETAIL, não grava) e ficam só na tela.
 * Layout inspirado no "Resumo do financiamento" do simulador Santander/FlowCredi.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import { callSimulation } from "@/features/financial-hub/core/services/gateway";
import { useSafeCall } from "@/features/financial-hub/core/hooks/useSafeCall";
import { BankLogo } from "./BankLogo";
import { DetailCharts } from "./DetailCharts";
import {
  pct,
  selectionOf,
  termLabel,
  FlowCondition,
  FlowInputs,
  FlowParcela,
  flowProductOf,
  conditionLabel,
  rateLabel,
} from "./flowcredi.types";

interface DetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  condition: FlowCondition | null; // condição do card (abre com ela)
  schedule: FlowParcela[]; // parcelas da condição do card, já devolvidas pela simulação
  options: FlowCondition[]; // todas as condições do banco (para o cliente consultar outras)
  knownSchedules?: Record<string, FlowParcela[]>; // parcelas que já vieram na simulação (chave idProduto|seguradora)
  inputs: FlowInputs | null;
  data: any; // estado do wizard (ids da visita/simulação para buscar parcelas de outra condição)
  propertyValue: number;
}

const Tile = ({ label, value, sub, main }: { label: string; value: string; sub?: string; main?: boolean }) => (
  <div
    className={`border-t-[3px] border-[#2246A7] px-3.5 py-3 ${
      main ? "bg-[#EEF3FC] dark:bg-neutral-800" : "bg-neutral-50 dark:bg-neutral-900"
    }`}
  >
    <p className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{label}</p>
    <p
      className={`font-bold tracking-tight whitespace-nowrap mt-1 ${
        main ? "text-2xl text-[#2246A7] dark:text-blue-400" : "text-xl text-neutral-900 dark:text-neutral-100"
      }`}
    >
      {value}
    </p>
    {sub && <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">{sub}</p>}
  </div>
);

/**
 * Faixa horizontal das condições: arrasta com o dedo (nativo) ou com o mouse, sem barra
 * de rolagem visível, com setas azuis nas pontas (só aparecem quando há o que rolar).
 */
function DragStrip({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ active: false, moved: false, startX: 0, startLeft: 0 });
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 2);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update, children]);

  const scrollByPage = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  // Arrastar com o mouse (no toque o navegador já rola sozinho).
  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== "mouse" || !ref.current) return;
    drag.current = { active: true, moved: false, startX: e.clientX, startLeft: ref.current.scrollLeft };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d.active || !ref.current) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 4) d.moved = true;
    ref.current.scrollLeft = d.startLeft - dx;
  };
  const endDrag = () => {
    drag.current.active = false;
  };
  // Depois de arrastar, o clique não troca de condição.
  const onClickCapture = (e: React.MouseEvent) => {
    if (drag.current.moved) {
      e.stopPropagation();
      e.preventDefault();
      drag.current.moved = false;
    }
  };

  const arrow = "absolute top-1/2 -translate-y-1/2 z-10 h-8 w-8 rounded-full bg-[#2246A7]/70 backdrop-blur-sm text-white shadow-md flex items-center justify-center hover:bg-[#2246A7]/90 transition-colors";

  return (
    <div className="relative">
      <div
        ref={ref}
        onScroll={update}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onClickCapture={onClickCapture}
        className="flex gap-2 overflow-x-auto select-none cursor-grab active:cursor-grabbing [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      {canLeft && (
        <button type="button" aria-label="Condições anteriores" onClick={() => scrollByPage(-1)} className={`${arrow} -left-3`}>
          <ChevronLeft className="h-4 w-4" strokeWidth={2.5} />
        </button>
      )}
      {canRight && (
        <button type="button" aria-label="Próximas condições" onClick={() => scrollByPage(1)} className={`${arrow} -right-3`}>
          <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}

const Fact = ({ label, value }: { label: string; value: string }) => (
  <div className="px-3 py-2.5 border-neutral-200 dark:border-neutral-800">
    <p className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400">{label}</p>
    <p className="text-[13px] font-semibold text-neutral-900 dark:text-neutral-100 mt-0.5 whitespace-nowrap">{value}</p>
  </div>
);

export function DetailSheet({
  open,
  onOpenChange,
  condition,
  schedule,
  options,
  knownSchedules,
  inputs,
  data,
  propertyValue,
}: DetailSheetProps) {
  const { execute } = useSafeCall();
  const isHomeEquity = flowProductOf(data) === "home_equity";
  const keyOf = (x: FlowCondition) => `${x.idProduto}|${x.seguradora?.id ?? ""}`;
  const [current, setCurrent] = useState<FlowCondition | null>(null); // condição em exibição
  const [schedules, setSchedules] = useState<Record<string, FlowParcela[]>>({}); // parcelas já carregadas (só na tela)
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openYears, setOpenYears] = useState<Set<number>>(new Set()); // anos abertos (todos começam recolhidos)
  const [openMonth, setOpenMonth] = useState<number | null>(null); // celular: composição da parcela tocada

  // Cada banco abre na condição do card, com as parcelas que vieram na simulação.
  useEffect(() => {
    if (!open || !condition) return;
    setCurrent(condition);
    // Tudo o que já veio na simulação (home equity: as 4 condições) abre sem nova chamada
    setSchedules({ ...(knownSchedules ?? {}), ...(schedule.length ? { [keyOf(condition)]: schedule } : {}) });
    setLoading(false);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, condition?.banco, condition?.idProduto, condition?.seguradora?.id]);

  const c = current ?? condition;

  // Cada condição abre com os anos recolhidos.
  useEffect(() => {
    setOpenYears(new Set());
    setOpenMonth(null);
  }, [open, c?.banco, c?.idProduto, c?.seguradora?.id]);

  /** Outra condição do banco: resumo na hora; parcelas buscadas no gateway (não grava). */
  const choose = (o: FlowCondition) => {
    if (loading || (c && keyOf(o) === keyOf(c))) return;
    setCurrent(o);
    setError(null);
    if (schedules[keyOf(o)] || !inputs) return;
    setLoading(true);
    const urlParams = new URLSearchParams(window.location.search);
    const payload = {
      action: "SIMULATE",
      visit_id: urlParams.get("visit_id") || data?.visit_id,
      visit_update_id: urlParams.get("visit_update_id") || data?.visit_update_id,
      offer_id: data?.offer?.offer_id,
      simulation_id: data?.simulation_id,
      product_id: data?.product_id,
      partner_id: data?.partner_id,
      step: "EXECUTE_SIMULATION",
      // mesmos inputs da simulação (imóveis: valor/prazo/renda; home equity: + dados do imóvel)
      simulation_details: { ...inputs, selected: selectionOf(o) },
    };
    execute(() => callSimulation(payload, "EXECUTE_SIMULATION"))
      .then((res: any) => {
        const sch = res?.consults?.[0]?.installment_schedule as FlowParcela[] | undefined;
        if (res?.success && sch?.length) setSchedules((prev) => ({ ...prev, [keyOf(o)]: sch }));
        else setError(res?.mensagem || "Não foi possível carregar as parcelas desta condição.");
      })
      .catch((err: any) => setError(err?.message || "Não foi possível carregar as parcelas desta condição."))
      .finally(() => setLoading(false));
  };

  const parcelas: FlowParcela[] = c ? schedules[keyOf(c)] ?? [] : [];
  const financed = inputs?.requested_value ?? 0;
  const totalPago = parcelas.reduce((sum, p) => sum + p.parcelaTotal, 0);
  // Amortização, Juros, MIP, DFI, Tarifa: no computador sempre; no celular a composição
  // aparece numa linha extra ao tocar no mês.
  const composition = "hidden sm:table-cell";
  const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const mesAno = (d: string) => {
    const [, mm, yyyy] = String(d).split("/");
    return mm && yyyy ? `${MESES[Number(mm) - 1]}/${yyyy.slice(2)}` : d;
  };
  const sum = (rows: FlowParcela[], k: keyof FlowParcela) => rows.reduce((t, x) => t + Number(x[k] ?? 0), 0);
  const years = (() => {
    const out: { ano: number; rows: FlowParcela[] }[] = [];
    parcelas.forEach((p, idx) => {
      const ano = Math.floor(idx / 12) + 1;
      if (!out[ano - 1]) out[ano - 1] = { ano, rows: [] };
      out[ano - 1].rows.push(p);
    });
    return out;
  })();
  const allOpen = years.length > 0 && openYears.size === years.length;
  const toggleYear = (ano: number) =>
    setOpenYears((prev) => {
      const next = new Set(prev);
      if (next.has(ano)) next.delete(ano);
      else next.add(ano);
      return next;
    });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-4xl p-0 rounded-none bg-white dark:bg-neutral-950 border-neutral-200 dark:border-neutral-800 flex flex-col"
      >
        <SheetHeader className="px-5 sm:px-7 py-5 border-b border-neutral-200 dark:border-neutral-800 text-left">
          <div className="flex items-center gap-3.5 pr-8">
            {c && !isHomeEquity && <BankLogo src={c.logoUrl} alt={c.banco} size="lg" />}
            <div className="min-w-0 flex-1">
              <SheetTitle className="text-lg font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">
                {c ? (isHomeEquity ? conditionLabel(c, "home_equity") : c.banco) : "Detalhes"}
              </SheetTitle>
              <SheetDescription className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                {c ? (isHomeEquity ? rateLabel(c, "home_equity") : c.produto) : ""}
              </SheetDescription>
            </div>
            {c && (
              <span className="shrink-0 border border-neutral-300 dark:border-neutral-700 px-2 py-0.5 text-[10px] font-bold tracking-widest text-neutral-700 dark:text-neutral-300">
                {c.tabela}
              </span>
            )}
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 sm:px-7 pb-6">
          {c && options.length > 1 && (
            <div className="pt-5">
              <p className="text-[10px] uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-1.5">
                {isHomeEquity ? "Outras condições" : `Condições do ${c.banco}`}
              </p>
              <DragStrip>
                {options.map((o) => {
                  const active = keyOf(o) === keyOf(c);
                  const spinning = active && loading; // borda girando enquanto as parcelas carregam
                  return (
                    <button
                      key={keyOf(o)}
                      type="button"
                      onClick={() => choose(o)}
                      disabled={loading}
                      className={`relative overflow-hidden shrink-0 text-left px-3 py-2 border rounded-none transition-colors disabled:cursor-wait ${
                        spinning
                          ? "border-transparent bg-[#EEF3FC] dark:bg-neutral-800"
                          : active
                          ? "border-[#2246A7] bg-[#EEF3FC] dark:bg-neutral-800"
                          : "border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                      }`}
                    >
                      {spinning && (
                        <>
                          <span
                            aria-hidden="true"
                            className="pointer-events-none absolute -inset-[150%] animate-spin [animation-duration:1.4s] bg-[conic-gradient(from_0deg,transparent_0deg,transparent_250deg,#2246A7_360deg)]"
                          />
                          <span aria-hidden="true" className="pointer-events-none absolute inset-[2px] bg-[#EEF3FC] dark:bg-neutral-800" />
                        </>
                      )}
                      <span className="relative block text-xs font-semibold text-neutral-900 dark:text-neutral-100 whitespace-nowrap">
                        {isHomeEquity ? conditionLabel(o, "home_equity") : o.produto}
                      </span>
                      <span className="relative block text-[11px] text-neutral-500 dark:text-neutral-400 whitespace-nowrap">
                        {isHomeEquity ? rateLabel(o, "home_equity") : `${pct(o.taxaJurosAnual)} a.a.`} · {BRL(o.primeiraParcela)}
                      </span>
                    </button>
                  );
                })}
              </DragStrip>
            </div>
          )}

          {c && (
            <div className="pt-5 space-y-3">
              <div className={`grid grid-cols-1 ${isHomeEquity ? "sm:grid-cols-[1.15fr_1.25fr_1fr]" : "sm:grid-cols-[1.3fr_1fr_1fr]"} gap-2.5`}>
                <Tile main label="1ª parcela" value={BRL(c.primeiraParcela)} sub={isHomeEquity ? "com seguros (MIP e DFI) e tarifa" : "a maior do contrato · com MIP e DFI"} />
                <Tile
                  label={c.tabela === "SAC" || isHomeEquity ? "Última parcela" : "Parcela fixa"}
                  value={BRL(c.tabela === "SAC" || isHomeEquity ? c.ultimaParcela : c.primeiraParcela)}
                  sub={
                    isHomeEquity
                      ? c.tabela === "SAC"
                        ? "parcelas diminuem mês a mês"
                        : "juros e amortização iguais; o seguro varia"
                      : c.tabela === "SAC"
                        ? "a menor do contrato"
                        : "todas iguais"
                  }
                />
                {isHomeEquity ? (
                  <Tile label="Juros" value={rateLabel(c, "home_equity")} sub={`${pct(c.taxaJurosAnual)} ao ano`} />
                ) : (
                  <Tile label="Juros" value={`${pct(c.taxaJurosAnual)} a.a.`} sub={`${pct(c.taxaJurosMensal)} ao mês`} />
                )}
              </div>
              <div
                className={`grid grid-cols-2 ${isHomeEquity ? "sm:grid-cols-4" : "sm:grid-cols-5"} border border-neutral-200 dark:border-neutral-800 divide-x divide-y sm:divide-y-0 divide-neutral-200 dark:divide-neutral-800`}
              >
                <Fact label="Imóvel" value={BRL(propertyValue)} />
                {!isHomeEquity && <Fact label="Entrada" value={BRL(Math.max(0, propertyValue - financed))} />}
                <Fact label={isHomeEquity ? "Crédito" : "Financiado"} value={BRL(financed)} />
                <Fact label="Prazo" value={`${inputs?.installments ?? "—"} meses`} />
                <Fact label="Renda mínima" value={BRL(c.rendaMinima)} />
              </div>
            </div>
          )}

          {loading && (
            <div className="animate-pulse" aria-busy="true" aria-label="Carregando a tabela de parcelas">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6">
                {[1, 2].map((i) => (
                  <div key={i} className="border border-neutral-200 dark:border-neutral-800 p-4 space-y-2 rounded-none">
                    <div className="h-3.5 w-1/2 bg-neutral-200/80 dark:bg-neutral-700/80 rounded-none" />
                    <div className="h-3 w-3/4 bg-neutral-100 dark:bg-neutral-800 rounded-none" />
                    <div className="h-44 w-full bg-neutral-100 dark:bg-neutral-800 rounded-none" />
                    <div className="h-3 w-2/3 bg-neutral-100 dark:bg-neutral-800 rounded-none" />
                  </div>
                ))}
              </div>
              <div className="mt-6">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="h-3 w-32 bg-neutral-200/80 dark:bg-neutral-700/80 rounded-none" />
                  <div className="h-3 w-40 bg-neutral-100 dark:bg-neutral-800 rounded-none" />
                </div>
                <div className="h-8 w-full bg-neutral-200/80 dark:bg-neutral-700/80 rounded-none" />
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <div key={i} className="flex items-center justify-between gap-3 h-10 px-2 border-b border-neutral-200 dark:border-neutral-800">
                    <div className="h-3 w-14 bg-neutral-200/80 dark:bg-neutral-700/80 rounded-none" />
                    <div className="h-3 w-24 bg-neutral-100 dark:bg-neutral-800 rounded-none" />
                    <div className="h-3 w-20 bg-neutral-100 dark:bg-neutral-800 rounded-none" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {c && !loading && parcelas.length === 0 && (
            <p className="mt-5 text-sm text-neutral-600 dark:text-neutral-400 border border-neutral-200 dark:border-neutral-800 p-4">
              {error || "Tabela de parcelas indisponível para esta condição no momento."}
            </p>
          )}

          {!loading && parcelas.length > 0 && <DetailCharts parcelas={parcelas} />}

          {!loading && parcelas.length > 0 && (
            <div className="mt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <h4 className="font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-500 dark:text-neutral-400">
                  Tabela de parcelas
                </h4>
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  Total pago em {termLabel(parcelas.length)}:{" "}
                  <strong className="text-neutral-900 dark:text-neutral-100">{BRL(totalPago)}</strong>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2 text-xs font-semibold text-[#2246A7] dark:text-blue-400">
                <button
                  type="button"
                  onClick={() => setOpenYears(allOpen ? new Set() : new Set(years.map((y) => y.ano)))}
                  className="hover:underline underline-offset-2"
                >
                  {allOpen ? "Recolher todos" : "Expandir todos"}
                </button>
              </div>

              <div>
                <table className="w-full text-[11.5px] tabular-nums border-collapse">
                  {/* top-0 no limite da área rolável (sem padding em cima), para nenhuma linha aparecer por trás */}
                  <thead className="sticky top-0 z-10">
                    <tr className="bg-[#2246A7] text-white">
                      <th className="px-2 py-2 font-semibold text-left sticky left-0 bg-[#2246A7]">Nº</th>
                      <th className="hidden sm:table-cell px-2 py-2 font-semibold text-left">Vencimento</th>
                      <th className={`px-2 py-2 font-semibold text-right ${composition}`}>Amortização</th>
                      <th className={`px-2 py-2 font-semibold text-right ${composition}`}>Juros</th>
                      <th className={`px-2 py-2 font-semibold text-right ${composition}`}>MIP</th>
                      <th className={`px-2 py-2 font-semibold text-right ${composition}`}>DFI</th>
                      <th className={`px-2 py-2 font-semibold text-right ${composition}`}>Tarifa</th>
                      <th className="px-2 py-2 font-semibold text-right">Parcela</th>
                      <th className="px-2 py-2 font-semibold text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="text-neutral-700 dark:text-neutral-300">
                    {years.map((y) => {
                      const open = openYears.has(y.ano);
                      const first = y.rows[0];
                      const last = y.rows[y.rows.length - 1];
                      return [
                        <tr
                          key={`ano-${y.ano}`}
                          onClick={() => toggleYear(y.ano)}
                          className={`cursor-pointer border-b border-neutral-200 dark:border-neutral-800 ${
                            open
                              ? "font-semibold text-neutral-900 dark:text-neutral-100 bg-[#EEF3FC] dark:bg-neutral-800"
                              : "font-normal text-neutral-700 dark:text-neutral-300 bg-white dark:bg-neutral-950 hover:bg-neutral-50 dark:hover:bg-neutral-900"
                          }`}
                        >
                          <td className="px-2 py-2 text-left whitespace-nowrap sticky left-0 bg-inherit">
                            <span
                              className={`inline-flex items-center gap-1 ${
                                open
                                  ? "text-neutral-700 dark:text-neutral-300"
                                  : "font-bold text-neutral-900 dark:text-neutral-100"
                              }`}
                            >
                              <ChevronRight
                                strokeWidth={open ? 2 : 2.75}
                                className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
                              />
                              Ano {y.ano}
                            </span>
                            <span className="sm:hidden block pl-[18px] text-[10px] font-normal text-neutral-500 dark:text-neutral-400">
                              {mesAno(first.data)} – {mesAno(last.data)}
                            </span>
                          </td>
                          <td className="hidden sm:table-cell px-2 py-2 text-left whitespace-nowrap font-normal text-neutral-600 dark:text-neutral-400">
                            {mesAno(first.data)} – {mesAno(last.data)}
                          </td>
                          <td className={`px-2 py-2 text-right whitespace-nowrap ${composition}`}>{BRL(sum(y.rows, "amortizacao"))}</td>
                          <td className={`px-2 py-2 text-right whitespace-nowrap ${composition}`}>{BRL(sum(y.rows, "juros"))}</td>
                          <td className={`px-2 py-2 text-right whitespace-nowrap ${composition}`}>{BRL(sum(y.rows, "mip"))}</td>
                          <td className={`px-2 py-2 text-right whitespace-nowrap ${composition}`}>{BRL(sum(y.rows, "dfi"))}</td>
                          <td className={`px-2 py-2 text-right whitespace-nowrap ${composition}`}>{BRL(sum(y.rows, "tac"))}</td>
                          <td
                            className={`px-2 py-2 text-right whitespace-nowrap ${
                              open ? "" : "font-bold text-[#2246A7] dark:text-blue-400"
                            }`}
                          >
                            {/* 1ª e última parcela do ano empilhadas (uma linha só cortava o Saldo com valores altos) */}
                            <span className="flex flex-col items-end leading-tight">
                              <span>{BRL(first.parcelaTotal)}</span>
                              <span className="text-[10px] font-normal">→ {BRL(last.parcelaTotal)}</span>
                            </span>
                          </td>
                          <td
                            className={`px-2 py-2 text-right whitespace-nowrap ${
                              open ? "" : "font-bold text-neutral-900 dark:text-neutral-100"
                            }`}
                          >
                            {BRL(last.saldoDevedor)}
                          </td>
                        </tr>,
                        ...(open
                          ? y.rows.flatMap((p) => [
                              <tr
                                key={p.parcela}
                                onClick={() => setOpenMonth((m) => (m === p.parcela ? null : p.parcela))}
                                className="bg-white dark:bg-neutral-950 even:bg-neutral-50 dark:even:bg-neutral-900 border-b border-neutral-100 dark:border-neutral-800"
                              >
                                <td className="pl-7 pr-2 py-1.5 text-left whitespace-nowrap sticky left-0 bg-inherit">
                                  {p.parcela}
                                  <span className="sm:hidden block text-[10px] text-neutral-500 dark:text-neutral-400">{p.data}</span>
                                </td>
                                <td className="hidden sm:table-cell px-2 py-1.5 text-left whitespace-nowrap">{p.data}</td>
                                <td className={`px-2 py-1.5 text-right whitespace-nowrap ${composition}`}>{BRL(p.amortizacao)}</td>
                                <td className={`px-2 py-1.5 text-right whitespace-nowrap ${composition}`}>{BRL(p.juros)}</td>
                                <td className={`px-2 py-1.5 text-right whitespace-nowrap ${composition}`}>{BRL(p.mip)}</td>
                                <td className={`px-2 py-1.5 text-right whitespace-nowrap ${composition}`}>{BRL(p.dfi)}</td>
                                <td className={`px-2 py-1.5 text-right whitespace-nowrap ${composition}`}>{BRL(p.tac)}</td>
                                <td className="px-2 py-1.5 text-right whitespace-nowrap font-bold text-[#2246A7] dark:text-blue-400">
                                  {BRL(p.parcelaTotal)}
                                </td>
                                <td className="px-2 py-1.5 text-right whitespace-nowrap">{BRL(p.saldoDevedor)}</td>
                              </tr>,
                              openMonth === p.parcela ? (
                                <tr key={`comp-${p.parcela}`} className="sm:hidden bg-white dark:bg-neutral-950">
                                  <td colSpan={9} className="pl-7 pr-2 pb-2 pt-0 text-[10.5px] text-neutral-500 dark:text-neutral-400">
                                    Amortização {BRL(p.amortizacao)} · Juros {BRL(p.juros)} · Seguros {BRL(p.mip + p.dfi)} ·
                                    Tarifa {BRL(p.tac)}
                                  </td>
                                </tr>
                              ) : null,
                            ])
                          : []),
                      ];
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-[11px] text-neutral-400 dark:text-neutral-500 leading-relaxed">
                Valores de referência. MIP varia com a idade e o saldo devedor;{" "}
                {isHomeEquity ? "registro e avaliação do imóvel não estão incluídos." : "ITBI, registro e avaliação do imóvel não estão incluídos."}
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

```
