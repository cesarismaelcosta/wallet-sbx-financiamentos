/**
 * @fileoverview Componente: TrafficCharts (Módulo de Gráficos de Tráfego/Acessos)
 * 
 * ============================================================================
 * [ARQUITETURA E RESPONSIVIDADE - ZERO-RADIUS & NEUTRAL PURITY]
 * ============================================================================
 * Este componente renderiza a evolução de acessos e o detalhamento por UTM, 
 * intenção de ação e produto visitado.
 * 
 * Correções aplicadas (Padrão Gemini Pro de Responsividade):
 * 1. Hook de Responsividade Nativo (`useIsMobile` integrado): Evita erros de referência.
 * 2. Zero-Radius: Substituição de `rounded-2xl` e borders curves por cantos retos.
 * 3. Neutral Purity: Extinção da paleta roxa, utilizando os tons `neutral-900` 
 *    a `neutral-300` para consistência analítica no painel administrativo.
 * 4. Margens Dinâmicas (`right`): Ajustadas dinamicamente para não cortar labels.
 */

import { Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, LabelList } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
// ✨ [PERFORMANCE]: Hook canônico do projeto (matchMedia + evento "change"), em vez de uma
// definição local ouvindo "resize" bruto — que disparava um re-render (incluindo os BarChart
// do Recharts) a cada pixel arrastado ao redimensionar a janela.
import { useIsMobile } from "@/hooks/use-mobile";

// ============================================================================
// [CONSTANTES E HELPERS]
// ============================================================================
// Tinta escura (evolução diária) + rampa azul do design system (--chart-1/2/3)
// para os rankings — validada como escala ordinal (monotônica, contraste >=2:1
// no tom mais claro contra o card branco, tons distinguíveis entre si). Ver
// skill de dataviz. Ciclo de 3 tons; rankings com mais de 3 itens repetem o
// tom mais claro (identidade real já vem do rótulo direto em cada barra).
const darkInk = "#404040"; // cinza neutro (mais suave que --foreground puro)
const chartBlues = ["#2245a5", "#2a72df", "#64a4e8"]; // hsl(var(--chart-1/2/3))

const defaultChartConfig = {
  count: { label: "Quantidade", color: darkInk },
} satisfies ChartConfig;

// ============================================================================
// [COMPONENTE PRINCIPAL]
// ============================================================================
export default function TrafficCharts({
  loading,
  visitKpis,
  visDailyData,
  periodLabel,
}: {
  loading: boolean;
  visitKpis: any;
  visDailyData: any[];
  periodLabel: string;
}) {
  // ✨ Hook de responsividade injetado na raiz do componente
  const isMobile = useIsMobile();

  return (
    <div className="space-y-6">
      
      {/* ---------------------------------------------------------------------
          GRÁFICO 1: EVOLUÇÃO DE ACESSOS DIÁRIOS (Linha do Tempo)
      --------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-none border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-neutral-900">Evolução de Acessos Diários</h3>
              <p className="text-xs text-neutral-500 font-medium mt-1">{periodLabel}</p>
            </div>
          </div>
          
          {loading || !visitKpis ? (
            <div className="h-[240px] flex items-center justify-center text-neutral-500 font-medium">
              <Loader2 className="h-4 w-4 animate-spin mr-2 text-neutral-900" />
              Carregando...
            </div>
          ) : (
            <ChartContainer config={defaultChartConfig} className="h-[240px] w-full min-w-0">
              <BarChart data={visDailyData} margin={{ top: 24, right: 0, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#737373" }} interval="preserveStartEnd" />
                <YAxis hide />
                <ChartTooltip cursor={{ fill: "#f5f5f5", opacity: 0.8 }} content={<ChartTooltipContent className="rounded-none shadow-md border-neutral-200" />} />
                <Bar dataKey="count" fill={darkInk} radius={[0, 0, 0, 0]}>
                  <LabelList dataKey="count" position="top" offset={6} className="fill-neutral-900" fontSize={11} fontWeight={700} formatter={(v: any) => (v > 0 ? v : "")} />
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </div>
      </div>

      {/* ---------------------------------------------------------------------
          GRÁFICOS 2, 3 E 4: ANÁLISE VERTICAL (Origem, Ação, Produto)
      --------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          { title: "Origem do Acesso (UTM Source)", data: visitKpis?.bySource, colorOffset: 0 },
          { title: "Intenção do Usuário (Ação)", data: visitKpis?.byAction, colorOffset: 1 },
          { title: "Produto Visitado", data: visitKpis?.byProduct, colorOffset: 2 },
        ].map((chart) => (
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
                {/* ✨ FIX RESPONSIVO: Margem direita dinâmica para garantir que o número não seja cortado na borda */}
                <BarChart 
                  data={chart.data} 
                  layout="vertical" 
                  margin={{ top: 0, right: isMobile ? 45 : 80, left: 0, bottom: 0 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e5e5e5" />
                  <XAxis type="number" hide />
                  
                  {/* ✨ FIX RESPONSIVO: Largura do Eixo Y dinâmica (protege UTMs longas) */}
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    tickLine={false} 
                    axisLine={false} 
                    tick={{ fontSize: isMobile ? 10 : 11, fill: "#737373", fontWeight: 500 }} 
                    width={isMobile ? 85 : 120} 
                  />
                  
                  <ChartTooltip cursor={{ fill: "#f5f5f5", opacity: 0.8 }} content={<ChartTooltipContent className="rounded-none shadow-md border-neutral-200" />} />
                  <Bar dataKey="count" radius={[0, 0, 0, 0]} maxBarSize={28}>
                    {chart.data.map((_: unknown, i: number) => (
                      <Cell key={i} fill={chartBlues[(i + chart.colorOffset) % chartBlues.length]} />
                    ))}
                    <LabelList dataKey="count" position="right" fill="#171717" fontSize={11} fontWeight={700} />
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