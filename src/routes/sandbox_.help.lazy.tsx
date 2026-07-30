/**
 * ============================================================================
 * @fileoverview Central de Ajuda e Documentação do Sistema (Sandbox)
 * @module Sandbox/Help
 * @route /sandbox/help
 * 
 * @description
 * Documentação técnica aprofundada gerada a partir da inspeção exaustiva 
 * dos arquivos reais do ecossistema (Camada de Serviços, Rotas TanStack, 
 * Contextos de Autenticação, Edge Functions Deno em _shared e Migrações PostgreSQL).
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
            Manual Técnico & Arquitetura do Ecossistema
          </h1>
          <p className="text-sm text-muted-foreground max-w-4xl leading-relaxed">
            Documentação estruturada estritamente com base na auditoria dos arquivos-fonte do projeto. 
            Abrange o roteamento lazy do TanStack, o ecossistema de serviços, a segurança de borda em Deno (_shared) e o modelo relacional do PostgreSQL.
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
                <KeyRound className="w-4 h-4 mr-2" /> Serviços & Auth
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

            {/* ABA: SERVIÇOS & AUTH */}
            <TabsContent value="services" className="space-y-6 animate-in fade-in duration-300">
              <Card className="border-slate-200 shadow-sm">
                <CardHeader className="bg-white rounded-t-xl border-b border-slate-100 pb-5">
                  <CardTitle className="text-lg text-slate-800">Controle de Sessão, Tokens SBX e Autenticação Dual</CardTitle>
                  <CardDescription>Como o sistema gerencia credenciais, o protocolo de Exchange na borda e o isolamento de sessões.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-slate-50/30">
                  <HelpAccordion 
                    items={[
                      {
                        q: "Como o ecossistema executa a autenticação e o protocolo de Exchange (sbx-auth-exchange)?",
                        a: "Para mitigar riscos de exposição do token corporativo da Superbid, a aplicação implementa um fluxo rigoroso de troca de credenciais:",
                        bullets: [
                          <><b>Autenticação Externa:</b> A função <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">autenticarAccountsSBX</code> executa um POST direto no endpoint OAuth2 da Superbid (<code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">/account/oauth/token</code>) usando credenciais corporativas e o client_id configurado, obtendo um token bruto (<code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">access_token_sbx</code>).</>,
                          <><b>A Ponte de Borda:</b> O token externo bruto é enviado para a Edge Function <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">sbx-auth-exchange</code>, que valida a autenticidade junto à sbX.</>,
                          <><b>Emissão do Token Interno:</b> A borda emite um <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">session_token</code> (JWT assinado pelo Supabase) que passa a transitar nas requisições do sistema, garantindo conformidade com as regras de Row Level Security (RLS) sem expor a API primária da Superbid no banco.</>
                        ]
                      },
                      {
                        q: "Como o armazenamento de tokens e o FinancialAuthContext operam no front-end?",
                        a: "O gerenciamento de estado e persistência de credenciais divide-se em duas camadas:",
                        bullets: [
                          <><b>Armazenamento Local/Sessão:</b> O token bruto obtido da sbX é salvo em <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">sessionStorage</code> para isolar o ciclo de vida à aba ativa do operador no Sandbox.</>,
                          <><b>FinancialAuthContext:</b> Localizado em <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">integrations/auth/FinancialAuthContext.tsx</code>, gerencia o token de sessão reativo, propaga estados de login e executa o encerramento seguro com purga de ambiente (<code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">purgeEnv</code>).</>,
                          <><b>Instâncias Supabase:</b> Trabalha integrado aos clientes de front, servidor e administração (<code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">client.admin.ts</code>) com privilégios de service role quando necessário.</>
                        ]
                      },
                      {
                        q: "Quais são as responsabilidades da pasta 'services/'?",
                        a: "Isola totalmente a comunicação com APIs externas e microserviços de suporte:",
                        bullets: [
                          <><b>offer.ts:</b> Implementa a função <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">fetchOfferDetails</code> para resgatar dados detalhados de lotes na API upstream.</>,
                          <><b>user.ts:</b> Executa <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">fetchMyProfile</code> para coletar o perfil estruturado do usuário logado.</>,
                          <><b>session.ts:</b> Gerencia o estado de sessão e a alternância de ambientes entre staging e production.</>,
                          <><b>auth.ts e systemNotification.ts:</b> Concentram rotinas auxiliares de autenticação e gerenciamento de alertas sistêmicos.</>
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
                  <CardDescription>Arquitetura de microsserviços serverless, CORS global e protocolo de troca de tokens.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-slate-50/30">
                  <HelpAccordion 
                    items={[
                      {
                        q: "Como o diretório 'supabase/functions/_shared/' padroniza o back-end?",
                        a: "O código serverless evita duplicação importando utilitários universais do núcleo compartilhado:",
                        bullets: [
                          <><b>server.ts:</b> Define e exporta a constante global <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">corsHeaders</code> para atender requisições de origem cruzada.</>,
                          <><b>gateKeeper.ts e auth.ts:</b> Atuam como middlewares de validação de tokens e segurança de borda.</>,
                          <><b>logger.ts, crypto.ts, db.ts e security.ts:</b> Fornecem rotinas de logs estruturados, criptografia e interação segura com o banco.</>
                        ]
                      },
                      {
                        q: "Quais funções de borda e serviços especializados compõem o financial-gateway?",
                        a: "A pasta 'supabase/functions/financial-gateway/' abriga os microsserviços de integração:",
                        bullets: [
                          <><b>financial-gateway-gate:</b> Borda principal que intercepta e valida requisições de entrada, gerando tokens e submissões seguras.</>,
                          <><b>financial-gateway-webhook:</b> Recebe callbacks assíncronos de parceiros externos (como a Fandi).</>,
                          <><b>Serviços específicos:</b> <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">credit-card-service.ts</code>, <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">creditas-auto-equity-service.ts</code>, <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">fandi-service.ts</code>, <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">simulation-handler.ts</code> e <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">persist-data.ts</code> gerenciam a normalização de payloads e a gravação transacional.</>
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
                  <CardDescription>Como a Edge Function 'orchestrator-configs' entrega UIs e regras dinâmicas.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-slate-50/30">
                  <HelpAccordion 
                    items={[
                      {
                        q: "Qual é a função do motor Orchestrator no projeto?",
                        a: "Ele desacopla as regras de apresentação do código React, permitindo que o front-end monte interfaces sem dependências de código estático:",
                        bullets: [
                          <>A Edge Function <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">orchestrator-configs</code> consulta o banco de dados para buscar parametrizações de rotas.</>,
                          "Retorna um payload JSON estruturado contendo dados do Offer Panel, FAQs, regras de parcelamento e termos LGPD."
                        ]
                      },
                      {
                        q: "Como o ecossistema processa webhooks de parceiros externos?",
                        a: "Através da Edge Function 'financial-gateway-webhook':",
                        bullets: [
                          <>Expõe endpoints seguros para receber callbacks assíncronos de instituições financeiras (ex: Fandi).</>,
                          "Atualiza o status e a máquina de estados das propostas diretamente na base de dados de forma automatizada."
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
                          <>As políticas de segurança utilizam funções validadoras como <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">check_user_role()</code> para restringir operações com base na role do usuário autenticado.</>
                        ]
                      },
                      {
                        q: "Como a modelagem separa Topo de Funil (Visits) da Esteira de Crédito (Simulations)?",
                        a: "O banco divide o ciclo de vida do cliente em domínios normalizados:",
                        bullets: [
                          <><b>Topo de Funil:</b> As tabelas <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">visits</code>, <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">visit_updates</code>, <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">visit_entities</code> e <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">visit_consents</code> registram UTMs, IPs e interações prévias.</>,
                          <><b>Esteira de Crédito:</b> A tabela mestre <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">simulations</code> gerencia propostas de financiamento, ligando-se a tabelas satélites de auditoria (<code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">simulation_updates</code>), consentimentos com snapshot jurídico (<code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">simulation_consents</code>) e garantias físicas (<code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">simulation_collateral_vehicle</code> e <code className="bg-slate-100 text-purple-700 px-1 py-0.5 rounded font-mono text-[10px]">simulation_collateral_home</code>).</>
                        ]
                      },
                      {
                        q: "Como os Triggers automatizam a auditoria temporal?",
                        a: "Funções de gatilho como 'update_updated_at_column()' e 'handle_updated_at()' são acopladas a triggers BEFORE UPDATE, garantindo a atualização automática da coluna 'updated_at' nas modificações de registros."
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