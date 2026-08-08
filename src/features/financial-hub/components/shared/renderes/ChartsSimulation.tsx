import { Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, LabelList } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const barColors = ["#600082", "#BE00FF", "#E299FF", "#730070", "#E300DD", "#FF9EFF", "#475569", "#94a3b8", "#cbd5e1"];
const BRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const defaultChartConfig = {
  count: { label: "Quantidade", color: "var(--primary)" },
} satisfies ChartConfig;

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
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4">
        <div className="rounded-2xl border bg-card p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-medium">Evolução de Simulações Diárias</h3>
              <p className="text-xs text-muted-foreground">{periodLabel}</p>
            </div>
          </div>
          {loading || !simKpis ? (
            <div className="h-[240px] flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin mr-2 text-primary" />
              Carregando...
            </div>
          ) : (
            <ChartContainer config={defaultChartConfig} className="h-[240px] w-full">
              <BarChart data={simDailyData} margin={{ top: 24, right: 0, left: -24, bottom: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" />
                <YAxis hide />
                <ChartTooltip cursor={{ fill: "var(--muted)", opacity: 0.4 }} content={<ChartTooltipContent />} />
                <Bar dataKey="count" fill="var(--primary)" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="count" position="top" offset={6} className="fill-foreground" fontSize={11} fontWeight={600} formatter={(v: any) => (v > 0 ? v : "")} />
                </Bar>
              </BarChart>
            </ChartContainer>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {[
          { title: "Status da Proposta", data: simKpis?.byStatus },
          { title: "Por Produto", data: simKpis?.byProduct },
          { title: "Por Parceiro", data: simKpis?.byPartner },
        ].map((chart, idx) => (
          <div key={chart.title} className="rounded-2xl border bg-card p-5">
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
                <BarChart data={chart.data} layout="vertical" margin={{ top: 0, right: 60, left: 0, bottom: 0 }}>
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} width={110} />
                  <ChartTooltip
                    cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                    content={
                      <ChartTooltipContent
                        formatter={(value, _name, item) => (
                          <div className="flex flex-col">
                            <span>{value} simulações</span>
                            <span className="text-xs text-muted-foreground">{BRL(item.payload.volume)}</span>
                          </div>
                        )}
                      />
                    }
                  />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]} maxBarSize={28}>
                    {chart.data.map((_: unknown, i: number) => (
                      <Cell key={i} fill={barColors[(i + idx * 3) % barColors.length]} />
                    ))}
                    <LabelList
                      dataKey="count"
                      position="right"
                      content={(props: any) => {
                        const item = chart.data![props.index];
                        if (!item) return null;
                        const cx = Number(props.x) + Number(props.width) + 8;
                        const cy = Number(props.y) + Number(props.height) / 2;
                        return (
                          <g>
                            <text x={cx} y={cy - 6} fill="var(--foreground)" fontSize={11} fontWeight={600} dominantBaseline="middle">{props.value}</text>
                            <text x={cx} y={cy + 8} fill="var(--muted-foreground)" fontSize={10} dominantBaseline="middle">{BRL(item.volume)}</text>
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