/**
 * ============================================================================
 * @fileoverview Central de Ajuda e Documentação do Sistema (Sandbox)
 * @module Sandbox/Help
 * @route /sandbox/help
 * 
 * @description
 * Página dedicada à documentação técnica e de negócios do ecossistema.
 * Serve como guia rápido para operadores e desenvolvedores entenderem o fluxo
 * de dados (Visitas -> Simulações), regras de orquestração e uso do Sandbox.
 * ============================================================================
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { 
  Map, 
  Activity, 
  Database, 
  ShieldCheck, 
  TerminalSquare, 
  LifeBuoy
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createLazyFileRoute("/sandbox/help")({
  component: SandboxHelpPage,
});

/**
 * Componente reutilizável para renderizar blocos de perguntas/respostas.
 * Usa o padrão de 1 coluna para leitura fluida da documentação.
 */
function HelpAccordion({ items }: { items: { q: string; a: React.ReactNode; bullets?: string[] }[] }) {
  if (!items || items.length === 0) return null;

  return (
    <Accordion type="multiple" className="w-full space-y-3">
      {items.map((item, i) => (
        <AccordionItem 
          key={i} 
          value={`help-item-${i}`} 
          className="border border-border rounded-xl px-4 bg-white shadow-sm transition-all focus-within:border-[#B300FF]"
        >
          <AccordionTrigger className="text-left font-bold text-sm text-slate-800 hover:text-[#B300FF] transition-colors py-4">
            {item.q}
          </AccordionTrigger>
          <AccordionContent className="text-muted-foreground text-xs leading-relaxed pb-4 border-t border-slate-100 pt-3">
            <div className="mb-2 text-slate-600">{item.a}</div>
            {item.bullets && item.bullets.length > 0 && (
              <div className="space-y-1.5 mt-3">
                {item.bullets.map((bullet, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <span className="text-[#B300FF] font-bold mt-0.5">•</span>
                    <span className="text-slate-600">{bullet}</span>
                  </div>
                ))}
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

function SandboxHelpPage() {
  return (
    <div className="bg-slate-50/50 min-h-screen pt-12 pb-24 px-6 md:px-12">
      <div className="max-w-5xl mx-auto space-y-6 font-sans">
        
        {/* HEADER DA PÁGINA */}
        <div className="flex flex-col gap-2 border-b border-slate-200 pb-6">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-3">
            <LifeBuoy className="h-8 w-8 text-[#B300FF]" />
            Central de Ajuda & Documentação
          </h1>
          <p className="text-sm text-muted-foreground max-w-3xl leading-relaxed">
            Tudo o que você precisa saber sobre o funcionamento do ecossistema: desde a captação do lead no Topo de Funil (Gateway) até a conversão e gestão de rotas do Orchestrator.
          </p>
        </div>

        {/* NAVEGAÇÃO POR ABAS (TABS) */}
        <Tabs defaultValue="overview" className="flex flex-col w-full">
          
          {/* Menu de Abas */}
          <div className="overflow-x-auto pb-2">
            <TabsList className="w-auto inline-flex justify-start h-12 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
              <TabsTrigger value="overview" className="rounded-lg data-[state=active]:bg-slate-100 data-[state=active]:text-[#B300FF] px-4 font-semibold text-xs">
                <Map className="w-4 h-4 mr-2" /> Visão Geral
              </TabsTrigger>
              <TabsTrigger value="consults" className="rounded-lg data-[state=active]:bg-slate-100 data-[state=active]:text-[#B300FF] px-4 font-semibold text-xs">
                <Activity className="w-4 h-4 mr-2" /> Consultas & Visitas
              </TabsTrigger>
              <TabsTrigger value="simulations" className="rounded-lg data-[state=active]:bg-slate-100 data-[state=active]:text-[#B300FF] px-4 font-semibold text-xs">
                <Database className="w-4 h-4 mr-2" /> Simulações (Crédito)
              </TabsTrigger>
              <TabsTrigger value="orchestrator" className="rounded-lg data-[state=active]:bg-slate-100 data-[state=active]:text-[#B300FF] px-4 font-semibold text-xs">
                <TerminalSquare className="w-4 h-4 mr-2" /> Gestão de Rotas
              </TabsTrigger>
              <TabsTrigger value="compliance" className="rounded-lg data-[state=active]:bg-slate-100 data-[state=active]:text-[#B300FF] px-4 font-semibold text-xs">
                <ShieldCheck className="w-4 h-4 mr-2" /> LGPD & Compliance
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ========================================== */}
          {/* CONTEÚDO DAS ABAS                          */}
          {/* ========================================== */}
          <div className="mt-4">
            
            {/* ABA: VISÃO GERAL */}
            <TabsContent value="overview" className="space-y-6 animate-in fade-in duration-300">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="bg-white rounded-t-xl border-b border-slate-100 pb-5">
                  <CardTitle className="text-lg text-slate-800">Como o Ecossistema Funciona?</CardTitle>
                  <CardDescription>Entenda a jornada de ponta a ponta do usuário.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-slate-50/30">
                  <HelpAccordion 
                    items={[
                      {
                        q: "Qual é a diferença entre uma 'Consulta/Visita' e uma 'Simulação'?",
                        a: "O sistema divide a jornada em dois grandes momentos para otimizar a performance e a conversão:",
                        bullets: [
                          "Visitas (Topo de Funil): Ocorrem quando o usuário acessa uma rota, visualiza uma oferta ou clica em um botão de parceiro. É o interesse inicial. Tudo é logado de forma leve na tabela 'visits'.",
                          "Simulações (Conversão): Acontecem quando o usuário efetivamente preenche um formulário de financiamento, enviando dados de valores, prazos e passando por análise de crédito. Fica registrado na tabela pesada 'simulations'."
                        ]
                      },
                      {
                        q: "O que é o Sandbox?",
                        a: "O Sandbox é uma ferramenta de desenvolvimento e homologação. Ele permite simular disparos para a API de Gateway (borda) como se você fosse o front-end, testando como o Orchestrator responde a cada ID de produto ou oferta e permitindo auditorias através dos painéis de inspeção (Drawers).",
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ABA: CONSULTAS E VISITAS */}
            <TabsContent value="consults" className="space-y-6 animate-in fade-in duration-300">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="bg-white rounded-t-xl border-b border-slate-100 pb-5">
                  <CardTitle className="text-lg text-slate-800">Monitor de Consultas e Visitas</CardTitle>
                  <CardDescription>Entenda os dados capturados no Topo do Funil.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-slate-50/30">
                  {/* TEXTOS FUTUROS ENTRARÃO AQUI */}
                  <p className="text-sm text-slate-500 italic">Pronto para receber as orientações da aba Consultas...</p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ABA: SIMULAÇÕES */}
            <TabsContent value="simulations" className="space-y-6 animate-in fade-in duration-300">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="bg-white rounded-t-xl border-b border-slate-100 pb-5">
                  <CardTitle className="text-lg text-slate-800">Esteira de Simulações</CardTitle>
                  <CardDescription>Gerenciamento do ciclo de vida das propostas de crédito.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-slate-50/30">
                  {/* TEXTOS FUTUROS ENTRARÃO AQUI */}
                  <p className="text-sm text-slate-500 italic">Pronto para receber as orientações da aba Simulações...</p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ABA: ORCHESTRATOR */}
            <TabsContent value="orchestrator" className="space-y-6 animate-in fade-in duration-300">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="bg-white rounded-t-xl border-b border-slate-100 pb-5">
                  <CardTitle className="text-lg text-slate-800">Orchestrator & Gestão de Rotas</CardTitle>
                  <CardDescription>Entenda como configurar e orquestrar as jornadas.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-slate-50/30">
                  {/* TEXTOS FUTUROS ENTRARÃO AQUI */}
                  <p className="text-sm text-slate-500 italic">Pronto para receber as orientações da aba Orchestrator...</p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ABA: COMPLIANCE */}
            <TabsContent value="compliance" className="space-y-6 animate-in fade-in duration-300">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="bg-white rounded-t-xl border-b border-slate-100 pb-5">
                  <CardTitle className="text-lg text-slate-800">LGPD, Tracker e Consentimentos</CardTitle>
                  <CardDescription>Como garantimos a segurança jurídica das operações.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-slate-50/30">
                   {/* TEXTOS FUTUROS ENTRARÃO AQUI */}
                   <p className="text-sm text-slate-500 italic">Pronto para receber as orientações da aba Compliance...</p>
                </CardContent>
              </Card>
            </TabsContent>

          </div>
        </Tabs>
      </div>
    </div>
  );
}