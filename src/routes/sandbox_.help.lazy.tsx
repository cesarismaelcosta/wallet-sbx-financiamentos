/**
 * ============================================================================
 * @fileoverview Central de Ajuda e Documentação do Sistema (Sandbox)
 * @module Sandbox/Help
 * @route /sandbox/help
 * 
 * @description
 * Documentação técnica aprofundada gerada a partir da inspeção exaustiva 
 * dos arquivos reais do ecossistema (Camada de Serviços, Rotas TanStack, 
 * Contextos de Autenticação, Edge Functions Deno em _shared e Arquitetura Stateless).
 * ============================================================================
 */

import { createLazyFileRoute } from "@tanstack/react-router";
import { 
  Map, 
  Activity, 
  Database, 
  ShieldCheck, 
  TerminalSquare, 
  LifeBuoy,
  ServerCrash,
  Layers,
  Cpu,
  KeyRound
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createLazyFileRoute("/sandbox_/help")({
  component: SandboxHelpPage,
});

/**
 * Componente reutilizável para renderizar blocos de perguntas/respostas técnicos.
 */
function HelpAccordion({ items }: { items: { q: string; a: React.ReactNode; bullets?: React.ReactNode[] }[] }) {
  if (!items || items.length === 0) return null;

  return (
    <Accordion type="multiple" className="w-full space-y-3">
      {items.map((item, i) => (
        <AccordionItem 
          key={i} 
          value={`help-item-${i}`} 
          className="border border-border rounded-xl px-4 bg-white shadow-sm transition-all focus-within:border-[#B300FF]"
        >
          <AccordionTrigger className="text-left font-bold text-sm text-slate-800 hover:text-[#B300FF] transition-colors py-4 leading-snug">
            {item.q}
          </AccordionTrigger>
          <AccordionContent className="text-muted-foreground text-xs leading-relaxed pb-4 border-t border-slate-100 pt-3">
            <div className="mb-2 text-slate-600">{item.a}</div>
            {item.bullets && item.bullets.length > 0 && (
              <div className="space-y-2 mt-3">
                {item.bullets.map((bullet, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <span className="text-[#B300FF] font-bold mt-0.5">•</span>
                    <span className="text-slate-600 flex-1">{bullet}</span>
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
      <div className="max-w-6xl mx-auto space-y-6 font-sans">
        
        {/* HEADER DA PÁGINA */}
        <div className="flex flex-col gap-2 border-b border-slate-200 pb-6">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 flex items-center gap-3">
            <LifeBuoy className="h-8 w-8 text-[#B300FF]" />
            Manual Técnico & Arquitetura Stateless do Ecossistema
          </h1>
          <p className="text-sm text-muted-foreground max-w-4xl leading-relaxed">
            Documentação estruturada com base na auditoria dos arquivos-fonte do projeto. 
            Abrange o roteamento lazy do TanStack, o ecossistema de serviços, a segurança de borda em Deno (_shared) e o modelo de autenticação puramente Stateless em memória.
          </p>
        </div>

        {/* NAVEGAÇÃO POR ABAS (TABS) */}
        <Tabs defaultValue="frontend" className="flex flex-col w-full">
          
          {/* Menu de Abas */}
          <div className="overflow-x-auto pb-2">
            <TabsList className="w-auto inline-flex justify-start h-12 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
              <TabsTrigger value="frontend" className="rounded-lg data-[state=active]:bg-slate-100 data-[state=active]:text-[#B300FF] px-4 font-semibold text-xs">
                <Layers className="w-4 h-4 mr-2" /> Front-end & Rotas
              </TabsTrigger>
              <TabsTrigger value="services" className="rounded-lg data-[state=active]:bg-slate-100 data-[state=active]:text-[#B300FF] px-4 font-semibold text-xs">
                <KeyRound className="w-4 h-4 mr-2" /> Serviços & Auth Stateless
              </TabsTrigger>
              <TabsTrigger value="edge" className="rounded-lg data-[state=active]:bg-slate-100 data-[state=active]:text-[#B300FF] px-4 font-semibold text-xs">
                <ServerCrash className="w-4 h-4 mr-2" /> Edge Functions (_shared)
              </TabsTrigger>
              <TabsTrigger value="orchestrator" className="rounded-lg data-[state=active]:bg-slate-100 data-[state=active]:text-[#B300FF] px-4 font-semibold text-xs">
                <TerminalSquare className="w-4 h-4 mr-2" /> BFF & Orchestrator
              </TabsTrigger>
              <TabsTrigger value="database" className="rounded-lg data-[state=active]:bg-slate-100 data-[state=active]:text-[#B300FF] px-4 font-semibold text-xs">
                <Database className="w-4 h-4 mr-2" /> PostgreSQL & RLS
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ========================================== */}
          {/* CONTEÚDO DAS ABAS                          */}
          {/* ========================================== */}
          <div className="mt-4">
            
            {/* ABA: FRONT-END & ROTAS */}
            <TabsContent value="frontend" className="space-y-6 animate-in fade-in duration-300">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="bg-white rounded-t-xl border-b border-slate-100 pb-5">
                  <CardTitle className="text-lg text-slate-800">TanStack Router e Componentização (Features)</CardTitle>
                  <CardDescription>Análise do mapeamento de rotas lazy-loaded e da arquitetura modular do hub financeiro.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-slate-50/30">
                  <HelpAccordion 
                    items={[
                      {
                        q: "Como o TanStack Router gerencia as telas e o carregamento da aplicação?",
                        a: "Mapeado através do diretório 'routes/', o sistema emprega roteamento baseado em arquivos com carregamento assíncrono (.lazy.tsx):",
                        bullets: [
                          <><b>Sandbox & Ajuda:</b> Os arquivos <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">sandbox.lazy.tsx</code> e <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">sandbox_.help.lazy.tsx</code> utilizam o sufixo com underline (_) para isolar rotas e prevenir herança de layouts indesejados.</>,
                          <><b>Portal do Cliente (SBX Pay):</b> Gerenciado por <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">sbxpay.lazy.tsx</code> e suas extensões para a página inicial, visualização de ofertas e histórico de consultas.</>,
                          <><b>Backoffice Administrativo:</b> Módulos isolados em <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">backoffice.*.lazy.tsx</code> cobrindo alertas, auditorias, configurações, domínios, relatórios, rotas, simulações e controle de usuários.</>,
                          <><b>Jornadas Verticais:</b> Telas específicas para produtos como Auto Equity, Cartão, Financiamento de Veículos e Seguros localizadas em <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">financiamentos.*</code> e <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">seguros.*</code>.</>
                        ]
                      },
                      {
                        q: "Como a pasta 'features/' modulariza a interface e os produtos de crédito?",
                        a: "O design system e as regras de negócio visuais estão desacoplados em subpastas dedicadas:",
                        bullets: [
                          <><b>Componentes de Layout:</b> Elementos reutilizáveis como <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">ButtonWhatsApp.tsx</code>, <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">DynamicConsents.tsx</code>, <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">FAQSection.tsx</code> e <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">Footer.tsx</code>.</>,
                          <><b>Módulos Sequenciais (Wizards):</b> Produtos como o Auto Equity possuem passos estruturados de <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">Step1Eligibility.tsx</code> até <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">Step5Confirm.tsx</code>, validados por schemas próprios e controlados pelo motor central em <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">WizardEngine.tsx</code>.</>,
                          <><b>Core State:</b> O gerenciamento de estado e navegação utiliza hooks dedicados como <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">useOrchestrator.ts</code>, <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">useNavigation.ts</code> e o contexto global do hub.</>
                        ]
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ABA: SERVIÇOS & AUTH STATELESS */}
            <TabsContent value="services" className="space-y-6 animate-in fade-in duration-300">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="bg-white rounded-t-xl border-b border-slate-100 pb-5">
                  <CardTitle className="text-lg text-slate-800">Autenticação Stateless e Arquitetura Zero-Database</CardTitle>
                  <CardDescription>Como o sistema substituiu tabelas de sessão por assinaturas criptográficas em memória.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-slate-50/30">
                  <HelpAccordion 
                    items={[
                      {
                        q: "Como o ecossistema executa a autenticação e o protocolo de Exchange (sbx-auth-exchange)?",
                        a: "Para mitigar riscos e eliminar consultas desnecessárias ao banco de dados, o sistema adota um fluxo otimizado de autenticação:",
                        bullets: [
                          <><b>Autenticação Externa:</b> A função <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">autenticarAccountsSBX</code> executa um POST direto no endpoint OAuth2 da Superbid (<code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">/account/oauth/token</code>), obtendo o token bruto (<code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">access_token_sbx</code>).</>,
                          <><b>Exchange Stateless:</b> O token bruto é enviado para a Edge Function <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">sbx-auth-exchange</code>, que valida o usuário no upstream e retorna um perfil unificado junto a um JWT assinado criptografamente em memória (<code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">session_token</code>).</>,
                          <><b>Zero Banco de Dados para Sessões:</b> A tabela legada <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">session_tokens</code> foi eliminada. Toda a validação de acesso ocorre puramente pela verificação matemática da assinatura do JWT.</>
                        ]
                      },
                      {
                        q: "Como funciona a Validação em Memória (Gatekeeper e Auth)?",
                        a: "Módulos de segurança críticos operam de forma totalmente autônoma:",
                        bullets: [
                          <><b>Verificação Criptográfica:</b> As funções <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">verifySessionToken</code> (em <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">jwt.ts</code>) decodificam a identidade e o ambiente diretamente da assinatura do token.</>,
                          <><b>Zero Roundtrips:</b> O <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">gatekeeper.ts</code> e o <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">auth.ts</code> extraem o <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">user_id</code> e o <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">environment</code> em frações de milésimos de segundo, sem consultar tabelas relacionais.</>,
                          <><b>Resiliência e Performance:</b> O modelo stateless blinda a aplicação contra gargalos de I/O no PostgreSQL em rotas de alta frequência.</>
                        ]
                      },
                      {
                        q: "Como o FinancialAuthContext e os serviços operam no front-end?",
                        a: "A gestão de estado local e chamadas de serviço segue o padrão clean architecture:",
                        bullets: [
                          <><b>FinancialAuthContext:</b> Localizado em <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">integrations/auth/FinancialAuthContext.tsx</code>, gerencia a sessão reativa e propaga o token stateless.</>,
                          <><b>Armazenamento Seguro:</b> O perfil do usuário e o token bruto são mantidos em <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">sessionStorage</code> para isolamento adequado da sessão ativa.</>,
                          <><b>Camada de Serviços:</b> Módulos como <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">offer.ts</code> e <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">session.ts</code> abstraem a comunicação REST com as Edge Functions.</>
                        ]
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ABA: EDGE FUNCTIONS & _SHARED */}
            <TabsContent value="edge" className="space-y-6 animate-in fade-in duration-300">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="bg-white rounded-t-xl border-b border-slate-100 pb-5">
                  <CardTitle className="text-lg text-slate-800">Edge Functions em Deno e Núcleo Compartilhado (_shared)</CardTitle>
                  <CardDescription>Arquitetura de microsserviços serverless e validação de borda.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-slate-50/30">
                  <HelpAccordion 
                    items={[
                      {
                        q: "Como o diretório 'supabase/functions/_shared/' padroniza o back-end?",
                        a: "O código serverless utiliza utilitários universais centralizados:",
                        bullets: [
                          <><b>server.ts:</b> Define os cabeçalhos de CORS e o wrapper de segurança <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">withSecurity</code>.</>,
                          <><b>jwt.ts e auth.ts:</b> Concentram a lógica de emissão (<code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">generateSessionToken</code>) e validação em memória (<code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">verifySessionToken</code>).</>,
                          <><b>gateKeeper.ts, logger.ts e db.ts:</b> Asseguram regras de IDOR, logs estruturados e conexões seguras com o Supabase.</>
                        ]
                      },
                      {
                        q: "Como a borda (financial-gateway-gate) processa as requisições de entrada?",
                        a: "Atua como a porta de entrada frontal unificada do ecossistema:",
                        bullets: [
                          <><b>Recepção do Token Externo:</b> Recebe o token bruto da Superbid enviado pelo front-end ou sistemas externos.</>,
                          <><b>Validação Upstream & Emissão Stateless:</b> Valida o token no endpoint <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">/account/v2/user/me</code> da Superbid e emite o nosso JWT interno assinado em memória.</>,
                          <><b>Smart Delivery:</b> Retorna o token via cookie HttpOnly ou corpo JSON (segundo negociação de conteúdo), redirecionando o fluxo com segurança.</>
                        ]
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ABA: BFF & ORCHESTRATOR */}
            <TabsContent value="orchestrator" className="space-y-6 animate-in fade-in duration-300">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="bg-white rounded-t-xl border-b border-slate-100 pb-5">
                  <CardTitle className="text-lg text-slate-800">Backend-for-Frontend (BFF) e Orchestrator</CardTitle>
                  <CardDescription>Como o motor de orquestração distribui regras e fluxos dinâmicos.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-slate-50/30">
                  <HelpAccordion 
                    items={[
                      {
                        q: "Qual é a função do motor Orchestrator no projeto?",
                        a: "Desacopla as regras de navegação e apresentação do código estático do front-end:",
                        bullets: [
                          <>A Edge Function <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">orchestrator</code> lê o <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">user_id</code> diretamente do token stateless validado em memória (<code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">auth.user_id</code>).</>,
                          "Entrega payloads JSON estruturados com configurações de rotas, painéis de propostas, FAQs e termos LGPD."
                        ]
                      },
                      {
                        q: "Como o ecossistema processa webhooks de parceiros externos?",
                        a: "Através de rotas dedicadas como 'financial-gateway-webhook':",
                        bullets: [
                          <>Processa callbacks assíncronos de instituições financeiras parceiras (ex: Fandi).</>,
                          "Atualiza o pipeline de propostas na base de dados de forma automatizada e segura."
                        ]
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ABA: POSTGRESQL & RLS */}
            <TabsContent value="database" className="space-y-6 animate-in duration-300">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="bg-white rounded-t-xl border-b border-slate-100 pb-5">
                  <CardTitle className="text-lg text-slate-800">Modelo Relacional, RLS e Triggers (PostgreSQL)</CardTitle>
                  <CardDescription>Segurança de dados e estruturação de tabelas baseada nos scripts SQL de migração.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-slate-50/30">
                  <HelpAccordion 
                    items={[
                      {
                        q: "Como o Row Level Security (RLS) protege as tabelas nas migrações?",
                        a: "Os scripts em 'supabase/migrations/' aplicam restrições de acesso rígidas no banco de dados relacional:",
                        bullets: [
                          <>Todas as tabelas executam explicitamente o comando <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">ENABLE ROW LEVEL SECURITY</code>.</>,
                          <>A tabela legada <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">session_tokens</code> foi totalmente removida para dar lugar à arquitetura puramente stateless.</>
                        ]
                      },
                      {
                        q: "Como a modelagem separa Topo de Funil (Visits) da Esteira de Crédito (Simulations)?",
                        a: "O banco divide o ciclo de vida do cliente em domínios normalizados:",
                        bullets: [
                          <><b>Topo de Funil:</b> As tabelas <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">visits</code>, <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">visit_updates</code>, <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">visit_entities</code> e <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">visit_consents</code> registram UTMs, IPs e interações prévias.</>,
                          <><b>Esteira de Crédito:</b> A tabela mestre <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">simulations</code> gerencia propostas de financiamento, ligando-se a tabelas satélites de auditoria e garantias.</>
                        ]
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

          </div>
        </Tabs>
      </div>
    </div>
  );
}