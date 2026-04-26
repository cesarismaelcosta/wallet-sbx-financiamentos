import { createFileRoute } from "@tanstack/react-router";
import { Download, FileBarChart2, FileSpreadsheet, FileText, PieChart, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/backoffice/relatorios")({
  component: RelatoriosPage,
});

const REPORTS = [
  { icon: TrendingUp, title: "Performance comercial", desc: "Conversão por vendedor, loja e período.", tag: "Mensal" },
  { icon: PieChart, title: "Mix de produtos", desc: "Distribuição por tipo de veículo e prazo.", tag: "Diário" },
  { icon: FileBarChart2, title: "Funil de propostas", desc: "Simulação → análise → aprovação → contratação.", tag: "Semanal" },
  { icon: FileSpreadsheet, title: "Carteira ativa", desc: "Contratos vigentes, inadimplência e amortização.", tag: "Mensal" },
  { icon: FileText, title: "Conformidade & auditoria", desc: "Trilha de aprovações e exceções.", tag: "Trimestral" },
  { icon: TrendingUp, title: "Análise de risco", desc: "Score, motivos de recusa e tendências.", tag: "Mensal" },
];

function RelatoriosPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
        <p className="text-sm text-muted-foreground">
          Exporte os principais indicadores da sua operação de crédito.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <div
              key={r.title}
              className="group rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[var(--shadow-card)]"
            >
              <div className="flex items-start justify-between">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-accent px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent-foreground">
                  {r.tag}
                </span>
              </div>
              <h3 className="mt-5 text-base font-bold">{r.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{r.desc}</p>
              <div className="mt-5 flex items-center gap-2">
                <Button size="sm" className="rounded-lg">
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Baixar
                </Button>
                <Button size="sm" variant="outline" className="rounded-lg">
                  Visualizar
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
