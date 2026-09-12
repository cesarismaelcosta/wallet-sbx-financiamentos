/**
 * @fileoverview Componente: SimulationCharts (Módulo de Gráficos de Simulação)
 * 
 * ============================================================================
 * [ARQUITETURA E RESPONSIVIDADE - ZERO-RADIUS & NEUTRAL PURITY]
 * ============================================================================
 * Este componente renderiza a evolução de simulações e o detalhamento por status, 
 * produto e parceiro. 
 * 
 * Correções aplicadas (Zero Efeitos Colaterais):
 * 1. Zero-Radius: Todos os cantos arredondados das barras do Recharts e dos
 *    cards externos (`rounded-2xl`) foram substituídos por `rounded-none` ou 
 *    `radius={[0,0,0,0]}`.
 * 2. Neutral Purity: Extinção da paleta de cores roxa/magenta hardcoded (`barColors`)
 *    e de referências ao `--primary`. Utiliza a escala de cinzas `neutral-900` a `neutral-300`.
 * 3. Margens Dinâmicas (`right`): No desktop, a margem direita do BarChart expande 
 *    para 130px para abrigar valores monetários longos (ex: R$ 2.164.871) sem cortar.
 *    No mobile, encolhe para 60px para otimizar o espaço da tela.
 */

import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, LabelList } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

// ============================================================================
// [HOOK LOCAL]: Garantia de responsividade sem depender de arquivos externos
// ============================================================================
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile(); // Checagem inicial
    
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  
  return isMobile;
}

// ============================================================================
// [CONSTANTES E HELPERS]
// ============================================================================
// Paleta neutra para análise vertical (do mais escuro ao mais claro)
const neutralColors = ["#171717", "#404040", "#737373", "#a3a3a3", "#d4d4d4", "#e5e5e5"];

const BRL = (n: number) => 
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const defaultChartConfig = {
  count: { label: "Quantidade", color: "#171717" }, // neutral-900
} satisfies ChartConfig;

// ============================================================================
// [COMPONENTE PRINCIPAL]
// ============================================================================
export default function SimulationCharts({
  loading,
  simKpis,
  simDailyData,
  periodLabel,
}: {
  loading: boolean;
  simKpis: any;
  simDailyData: any[];
  periodLabel: string;
}) {
  // ✨ Hook de responsividade injetado
  const isMobile = useIsMobile();

  return (
    <div className="space-y-6">
      
      {/* ---------------------------------------------------------------------
          GRÁFICO 1: EVOLUÇÃO DIÁRIA (Linha do Tempo)
      --------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-none border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-900">Evolução de Simulações Diárias</h3>
              <p className="text-xs text-neutral-500 font-medium mt-1">{periodLabel}</p>
            </div>
          </div>
          
          {loading || !simKpis ? (
            <div className="h-[240px] flex items-center justify-center text-neutral-500 font-medium">
              <Loader2 className="h-4 w-4 animate-spin mr-2 text-neutral-900" />
              Carregando...
            </div>
          ) : (
            <ChartContainer config={defaultChartConfig} className="h-[240px] w-full min-w-0">
              <BarChart data={simDailyData} margin={{ top: 24, right: 0, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#737373" }} interval="preserveStartEnd" />
                <YAxis hide />
                <ChartTooltip cursor={{ fill: "#f5f5f5", opacity: 0.8 }} content={<ChartTooltipContent className="rounded-none shadow-md border-neutral-200" />} />
                <Bar dataKey="count" fill="#171717" radius={[0, 0, 0, 0]}>
                  <LabelList dataKey="count" position="top" offset={6} className="fill-neutral-900" fontSize={11} fontWeight={700} formatter={(v: any) => (v > 0 ? v : "")} />
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------------------
          GRÁFICOS 2, 3 E 4: ANÁLISE VERTICAL (Status, Produto, Parceiro)
      --------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          { title: "Status da Proposta", data: simKpis?.byStatus },
          { title: "Por Produto", data: simKpis?.byProduct },
          { title: "Por Parceiro", data: simKpis?.byPartner },
        ].map((chart, idx) => (
          <div key={chart.title} className="rounded-none border border-neutral-200 bg-white p-5 overflow-hidden shadow-sm">
            <div className="mb-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-900">{chart.title}</h3>
              <p className="text-xs text-neutral-500 font-medium mt-1">{periodLabel}</p>
            </div>
            
            {loading || !chart.data ? (
              <div className="h-[240px] flex items-center justify-center text-neutral-500 font-medium">
                <Loader2 className="h-4 w-4 animate-spin mr-2 text-neutral-900" />
                Carregando...
              </div>
            ) : chart.data.length === 0 ? (
              <p className="text-sm text-neutral-500 font-medium text-center mt-10">Nenhum dado no período.</p>
            ) : (
              <ChartContainer config={defaultChartConfig} className="h-[240px] w-full">
                {/* ✨ FIX RESPONSIVO: Margem direita dinâmica para evitar corte dos valores monetários */}
                <BarChart 
                  data={chart.data} 
                  layout="vertical" 
                  margin={{ top: 0, right: isMobile ? 100 : 130, left: 0, bottom: 0 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis type="number" hide />
                  
                  {/* ✨ FIX RESPONSIVO: Largura do Eixo Y dinâmica para não espremer a barra */}
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    tickLine={false} 
                    axisLine={false} 
                    tick={{ fontSize: isMobile ? 10 : 11, fill: "#737373", fontWeight: 500 }} 
                    width={isMobile ? 80 : 120}
                  />
                  
                  <ChartTooltip
                    cursor={{ fill: "#f5f5f5", opacity: 0.8 }}
                    content={
                      <ChartTooltipContent
                        className="rounded-none shadow-md border-neutral-200"
                        formatter={(value, _name, item) => (
                          <div className="flex flex-col">
                            <span className="font-bold text-neutral-900">{value} simulações</span>
                            <span className="text-xs font-medium text-neutral-500">{BRL(item.payload.volume)}</span>
                          </div>
                        )}
                      />
                    }
                  />
                  <Bar dataKey="count" radius={[0, 0, 0, 0]} maxBarSize={28}>
                    {chart.data.map((_: unknown, i: number) => (
                      <Cell key={i} fill={neutralColors[i % neutralColors.length]} />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="right"
                      content={(props: any) => {
                        const item = chart.data![props.index];
                        if (!item) return null;
                        
                        // Cálculos precisos de ancoragem para o texto do Recharts
                        const cx = Number(props.x) + Number(props.width) + 8;
                        const cy = Number(props.y) + Number(props.height) / 2;
                        
                        return (
                          <g>
                            <text x={cx} y={cy - 6} fill="#171717" fontSize={11} fontWeight={700} dominantBaseline="middle">
                              {props.value}
                            </text>
                            <text x={cx} y={cy + 8} fill="#737373" fontSize={10} fontWeight={500} dominantBaseline="middle">
                              {BRL(item.volume)}
                            </text>
                          </g>
                        );
                      }}
                    />
                  </Bar>
                </BarChart>
              </ChartContainer>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}