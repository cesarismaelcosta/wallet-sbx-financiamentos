/**
 * @fileoverview Componente: RelatoriosPage (Página de Relatórios do Backoffice)
 * @route /backoffice/reports
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-RADIUS & NEUTRAL PURITY
 * =========================================================================
 * [ATUALIZAÇÃO DE DESIGN SYSTEM]:
 * 1. Zero-Radius: Remoção absoluta de cantos arredondados nos cards, badges, 
 *    ícones e botões. Adoção total do `rounded-none`.
 * 2. Neutral Purity: Extinção de referências a cores de marca ou vars globais 
 *    (`primary`, `accent`, `muted-foreground`). Transição para a paleta 
 *    estrita de `neutral-900` a `neutral-50`.
 * 3. Interactions: Hover states repensados para contrastes institucionais 
 *    (ex: ícone inverte de fundo cinza para fundo preto).
 * =========================================================================
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { Download, FileBarChart2, FileSpreadsheet, FileText, PieChart, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createLazyFileRoute("/backoffice/reports")({
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
        <h1 className="text-2xl font-bold tracking-tight text-neutral-950">Relatórios</h1>
        <p className="text-sm text-neutral-600">
          Exporte os principais indicadores da sua operação de crédito.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <div
              key={r.title}
              className="group rounded-none border border-neutral-200 bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-neutral-400 hover:shadow-sm"
            >
              <div className="flex items-start justify-between">
                {/* Ícone Neutral c/ Inversão no Hover */}
                <div className="flex h-10 w-10 items-center justify-center rounded-none bg-neutral-100 text-neutral-700 border border-neutral-200 transition-colors group-hover:bg-neutral-900 group-hover:text-white group-hover:border-neutral-900">
                  <Icon className="h-4 w-4" />
                </div>
                
                {/* Badge Micro-Tipográfica Neutral */}
                <span className="rounded-none border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-500">
                  {r.tag}
                </span>
              </div>
              
              <h3 className="mt-4 text-sm font-medium text-neutral-900">{r.title}</h3>
              <p className="mt-1 text-xs text-neutral-500 leading-relaxed">{r.desc}</p>
              
              <div className="mt-5 flex items-center gap-2">
                <Button size="sm" className="rounded-none bg-neutral-900 hover:bg-neutral-800 text-white font-medium shadow-xs text-xs h-8">
                  <Download className="mr-1.5 h-3.5 w-3.5 text-neutral-300" /> Baixar
                </Button>
                <Button size="sm" variant="outline" className="rounded-none border-neutral-200 text-neutral-900 hover:bg-neutral-100 font-medium shadow-xs text-xs h-8">
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