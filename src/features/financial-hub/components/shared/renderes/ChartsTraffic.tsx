/**
 * @fileoverview Componente: TrafficCharts (Módulo de Gráficos de Tráfego/Acessos)
 * 
 * ============================================================================
 * [ARQUITETURA E RESPONSIVIDADE]
 * ============================================================================
 * Este componente renderiza a evolução de acessos e o detalhamento por UTM, 
 * intenção de ação e produto visitado.
 * 
 * Correções aplicadas (Padrão Gemini Pro de Responsividade):
 * 1. Hook de Responsividade Nativo (`useIsMobile` integrado): Evita erros de referência 
 *    ("isMobile is not defined") e mantém o componente 100% autônomo.
 * 2. Margens Dinâmicas (`right`): Ajustadas dinamicamente (45px no mobile, 80px no 
 *    desktop) para evitar corte dos números totais de acesso, equilibrando o espaço.
 * 3. Eixo Y Dinâmico (`width`): A largura do eixo ajusta entre desktop e mobile 
 *    para não espremer as barras ao exibir nomes longos (ex: UTM_Campaign).
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
    checkMobile(); // Checagem inicial de viewport
    
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);
  
  return isMobile;
}

// ============================================================================
// [CONSTANTES E HELPERS]
// ============================================================================
const barColors = ["#600082", "#BE00FF", "#E299FF", "#730070", "#E300DD", "#FF9EFF", "#475569", "#94a3b8", "#cbd5e1"];

const defaultChartConfig = {
  count: { label: "Quantidade", color: "var(--primary)" },
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
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-medium">Evolução de Acessos Diários</h3>
              <p className="text-xs text-muted-foreground">{periodLabel}</p>
            </div>
          </div>
          
          {loading || !visitKpis ? (
            <div className="h-[240px] flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2 text-primary" />
              Carregando...
            </div>
          ) : (
            <ChartContainer config={defaultChartConfig} className="h-[240px] w-full min-w-0">
              <BarChart data={visDailyData} margin={{ top: 24, right: 0, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" />
                <YAxis hide />
                <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="#94a3b8" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="count" position="top" offset={6} className="fill-foreground" fontSize={11} fontWeight={600} formatter={(v: any) => (v > 0 ? v : "")} />
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
          { title: "Origem do Acesso (UTM Source)", data: visitKpis?.bySource, colorOffset: 6 },
          { title: "Intenção do Usuário (Ação)", data: visitKpis?.byAction, colorOffset: 7 },
          { title: "Produto Visitado", data: visitKpis?.byProduct, colorOffset: 8 },
        ].map((chart) => (
          <div key={chart.title} className="rounded-2xl border bg-card p-5 overflow-hidden">
            <div className="mb-4">
              <h3 className="text-sm font-medium">{chart.title}</h3>
              <p className="text-xs text-muted-foreground">{periodLabel}</p>
            </div>
            
            {loading || !chart.data ? (
              <div className="h-[240px] flex items-center justify-center text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2 text-primary" />
                Carregando...
              </div>
            ) : chart.data.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum dado no período.</p>
            ) : (
              <ChartContainer config={defaultChartConfig} className="h-[240px] w-full">
                {/* ✨ FIX RESPONSIVO: Margem direita dinâmica para garantir que o número não seja cortado na borda */}
                <BarChart 
                  data={chart.data} 
                  layout="vertical" 
                  margin={{ top: 0, right: isMobile ? 45 : 80, left: 0, bottom: 0 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" hide />
                  
                  {/* ✨ FIX RESPONSIVO: Largura do Eixo Y dinâmica (protege UTMs longas) */}
                  <YAxis 
                    type="category" 
                    dataKey="name" 
                    tickLine={false} 
                    axisLine={false} 
                    tick={{ fontSize: isMobile ? 10 : 11, fill: "var(--muted-foreground)" }} 
                    width={isMobile ? 85 : 120} 
                  />
                  
                  <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<ChartTooltipContent />} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {chart.data.map((_: unknown, i: number) => (
                      <Cell key={i} fill={barColors[(i + chart.colorOffset) % barColors.length]} />
                    ))}
                    <LabelList dataKey="count" position="right" fill="var(--foreground)" fontSize={11} fontWeight={600} />
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