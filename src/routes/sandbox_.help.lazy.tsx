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
 * 
 * [ATUALIZAÇÃO DE CONFORMIDADE VISUAL]:
 * - Neutral Purity: Extinção de cores de marca (roxo/lilás) em favor de tons
 *   sóbrios de neutral-900 a neutral-50 para documentação técnica.
 * - Zero-Radius: Remoção de cantos arredondados (rounded-xl, rounded-lg) em
 *   Tabs, Accordions, Cards e badges de código, aplicando rounded-none.
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
  KeyRound,
  Lock
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
          className="border border-neutral-200 rounded-none px-4 bg-white shadow-sm transition-all focus-within:border-neutral-900"
        >
          <AccordionTrigger className="text-left font-bold text-sm text-neutral-800 hover:text-neutral-900 transition-colors py-4 leading-snug">
            {item.q}
          </AccordionTrigger>
          <AccordionContent className="text-neutral-500 text-xs leading-relaxed pb-4 border-t border-neutral-200 pt-3">
            <div className="mb-2 text-neutral-600">{item.a}</div>
            {item.bullets && item.bullets.length > 0 && (
              <div className="space-y-2 mt-3">
                {item.bullets.map((bullet, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <span className="text-neutral-900 font-bold mt-0.5">•</span>
                    <span className="text-neutral-600 flex-1">{bullet}</span>
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
  const codeBadge = "bg-neutral-100 border border-neutral-200 text-neutral-900 px-1 py-0.5 rounded-none font-mono text-[10px]";

  return (
    <div className="bg-neutral-50 min-h-screen pt-12 pb-24 px-6 md:px-12">
      <div className="max-w-6xl mx-auto space-y-6 font-sans">
        
        {/* HEADER DA PÁGINA */}
        <div className="flex flex-col gap-2 border-b border-neutral-200 pb-6">
          <h1 className="text-3xl font-black tracking-tight text-neutral-900 flex items-center gap-3">
            <LifeBuoy className="h-8 w-8 text-neutral-900" />
            Manual Técnico & Arquitetura Stateless do Ecossistema
          </h1>
          <p className="text-sm text-neutral-500 max-w-4xl leading-relaxed">
            Documentação estruturada com base na auditoria dos arquivos-fonte do projeto. 
            Abrange o roteamento lazy do TanStack, o ecossistema de serviços, a segurança de borda em Deno (_shared), o modelo de autenticação Stateless em memória e o tratamento automatizado de sessões expiradas.
          </p>
        </div>

        {/* NAVEGAÇÃO POR ABAS (TABS) */}
        <Tabs defaultValue="frontend" className="flex flex-col w-full">
          
          {/* Menu de Abas */}
          <div className="overflow-x-auto pb-2">
            <TabsList className="w-auto inline-flex justify-start h-12 bg-white p-1 rounded-none border border-neutral-200 shadow-sm">
              <TabsTrigger value="frontend" className="rounded-none data-[state=active]:bg-neutral-100 data-[state=active]:text-neutral-900 px-4 font-semibold text-xs">
                <Layers className="w-4 h-4 mr-2" /> Front-end & Rotas
              </TabsTrigger>
              <TabsTrigger value="services" className="rounded-none data-[state=active]:bg-neutral-100 data-[state=active]:text-neutral-900 px-4 font-semibold text-xs">
                <KeyRound className="w-4 h-4 mr-2" /> Serviços & Auth Stateless
              </TabsTrigger>
              <TabsTrigger value="edge" className="rounded-none data-[state=active]:bg-neutral-100 data-[state=active]:text-neutral-900 px-4 font-semibold text-xs">
                <ServerCrash className="w-4 h-4 mr-2" /> Edge Functions (_shared)
              </TabsTrigger>
              <TabsTrigger value="dataflow" className="rounded-none data-[state=active]:bg-neutral-100 data-[state=active]:text-neutral-900 px-4 font-semibold text-xs">
                <Lock className="w-4 h-4 mr-2" /> Segurança de Dados & Fast Path
              </TabsTrigger>
              <TabsTrigger value="secrets" className="rounded-none data-[state=active]:bg-neutral-100 data-[state=active]:text-neutral-900 px-4 font-semibold text-xs">
                <ShieldCheck className="w-4 h-4 mr-2" /> Segredos & Blindagem
              </TabsTrigger>
              <TabsTrigger value="orchestrator" className="rounded-none data-[state=active]:bg-neutral-100 data-[state=active]:text-neutral-900 px-4 font-semibold text-xs">
                <TerminalSquare className="w-4 h-4 mr-2" /> BFF & Orchestrator
              </TabsTrigger>
              <TabsTrigger value="database" className="rounded-none data-[state=active]:bg-neutral-100 data-[state=active]:text-neutral-900 px-4 font-semibold text-xs">
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
              <Card className="border-neutral-200 shadow-sm rounded-none">
                <CardHeader className="bg-white rounded-none border-b border-neutral-200 pb-5">
                  <CardTitle className="text-lg text-neutral-800">TanStack Router e Componentização (Features)</CardTitle>
                  <CardDescription className="text-neutral-500">Análise do mapeamento de rotas lazy-loaded e da arquitetura modular do hub financeiro.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-neutral-50">
                  <HelpAccordion 
                    items={[
                      {
                        q: "Como o TanStack Router gerencia as telas e o carregamento da aplicação?",
                        a: "Mapeado através do diretório 'routes/', o sistema emprega roteamento baseado em arquivos com carregamento assíncrono (.lazy.tsx):",
                        bullets: [
                          <><b>Sandbox & Ajuda:</b> Os arquivos <code className={codeBadge}>sandbox.tsx</code> e <code className={codeBadge}>sandbox_.help.lazy.tsx</code> gerenciam o painel de debug e o manual técnico com redirecionamento automático de sessões expiradas.</>,
                          <><b>Portal do Cliente (SBX Pay):</b> Gerenciado por <code className={codeBadge}>sbxpay.lazy.tsx</code> e suas extensões para a página inicial, visualização de ofertas e histórico de consultas.</>,
                          <><b>Backoffice Administrativo:</b> Módulos isolados em <code className={codeBadge}>backoffice.*.lazy.tsx</code> cobrindo alertas, auditorias, configurações, domínios, relatórios, rotas, simulações e controle de usuários.</>,
                          <><b>Jornadas Verticais:</b> Telas específicas para produtos como Auto Equity, Cartão, Financiamento de Veículos e Seguros localizadas em <code className={codeBadge}>financiamentos.*</code> e <code className={codeBadge}>seguros.*</code>.</>
                        ]
                      },
                      {
                        q: "Como a pasta 'features/' modulariza a interface e os produtos de crédito?",
                        a: "O design system e as regras de negócio visuais estão desacoplados em subpastas dedicadas:",
                        bullets: [
                          <><b>Componentes de Layout:</b> Elementos reutilizáveis como <code className={codeBadge}>ButtonWhatsApp.tsx</code>, <code className={codeBadge}>DynamicConsents.tsx</code>, <code className={codeBadge}>FAQSection.tsx</code> e <code className={codeBadge}>Footer.tsx</code>.</>,
                          <><b>Módulos Sequenciais (Wizards):</b> Produtos como o Auto Equity possuem passos estruturados de <code className={codeBadge}>Step1Eligibility.tsx</code> até <code className={codeBadge}>Step5Confirm.tsx</code>, validados por schemas próprios e controlados pelo motor central em <code className={codeBadge}>WizardEngine.tsx</code>.</>,
                          <><b>Core State:</b> O gerenciamento de estado e navegação utiliza hooks dedicados como <code className={codeBadge}>useOrchestrator.ts</code>, <code className={codeBadge}>useNavigation.ts</code> e o contexto global do hub.</>
                        ]
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ABA: SERVIÇOS & AUTH STATELESS */}
            <TabsContent value="services" className="space-y-6 animate-in fade-in duration-300">
              <Card className="border-neutral-200 shadow-sm rounded-none">
                <CardHeader className="bg-white rounded-none border-b border-neutral-200 pb-5">
                  <CardTitle className="text-lg text-neutral-800">Autenticação Stateless e Tratamento de Sessão Expirada</CardTitle>
                  <CardDescription className="text-neutral-500">Como o sistema unificou a validação em memória e o redirecionamento automático por resiliência.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-neutral-50">
                  <HelpAccordion 
                    items={[
                      {
                        q: "Como o ecossistema executa a autenticação e o protocolo de Exchange (sbx-auth-exchange)? (fotografia completa do fluxo atual)",
                        a: <>O sistema não guarda sessão em nenhuma tabela — hoje, TODA a prova de que um usuário está logado mora dentro do próprio token, assinado criptograficamente. Segue o caminho completo, do login até a última requisição antes de expirar:</>,
                        bullets: [
                          <><b>1. Autenticação externa (upstream):</b> a função <code className={codeBadge}>autenticarAccountsSBX</code> faz um POST direto no endpoint OAuth2 da Superbid (<code className={codeBadge}>/account/oauth/token</code>) com as credenciais do usuário, e recebe de volta um token bruto (<code className={codeBadge}>access_token_sbx</code>) — esse token é da Superbid, não é o nosso; ele só prova que o login/senha bateram lá.</>,
                          <><b>2. Exchange (troca) — emissão do nosso próprio JWT:</b> o token bruto é enviado para a Edge Function <code className={codeBadge}>sbx-auth-exchange</code>, que valida o usuário no upstream e chama <code className={codeBadge}>generateSessionToken()</code> (<code className={codeBadge}>_shared/jwt.ts</code>). Essa função monta um payload interno — <code className={codeBadge}>{"{ typ: 'session', environment, userId, userName, login }"}</code> — e assina tudo com o algoritmo <code className={codeBadge}>HS256</code> usando o segredo <code className={codeBadge}>JWT_SECRET</code>, com expiração padrão de <code className={codeBadge}>7200s</code> (2 horas). O resultado é o <code className={codeBadge}>session_token</code> — um JWT que carrega, dentro de si mesmo, tudo que qualquer Edge Function vai precisar saber sobre quem é o usuário.</>,
                          <><b>3. Selo de ambiente contra forjamento:</b> o campo <code className={codeBadge}>environment</code> ("staging" ou "production") vai LACRADO dentro da assinatura do próprio token — não é um parâmetro solto que o cliente manda em toda requisição. Isso significa que ninguém consegue, alterando algo na URL ou no corpo da requisição, fazer um token de staging ser aceito como se fosse de produção (ou vice-versa): qualquer tentativa de trocar o ambiente por fora invalida a assinatura inteira.</>,
                          <><b>4. Transporte híbrido do token (produção vs. desenvolvimento):</b> em produção, quando front-end e API compartilham o mesmo domínio raiz (checado por <code className={codeBadge}>isSameSite()</code> em <code className={codeBadge}>src/services/session.ts</code>), o backend devolve o token via <code className={codeBadge}>Set-Cookie</code> <b>HttpOnly</b> — o JavaScript do navegador NUNCA chega a ler o valor do token, o que fecha a porta pra roubo via XSS. Fora desse cenário (dev local, ou domínios diferentes), o sistema cai num fallback: guarda o token em <code className={codeBadge}>sessionStorage</code> (nunca em <code className={codeBadge}>localStorage</code> — evaporaria ao fechar a aba de qualquer forma) e passa a enviá-lo manualmente no header customizado <code className={codeBadge}>x-session-token</code> em toda chamada.</>,
                          <><b>5. Validação em CADA requisição seguinte — sem tocar o banco:</b> toda Edge Function protegida chama <code className={codeBadge}>verifySessionToken(token)</code>, que roda <code className={codeBadge}>jwtVerify()</code> (biblioteca <code className={codeBadge}>jose</code>) inteiramente em memória, dentro da própria instância da function. Duas checagens automáticas acontecem ali: (a) a assinatura HS256 bate com o que <code className={codeBadge}>JWT_SECRET</code> geraria — se um único bit do token foi alterado, a verificação falha na hora (<code className={codeBadge}>JWT_INVALID_SIGNATURE</code>); (b) o claim <code className={codeBadge}>exp</code> (timestamp de expiração, embutido no próprio token) ainda não passou — se passou, falha com <code className={codeBadge}>JWT_EXPIRED_SESSION</code>. Não existe passo intermediário de "consultar uma tabela pra ver se esse token ainda é válido" — a matemática da assinatura E o carimbo de tempo JÁ SÃO a validação.</>,
                          <><b>Onde ficava o estado antes, e por que essa tabela não existe mais:</b> antes dessa arquitetura, cada sessão emitida virava uma linha na tabela <code className={codeBadge}>session_tokens</code>, e cada requisição fazia uma consulta pra checar existência/validade — esse era o modelo "stateful" (estado mora no banco). Hoje essa tabela foi fisicamente removida do banco de dados (confirmado consultando o schema <code className={codeBadge}>public</code> ao vivo — ela não existe mais); o único resquício é um tipo TypeScript desatualizado em <code className={codeBadge}>src/integrations/supabase/types.ts</code>, gerado antes da remoção e nunca mais regenerado, sem nenhum efeito em runtime.</>
                        ]
                      },
                      {
                        q: "Como o Sandbox lida com o erro SESSION_EXPIRED em chamadas AJAX (Fetch)?",
                        a: "O painel de testes implementa resiliência automatizada por meio da rotina 'checkAndHandleSessionError':",
                        bullets: [
                          <><b>Interceptação Inteligente:</b> Caso uma chamada assíncrona retorne código <code className={codeBadge}>SESSION_EXPIRED</code> ou status 401, a aplicação não exibe apenas um aviso estático, mas limpa o storage e executa o <code className={codeBadge}>handleExpiredSession()</code>.</>,
                          <><b>Redirecionamento com Retorno Preservado:</b> O usuário é redirecionado instantaneamente para <code className={codeBadge}>/accounts/signin?redirect_uri=...</code>, garantindo que ele retorne ao ponto exato após reautenticar.</>,
                          <><b>Guarda de Visibilidade e Inatividade:</b> Eventos de <code className={codeBadge}>visibilitychange</code> e <code className={codeBadge}>pageshow</code> inspecionam o tempo de expiração do JWT (claim <code className={codeBadge}>exp</code>) preventivamente ao focar na aba.</>
                        ]
                      },
                      {
                        q: "Além do session_token principal, existem outros tokens de curta duração no ecossistema? (Exchange Token e Cartório S2S)",
                        a: <>Sim — dois mecanismos auxiliares, ambos efêmeros (segundos a poucos minutos) e com escopo propositalmente estreito, vivendo em <code className={codeBadge}>_shared/jwt.ts</code> e <code className={codeBadge}>_shared/s2s.ts</code>:</>,
                        bullets: [
                          <><b>Exchange Token (handoff seguro entre domínios):</b> quando o fluxo precisa transicionar de um domínio para outro (ex.: Gateway → Portal do cliente), a Borda emite um <code className={codeBadge}>generateExchangeToken()</code> — um JWT com <code className={codeBadge}>typ: "exchange"</code> e TTL fixo de <code className={codeBadge}>EXCHANGE_TTL_SECONDS = 60</code> segundos. Ele trafega no <b>fragmento da URL</b> (<code className={codeBadge}>#xt=...</code> ou <code className={codeBadge}>#exchange_token=...</code>) — fragmentos de URL não são enviados ao servidor nem aparecem em logs de acesso, só ficam disponíveis no navegador via JavaScript. O front-end detecta esse padrão em <code className={codeBadge}>useHandoffRedeem.ts</code> e troca o token pela sessão de verdade.</>,
                          <><b>Blindagem contra sequestro do link (hash do User-Agent):</b> o token carrega <code className={codeBadge}>uah</code> (hash do User-Agent de quem o emitiu, via <code className={codeBadge}>hashUserAgent()</code>) e <code className={codeBadge}>aud</code> (o domínio que pode consumi-lo). <code className={codeBadge}>verifyExchangeToken()</code> recalcula o hash do User-Agent de quem está resgatando o token e compara — se o link foi copiado e aberto em outro navegador/dispositivo, o hash diverge e a troca é recusada com <code className={codeBadge}>EXCHANGE_HIJACK_DETECTED</code>, mesmo com a assinatura JWT tecnicamente válida.</>,
                          <><b>Cartório S2S (bypass interno entre microserviços):</b> depois do login, <code className={codeBadge}>sbx-auth</code> chancela o perfil do usuário com <code className={codeBadge}>signS2SEntity()</code> (TTL de 1 minuto, "trânsito interno é quase instantâneo") gerando o <code className={codeBadge}>s2s_signed_entity</code>. O Orquestrador valida essa chancela com <code className={codeBadge}>verifyS2SEntity()</code> e passa a confiar na PII carregada nela sem precisar revalidar a sessão no banco de novo — mas só depois de <code className={codeBadge}>assertS2SEntity()</code> confirmar que o formato do perfil (campos <code className={codeBadge}>entity_id</code>/<code className={codeBadge}>entity_type</code> obrigatórios) é válido; um payload fora do contrato é rejeitado com <code className={codeBadge}>INVALID_S2S_ENTITY</code> mesmo com assinatura correta.</>,
                          <><b>Fail-closed no boot:</b> <code className={codeBadge}>_shared/s2s.ts</code> se recusa a inicializar se <code className={codeBadge}>JWT_SECRET</code> não estiver configurado — sem fallback silencioso. Um cartório criptográfico sem segredo forjaria confiança de graça, então o módulo prefere derrubar a function no boot (erro auditável) a operar inseguro.</>,
                          <>O mesmo módulo também assina os parâmetros da URL de reautenticação (<code className={codeBadge}>visit_id</code>, <code className={codeBadge}>visit_update_id</code>, <code className={codeBadge}>target_url</code>) quando o Orquestrador responde <code className={codeBadge}>401</code> — blindando a "memória do carrinho" contra Open Redirect e IDOR no fluxo de novo login.</>
                        ]
                      }
                    ]}
                  />
                </CardContent>
              </Card>

              <Card className="border-neutral-200 shadow-sm rounded-none">
                <CardHeader className="bg-white rounded-none border-b border-neutral-200 pb-5">
                  <CardTitle className="text-lg text-neutral-800">Autenticação do Backoffice (Google Workspace + Auditoria)</CardTitle>
                  <CardDescription className="text-neutral-500">Um mecanismo TOTALMENTE separado do stateless acima — usado só pelo painel administrativo interno, nunca pelo cliente final.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-neutral-50">
                  <HelpAccordion
                    items={[
                      {
                        q: "Como um funcionário entra no Backoffice, do clique em 'Entrar com Google' até a tela renderizar?",
                        a: "Fluxo em 3 etapas, todo orquestrado por `src/integrations/auth/AuthContext.tsx`:",
                        bullets: [
                          <><b>1. OAuth do Google (via Supabase Auth):</b> <code className={codeBadge}>signInWithGoogle()</code> chama <code className={codeBadge}>supabase.auth.signInWithOAuth({"{"} provider: 'google' {"}"})</code> — quem emite e guarda a sessão é o próprio Supabase Auth, não uma tabela nossa. Isso é <b>diferente</b> do JWT stateless do sbXPay (aba anterior).</>,
                          <><b>2. Autorização via RPC (`get_backoffice_session`):</b> assim que existe uma sessão do Supabase Auth, <code className={codeBadge}>validateUserAccess()</code> chama a RPC <code className={codeBadge}>get_backoffice_session()</code>. Ela é <code className={codeBadge}>SECURITY DEFINER</code> e lê o e-mail direto de <code className={codeBadge}>auth.jwt()</code> (nunca de um parâmetro que o cliente poderia forjar), busca em <code className={codeBadge}>backoffice_users</code> e retorna erro (<code className={codeBadge}>user_does_not_exist</code>/<code className={codeBadge}>user_inactive</code>) ou o perfil completo (role, parceiros e produtos permitidos).</>,
                          <><b>3. Schema Obfuscation:</b> o front-end NUNCA faz <code className={codeBadge}>supabase.from('backoffice_users').select(...)</code> diretamente — só a RPC, que decide o que expor. Isso esconde nomes de coluna/estrutura da tabela de qualquer inspeção via DevTools/Network.</>,
                          <>Um e-mail autenticado no Google mas ausente (ou inativo) em <code className={codeBadge}>backoffice_users</code> é barrado aqui — <code className={codeBadge}>signOut()</code> é chamado e a tela de login reaparece com a mensagem de erro apropriada.</>
                        ]
                      },
                      {
                        q: "Por que o AuthProvider não refaz essa validação a cada navegação entre telas do Backoffice?",
                        a: <>Porque <code className={codeBadge}>AuthProvider</code> é montado <b>uma única vez</b> no layout pai (<code className={codeBadge}>backoffice.lazy.tsx</code>) — navegar entre <code className={codeBadge}>/backoffice/simulations</code>, <code className={codeBadge}>/backoffice/users</code> etc. troca só o <code className={codeBadge}>{"<Outlet />"}</code> interno, sem remontar o Provider. Ainda assim, dois guardas evitam refetch redundante caso o componente remonte (ex: Lazy Loading/HMR):</>,
                        bullets: [
                          <><code className={codeBadge}>sessionStorage['auth_validated_once']</code> — sentinela que diz "esta aba já validou nesta sessão de navegador".</>,
                          <><code className={codeBadge}>backofficeUser?.email === email</code> — se o e-mail em memória já bate com o da sessão atual, nem chama a RPC de novo.</>,
                          <>Os dois juntos é que permitem diferenciar, no registro de auditoria, um <code className={codeBadge}>login</code> real (primeira validação) de um <code className={codeBadge}>refresh</code> (revalidação da mesma sessão).</>
                        ]
                      },
                      {
                        q: "Como funciona a auditoria de acesso — quem registra o quê, e onde isso é gravado?",
                        a: "Todo evento relevante de identidade vira uma linha em `login_history`, através da RPC `log_access_event` (não mais uma Edge Function — ver aba 'Segredos & Blindagem' para o histórico da migração):",
                        bullets: [
                          <><b>Login/Refresh (sucesso ou falha):</b> disparado dentro de <code className={codeBadge}>validateUserAccess()</code>, guardado por um <code className={codeBadge}>useRef(hasLoggedThisSession)</code> pra nunca logar duas vezes a mesma sessão de validação.</>,
                          <><b>Logout:</b> disparado em <code className={codeBadge}>signOut()</code>, antes de encerrar a sessão no Supabase Auth.</>,
                          <><b>Navegação (`refresh`):</b> ver próximo item — é um mecanismo deliberado e separado, vivendo em <code className={codeBadge}>backoffice.lazy.tsx</code>, não em <code className={codeBadge}>AuthContext</code>.</>,
                          <>A RPC identifica o autor via <code className={codeBadge}>auth.email()</code> (contexto do próprio Postgres/PostgREST) — o payload enviado pelo front-end NUNCA leva e-mail, só <code className={codeBadge}>p_event</code>/<code className={codeBadge}>p_success</code>/<code className={codeBadge}>p_origin_page</code>/<code className={codeBadge}>p_origin_function</code>/<code className={codeBadge}>p_failure_reason</code>.</>,
                          <>Detalhes técnicos completos (allowlist de eventos, rate limit, parsing de device/OS) estão na aba <b>PostgreSQL & RLS</b>, card "RPC & CRON Jobs".</>
                        ]
                      },
                      {
                        q: "Como é feito o registro deliberado de navegação (uma linha por troca de tela)?",
                        a: <>Vive num <code className={codeBadge}>useEffect</code> dedicado em <code className={codeBadge}>backoffice.lazy.tsx</code>, com dependência EXCLUSIVAMENTE em <code className={codeBadge}>pathname</code> (via <code className={codeBadge}>useLocation()</code> do TanStack Router) — de propósito separado do efeito de auth guard, pra não acoplar os dois:</>,
                        bullets: [
                          <>Ignora a rota <code className={codeBadge}>/backoffice/login</code> e qualquer estado ainda não autenticado.</>,
                          <>Um segundo <code className={codeBadge}>useRef(hasLoggedInitialPage)</code> pula o PRIMEIRO disparo do efeito (a página inicial pós-login) — ela já foi contabilizada como <code className={codeBadge}>login</code> pelo <code className={codeBadge}>AuthContext</code>; só as trocas SEGUINTES de rota geram um evento <code className={codeBadge}>refresh</code> novo.</>,
                          <>Chama <code className={codeBadge}>logLoginHistoryEvent()</code> de <code className={codeBadge}>src/lib/login-history.ts</code>, que faz <code className={codeBadge}>fetch</code> direto (sem o client completo do Supabase) pro endpoint REST <code className={codeBadge}>/rest/v1/rpc/log_access_event</code>, com headers <code className={codeBadge}>apikey</code> + <code className={codeBadge}>Authorization: Bearer</code>. Essa função retorna uma Promise de verdade, então <code className={codeBadge}>.catch()</code> funciona nela — diferente de <code className={codeBadge}>supabase.rpc()</code> (ver próximo item).</>,
                          <>Zero PII local: o e-mail só é usado em memória para virar um hash SHA-256 (throttle de 5 min por usuário no <code className={codeBadge}>sessionStorage</code>), nunca é persistido em texto.</>
                        ]
                      },
                      {
                        q: "Existe algum cuidado especial ao chamar `supabase.rpc(...)` que já causou bug em produção?",
                        a: <><b>Sim — isso já quebrou o carregamento do Backoffice uma vez e vale documentar para nunca se repetir:</b> <code className={codeBadge}>supabase.rpc(...)</code> retorna um <i>query builder</i> (thenable) que implementa só <code className={codeBadge}>.then()</code>, NÃO um <code className={codeBadge}>Promise</code> real — ele não tem <code className={codeBadge}>.catch()</code> nem <code className={codeBadge}>.finally()</code>.</>,
                        bullets: [
                          <>Chamar <code className={codeBadge}>.catch(...)</code> direto num <code className={codeBadge}>supabase.rpc(...)</code> lança <code className={codeBadge}>TypeError: ...catch is not a function</code> de forma SÍNCRONA — isso interrompe a função ANTES das próximas linhas rodarem (ex: <code className={codeBadge}>setBackofficeUser</code>, <code className={codeBadge}>setSession</code>), travando a tela em loading infinito.</>,
                          <>Padrão correto: <code className={codeBadge}>{"supabase.rpc(...).then(({ error }) => { if (error) console.error(error); })"}</code>.</>,
                          <><code className={codeBadge}>supabase.functions.invoke(...)</code> (chamada de Edge Function) é diferente — essa sim retorna uma Promise real e aceita <code className={codeBadge}>.catch()</code> normalmente, assim como <code className={codeBadge}>fetch()</code> cru (caso de <code className={codeBadge}>login-history.ts</code>, item anterior).</>
                        ]
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ABA: EDGE FUNCTIONS & _SHARED */}
            <TabsContent value="edge" className="space-y-6 animate-in fade-in duration-300">
              <Card className="border-neutral-200 shadow-sm rounded-none">
                <CardHeader className="bg-white rounded-none border-b border-neutral-200 pb-5">
                  <CardTitle className="text-lg text-neutral-800">Edge Functions em Deno, Borda Híbrida e _shared</CardTitle>
                  <CardDescription className="text-neutral-500">Segurança de borda com suporte flexível a cabeçalhos e payloads protegidos.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-neutral-50">
                  <HelpAccordion 
                    items={[
                      {
                        q: "Como a borda 'financial-gateway-gate' resolve credenciais de forma híbrida?",
                        a: "A Edge Function aceita tokens de acesso por múltiplas vias de transporte com purificação de segurança integrada:",
                        bullets: [
                          <><b>Prioridade por Header:</b> O sistema prioriza a leitura do token bruto no cabeçalho customizado <code className={codeBadge}>x-access-token</code> para requisições AJAX seguras via Fetch.</>,
                          <><b>Fallback por Payload:</b> Caso o envio ocorra via submissão tradicional de formulário HTML (<code className={codeBadge}>&lt;form method="POST"&gt;</code>), o parâmetro <code className={codeBadge}>auth_token</code> é extraído do corpo.</>,
                          <><b>Security Patch (Purga Automática):</b> Imediatamente após a captura, a propriedade <code className={codeBadge}>auth_token</code> é apagada do objeto payload (<code className={codeBadge}>delete payload.auth_token</code>), impedindo vazamentos ou o reenvio indevido da credencial opaca para serviços downstream (Orquestrador).</>
                        ]
                      },
                      {
                        q: "Como o diretório 'supabase/functions/_shared/' padroniza o back-end?",
                        a: "O código serverless utiliza utilitários universais centralizados:",
                        bullets: [
                          <><b>server.ts:</b> Define os cabeçalhos de CORS e o wrapper de segurança <code className={codeBadge}>withSecurity</code>.</>,
                          <><b>jwt.ts e auth.ts:</b> Concentram a lógica de emissão (<code className={codeBadge}>generateSessionToken</code>) e validação em memória (<code className={codeBadge}>verifySessionToken</code>).</>,
                          <><b>gateKeeper.ts, logger.ts e db.ts:</b> Asseguram regras de IDOR, logs estruturados e conexões seguras com o Supabase.</>
                        ]
                      },
                      {
                        q: "Como o CORS é validado sem abrir brecha pra CORS Spoofing, e o que protege as rotas Server-to-Server?",
                        a: <>Duas proteções distintas, ambas em <code className={codeBadge}>_shared/security.ts</code>/<code className={codeBadge}>server.ts</code>:</>,
                        bullets: [
                          <><b>Motor Anti-Spoofing (CORS):</b> a função <code className={codeBadge}>getSafeCorsOrigin()</code> nunca usa um wildcard (<code className={codeBadge}>*</code>) — ela lê o header <code className={codeBadge}>Origin</code> da requisição, confere contra uma allowlist de sufixos de domínio (<code className={codeBadge}>localhost</code> em qualquer porta, prévias <code className={codeBadge}>.lovable.app</code>, domínios corporativos <code className={codeBadge}>.superbid.net</code>) e só então <b>reflete de volta a origem exata</b> recebida — isso é exigido pela própria especificação de cookies HttpOnly quando <code className={codeBadge}>Access-Control-Allow-Credentials: true</code>. Uma origem forjada, um valor <code className={codeBadge}>"null"</code> (gerado por iframes sandboxed) ou uma requisição sem header <code className={codeBadge}>Origin</code> nenhum (cURL, Postman, chamadas S2S) recebem string vazia — o navegador aborta a requisição sozinho. Mitiga CORS Spoofing (CWE-942) e, numa função irmã do mesmo arquivo, Open Redirect (CWE-601).</>,
                          <><b>Timing Attacks em rotas Server-to-Server:</b> qualquer validação de segredo estático (senha S2S, segredos HMAC, assinatura de webhook) usa <code className={codeBadge}>safeCompare()</code> — comparação de bytes em tempo constante (XOR acumulado, percorrendo o array inteiro sempre) em vez de <code className={codeBadge}>a === b</code>, que vaza o tempo de execução byte a byte e permitiria a um atacante deduzir a chave certa por tentativa e erro medindo a latência da resposta.</>
                        ]
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ABA: SEGURANÇA DE DADOS & FAST PATH */}
            <TabsContent value="dataflow" className="space-y-6 animate-in fade-in duration-300">
              <Card className="border-neutral-200 shadow-sm rounded-none">
                <CardHeader className="bg-white rounded-none border-b border-neutral-200 pb-5">
                  <CardTitle className="text-lg text-neutral-800">"Thin Payload" e Hidratação Server-Side</CardTitle>
                  <CardDescription className="text-neutral-500">A premissa da arquitetura: o front-end é cego e inconfiável. Nada que ele manda é aceito como verdade.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-neutral-50">
                  <HelpAccordion
                    items={[
                      {
                        q: "O que é o 'Thin Payload', e o que o front-end tem permissão de mandar pro backend?",
                        a: <>No front-end, o utilitário <code className={codeBadge}>toThinPayload()</code> força a higienização de toda requisição antes dela sair do navegador — ele não confia, ele PODA:</>,
                        bullets: [
                          <>Deleta agressivamente qualquer PII ou ID de negócio que o cliente tenha injetado no objeto (<code className={codeBadge}>entity_id</code>, <code className={codeBadge}>category_id</code>, <code className={codeBadge}>seller_id</code>) — mesmo que esses campos existam no estado local do React, eles NUNCA saem pela rede.</>,
                          <>A rede trafega só dois tipos de coisa: os <b>cursores da jornada</b> (<code className={codeBadge}>visit_id</code>, <code className={codeBadge}>offer_id</code> — ponteiros opacos, não os dados em si) e os <b>inputs lícitos</b> que o usuário realmente digitou (prazo, valor de entrada). Tudo o mais que a tela precisa (nome do cliente, valor da oferta, condições) o servidor busca sozinho.</>
                        ]
                      },
                      {
                        q: "Se o payload chega 'vazio' de dados de negócio, de onde vem a 'verdade' que a Edge Function usa pra decidir?",
                        a: <>Do próprio banco, buscada pelo servidor — nunca do que o cliente mandou. Esse é o papel de <code className={codeBadge}>hydrateVisitContext()</code> (<code className={codeBadge}>_shared/hydrate-data.ts</code>), chamado assim que o payload chega na Borda:</>,
                        bullets: [
                          <>Lê só o cursor (<code className={codeBadge}>visit_id</code>/<code className={codeBadge}>offer_id</code>) e faz um <code className={codeBadge}>SELECT</code> direto no banco via a conexão TCP (Seção "Motor Transacional" abaixo), reconstruindo do zero a <b>Trusted Entity</b> e a <b>Trusted Offer</b> — os únicos objetos em que o resto do pipeline (Gatekeepers, motor de crédito) confia.</>,
                          <><b>Smart DB Caching:</b> para não derrubar a API de ofertas sob alto tráfego, a Borda usa o cálculo do próprio banco (<code className={codeBadge}>EXTRACT(EPOCH FROM (NOW() - o.updated_at))</code>) — se a oferta local tem menos de 5 minutos, o cache do Postgres é reaproveitado em vez de recalcular tudo de novo.</>,
                          <>Esse é o motivo de o Gatekeeper (próximo card) poder validar acesso "100% em memória" sem tocar o banco de novo: os dados já foram hidratados e validados NESTE passo — o Gatekeeper só cruza referências que já estão confiáveis.</>
                        ]
                      }
                    ]}
                  />
                </CardContent>
              </Card>

              <Card className="border-neutral-200 shadow-sm rounded-none">
                <CardHeader className="bg-white rounded-none border-b border-neutral-200 pb-5">
                  <CardTitle className="text-lg text-neutral-800">Gatekeepers — Escudo Anti-Fraude (Cross-Tampering Defense)</CardTitle>
                  <CardDescription className="text-neutral-500">_shared/gatekeeper.ts — o portão que toda escrita precisa atravessar antes do motor de crédito ou da persistência serem acionados.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-neutral-50">
                  <HelpAccordion
                    items={[
                      {
                        q: "O que exatamente o Gatekeeper verifica antes de deixar uma escrita passar?",
                        a: "Existem dois mecanismos, com granularidades diferentes — vale a pena não confundir os dois:",
                        bullets: [
                          <><code className={codeBadge}>validateOfferAccess</code> — cruzamento <b>100% em memória</b>: compara o <code className={codeBadge}>sessionUserId</code> extraído do JWT contra a <code className={codeBadge}>trustedEntity</code> e a <code className={codeBadge}>trustedOffer</code> já materializadas pela hidratação (card anterior). Não faz nenhuma consulta nova ao banco nesta etapa — é puramente comparar valores que já foram trazidos e validados.</>,
                          <><code className={codeBadge}>validateSimulationIntegrity</code> — cruzamento relacional com <b>uma consulta mínima e deliberada</b>: para uma simulação já existente, busca de forma estrita (por <code className={codeBadge}>id</code> E <code className={codeBadge}>visit_id</code> simultaneamente) pra confirmar que ela realmente pertence à visita e à entidade que o JWT afirma. Qualquer divergência lança <code className={codeBadge}>INVALID_RELATIONSHIP</code> na hora — isso é o que a documentação interna chama de "escudo Cross-Tampering".</>
                        ]
                      },
                      {
                        q: "Na prática, o que acontece se alguém tentar injetar o visit_id ou a oferta de outro cliente?",
                        a: <>A mecânica de validação sempre faz as mesmas três perguntas: o UUID extraído de forma imutável do JWT (<code className={codeBadge}>sessionUserId</code>) pertence à <code className={codeBadge}>trustedEntity</code>? Essa entidade é a dona da <code className={codeBadge}>visit_id</code>? Essa visita originou a <code className={codeBadge}>offer_id</code>?</>,
                        bullets: [
                          <>Se qualquer uma dessas respostas for "não" — ou seja, sessão ≠ dono do dado — o cruzamento falha e a transação morre instantaneamente com <code className={codeBadge}>403 Forbidden</code>.</>,
                          <>O motor de crédito NUNCA chega a ser acionado, e a persistência é abortada ANTES de qualquer escrita no banco — não existe um cenário de "escreve e depois desfaz"; a checagem acontece estritamente antes.</>
                        ]
                      }
                    ]}
                  />
                </CardContent>
              </Card>

              <Card className="border-neutral-200 shadow-sm rounded-none">
                <CardHeader className="bg-white rounded-none border-b border-neutral-200 pb-5">
                  <CardTitle className="text-lg text-neutral-800">Motor Transacional (Fast Path TCP) — e por que ele não usa RLS</CardTitle>
                  <CardDescription className="text-neutral-500">persist-data.ts — o executor atômico de escrita, e a justificativa técnica de por que o tráfego de cliente final não passa por Row Level Security.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-neutral-50">
                  <HelpAccordion
                    items={[
                      {
                        q: "Como a gravação (persist-data.ts) se conecta ao banco, e qual credencial ela usa?",
                        a: <>Via conexão TCP direta ao <b>Supavisor</b> (Transaction Pooler, porta <code className={codeBadge}>6543</code>, connection string <code className={codeBadge}>DB_POOLER_URL</code>), autenticando como o role dedicado <code className={codeBadge}>db_edge_worker</code> — <b>não</b> um usuário administrativo/superusuário. Isso é mínimo privilégio, não conveniência: os grants cobrem só <code className={codeBadge}>SELECT, INSERT, UPDATE</code> nas ~13 tabelas que este client realmente usa (confirmado por varredura de código — nenhum <code className={codeBadge}>DELETE</code>/<code className={codeBadge}>TRUNCATE</code> é emitido em nenhum arquivo que usa este client), nunca <code className={codeBadge}>ALL PRIVILEGES</code>/<code className={codeBadge}>ALL TABLES</code>. Detalhes completos de como esse role foi criado estão na aba "Segredos & Blindagem".</>,
                        bullets: [
                          <><b>Travas contra Race Conditions (Advisory Locks):</b> para gerar IDs sequenciais por parceiro (Fandi, Creditas), usa travas em nível de banco (<code className={codeBadge}>SELECT pg_advisory_xact_lock(1000, partnerId)</code>) — enfileira requisições simultâneas em ordem matematicamente exata ao buscar o próximo ID (<code className={codeBadge}>MAX() + 1</code>), liberando a trava no exato instante do commit.</>,
                          <><b>Consistência ACID:</b> toda gravação ocorre num bloco transacional (<code className={codeBadge}>sql.begin</code>). Um <code className={codeBadge}>UPDATE</code> que afeta zero linhas (ex.: sessão expirada) exige <code className={codeBadge}>RETURNING id</code>; se voltar vazio, lança <code className={codeBadge}>[FATAL]</code>, forçando rollback total. Para latência mínima, tabelas filhas (ofertas, configurações, consentimentos) são despachadas simultaneamente via <code className={codeBadge}>Promise.all</code>.</>,
                          <><b>Auditoria PII-Lean:</b> <code className={codeBadge}>buildAuditPayload()</code> constrói o <code className={codeBadge}>raw_payload</code> sem duplicar PII — reflete só o Thin Payload mais metadados lícitos, mantendo dados nominais estritamente normalizados (LGPD).</>,
                          <><b>Zero-Trust OLAP Sync (background, sem custo de latência):</b> quando a oferta hidratada tem mutações pendentes vindas do sistema mãe (Superbid), o Orquestrador dispara <code className={codeBadge}>syncHydratedOffer()</code> e entrega a Promise pro <code className={codeBadge}>EdgeRuntime.waitUntil()</code> nativo do Deno Deploy em vez de dar <code className={codeBadge}>await</code> nela — a resposta HTTP já foi enviada ao cliente, e a sincronização no Data Lake roda depois, em background, sem pesar no Time-to-Interactive. Se o runtime não expõe <code className={codeBadge}>waitUntil</code> (ex.: ambiente local), cai num fallback síncrono (<code className={codeBadge}>await syncPromise</code>) — mais lento, porém correto.</>
                        ]
                      },
                      {
                        q: "Por que esse role precisa de BYPASSRLS — isso não é uma brecha de segurança?",
                        a: <>Não é uma brecha — é uma exceção deliberada e estritamente escopada. Confirmado por inspeção ao vivo do banco: as tabelas que este role toca têm RLS habilitado com o mesmo padrão de 4 políticas descrito na aba "PostgreSQL & RLS" (<code className={codeBadge}>Leitura_Staff</code>, <code className={codeBadge}>Escrita_Admin_Mgr_Ins/Upd</code>, <code className={codeBadge}>Delete_Admin</code>), todas escopadas pra role <code className={codeBadge}>authenticated</code> via contexto de JWT.</>,
                        bullets: [
                          <>Uma conexão Postgres crua via <code className={codeBadge}>postgres.js</code> NUNCA carrega esse contexto de JWT — sem <code className={codeBadge}>BYPASSRLS</code>, toda query deste role seria bloqueada pelo RLS antes mesmo de chegar em qualquer <code className={codeBadge}>GRANT</code>.</>,
                          <>Quem efetivamente entra pela "porta dos fundos" com um JWT de usuário real (Backoffice, via PostgREST) continua sujeito às 4 políticas normalmente — o <code className={codeBadge}>db_edge_worker</code> é a única exceção, e só porque os privilégios de tabela dele já são explicitamente limitados por <code className={codeBadge}>GRANT</code> escopado.</>
                        ]
                      },
                      {
                        q: "Por que a proteção do cliente final é feita em código (Gatekeeper) em vez de RLS no banco?",
                        a: "Três motivos técnicos sustentam essa escolha arquitetural — não é uma omissão, é uma decisão deliberada:",
                        bullets: [
                          <><b>Redundância computacional (ganho zero):</b> a prevenção contra sequestro de dados (IDOR) já está garantida no código do Backend — a Borda já hidrata os dados de forma Zero-Trust e o Gatekeeper já cruza a criptografia do JWT com as chaves relacionais (cards anteriores). Quando a instrução chega na persistência, ela já é segura; exigir que o banco recompute o mesmo cruzamento no INSERT/UPDATE seria redundante.</>,
                          <><b>Vazamento de contexto no pool TCP:</b> para o RLS atuar sobre o usuário da ponta numa conexão TCP persistente e compartilhada — mesmo usando um role de aplicação dedicado e não administrativo, como o <code className={codeBadge}>db_edge_worker</code> — seria mandatório injetar estado por sessão via <code className={codeBadge}>set_config('request.jwt.claims')</code> antes de cada transação. Como <code className={codeBadge}>persist-data.ts</code> despacha dezenas de transações assíncronas em paralelo (<code className={codeBadge}>Promise.all</code>), injetar escopos de sessão voláteis em conexões concorrentes do mesmo pool cria o risco real de uma conexão reaproveitada executar comandos no contexto de outro usuário por falha de reset no pool.</>,
                          <><b>Morte do pipelining (degradação de TTI):</b> o RLS relacional opera executando tabelas de espelho e JOINs implícitos por baixo dos panos pra validar hierarquias profundas. Sob carga massiva de inserts simultâneos na origem de crédito, essas travas inviabilizariam o paralelismo e o Time-to-Interactive do cliente despencaria.</>,
                          <><b>O modelo final, em uma frase:</b> Cliente Final (Porta da Frente) = Fast Path TCP + role de privilégio escopado + blindagem 100% em código (Gatekeepers). Backoffice (Porta dos Fundos) = PostgREST + RPCs dedicadas + RLS como o cão de guarda da operação (aba "PostgreSQL & RLS"). São dois barramentos deliberadamente isolados, cada um com o mecanismo de proteção certo pro seu próprio perfil de tráfego.</>
                        ]
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ABA: SEGREDOS & BLINDAGEM */}
            <TabsContent value="secrets" className="space-y-6 animate-in fade-in duration-300">
              <Card className="border-neutral-200 shadow-sm rounded-none">
                <CardHeader className="bg-white rounded-none border-b border-neutral-200 pb-5">
                  <CardTitle className="text-lg text-neutral-800">Blindagem de Borda — registry.ts + server.ts</CardTitle>
                  <CardDescription className="text-neutral-500">Como cada Edge Function declara seu próprio contrato de autenticação, e como isso é aplicado de forma centralizada antes do handler rodar.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-neutral-50">
                  <HelpAccordion
                    items={[
                      {
                        q: "Onde uma chave de assinatura ou credencial de banco existe fisicamente — nunca no código-fonte?",
                        a: "O ecossistema adota desconfiança absoluta do repositório versionado como lugar de guardar segredo — a regra é dupla:",
                        bullets: [
                          <>Nenhum token, chave de assinatura (<code className={codeBadge}>JWT_SECRET</code>) ou connection string de banco existe no código-fonte do front-end, nem em repouso (em texto puro) no repositório do backend — nem mesmo como valor "de desenvolvimento" ou comentado.</>,
                          <>Todo material criptográfico é armazenado no <b>Vault</b> de infraestrutura da Supabase (Secrets da Edge Function) ou, quando o consumidor é um job do próprio banco, no <code className={codeBadge}>vault.decrypted_secrets</code> do Postgres (ver o padrão HMAC via Vault mais abaixo).</>,
                          <>Os módulos acessam as chaves estritamente na <b>memória volátil</b> do worker Deno, via <code className={codeBadge}>Deno.env.get()</code>, chamado em tempo de execução — nunca lido de um arquivo de configuração versionado. Um atacante inspecionando o tráfego HTTP ou vasculhando o histórico do Git jamais encontrará uma chave de assinatura real; o inventário completo de qual segredo existe, onde é lido e como recriá-lo está no card "Inventário de Segredos" logo abaixo.</>
                        ]
                      },
                      {
                        q: "Como o registry.ts garante que nenhuma function fique desprotegida por esquecimento?",
                        a: <><code className={codeBadge}>_shared/registry.ts</code> é a ÚNICA fonte de verdade sobre o contrato de borda de cada Edge Function — um mapa puramente declarativo (<code className={codeBadge}>FUNCTION_CONFIGS</code>), sem lógica de execução. Duas regras de fail-safe protegem contra esquecimento:</>,
                        bullets: [
                          <><b>Function não registrada:</b> se uma chave não existir em <code className={codeBadge}>FUNCTION_CONFIGS</code>, o <code className={codeBadge}>withSecurity</code> bloqueia com <code className={codeBadge}>500</code> ANTES do handler rodar. Esquecer de registrar quebra a function em vez de deixá-la desprotegida — o padrão de falha é "fechado", nunca "aberto".</>,
                          <><b>Function registrada sem authMode:</b> <code className={codeBadge}>authMode</code> é um campo OBRIGATÓRIO (união discriminada) — o TypeScript recusa compilar uma function nova sem essa escolha explícita. Isso fecha o "segundo buraco": antes, uma rota podia estar mapeada mas sem nenhum mecanismo de auth setado, sem que ninguém percebesse lendo o arquivo.</>
                        ]
                      },
                      {
                        q: "Quais mecanismos de autenticação existem, e quando usar cada um?",
                        a: "Cada authMode.type nomeado cobre um padrão real do sistema — nada fica escondido atrás de um \"custom\" genérico:",
                        bullets: [
                          <><code className={codeBadge}>session</code> — usuário logado no app (sbXPay/Financial Hub) via token de sessão (<code className={codeBadge}>_shared/jwt.ts</code>). Ex: <code className={codeBadge}>orchestrator</code>, <code className={codeBadge}>sbx-offer</code>.</>,
                          <><code className={codeBadge}>secret</code> — outra Edge Function que PODE guardar segredo estático em texto no próprio ambiente. Ex: <code className={codeBadge}>notification-gateway</code>.</>,
                          <><code className={codeBadge}>hmac</code> — chamador que NÃO pode guardar segredo em texto (ex: um job do <code className={codeBadge}>pg_cron</code>, visível via <code className={codeBadge}>select * from cron.job</code>). Ex: <code className={codeBadge}>notification-dispatcher</code>, <code className={codeBadge}>log-access</code> (worker de geo).</>,
                          <><code className={codeBadge}>sbx-access-token</code> — porta de entrada que recebe o token OAuth bruto da Superbid e é quem EMITE nossa sessão (não pode exigir de volta algo que ainda não existe). Ex: <code className={codeBadge}>sbx-auth</code>, <code className={codeBadge}>financial-gateway-gate</code>.</>,
                          <><code className={codeBadge}>staff-google-auth</code> — identidade de funcionário do backoffice via JWT do Google Auth (não é sessão sbX de cliente final). Ex: <code className={codeBadge}>manage-backoffice-users</code>.</>,
                          <><code className={codeBadge}>public</code> — zero credencial por design (exige <code className={codeBadge}>reason</code> documentado, pra não parecer esquecimento numa auditoria futura). Nenhuma function atual se encaixa aqui.</>,
                          <><code className={codeBadge}>custom</code> — válvula de escape pra um mecanismo genuinamente único, sem padrão compartilhado com nenhuma outra function (exige <code className={codeBadge}>reason</code>).</>
                        ]
                      },
                      {
                        q: "O que muda entre enforcement: 'wrapper' e 'manual'?",
                        a: "O subcampo enforcement diz QUEM checa, não SE existe checagem:",
                        bullets: [
                          <><code className={codeBadge}>wrapper</code> — o <code className={codeBadge}>withSecurity</code> já bloqueia sozinho, de forma centralizada, ANTES do handler rodar. Padrão preferido pra qualquer function nova.</>,
                          <><code className={codeBadge}>manual</code> — <code className={codeBadge}>server.ts</code> não faz nada por essa rota; a checagem inteira vive dentro do próprio <code className={codeBadge}>index.ts</code> do handler. Marca visivelmente as rotas candidatas a uma futura centralização.</>
                        ]
                      },
                      {
                        q: "Como funciona o esquema HMAC (Vault + pg_cron) sem o segredo nunca trafegar em texto?",
                        a: "Usado quando o chamador é um job do pg_cron — o comando SQL do job fica visível para qualquer um com acesso ao SQL Editor, então o segredo não pode viver ali:",
                        bullets: [
                          <>O valor do segredo fica só no <b>Supabase Vault</b> (<code className={codeBadge}>vault.create_secret</code>/<code className={codeBadge}>vault.decrypted_secrets</code>), nunca em texto puro no comando do cron.</>,
                          <>A cada disparo, o próprio SQL do job calcula uma assinatura <b>HMAC-SHA256</b> (via <code className={codeBadge}>pgcrypto</code>) sobre um timestamp, usando o segredo do Vault como chave — só o timestamp e a assinatura trafegam, nos headers <code className={codeBadge}>x-timestamp</code>/<code className={codeBadge}>x-signature</code>.</>,
                          <>A function valida essa assinatura centralmente em <code className={codeBadge}>_shared/hmac.ts</code> (<code className={codeBadge}>verifyHmacSignature</code>), chamado pelo wrapper — o handler em si não tem nenhum código de autenticação próprio.</>,
                          <>Exemplos reais: <code className={codeBadge}>notification-dispatcher</code> e <code className={codeBadge}>log-access</code> (reaproveitado como worker de geo do <code className={codeBadge}>login_history</code> — o nome do slug ficou desatualizado de propósito, pra reaproveitar um deploy já existente).</>
                        ]
                      }
                    ]}
                  />
                </CardContent>
              </Card>

              <Card className="border-neutral-200 shadow-sm rounded-none">
                <CardHeader className="bg-white rounded-none border-b border-neutral-200 pb-5">
                  <CardTitle className="text-lg text-neutral-800">Inventário de Segredos</CardTitle>
                  <CardDescription className="text-neutral-500">O que cada segredo é, onde é usado e como recriar/rotacionar. Passo a passo completo (comandos prontos) em <code className={codeBadge}>supabase/functions/_shared/SECRETS.md</code>.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-neutral-50">
                  <HelpAccordion
                    items={[
                      {
                        q: "Quais variáveis são auto-gerenciadas pela própria Supabase?",
                        a: "Injetadas automaticamente em toda Edge Function — nunca definidas via 'secrets set':",
                        bullets: [
                          <><code className={codeBadge}>SUPABASE_URL</code> — URL pública da API do projeto.</>,
                          <><code className={codeBadge}>SUPABASE_ANON_KEY</code> — chave pública da role <code className={codeBadge}>anon</code>, usada pra validar tokens de usuário final.</>,
                          <><code className={codeBadge}>SUPABASE_SERVICE_ROLE_KEY</code> — chave privilegiada que bypassa RLS. <b>Segredo mais crítico do projeto</b> — vazamento equivale a acesso total ao banco via PostgREST. Rotaciona via Painel → API → "Roll", exige redeploy de praticamente todas as functions.</>,
                          <><code className={codeBadge}>SUPABASE_DB_URL</code> — Direct Connection (usuário <code className={codeBadge}>postgres</code>). Fora de uso ativo desde a migração de <code className={codeBadge}>_shared/db.ts</code> pra <code className={codeBadge}>DB_POOLER_URL</code> (ver abaixo).</>
                        ]
                      },
                      {
                        q: "Como funciona o DB_POOLER_URL (conexão via Transaction Pooler)?",
                        a: <>Usado por <code className={codeBadge}>_shared/db.ts</code> (client <code className={codeBadge}>postgres.js</code>) pras escritas transacionais que o PostgREST não faz bem — <code className={codeBadge}>persist-data.ts</code>, <code className={codeBadge}>simulation-handler.ts</code>, <code className={codeBadge}>hydrate-data.ts</code>, <code className={codeBadge}>fandi-service.ts</code>.</>,
                        bullets: [
                          <>Conecta como um role DEDICADO — <code className={codeBadge}>db_edge_worker</code> — em vez do usuário <code className={codeBadge}>postgres</code>. Um bug de cache de credencial do Supavisor (Transaction Pooler) causou incidente com o usuário <code className={codeBadge}>postgres</code>; um role novo, nunca visto pelo Supavisor, contorna isso.</>,
                          <><code className={codeBadge}>BYPASSRLS</code> é necessário (confirmado, não just-in-case): as tabelas que esse role usa têm RLS escopado pra role <code className={codeBadge}>authenticated</code> via JWT, contexto que uma conexão Postgres crua nunca tem.</>,
                          <>Grants escopados só nas ~13 tabelas realmente usadas (<code className={codeBadge}>SELECT, INSERT, UPDATE</code> — nunca <code className={codeBadge}>ALL PRIVILEGES</code>/<code className={codeBadge}>ALL TABLES</code>).</>,
                          <>Setup completo (CREATE ROLE, GRANTs, secrets set) documentado no topo de <code className={codeBadge}>_shared/db.ts</code>.</>
                        ]
                      },
                      {
                        q: "O que o JWT_SECRET assina, e por que rotacionar é perigoso?",
                        a: <>Segredo simétrico usado por <code className={codeBadge}>_shared/jwt.ts</code>/<code className={codeBadge}>s2s.ts</code> pra assinar os JWTs de sessão que o PRÓPRIO sistema emite (sbXPay/Financial Hub) — não confundir com as chaves da Supabase.</>,
                        bullets: [
                          <>⚠️ Rotacionar invalida INSTANTANEAMENTE toda sessão ativa de todo usuário — todo mundo é deslogado ao mesmo tempo. Não é rotação de rotina, só em caso de suspeita concreta de vazamento.</>
                        ]
                      },
                      {
                        q: "O que são NOTIFICATION_GATEWAY_SECRET, WEBHOOK_MASTER_SECRET e FANDI_API_KEY?",
                        a: "Três segredos de propósito bem específico:",
                        bullets: [
                          <><code className={codeBadge}>NOTIFICATION_GATEWAY_SECRET</code> — segredo estático (sem HMAC) comparado em tempo constante (<code className={codeBadge}>safeCompare</code>); <code className={codeBadge}>notification-dispatcher</code> chama <code className={codeBadge}>notification-gateway</code> com esse mesmo valor.</>,
                          <><code className={codeBadge}>WEBHOOK_MASTER_SECRET</code> — mesmo valor nos DOIS lados do fluxo Fandi: <code className={codeBadge}>financial-gateway/fandi-service.ts</code> assina a URL de callback enviada à Fandi, e <code className={codeBadge}>financial-gateway-webhook</code> verifica a assinatura na volta. Assinatura vem no PATH da URL (não em headers), por isso <code className={codeBadge}>location: 'path'</code> + <code className={codeBadge}>enforcement: 'manual'</code> no registry.</>,
                          <><code className={codeBadge}>FANDI_API_KEY</code> — credencial fornecida pelo parceiro Fandi (não é gerável localmente).</>
                        ]
                      },
                      {
                        q: "O que não é segredo, mas vive no mesmo lugar (Secrets da function)?",
                        a: "Configuração não-sensível, só documentada aqui pra não confundir com credenciais reais:",
                        bullets: [
                          <><code className={codeBadge}>FRONTEND_URL</code> — fallback de CORS/redirect do <code className={codeBadge}>financial-gateway-gate</code>.</>,
                          <><code className={codeBadge}>DEBUG_MODE</code> — liga/desliga logs verbosos (<code className={codeBadge}>_shared/logger.ts</code>).</>,
                          <><code className={codeBadge}>GOOGLE_WORKSPACE_SMTP_USER</code>/<code className={codeBadge}>GOOGLE_WORKSPACE_APP_PASSWORD</code> — credenciais SMTP (senha de app do Google) usadas por <code className={codeBadge}>notification-gateway</code> pra enviar e-mail.</>
                        ]
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ABA: BFF & ORCHESTRATOR */}
            <TabsContent value="orchestrator" className="space-y-6 animate-in fade-in duration-300">
              <Card className="border-neutral-200 shadow-sm rounded-none">
                <CardHeader className="bg-white rounded-none border-b border-neutral-200 pb-5">
                  <CardTitle className="text-lg text-neutral-800">Backend-for-Frontend (BFF) e Orchestrator</CardTitle>
                  <CardDescription className="text-neutral-500">Como o motor de orquestração distribui regras e fluxos dinâmicos.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-neutral-50">
                  <HelpAccordion 
                    items={[
                      {
                        q: "Qual é a função do motor Orchestrator no projeto?",
                        a: "Desacopla as regras de navegação e apresentação do código estático do front-end:",
                        bullets: [
                          <>A Edge Function <code className={codeBadge}>orchestrator</code> lê o <code className={codeBadge}>user_id</code> diretamente do token stateless validado em memória (<code className={codeBadge}>auth.user_id</code>) via header <code className={codeBadge}>x-session-token</code>.</>,
                          "Entrega payloads JSON estruturados com configurações de rotas, painéis de propostas, FAQs e termos LGPD."
                        ]
                      },
                      {
                        q: "Como o ecossistema processa webhooks de parceiros externos, e o que garante que ninguém forje um callback? (pipeline completo de segurança)",
                        a: <>A Edge Function <code className={codeBadge}>financial-gateway-webhook</code> é um roteador puro (<code className={codeBadge}>index.ts</code>) que só lê o nome do parceiro na URL (<code className={codeBadge}>/financial-gateway-webhook/fandi/...</code>) e delega todo o trabalho pesado pra um módulo especialista — hoje só existe <code className={codeBadge}>fandi-service.ts</code> (parceiro MeResolve/Fandi). Um parceiro não mapeado recebe <code className={codeBadge}>404</code> na hora. Dentro do especialista, a requisição passa por 4 fases sequenciais — se qualquer uma falhar, as seguintes nem rodam:</>,
                        bullets: [
                          <><b>Fase 1 — Assinatura HMAC no PATH da URL (não em header):</b> a Fandi chama uma URL no formato <code className={codeBadge}>.../fandi/{"{simulationId}"}/{"{simulationUpdateId}"}/{"{timestamp}"}/{"{signature}"}</code>. A function remonta a string <code className={codeBadge}>{"`${simulationId}.${simulationUpdateId}.${timestamp}`"}</code> e recalcula a assinatura esperada com <code className={codeBadge}>WEBHOOK_MASTER_SECRET</code> (mesmo segredo usado do outro lado, em <code className={codeBadge}>financial-gateway/fandi-service.ts</code>, quando a URL de callback foi originalmente montada e assinada). Essa é a razão de o <code className={codeBadge}>registry.ts</code> marcar essa rota como <code className={codeBadge}>location: 'path'</code> + <code className={codeBadge}>enforcement: 'manual'</code> — não dá pra validar isso centralmente no wrapper porque o "segredo" está espalhado em pedaços da própria URL, não num header padronizado.</>,
                          <><b>Fase 1b — Comparação em tempo constante (`safeCompare`):</b> em vez de <code className={codeBadge}>a === b</code> (que vaza tempo de execução byte a byte e permitiria um ataque de timing pra descobrir a assinatura certa aos poucos), a comparação usa XOR bit a bit acumulado (<code className={codeBadge}>result |= a[i] ^ b[i]</code>) percorrendo TODOS os bytes sempre, sem sair mais cedo mesmo se já achou uma diferença.</>,
                          <><b>Fase 1c — Janela de validade (TTL) contra replay:</b> o <code className={codeBadge}>timestamp</code> embutido na URL precisa estar a menos de <code className={codeBadge}>MAX_AGE_MS = 5 minutos</code> do agora — uma URL de callback antiga capturada e reenviada mais tarde (replay attack) é rejeitada mesmo com assinatura matematicamente correta.</>,
                          <><b>Fase 2 — Barreira Cross-Tenant:</b> antes de aceitar qualquer dado do payload, a function busca a simulação pelo <code className={codeBadge}>simulationId</code> (via client <code className={codeBadge}>service_role</code>, que ignora RLS de propósito aqui) e confere se <code className={codeBadge}>partner_id === MERESOLVE_PARTNER_ID (2)</code>. Isso impede que um webhook — mesmo assinado corretamente para UM <code className={codeBadge}>simulationId</code> — seja usado pra adulterar uma simulação que pertence a outro parceiro.</>,
                          <><b>Fase 2b — Idempotência (proteção contra duplicidade):</b> a mesma consulta já traz os <code className={codeBadge}>simulation_updates</code> existentes; se o <code className={codeBadge}>simulationUpdateId</code> recebido já foi processado antes, a function retorna sucesso silencioso SEM tocar o banco de novo — essencial porque provedores de webhook costumam reenviar o mesmo evento (timeout, retry automático) e cada consulta financeira/atualização de status não pode ser aplicada duas vezes.</>,
                          <><b>Fase 3/4 — Gravação atômica (ACID):</b> só depois de passar por tudo acima, o payload é interpretado (dados de simulação/veículo, status Bacen) e gravado via <code className={codeBadge}>sql.begin(...)</code> (transação real, não duas queries soltas) — insere a linha de auditoria em <code className={codeBadge}>simulation_updates</code> E atualiza o status mestre em <code className={codeBadge}>simulations</code> juntos; se qualquer uma das duas falhar, o Postgres desfaz (<code className={codeBadge}>ROLLBACK</code>) as duas, nunca deixando o par updates/simulations dessincronizado.</>
                        ]
                      }
                    ]}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            {/* ABA: POSTGRESQL & RLS */}
            <TabsContent value="database" className="space-y-6 animate-in duration-300">
              <Card className="border-neutral-200 shadow-sm rounded-none">
                <CardHeader className="bg-white rounded-none border-b border-neutral-200 pb-5">
                  <CardTitle className="text-lg text-neutral-800">Modelo Relacional, RLS e Triggers (PostgreSQL)</CardTitle>
                  <CardDescription className="text-neutral-500">Segurança de dados e estruturação de tabelas baseada nos scripts SQL de migração.</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-neutral-50">
                  <HelpAccordion 
                    items={[
                      {
                        q: "Como o Row Level Security (RLS) protege as tabelas nas migrações?",
                        a: <>Todas as tabelas de negócio do projeto rodam com <code className={codeBadge}>ENABLE ROW LEVEL SECURITY</code> ativo — ou seja, por padrão NENHUMA linha é visível/gravável, e cada tabela precisa de políticas explícitas liberando acesso. O padrão que se repete nas ~13 tabelas mais sensíveis (confirmado via consulta ao vivo ao <code className={codeBadge}>pg_policies</code>) é sempre o mesmo conjunto de 4 políticas:</>,
                        bullets: [
                          <><code className={codeBadge}>Leitura_Staff</code> — permite <code className={codeBadge}>SELECT</code> pra role <code className={codeBadge}>authenticated</code>, mas só se <code className={codeBadge}>check_user_role(ARRAY[...])</code> confirmar que o JWT da sessão pertence a um cargo autorizado (o <code className={codeBadge}>role</code> vindo de <code className={codeBadge}>backoffice_users</code>, o mesmo que <code className={codeBadge}>get_backoffice_session()</code> devolve).</>,
                          <><code className={codeBadge}>Escrita_Admin_Mgr_Ins</code> e <code className={codeBadge}>Escrita_Admin_Mgr_Upd</code> — liberam <code className={codeBadge}>INSERT</code>/<code className={codeBadge}>UPDATE</code> só pra quem tem cargo <code className={codeBadge}>admin</code> ou <code className={codeBadge}>manager</code>, nunca <code className={codeBadge}>viewer</code>.</>,
                          <><code className={codeBadge}>Delete_Admin</code> — <code className={codeBadge}>DELETE</code> restrito estritamente ao cargo <code className={codeBadge}>admin</code>.</>,
                          <>Essas políticas são todas escopadas pra role <code className={codeBadge}>authenticated</code> — ou seja, dependem de haver um JWT de sessão no contexto da requisição. É exatamente por isso que o role <code className={codeBadge}>db_edge_worker</code> (usado por <code className={codeBadge}>_shared/db.ts</code> pra escrever direto via Transaction Pooler) PRECISA do atributo <code className={codeBadge}>BYPASSRLS</code>: uma conexão Postgres crua via <code className={codeBadge}>postgres.js</code> nunca tem esse contexto de JWT, então sem <code className={codeBadge}>BYPASSRLS</code> toda query dele seria bloqueada antes de chegar em qualquer <code className={codeBadge}>GRANT</code> (detalhes completos na aba "Segredos & Blindagem").</>,
                          <><i>Nota histórica:</i> a tabela <code className={codeBadge}>session_tokens</code>, que existia antes da migração pra sessão stateless via JWT, foi removida do banco — o fluxo completo de como a autenticação funciona hoje (sem nenhuma tabela de sessão) está detalhado na aba "Serviços & Auth Stateless".</>
                        ]
                      },
                      {
                        q: "Como a modelagem separa Topo de Funil (Visits) da Esteira de Crédito (Simulations)?",
                        a: "O banco divide o ciclo de vida do cliente em domínios normalizados:",
                        bullets: [
                          <><b>Topo de Funil:</b> As tabelas <code className={codeBadge}>visits</code>, <code className={codeBadge}>visit_updates</code>, <code className={codeBadge}>visit_entities</code> e <code className={codeBadge}>visit_consents</code> registram UTMs, IPs e interações prévias.</>,
                          <><b>Esteira de Crédito:</b> A tabela mestre <code className={codeBadge}>simulations</code> gerencia propostas de financiamento, ligando-se a tabelas satélites de auditoria e garantias.</>
                        ]
                      }
                    ]}
                  />
                </CardContent>
              </Card>

              <Card className="border-neutral-200 shadow-sm rounded-none">
                <CardHeader className="bg-white rounded-none border-b border-neutral-200 pb-5">
                  <CardTitle className="text-lg text-neutral-800">RPC (Stored Procedures) & CRON Jobs</CardTitle>
                  <CardDescription className="text-neutral-500">As duas peças que rodam DENTRO do Postgres — chamadas pelo front-end (RPC) ou pelo próprio banco, sozinho, num horário (pg_cron).</CardDescription>
                </CardHeader>
                <CardContent className="pt-6 bg-neutral-50">
                  <HelpAccordion
                    items={[
                      {
                        q: "O que é uma RPC nesse projeto, e por que preferimos isso a uma Edge Function?",
                        a: "RPC = uma função PL/pgSQL rodando dentro do próprio Postgres, chamada pelo front-end via `supabase.rpc('nome', {...})` (SDK) ou `POST /rest/v1/rpc/nome` (fetch cru via PostgREST). As duas RPCs do projeto são `SECURITY DEFINER`:",
                        bullets: [
                          <>Elimina um hop de rede inteiro (Front-end → Edge Function → Postgres vira Front-end → Postgres) — mais rápido e com uma peça a menos pra quebrar.</>,
                          <>Herda automaticamente o contexto de autenticação da requisição (<code className={codeBadge}>auth.jwt()</code>/<code className={codeBadge}>auth.email()</code>) — não precisa repassar token manualmente como faria uma Edge Function chamando o banco.</>,
                          <>Faz sentido quando a lógica é "ler/validar/gravar uma coisa simples no banco" — quando entra HMAC, chamada a outro serviço, ou processamento em lote, aí sim vira Edge Function (ver aba anterior).</>
                        ]
                      },
                      {
                        q: "O que a RPC `get_backoffice_session()` faz, exatamente?",
                        a: "Porta de entrada única para autorizar um funcionário no Backoffice (chamada por `AuthContext.tsx` — ver aba 'Serviços & Auth Stateless'):",
                        bullets: [
                          <>Lê o e-mail de <code className={codeBadge}>auth.jwt() {"->>"} 'email'</code> — nunca de um parâmetro vindo do cliente, então não dá pra "pedir a sessão de outra pessoa" alterando o payload.</>,
                          <>Busca em <code className={codeBadge}>backoffice_users</code> por <code className={codeBadge}>LOWER(email)</code> e retorna <code className={codeBadge}>{"{ error: 'user_does_not_exist' | 'user_inactive' }"}</code> ou o perfil completo (<code className={codeBadge}>role</code>, <code className={codeBadge}>allowed_partners</code>, <code className={codeBadge}>allowed_products</code>).</>,
                          <>É a ÚNICA via pela qual o front-end enxerga qualquer coluna dessa tabela — nenhum <code className={codeBadge}>select</code> direto é feito nela pelo cliente.</>
                        ]
                      },
                      {
                        q: "O que a RPC `log_access_event(...)` faz, e por que ela substituiu uma Edge Function?",
                        a: <>Grava uma linha em <code className={codeBadge}>login_history</code>. Migração <code className={codeBadge}>20260917120000_create_log_access_event_rpc.sql</code> — reproduz 100% da lógica que antes vivia na Edge Function <code className={codeBadge}>log-access</code> (hoje reaproveitada para outro papel, ver aba "Segredos & Blindagem"):</>,
                        bullets: [
                          <>Assinatura: <code className={codeBadge}>log_access_event(p_event, p_success, p_origin_page, p_origin_function, p_failure_reason)</code> — identidade sempre via <code className={codeBadge}>auth.email()</code>, nunca um parâmetro de e-mail.</>,
                          <>Allowlist de eventos (<code className={codeBadge}>login</code>/<code className={codeBadge}>refresh</code>/<code className={codeBadge}>logout</code>/<code className={codeBadge}>failed_attempt</code>/<code className={codeBadge}>blocked</code>) e de páginas de origem — valor fora da lista é rejeitado, não gravado "do jeito que veio".</>,
                          <>Rate limit e checagem de staff embutidos na própria função, mais truncamento de campos de texto e parsing de device/OS (via <code className={codeBadge}>ilike</code> no user-agent) antes de montar o <code className={codeBadge}>origin_details</code> final.</>,
                          <><code className={codeBadge}>GRANT EXECUTE</code> concedido só a <code className={codeBadge}>authenticated</code> — <code className={codeBadge}>anon</code> não pode chamar, e não precisou de nenhum <code className={codeBadge}>REVOKE</code> adicional porque essa role nunca teve grant direto nas tabelas.</>
                        ]
                      },
                      {
                        q: "O que é o job de CRON `resolver-geo-login-history`, e o que ele resolve?",
                        a: "Um job do `pg_cron` (agendador nativo do Postgres) que roda a cada 5 minutos, sozinho, sem nenhuma ação do usuário:",
                        bullets: [
                          <>Motivo de existir: a RPC <code className={codeBadge}>log_access_event</code> grava o acesso na hora, mas a resolução de geolocalização rica (país/estado/cidade a partir do IP) é mais lenta e depende de um serviço externo — não faz sentido bloquear o login esperando isso. O cron resolve isso de forma assíncrona, em lote.</>,
                          <>A cada disparo, chama a Edge Function <code className={codeBadge}>log-access</code> (reaproveitada — ver aba "Segredos & Blindagem") via HTTP, autenticando com HMAC (segredo só no <b>Supabase Vault</b>, nunca em texto no comando do cron).</>,
                          <>A function busca até <code className={codeBadge}>BATCH_LIMIT = 30</code> linhas de <code className={codeBadge}>login_history</code> onde <code className={codeBadge}>city = 'N/A'</code>, resolve cada uma via <code className={codeBadge}>resolveGeoFallback</code> (<code className={codeBadge}>_shared/infrastructure.ts</code>) com até <code className={codeBadge}>CONCURRENCY = 5</code> chamadas em paralelo, e faz <code className={codeBadge}>UPDATE</code> nas linhas resolvidas.</>,
                          <>Pra inspecionar: <code className={codeBadge}>select * from cron.job;</code> (definição/agendamento) e <code className={codeBadge}>select * from cron.job_run_details order by start_time desc;</code> (histórico de execuções, sucesso/erro).</>,
                          <>Setup completo (criar o secret no Vault, agendar o job) está em <code className={codeBadge}>login_geo_resolver_cron_setup.sql</code>, na raiz do projeto.</>
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