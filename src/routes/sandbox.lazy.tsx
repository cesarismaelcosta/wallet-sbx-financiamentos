/**
 * @fileoverview Sandbox de Simulação de Jornadas (Topo de Funil / sbX)
 * @module Sandbox/Index
 * @route /sandbox
 * 
 * ============================================================================
 * [ARQUITETURA, CLEAN ARCHITECTURE & DESIGN SYSTEM]
 * ============================================================================
 * Painel de controle, debug e testes integrado com a API de Ofertas, Sessão 
 * corporativa, Painel Lateral de Consulta de Oferta e Painel Lateral de Rota 
 * (Orchestrator Configs). Atua como o hub centralizado de inspeção de estado, 
 * simulação de fluxos de topo de funil e roteamento isolado do ecossistema.
 * 
 * [RESPONSABILIDADES DO MÓDULO]:
 * 1. Autenticação Dual: Realiza OAuth2 direto na API Superbid (sbX) e executa 
 *    o protocolo de troca (Exchange) para gerar o token interno seguro no Supabase.
 * 2. Hidratação de Prateleira: Coleta dados dinâmicos de lotes, ofertas, veículos 
 *    e imóveis para validação visual em tempo real.
 * 3. Gateway Dispatch: Executa disparos controlados para a Edge Function de 
 *    borda (`financial-gateway-gate`), garantindo tratamento estrito de sessões.
 * 4. Inspetores de Rota & Oferta: Abre drawers laterais para auditoria profunda 
 *    de payloads JSON, FAQs, regras de negócio e termos LGPD.
 * 
 * @author César Ismael Pereira da Costa
 * ============================================================================
 */

import { createLazyFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useMemo, ReactNode } from "react";
import { 
  Play, 
  ShieldCheck, 
  ExternalLink, 
  Key, 
  UserCheck,
  Search,
  RefreshCw,
  Eye, 
  EyeOff, 
  Loader2,
  LogOut,
  LogIn,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Home,
  AppWindow,
  X,
  FileText,
  HelpCircle,
  Layers,
  Info
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { fetchOfferDetails } from "@/services/offer";
import { fetchMyProfile, type BFFUserProfile } from "@/services/user";
import { getDefaultSbxEnvironment } from "@/services/session";
import { WalletLogo } from "@/components/brand/WalletLogo";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { callOrchestratorConfigs } from "@/features/financial-hub/core/services/gateway";
import { ICON_MAP } from "@/features/financial-hub/components/shared/icons-map";

/**
 * =========================================================================
 * [HELPERS]: Validação e Formatação de Documentos (CPF / CNPJ)
 * =========================================================================
 * @description Utilitários de sanitização e formatação visual para os inputs
 * de login do Sandbox, garantindo consistência antes do disparo para a API.
 */
const isCPF = (str: string) => /^\d{11}$/.test(str.replace(/\D/g, ''));
const isCNPJ = (str: string) => /^\d{14}$/.test(str.replace(/\D/g, ''));
const formatCPF = (val: string) => val.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})/, '$1-$2').slice(0, 14);
const formatCNPJ = (val: string) => val.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})/, '$1-$2').slice(0, 18);

// Mapeamento centralizado de URLs base da API da Superbid por ambiente de execução
const ENV_URLS = {
  production: "https://api.s4bdigital.net",
  staging: "https://stgapi.s4bdigital.net"
};

/**
 * =========================================================================
 * [SUB-COMPONENTES DA ROTA]: Renderizadores de UI do Orchestrator
 * =========================================================================
 */

/**
 * @function FAQSection
 * @description Renderiza blocos expansíveis (Accordion) organizados em duas colunas 
 * baseados no array `page_faqs` recuperado dinamicamente das configurações da rota.
 * 
 * @param {Object} props - Propriedades do componente.
 * @param {Array<any>} props.items - Coleção de perguntas e respostas estruturadas.
 * @returns {JSX.Element|null} Bloco visual de FAQs ou null se vazio.
 */
function FAQSection({ items }: { items?: any[] }) {
  if (!items || items.length === 0) return null;
  const sortedItems = [...items].sort((a, b) => (a.position || 0) - (b.position || 0));
  const half = Math.ceil(sortedItems.length / 2);

  return (
    <section className="py-4 overflow-hidden bg-white">
      <div className="max-w-full">
        <h3 className="text-sm font-bold mb-4 text-foreground/90 border-b pb-2">
          Dúvidas Frequentes da Rota
        </h3>
        <div className="grid md:grid-cols-2 gap-x-4 gap-y-3">
          <div className="space-y-3">
            <Accordion type="single" collapsible className="w-full">
              {sortedItems.slice(0, half).map((item, i) => (
                <AccordionItem 
                  key={i} 
                  value={`item-col1-${i}`} 
                  className="border border-border rounded-xl px-3 bg-white/60 shadow-sm transition-all focus-within:border-[var(--brand-primary)] mb-2"
                >
                  <AccordionTrigger className="text-left font-semibold text-xs text-foreground/90 hover:text-[var(--brand-primary)] transition-colors py-2.5">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-[11px] leading-relaxed pb-2">
                    <div className="mb-2">{item.answer}</div>
                    {item.bullets && item.bullets.length > 0 && (
                      <div className="space-y-1 mt-1">
                        {item.bullets.map((bullet: string, idx: number) => (
                          <div key={idx} className="flex gap-1.5">
                            <span>•</span>
                            <span>{bullet}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
          <div className="space-y-3">
            <Accordion type="single" collapsible className="w-full">
              {sortedItems.slice(half).map((item, i) => (
                <AccordionItem 
                  key={i} 
                  value={`item-col2-${i}`} 
                  className="border border-border rounded-xl px-3 bg-white/60 shadow-sm transition-all focus-within:border-[var(--brand-primary)] mb-2"
                >
                  <AccordionTrigger className="text-left font-semibold text-xs text-foreground/90 hover:text-[var(--brand-primary)] transition-colors py-2.5">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground text-[11px] leading-relaxed pb-2">
                    <div className="mb-2">{item.answer}</div>
                    {item.bullets && item.bullets.length > 0 && (
                      <div className="space-y-1 mt-1">
                        {item.bullets.map((bullet: string, idx: number) => (
                          <div key={idx} className="flex gap-1.5">
                            <span>•</span>
                            <span>{bullet}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * @function FooterRender
 * @description Processa templates de string e substitui dinamicamente 
 * marcadores de hiperlink `{texto}` baseados no array de links da API.
 * 
 * @param {Object} props - Propriedades do componente.
 * @param {Object} props.config - Objeto contendo o template de texto e os links associados.
 * @returns {JSX.Element|null} Rodapé legal renderizado com links formatados.
 */
function FooterRender({ config }: { config?: any }) {
  if (!config?.template_text) return null;
  const { template_text, links = [] } = config;

  const renderText = () => {
    const parts = template_text.split(/\{([^}]+)\}/g);
    return parts.map((part: string, index: number) => {
      const linkMatch = links.find((l: any) => l.text === part);
      if (linkMatch) {
        return (
          <a
            key={index}
            href={linkMatch.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-medium text-slate-500 hover:text-slate-800 transition-colors"
          >
            {part}
          </a>
        );
      }
      return <span key={index}>{part}</span>;
    });
  };

  return (
    <div className="space-y-2">
      <h4 className="text-[11px] font-bold uppercase text-purple-600 flex items-center gap-1.5">
        <FileText size={14} /> Rodapé Legal (Footer)
      </h4>
      <footer className="py-4 px-3 text-center text-[10px] text-muted-foreground bg-slate-50 border rounded-xl">
        <p className="leading-relaxed text-justify sm:text-center text-slate-400">
          {renderText()}
        </p>
      </footer>
    </div>
  );
}

/**
 * @function OfferPanelRender
 * @description Componente crítico que desenha a proposta de valor principal da rota.
 * Mapeia ícones dinamicamente utilizando a estrutura ICON_MAP do Core sbX.
 * 
 * @param {Object} props - Propriedades do componente.
 * @param {Object} props.config - Configurações visuais contendo headline, descrição, benefícios e tema.
 * @returns {JSX.Element|null} Painel de proposta estilizado ou null.
 */
function OfferPanelRender({ config }: { config: any }) {
  if (!config?.offer_panel?.headline?.parts || !config?.offer_panel?.description?.parts) return null;
  const { offer_panel, theme } = config;
  const brandColor = theme?.primary_color || "var(--brand-primary)";

  const getTextStyle = (type: string) => {
    switch (type) {
      case "highlight": return "text-[var(--brand-primary)]";
      case "bold": return "font-bold text-foreground";
      default: return "text-foreground";
    }
  };

  return (
    <div className="space-y-3" style={{ '--brand-primary': brandColor } as React.CSSProperties}>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold leading-tight text-foreground sm:text-xl">
          {offer_panel.headline.parts.map((part: any, i: number) => (
            <span key={i} className={getTextStyle(part.type)}>{part.text}</span>
          ))}
        </h2>
        <p className="text-xs text-muted-foreground">
          {offer_panel.description.parts.map((part: any, i: number) => (
            <span key={i} className={getTextStyle(part.type)}>{part.text}</span>
          ))}
        </p>
      </div>

      {offer_panel.benefits && Array.isArray(offer_panel.benefits) && (
        <ul className="grid grid-cols-1 gap-2">
          {offer_panel.benefits.map((b: any, i: number) => {
            const IconComponent = ICON_MAP[b.icon] || ICON_MAP[b.icon?.toLowerCase()] || CheckCircle2;
            
            return (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
                  <IconComponent className="h-3.5 w-3.5" />
                </span>
                <div>
                  <p className="font-medium text-foreground text-xs">{b.title}</p>
                  <p className="text-[10px] text-muted-foreground">{b.description}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {offer_panel.partner?.name && (
        <div className="rounded-xl border border-border bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
          {offer_panel.partner.label}{" "}
          <strong className="text-foreground">{offer_panel.partner.name}</strong>.
        </div>
      )}
    </div>
  );
}

/**
 * @function DynamicConsentsStatic
 * @description Renderiza os termos de consentimento e LGPD capturados no payload,
 * processando chaves marcadas com chaves `{}` e aplicando links web ou tooltips.
 * 
 * @param {Object} props - Propriedades do componente.
 * @param {Array<any>} props.configs - Array de configurações de consentimento.
 * @returns {JSX.Element|null} Bloco estático de consentimentos LGPD.
 */
function DynamicConsentsStatic({ configs }: { configs: any[] }) {
  if (!configs || configs.length === 0) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex flex-col rounded-lg border border-border bg-muted/10 p-3 space-y-2.5">
        <h4 className="text-[11px] font-bold text-slate-700 uppercase">Termos e Consentimentos da Rota:</h4>
        {[...configs]
          .sort((a, b) => a.position - b.position)
          .map((opt) => (
            <div key={opt.id} className="flex gap-2 items-start py-0.5 text-xs">
              <div className="flex items-center mt-0.5">
                <Checkbox disabled checked={false} className="h-4 w-4 shrink-0 rounded-[4px] border-slate-400" />
              </div>
              <label className="text-[11px] text-muted-foreground leading-snug flex-1">
                {opt.template_text ? (
                  opt.template_text.split(/(\{.*?\})/g).map((part: string, i: number) => {
                    if (part.startsWith("{") && part.endsWith("}")) {
                      const cleanText = part.replace(/[{}]/g, "");
                      const linkConfig = opt.links?.find((l: any) => l.text === cleanText);
                      if (!linkConfig) return <span key={i} className="font-bold text-foreground">{cleanText}</span>;

                      if (linkConfig.type === "web") {
                        return (
                          <a
                            key={i}
                            href={linkConfig.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline font-bold inline mx-0.5"
                            style={{ color: "var(--brand-primary)" }}
                          >
                            {cleanText}
                          </a>
                        );
                      }

                      if (linkConfig.type === "tooltip") {
                        return (
                          <span key={i} className="underline font-bold inline mx-0.5 text-[var(--brand-primary)]">
                            {cleanText}
                          </span>
                        );
                      }
                    }
                    return <span key={i}>{part}</span>;
                  })
                ) : null}
              </label>
            </div>
          ))}
      </div>
    </TooltipProvider>
  );
}

/**
 * =========================================================================
 * STEP 1 & 2: OAUTH2 & EXCHANGE (Motor de Autenticação Sandbox)
 * =========================================================================
 */

/**
 * @function autenticarAccountsSBX
 * @description Executa a requisição direta de autenticação OAuth2 na API externa da Superbid (sbX),
 * validando credenciais de usuário (PF/PJ) e resgatando o token de acesso bruto.
 * 
 * @param {string} username - Identificador de login (e-mail, CPF ou CNPJ).
 * @param {string} password - Senha de acesso do usuário.
 * @param {"staging"|"production"} environment - Ambiente de infraestrutura de destino.
 * @returns {Promise<{success: boolean, access_token: string, userId: string}>} Objeto com dados de acesso.
 */
const autenticarAccountsSBX = async (username: string, password: string, environment: "staging" | "production") => {
  const sbxBaseUrl = ENV_URLS[environment];
  const details = new URLSearchParams();
  details.append("username", username.trim());
  details.append("password", password.trim());
  details.append("grant_type", "password");
  details.append("client_id", "dzqC3VodSoXukD45BQKg3NQU6-faststore");
  details.append("portalid", "2");

  const sbxLoginResponse = await fetch(`${sbxBaseUrl}/account/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: details.toString()
  });

  const rawResponse = await sbxLoginResponse.text();
  if (!sbxLoginResponse.ok) {
    throw new Error(`Credenciais inválidas ou erro na API: ${sbxLoginResponse.status}`);
  }
  const sbxData = JSON.parse(rawResponse);
  return { success: true, access_token: sbxData.access_token, userId: sbxData.userId };
};

/**
 * @function trocarTokenNaEdgeFunction
 * @description Envia o token bruto da sbX para a Edge Function interna (`sbx-auth-exchange`),
 * convertendo-o em uma sessão segura gerenciada pelo Supabase.
 * 
 * @param {string} sbxAccessToken - Token de acesso bruto obtido na sbX.
 * @param {"staging"|"production"} environment - Ambiente ativo.
 * @returns {Promise<any>} Dados de resposta contendo o `session_token`.
 */
const trocarTokenNaEdgeFunction = async (sbxAccessToken: string, environment: "staging" | "production") => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/sbx-auth-exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${supabaseAnonKey}` },
    body: JSON.stringify({ sbx_access_token: sbxAccessToken, environment: environment })
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || `Erro HTTP no exchange: ${res.status}`);
  }
  return data;
};

// ============================================================================
// [REGISTRO DA ROTA TANSTACK ROUTER]
// ============================================================================
export const Route = createLazyFileRoute("/sandbox")({
  component: SandboxPage,
});

/**
 * =========================================================================
 * COMPONENTE PRINCIPAL: SandboxPage
 * =========================================================================
 * @description Controla a interface interativa do Sandbox, gerenciando formulários
 * de login, prateleira de ofertas, inspetores de rotas e abertura de drawers.
 */
function SandboxPage() {
  const navigate = useNavigate();
  const { sessionToken, logout, setSession } = useFinancialAuth();

  // --- [STATE MANAGEMENT] ---
  const [isScrolled, setIsScrolled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // Estados de Contexto e Prateleira (Desacoplando o input temporário do ID efetivo de busca)
  const [customOfferId, setCustomOfferId] = useState("4755461");
  const [tempOfferId, setTempOfferId] = useState("4755461");
  const [apiOfferData, setApiOfferData] = useState<any>(null);
  const [userData, setUserData] = useState<BFFUserProfile | null>(null);
  const [vitrineOffers, setVitrineOffers] = useState<Record<string, any>>({});
  const [cardFotoIndex, setCardFotoIndex] = useState<Record<string, number>>({});
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});
  
  // Estados para o Painel Lateral (Drawer) de Consulta de Oferta
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedOfferPayload, setSelectedOfferPayload] = useState<any>(null);
  const [drawerFotoAtiva, setDrawerFotoAtiva] = useState(0);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerOfferId, setDrawerOfferId] = useState("");

  // Estados para o Painel Lateral (Drawer) de Consulta de Rota (orchestrator_configs)
  const [isRouteDrawerOpen, setIsRouteDrawerOpen] = useState(false);
  const [routeConfigData, setRouteConfigData] = useState<any>(null);
  const [routeDrawerLoading, setRouteDrawerLoading] = useState(false);
  const [routeDrawerTitle, setRouteDrawerTitle] = useState("");

  // Estados para o Painel Lateral (Drawer) de Simulação de Erros
  const [isErrorDrawerOpen, setIsErrorDrawerOpen] = useState(false);
  const [errorDrawerConfig, setErrorDrawerConfig] = useState<any>(null);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [simulating, setSimulating] = useState(false);

  // Limpa o estado de loading se o usuário voltar pela seta do navegador (bfcache)
  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted || window.performance?.navigation?.type === 2) {
        setLoadingAction(null);
      }
    };

    window.addEventListener('pageshow', handlePageShow);
    
    // Garante que o loading limpa se a janela recuperar o foco após o retorno
    const handleFocus = () => setLoadingAction(null);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  // Handler de Scroll para efeito Glassmorphism no Header
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const [ambienteAtivo, setAmbienteAtivo] = useState<"staging" | "production">(() => {
    if (typeof window !== "undefined") {
      const savedEnv = sessionStorage.getItem("sandbox_active_env");
      if (savedEnv === "staging" || savedEnv === "production") {
        return savedEnv;
      }
    }
    return (getDefaultSbxEnvironment() as "staging" | "production") || "staging";
  });

  // Salva o ambiente na sessionStorage sempre que ele for alterado
  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("sandbox_active_env", ambienteAtivo);
    }
  }, [ambienteAtivo]);

  // Inicializa o estado vazio para garantir paridade exata na primeira renderização SSR/Client
  const [accessTokenSBX, setAccessTokenSBX] = useState<string>("");

  // Hidratação segura do token guardado no sessionStorage após o mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedToken = sessionStorage.getItem("access_token_sbx");
      if (storedToken) {
        setAccessTokenSBX(storedToken);
      }
    }
  }, []);

  // Estados do Formulário de Autenticação no Sandbox
  const [tipoPessoa, setTipoPessoa] = useState<"F" | "J">("F");
  const [loginCred, setLoginCred] = useState("");
  const [passwordCred, setPasswordCred] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [generalError, setGeneralError] = useState("");

  // =========================================================================
  // ARQUITETURA DE VITRINE: Definição Estática das Ofertas de Topo
  // =========================================================================
  const FLOW_OFFERS = [
    { 
      key: "Cartão", 
      label: "Cartão em até 18x", 
      title: "Parcelamento com Cartão", 
      product_id: "8",
      offerId: ambienteAtivo === "production" ? "4846218" : "3064406", 
      flowKey: "Cartão", 
      disabled: false, 
      variant: "bg-white text-[#B300FF] border border-[#B300FF]/30 hover:bg-[#B300FF]/5 font-light text-xs" 
    },
    { 
      key: "Carros", 
      label: "Financiar em até 60x", 
      title: "Financiamento de Carros", 
      offerId: ambienteAtivo === "production" ? "4952846" : "2969794", 
      flowKey: "Carros", 
      disabled: false, 
      variant: "bg-white text-[#B300FF] border border-[#B300FF]/30 hover:bg-[#B300FF]/5 font-light text-xs" 
    },
    { 
      key: "Caminhões", 
      label: "Financiar em até 48x", 
      title: "Financiamento de Caminhões", 
      offerId: "4680825", 
      flowKey: "Caminhões", 
      disabled: false, 
      variant: "bg-white text-[#B300FF] border border-[#B300FF]/30 hover:bg-[#B300FF]/5 font-light text-xs" 
    },
    { 
      key: "Imóveis", 
      label: "Financiar em até 240x", 
      title: "Financiamento de Imóveis", 
      offerId: ambienteAtivo === "production" ? "4512612" : "2400058", 
      flowKey: "Imóveis", 
      disabled: true, 
      variant: "bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60 font-light text-xs" 
    },
  ];

  // Definição clara do token ativo na sessão do Sandbox
  const activeToken = sessionToken || accessTokenSBX;

  // =========================================================================
  // HOOKS DE INICIALIZAÇÃO E HIDRATAÇÃO DE DADOS DA PRATELEIRA
  // =========================================================================
  useEffect(() => {
    const loadSandboxData = async () => {
      if (!activeToken) return;
      
      setLoading(true);
      setError(null);

      try {
        // Chamando vazio para o serviço usar os authHeaders() e pegar do sessionStorage
        const profile = await fetchMyProfile(); 
        setUserData(profile);

        try {
          const offer = await fetchOfferDetails(customOfferId);
          setApiOfferData(offer);
        } catch (e) {
          console.error("Erro na inspeção principal:", e);
        }

        const promises = FLOW_OFFERS.map(async (item) => {
          try {
            const data = await fetchOfferDetails(item.offerId);
            return { key: item.key, data };
          } catch (e) {
            return { key: item.key, error: true };
          }
        });

        const results = await Promise.allSettled(promises);
        const newVitrine: Record<string, any> = {};
        results.forEach((res) => {
          if (res.status === "fulfilled" && res.value && !res.value.error) {
            newVitrine[res.value.key] = res.value.data;
          }
        });
        setVitrineOffers(newVitrine);
      } catch (err: any) {
        console.error("Erro ao carregar dados do sandbox:", err);
        const errorMsg = (err.message || "").toLowerCase();
        
        if (errorMsg.includes("401") || errorMsg.includes("unauthorized") || errorMsg.includes("session") || errorMsg.includes("expired") || errorMsg.includes("falha de autenticação")) {
          setError("Sua sessão expirou. Utilize o botão 'Sair' no topo para entrar novamente.");
        } else {
          setError(err.message || "Erro ao carregar dados do sandbox.");
        }
      } finally {
        setLoading(false);
      }
    };
    loadSandboxData();
  }, [activeToken, customOfferId, ambienteAtivo]);

  /**
   * @function handleInspectOffer
   * @description Sincroniza o valor temporário, limpa dados antigos para o estado de loading,
   * e dispara a busca detalhada da oferta informada.
   */
  const handleInspectOffer = async () => {
    if (!activeToken) {
      alert("Autentique-se primeiro no formulário abaixo.");
      return;
    }
    
    setCustomOfferId(tempOfferId);
    setLoading(true);
    setError(null);
    setApiOfferData(null); // Limpa o card anterior imediatamente para refletir o carregamento

    try {
      const offer = await fetchOfferDetails(tempOfferId);
      setApiOfferData(offer);
    } catch (err: any) {
      setError(err.message || `Oferta não encontrada (Lote: ${tempOfferId}).`);
      setApiOfferData(null);
    } finally {
      setLoading(false);
    }
  };

  /**
   * @function handleOpenConsultarOferta
   * @description Abre o painel lateral (Drawer) carregando o payload estruturado da oferta.
   */
  const handleOpenConsultarOferta = async (targetOfferId: string) => {
    if (!activeToken) {
      alert("Faça o login primeiro!");
      return;
    }
    setDrawerOfferId(targetOfferId);
    setIsDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerFotoAtiva(0);
    setSelectedOfferPayload(null);

    try {
      const data = await fetchOfferDetails(targetOfferId);
      setSelectedOfferPayload(data);
    } catch (err: any) {
      console.error("[DRAWER_FETCH_ERROR]:", err);
    } finally {
      setDrawerLoading(false);
    }
  };

  /**
   * @function handleOpenConsultarRota
   * @description Busca e exibe as configurações dinâmicas de rota da Edge Function `orchestrator_configs`.
   */
  const handleOpenConsultarRota = async (item: any) => {
    if (!item) return; 
    
    if (!sessionToken) {
      alert("Faça o login primeiro!");
      return;
    }

    setRouteDrawerTitle(item.title || "Detalhes da Configuração");
    setIsRouteDrawerOpen(true);
    setRouteDrawerLoading(true);
    setRouteConfigData(null);

    try {
      const contextParams: Record<string, any> = {};

      if (item.offerId) {
        try {
          const offerPayload = await fetchOfferDetails(item.offerId);
          if (offerPayload?.event?.event_id) contextParams.event_id = offerPayload.event.event_id;
          if (offerPayload?.seller?.seller_id) contextParams.seller_id = offerPayload.seller.seller_id;
          if (offerPayload?.offer?.category_id) contextParams.category_id = offerPayload.offer.category_id;
        } catch (e) {
          console.warn("Erro ao buscar detalhes da offer para montar cascata:", e);
        }
      }

      if (item.product_id) {
        contextParams.product_id = item.product_id;
      }

      const data = await callOrchestratorConfigs(contextParams);
      setRouteConfigData(data);
    } catch (err: any) {
      console.error("[ROUTE_CONFIG_ERROR]:", err);
    } finally {
      setRouteDrawerLoading(false);
    }
  };

  /**
   * @function handleOpenSimularErro
   * @description Abre o painel lateral de simulação de erros contendo instruções e guias para desenvolvedores.
   */
  const handleOpenSimularErro = (type: 'offer' | 'direct', item?: any) => {
    setSimulationResult(null);
    setErrorDrawerConfig({
      type,
      title: type === 'offer' ? `Simulação de Erros: ${item?.title || 'Oferta'}` : `Simulação de Erros: ${item?.title || 'Acesso Direto'}`,
      item
    });
    setIsErrorDrawerOpen(true);
  };

  /**
   * @function executeErrorSimulation
   * @description Executa cenários de falha controlada (oferta inválida ID 9999 ou token corrompido) 
   * via formulário (redirecionamento) ou via fetch (exibindo o JSON de erro diretamente na aba lateral).
   */
  const executeErrorSimulation = async (method: 'form' | 'fetch', errorTarget: 'offer' | 'token' | 'product') => {
    setSimulating(true);
    setSimulationResult(null);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    const gatewayUrl = `${supabaseUrl}/functions/v1/financial-gateway-gate`;

    const invalidOfferId = errorTarget === 'offer' ? "9999" : (errorDrawerConfig.item?.offerId || "4846218");
    // Híbrido: Pega o activeToken e despacha para a simulação de erros
    const invalidToken = errorTarget === 'token' ? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid_token_payload_test.signature" : activeToken;
    const invalidProductId = errorTarget === 'product' ? "999" : (errorDrawerConfig.item?.product_id || "8");

    const payload = {
      environment: ambienteAtivo,
      auth_token: invalidToken, // Token híbrido (JWT Interno ou Token sbX cru dependendo do estado)
      offer_id: errorDrawerConfig.type === 'offer' ? invalidOfferId : undefined,
      product_id: errorDrawerConfig.type === 'direct' ? invalidProductId : (errorDrawerConfig.item?.product_id || ""),
      return_uri: window.location.origin + window.location.pathname,
      utm_source: "sandbox_error_simulation",
      utm_medium: "debug",
      utm_campaign: `error_${errorTarget}_${method}`,
    };

    if (method === 'fetch') {
      try {
        const res = await fetch(gatewayUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        setSimulationResult({
          status: res.status,
          ok: res.ok,
          data
        });
      } catch (err: any) {
        setSimulationResult({
          status: 500,
          ok: false,
          data: { error: err.message || "Erro de rede ao comunicar com a borda." }
        });
      } finally {
        setSimulating(false);
      }
    } else {
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = gatewayUrl;

      Object.entries(payload).forEach(([key, value]) => {
        if (value !== undefined) {
          const input = document.createElement('input');
          input.type = 'hidden';
          input.name = key;
          input.value = String(value);
          form.appendChild(input);
        }
      });

      document.body.appendChild(form);
      try {
        form.submit();
      } catch (err: any) {
        setSimulationResult({ status: 500, data: { error: err.message } });
        setSimulating(false);
        document.body.removeChild(form);
      }
    }
  };

  /**
   * @function handleSandboxLogin
   * @description Orquestra o fluxo completo de autenticação no Sandbox: 
   * autentica na Superbid, armazena o token e executa o Exchange na Edge Function do Supabase.
   */
  const handleSandboxLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(""); 
    setPasswordError(""); 
    setGeneralError("");
    setError(null);

    let hasError = false;
    if (!loginCred.trim()) { 
      setLoginError(tipoPessoa === "F" ? "O e-mail ou login devem ser informados" : "O CNPJ ou login devem ser informados"); 
      hasError = true; 
    }
    if (!passwordCred.trim()) { 
      setPasswordError("A senha deve ser informada"); 
      hasError = true; 
    }
    
    const cleanLogin = loginCred.replace(/\D/g, '');
    if (cleanLogin.length > 0) {
      if (tipoPessoa === "F" && cleanLogin.length === 11 && !isCPF(cleanLogin)) { 
        setLoginError("CPF inválido"); 
        hasError = true; 
      } else if (tipoPessoa === "J" && cleanLogin.length === 14 && !isCNPJ(cleanLogin)) { 
        setLoginError("CNPJ inválido"); 
        hasError = true; 
      }
    }

    if (hasError) return;
    setIsLoggingIn(true);

    try {
      const loginResponse = await autenticarAccountsSBX(loginCred, passwordCred, ambienteAtivo);
      if (loginResponse?.success && loginResponse.access_token) {
        
        // Não mudamos a tela ainda! Aguardamos a Exchange rolar primeiro.
        const exchangeResponse = await trocarTokenNaEdgeFunction(loginResponse.access_token, ambienteAtivo);
        
        if (exchangeResponse?.success && exchangeResponse.session_token) {
          // Tudo deu certo. Salvamos os dois tokens ao mesmo tempo.
          sessionStorage.setItem("access_token_sbx", loginResponse.access_token);
          setAccessTokenSBX(loginResponse.access_token);
          
          if (setSession) {
            setSession(exchangeResponse.session_token, exchangeResponse.user_id || loginResponse.userId);
          }
        } else {
          throw new Error("Falha ao gerar o token interno na exchange.");
        }
      } else {
        setPasswordError("Usuário ou senha inválidos.");
      }
    } catch (err: any) {
      setGeneralError(err.message || "Erro de comunicação ao autenticar na sbX.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  /**
   * @function handleSandboxLogout
   * @description Limpa os estados de sessão, remove tokens armazenados e purifica o ambiente.
   */
  const handleSandboxLogout = () => {
    // 1. Aciona o spinner imediatamente
    setLoadingAction("logout");

    // 2. Dá um fôlego de 50ms para o React renderizar o spinner antes de limpar os dados
    setTimeout(() => {
      setAccessTokenSBX("");
      sessionStorage.removeItem("access_token_sbx");
      setError(null);
      setGeneralError(""); 
      
      // Limpa os dados do usuário e prateleira ao deslogar
      setUserData(null);
      setApiOfferData(null);
      setVitrineOffers({});
      
      if (logout) logout({ purgeEnv: true } as any);
      
      setLoadingAction(null);
    }, 50);
  };

  /**
   * =========================================================================
   * [GATEWAY DISPATCH VIA FORM POST NATIVO - MESMA ABA]
   * =========================================================================
   * @description Simula uma submissão de formulário HTML tradicional (POST nativo)
   * em direção à Edge Function de borda (`financial-gateway-gate`) abrindo na MESMA ABA.
   * 
   * -------------------------------------------------------------------------
   * [ARQUITETURA & DECISÃO TÉCNICA]
   * -------------------------------------------------------------------------
   * - Utiliza submissão de formulário nativa para contornar restrições severas de 
   *   CORS e Preflight (OPTIONS) entre domínios cruzados (App vs Supabase).
   * - Opera estritamente na mesma aba (sem `target = '_blank'`), garantindo que o 
   *   ciclo de vida do navegador e o contexto de sessão não sofram rupturas ou 
   *   problemas de isolamento de armazenamento em ambiente local/staging.
   * -------------------------------------------------------------------------
   */
  const handleSimulateOfferForm = (flowKey: string, offerId: string, productId: string, isDisabled?: boolean, forceToken?: 'jwt' | 'sbx') => {
    console.log("🚨 CLIQUE RECEBIDO NA FUNÇÃO DO FORM!", { flowKey, forceToken });
    
    if (isDisabled) return;

    let tokenToUse = activeToken;
    if (forceToken === 'jwt') tokenToUse = sessionToken;
    if (forceToken === 'sbx') tokenToUse = accessTokenSBX;

    if (!tokenToUse) {
      alert(`Token de autenticação não encontrado. Faça o login primeiro.`);
      return;
    }

    // Liga o estado de carregamento do botão específico com nome do estado
    setLoadingAction(`${flowKey}_form_${forceToken}`);
    setError(null);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    const gatewayUrl = `${supabaseUrl}/functions/v1/financial-gateway-gate`;

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = gatewayUrl;

    const searchPayload: Record<string, string> = {
      environment: ambienteAtivo,
      auth_token: tokenToUse,
      offer_id: String(offerId),
      product_id: String(productId || ''),
      return_uri: window.location.origin + window.location.pathname,
      utm_source: "sandbox",
      utm_medium: "referral",
      utm_campaign: `flow_${flowKey.toLowerCase()}_form`,
    };

    Object.entries(searchPayload).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = String(value);
      form.appendChild(input);
    });

    document.body.appendChild(form);

    try {
      form.submit();
    } catch (err: any) {
      console.error("[FORM_POST_ERROR]:", err);
      setError(`Erro ao submeter formulário: ${err.message}`);
      setLoadingAction(null);
    } finally {
      setTimeout(() => {
        if (document.body.contains(form)) document.body.removeChild(form);
        setLoadingAction(null);
      }, 800);
    }
  };

  /**
   * =========================================================================
   * [GATEWAY DISPATCH VIA AJAX / FETCH - NOVA ABA]
   * =========================================================================
   * @description Executa uma requisição assíncrona moderna (AJAX via `fetch`) 
   * direcionada à Edge Function de borda, tratando o payload JSON de resposta 
   * e abrindo o resultado controlado em uma NOVA ABA (`_blank`).
   * 
   * -------------------------------------------------------------------------
   * [ARQUITETURA & DECISÃO TÉCNICA]
   * -------------------------------------------------------------------------
   * - Consome a API da borda enviando dados em JSON e aguardando o contrato de 
   *   retorno estruturado (`success`, `redirect_url`, `session_token`).
   * - Realiza o armazenamento preventivo no `sessionStorage` se necessário e 
   *   dispara a abertura programática da nova aba (`window.open`), servindo 
   *   como ferramenta ideal de homologação e validação de contratos de API.
   * -------------------------------------------------------------------------
   */
  const handleSimulateOfferAjax = async (flowKey: string, offerId: string, productId: string, isDisabled?: boolean, forceToken?: 'jwt' | 'sbx') => {
    if (isDisabled) return;

    let tokenToUse = activeToken;
    if (forceToken === 'jwt') tokenToUse = sessionToken;
    if (forceToken === 'sbx') tokenToUse = accessTokenSBX;

    if (!tokenToUse) {
      alert(`Token de autenticação não encontrado. Faça o login primeiro.`);
      return;
    }

    // Liga o estado de carregamento do botão específico com nome do estado
    setLoadingAction(`${flowKey}_ajax_${forceToken}`);
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
      const gatewayUrl = `${supabaseUrl}/functions/v1/financial-gateway-gate`;

      const res = await fetch(gatewayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          environment: ambienteAtivo,
          auth_token: tokenToUse,
          offer_id: String(offerId),
          product_id: String(productId || ''),
          return_uri: window.location.origin + window.location.pathname,
          utm_source: "sandbox",
          utm_medium: "referral",
          utm_campaign: `flow_${flowKey.toLowerCase()}_ajax`,
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || `Erro no gateway AJAX: ${res.status}`);
      }

      if (data.session_token) {
        sessionStorage.setItem('session_token', data.session_token);
      }

      if (data.redirect_url) {
        window.open(data.redirect_url, '_blank');
      } else {
        throw new Error("URL de redirecionamento ausente na resposta.");
      }
    } catch (err: any) {
      console.error("[AJAX_GATEWAY_ERROR]:", err);
      const errorMsg = err.message || "Erro desconhecido";
      setError(`Erro no disparo AJAX: ${errorMsg}`);
    } finally {
      setLoadingAction(null);
    }
  };

  /**
   * =========================================================================
   * [GATEWAY DISPATCH DIRETO VIA FORM POST - SBXPAY / MESMA ABA]
   * =========================================================================
   * @description Submissão nativa direcionada ao hub sbxpay sem produto ou lote,
   * enviando a target_url opcional para acionar o fluxo de visita (VISIT) na borda.
   */
  const handleSbxPayGatewayForm = () => {
    if (!activeToken) {
      alert("Token de autenticação não encontrado. Faça o login primeiro.");
      return;
    }

    setLoadingAction("sbxpay_form");
    setError(null);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    const gatewayUrl = `${supabaseUrl}/functions/v1/financial-gateway-gate`;

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = gatewayUrl;

    const searchPayload: Record<string, string> = {
      environment: ambienteAtivo,
      auth_token: activeToken,
      target_url: "/sbxpay", // Opcional: Aciona o modo VISIT na borda
      return_uri: window.location.origin + window.location.pathname,
      utm_source: "sandbox",
      utm_medium: "referral",
      utm_campaign: "flow_sbxpay_form",
    };

    Object.entries(searchPayload).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = String(value);
      form.appendChild(input);
    });

    document.body.appendChild(form);

    try {
      form.submit();
    } catch (err: any) {
      console.error("[FORM_POST_ERROR]:", err);
      setError(`Erro ao submeter formulário: ${err.message}`);
      setLoadingAction(null);
    } finally {
      setTimeout(() => {
        if (document.body.contains(form)) document.body.removeChild(form);
        setLoadingAction(null);
      }, 800);
    }
  };

  /**
   * =========================================================================
   * [GATEWAY DISPATCH DIRETO VIA AJAX - SBXPAY / NOVA ABA]
   * =========================================================================
   * @description Requisição assíncrona (AJAX) para o hub sbxpay sem lote, 
   * enviando a target_url opcional e abrindo o resultado com a sessão hidratada em nova aba.
   */
  const handleSbxPayGatewayAjax = async () => {
    if (!activeToken) {
      alert("Token de autenticação não encontrado. Faça o login primeiro.");
      return;
    }

    setLoadingAction("sbxpay_ajax");
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
      const gatewayUrl = `${supabaseUrl}/functions/v1/financial-gateway-gate`;

      const res = await fetch(gatewayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          environment: ambienteAtivo,
          auth_token: activeToken,
          target_url: "/sbxpay", // Opcional: Aciona o modo VISIT na borda
          return_uri: window.location.origin + window.location.pathname,
          utm_source: "sandbox",
          utm_medium: "referral",
          utm_campaign: "flow_sbxpay_ajax",
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || `Erro no gateway AJAX: ${res.status}`);
      }

      if (data.session_token) {
        sessionStorage.setItem('session_token', data.session_token);
      }

      if (data.redirect_url) {
        window.open(data.redirect_url, '_blank');
      } else {
        throw new Error("URL de redirecionamento ausente na resposta.");
      }
    } catch (err: any) {
      console.error("[AJAX_GATEWAY_ERROR]:", err);
      const errorMsg = err.message || "Erro desconhecido";
      setError(`Erro no disparo AJAX: ${errorMsg}`);
    } finally {
      setLoadingAction(null);
    }
  };

  /**
   * =========================================================================
   * [GATEWAY DISPATCH DIRETO VIA FORM POST - PRODUTOS SEM LOTE / MESMA ABA]
   * =========================================================================
   * @description Submissão nativa direcionada a produtos estruturais sem lote 
   * (Equities & Seguros) operando na mesma aba.
   */
  const handleDirectGatewayForm = (flowKey: string, productId: string) => {
    if (!activeToken) {
      alert("Token de autenticação não encontrado. Faça o login primeiro.");
      return;
    }

    setLoadingAction(`${flowKey}_form`);
    setError(null);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    const gatewayUrl = `${supabaseUrl}/functions/v1/financial-gateway-gate`;

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = gatewayUrl;

    const searchPayload: Record<string, string> = {
      environment: ambienteAtivo,
      auth_token: activeToken,
      product_id: String(productId),
      return_uri: window.location.origin + window.location.pathname,
      utm_source: "sandbox",
      utm_medium: "referral",
      utm_campaign: `flow_${flowKey.toLowerCase()}_form`,
    };

    Object.entries(searchPayload).forEach(([key, value]) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = key;
      input.value = String(value);
      form.appendChild(input);
    });

    document.body.appendChild(form);

    try {
      form.submit();
    } catch (err: any) {
      console.error("[FORM_POST_ERROR]:", err);
      setError(`Erro ao submeter formulário: ${err.message}`);
      setLoadingAction(null);
    } finally {
      setTimeout(() => {
        if (document.body.contains(form)) document.body.removeChild(form);
        setLoadingAction(null);
      }, 800);
    }
  };

  /**
   * =========================================================================
   * [GATEWAY DISPATCH DIRETO VIA AJAX - PRODUTOS SEM LOTE / NOVA ABA]
   * =========================================================================
   * @description Requisição assíncrona (AJAX) para produtos estruturais sem lote 
   * (Equities & Seguros) com abertura controlada em nova aba.
   */
  const handleDirectGatewayAjax = async (flowKey: string, productId: string) => {
    if (!activeToken) {
      alert("Token de autenticação não encontrado. Faça o login primeiro.");
      return;
    }

    setLoadingAction(`${flowKey}_ajax`);
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
      const gatewayUrl = `${supabaseUrl}/functions/v1/financial-gateway-gate`;

      const res = await fetch(gatewayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          environment: ambienteAtivo,
          auth_token: activeToken,
          product_id: String(productId),
          return_uri: window.location.origin + window.location.pathname,
          utm_source: "sandbox",
          utm_medium: "referral",
          utm_campaign: `flow_${flowKey.toLowerCase()}_ajax`,
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || `Erro no gateway AJAX: ${res.status}`);
      }

      if (data.session_token) {
        sessionStorage.setItem('session_token', data.session_token);
      }

      if (data.redirect_url) {
        window.open(data.redirect_url, '_blank');
      } else {
        throw new Error("URL de redirecionamento ausente na resposta.");
      }
    } catch (err: any) {
      console.error("[AJAX_GATEWAY_ERROR]:", err);
      const errorMsg = err.message || "Erro desconhecido";
      setError(`Erro no disparo AJAX: ${errorMsg}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // --- [HANDLERS DE GALERIA DE FOTOS] ---
  const handleNextPhoto = (cardKey: string, totalPhotos: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCardFotoIndex(prev => ({ ...prev, [cardKey]: ((prev[cardKey] || 0) + 1) % totalPhotos }));
  };

  const handlePrevPhoto = (cardKey: string, totalPhotos: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCardFotoIndex(prev => ({ ...prev, [cardKey]: ((prev[cardKey] || 0) - 1 + totalPhotos) % totalPhotos }));
  };

  const formatTokenSnippet = (token: string | null) => {
    if (!token) return "vazio";
    return token.length > 38 ? `${token.substring(0, 38)}...` : token;
  };

  const drawerImagens = useMemo(() => {
    if (!selectedOfferPayload?.offer?.photos) return [];
    return [...selectedOfferPayload.offer.photos]
      .sort((a, b) => (a.highlight === b.highlight ? 0 : a.highlight ? -1 : 1))
      .map((p: any) => p.link);
  }, [selectedOfferPayload]);

  const ghostBtn = "border-2 border-purple-600 text-purple-600 hover:bg-purple-600 hover:text-white transition-all rounded-lg px-4 py-2 text-xs font-bold transform hover:scale-[1.02]";
  const loginLabelText = tipoPessoa === "F" ? "E-mail, login ou CPF" : "CNPJ ou login";

  return (
    <div className="bg-white text-slate-900 antialiased font-sans overflow-x-hidden relative min-h-screen pb-24 md:pb-10">
      <style>{`
        .glass { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
      `}</style>

      {/* HEADER INSTITUCIONAL */}
      <header className={`fixed top-0 left-0 w-full z-50 glass border-b border-gray-100 transition-all duration-300 ${isScrolled ? 'shadow-sm py-2' : 'py-3'}`}>
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <a href="#" className="flex items-center">
            <WalletLogo size="md" withTagline />
          </a>
          
          <div className="hidden md:flex flex-col items-start">
            <div className="flex items-center space-x-3 text-[13px] font-semibold text-slate-600">
              <span className="text-purple-600 font-bold">Painel de Sandbox</span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500 uppercase text-[11px] font-bold tracking-wide">Ambiente: {ambienteAtivo}</span>
            </div>
            <div className="flex flex-col font-mono text-[10px] text-slate-500 mt-1 space-y-0.5">
              <span><b>access_token_sbx:</b> {formatTokenSnippet(accessTokenSBX)}</span>
              <span><b>session_token:</b> {formatTokenSnippet(sessionToken)}</span>
            </div>
          </div>

          <div className="hidden md:flex items-center space-x-3">
            <a 
              href="/sandbox/help" 
              target="_blank" 
              rel="noopener noreferrer" 
              className={`flex items-center gap-1.5 ${ghostBtn}`}
            >
              <HelpCircle className="w-4 h-4" /> Ajuda
            </a>
            <a href="/backoffice" target="_blank" rel="noopener noreferrer" className={ghostBtn}>
              Backoffice
            </a>
            {activeToken ? (
              <button 
                onClick={handleSandboxLogout} 
                disabled={loadingAction === "logout"}
                className={`flex items-center gap-2 ${ghostBtn} ${loadingAction === "logout" ? "opacity-70 cursor-not-allowed" : ""}`}
              >
                {loadingAction === "logout" ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" /> Saindo...
                  </>
                ) : (
                  <>
                    Sair <LogOut className="w-3 h-3" />
                  </>
                )}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL DA ROTA */}
      <main className="max-w-7xl mx-auto px-6 pt-28 md:pt-32 space-y-8">

        {error && (
          <div className="bg-red-50 p-4 text-red-700 rounded-xl border border-red-200 text-sm font-medium">
            {error}
          </div>
        )}

        {!activeToken ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-full max-w-[440px] bg-white rounded-xl shadow-sm border border-gray-100 p-8 sm:p-10">
              
              <div className="flex justify-between items-center mb-6">
                <WalletLogo size="md" withTagline />
                {ambienteAtivo === "staging" && (
                  <span className="text-[10px] uppercase font-bold px-2 py-1 rounded-full border bg-red-50 text-red-600 border-red-200">
                    STAGE
                  </span>
                )}
              </div>

              <div className="mb-4">
                <p className="text-[11px] uppercase font-bold text-gray-500 mb-2 text-center tracking-wide">
                  Selecione o ambiente de destino:
                </p>
                <div className="flex bg-gray-100 rounded-full p-1">
                  <button
                    type="button"
                    onClick={() => setAmbienteAtivo("staging")}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-full transition-all border ${
                      ambienteAtivo === "staging" ? "bg-white text-[#B400FF] border-[#B400FF] shadow-sm" : "text-gray-500 border-transparent hover:text-gray-700"
                    }`}
                  >
                    STAGE
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmbienteAtivo("production")}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-full transition-all border ${
                      ambienteAtivo === "production" ? "bg-white text-[#B400FF] border-[#B400FF] shadow-sm" : "text-gray-500 border-transparent hover:text-gray-700"
                    }`}
                  >
                    PRODUÇÃO
                  </button>
                </div>
              </div>

              <form onSubmit={handleSandboxLogin} className="flex flex-col gap-5" noValidate>
                <div className="flex w-full border-b border-gray-200 mb-2">
                  <button
                    type="button"
                    disabled={isLoggingIn}
                    onClick={() => { setTipoPessoa("F"); setLoginCred(""); setLoginError(""); setPasswordError(""); }}
                    className={`flex-1 text-sm font-semibold py-3 transition-all border-b-2 outline-none ${tipoPessoa === "F" ? "text-gray-900 border-gray-900" : "text-gray-400 border-transparent"}`}
                  >
                    Pessoa Física
                  </button>
                  <button
                    type="button"
                    disabled={isLoggingIn}
                    onClick={() => { setTipoPessoa("J"); setLoginCred(""); setLoginError(""); setPasswordError(""); }}
                    className={`flex-1 text-sm font-semibold py-3 transition-all border-b-2 outline-none ${tipoPessoa === "J" ? "text-gray-900 border-gray-900" : "text-gray-400 border-transparent"}`}
                  >
                    Pessoa Jurídica
                  </button>
                </div>

                {generalError && (
                  <div className="bg-red-50 text-red-600 text-sm p-3 rounded border border-red-100 text-center font-medium">
                    {generalError}
                  </div>
                )}

                <div className="flex flex-col gap-1.5">
                  <input
                    type="text"
                    disabled={isLoggingIn}
                    value={loginCred}
                    onChange={(e) => {
                      const rawValue = e.target.value;
                      const isNumeric = /^\d+$/.test(rawValue.replace(/\D/g, ''));
                      setLoginCred(isNumeric ? (tipoPessoa === "F" ? formatCPF(rawValue) : formatCNPJ(rawValue)) : rawValue);
                      if (loginError) setLoginError("");
                    }}
                    className={`w-full h-12 border rounded-full px-5 text-sm outline-none transition-all ${loginError ? "border-[#C13535]" : "border-gray-300 focus:border-[#B400FF]"}`}
                    placeholder={loginLabelText}
                  />
                  {loginError && <span className="text-[#C13535] text-[11px] pl-5 font-medium mt-1">{loginError}</span>}
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="relative flex items-center w-full">
                    <input
                      type={showPassword ? "text" : "password"}
                      disabled={isLoggingIn}
                      value={passwordCred}
                      onChange={(e) => { setPasswordCred(e.target.value); if (passwordError) setPasswordError(""); }}
                      className={`w-full h-12 border rounded-full pl-5 pr-12 text-sm outline-none transition-all ${passwordError ? "border-[#C13535]" : "border-gray-300 focus:border-[#B400FF]"}`}
                      placeholder="Senha"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <Eye size={18} /> : <EyeOff size={18} />}
                    </button>
                  </div>
                  {passwordError && <span className="text-[#C13535] text-[11px] pl-5 font-medium mt-1">{passwordError}</span>}
                </div>

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className={`w-full h-12 bg-[#B400FF] text-white font-semibold rounded-full transition-all duration-300 flex items-center justify-center gap-2 ${isLoggingIn ? "opacity-70 cursor-wait" : "hover:bg-[#9a00db]"}`}
                >
                  {isLoggingIn ? <><Loader2 className="animate-spin" size={20} /> Processando...</> : "Entrar"}
                </button>
              </form>
            </div>
          </div>
        ) : (
          <>
            {/* INSPEÇÃO DE OFERTA E PERFIL */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card className="rounded-2xl border-border bg-white shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-[#B300FF]">
                    <Search className="h-4 w-4" /> Consulta de Oferta (/offer)
                  </CardTitle>
                  <CardDescription className="text-xs">Edge Function autenticada com token interno que chama /offer na sbX.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="flex gap-2">
                    <Input 
                      value={tempOfferId} 
                      onChange={(e) => setTempOfferId(e.target.value)} 
                      onKeyDown={(e) => { if (e.key === 'Enter') handleInspectOffer(); }}
                      className="rounded-xl font-mono text-xs" 
                    />
                    <Button onClick={handleInspectOffer} disabled={loading} size="sm" className="rounded-xl bg-[#B300FF] text-white hover:bg-[#9f00e6]">
                      {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Buscar"}
                    </Button>
                    <Button onClick={() => handleOpenConsultarOferta(customOfferId)} variant="outline" size="sm" className="rounded-xl text-[#B300FF] border-[#B300FF]/30 hover:bg-[#B300FF]/5">
                      <Info className="h-3.5 w-3.5 mr-1" /> Detalhes
                    </Button>
                  </div>
                  
                  {loading ? (
                    <div className="bg-muted/40 rounded-xl border flex items-center gap-6 overflow-hidden">
                      <div className="relative h-24 w-32 bg-[#B300FF] shrink-0 overflow-hidden rounded-l-xl flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                          <Loader2 className="animate-spin text-white" size={16} />
                        </div>
                      </div>

                      <div className="py-2 pr-4 flex flex-col justify-center space-y-1 overflow-hidden flex-1">
                        <p className="font-bold text-sm text-foreground">Carregando lote #{tempOfferId}...</p>
                        <p className="text-xs text-muted-foreground">Buscando dados na API da Superbid...</p>
                      </div>
                    </div>
                  ) : apiOfferData ? (() => {
                    const rawPhotos = apiOfferData?.offer?.photos || [];
                    const sortedPhotos = [...rawPhotos].sort((a: any, b: any) => {
                      if (a.highlight && !b.highlight) return -1;
                      if (!a.highlight && b.highlight) return 1;
                      return 0;
                    }).map((p: any) => p.link);

                    const currentCardIndex = cardFotoIndex["inspection"] || 0;
                    const activePhotoUrl = sortedPhotos.length > 0 
                      ? sortedPhotos[currentCardIndex % sortedPhotos.length] 
                      : null;
                    
                    const hasPhotoError = imageErrors["inspection"] || !activePhotoUrl;

                    const catName = apiOfferData?.offer?.category_name || apiOfferData?.offer?.category || "Categoria não informada";
                    const formattedValue = apiOfferData?.offer?.offer_value 
                      ? `R$ ${apiOfferData.offer.offer_value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` 
                      : "Valor sob consulta";

                    const eventId = apiOfferData?.event?.event_id || "";
                    const eventDesc = apiOfferData?.event?.event_description || apiOfferData?.offer?.event_description || "";

                    return (
                      <div className="bg-muted/40 rounded-xl border flex items-center gap-6 overflow-hidden">
                        <div className="relative h-24 w-32 bg-black shrink-0 overflow-hidden rounded-l-xl">
                          {hasPhotoError ? (
                            <div className="absolute inset-0 bg-[#B300FF] flex items-center justify-center text-white text-[10px] font-bold">
                              Sem foto
                            </div>
                          ) : (
                            <img 
                              src={activePhotoUrl!} 
                              alt="Lote" 
                              className="h-full w-full object-cover"
                              onError={() => setImageErrors(prev => ({ ...prev, ["inspection"]: true }))}
                            />
                          )}

                          {!hasPhotoError && sortedPhotos.length > 1 && (
                            <>
                              <button 
                                onClick={(e) => handlePrevPhoto("inspection", sortedPhotos.length, e)}
                                className="absolute left-1 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-1 rounded-full cursor-pointer border-none flex items-center justify-center z-10"
                              >
                                <ChevronLeft size={12} />
                              </button>
                              <button 
                                onClick={(e) => handleNextPhoto("inspection", sortedPhotos.length, e)}
                                className="absolute right-1 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-1 rounded-full cursor-pointer border-none flex items-center justify-center z-10"
                              >
                                <ChevronRight size={12} />
                              </button>
                            </>
                          )}
                        </div>

                        <div className="py-2 pr-4 flex flex-col justify-center space-y-1 overflow-hidden flex-1">
                          <p className="font-bold text-sm text-foreground truncate" title={apiOfferData.offer?.offer_description}>
                            Lote #{customOfferId} - {apiOfferData.offer?.offer_description || "Oferta sem descrição"}
                          </p>

                          {eventId && (
                            <p className="text-xs text-muted-foreground truncate font-normal">
                              EVENTO #{eventId} {eventDesc ? `- ${eventDesc}` : ""}
                            </p>
                          )}

                          <p className="text-xs text-muted-foreground truncate">
                            {catName} • <strong className="text-foreground">{formattedValue}</strong>
                          </p>
                        </div>
                      </div>
                    );
                  })() : (
                    <div className="p-3 bg-muted/40 rounded-xl border text-muted-foreground text-center italic">
                      Nenhuma oferta carregada. Insira um ID válido e clique em Buscar.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-border bg-white shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-[#B300FF]">
                    <UserCheck className="h-4 w-4" /> Perfil Carregado da sbX (/me)
                  </CardTitle>
                  <CardDescription className="text-xs">Edge Function autenticada com token interno que chama /me na sbX.</CardDescription>
                </CardHeader>
                <CardContent>
                  {userData ? (
                    <div className="p-3 bg-muted/40 rounded-xl border space-y-2 text-xs">
                      <div className="border-b pb-2">
                        <p className="font-bold text-sm text-foreground">{userData.name || "Usuário Identificado"}</p>
                        <p className="text-muted-foreground font-mono mt-0.5">{userData.email || "—"}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-y-1.5 gap-x-4 pt-0.5 font-mono text-[11px]">
                        <div>
                          <span className="text-muted-foreground uppercase text-[10px] block font-sans">Documento:</span>
                          <span className="font-semibold text-slate-800">{userData.document || "—"}</span>
                        </div>

                        <div>
                          <span className="text-muted-foreground uppercase text-[10px] block font-sans">Telefone:</span>
                          <span className="font-semibold text-slate-800">{userData.phone || "—"}</span>
                        </div>

                        <div>
                          <span className="text-muted-foreground uppercase text-[10px] block font-sans">Entity ID:</span>
                          <span className="font-semibold text-slate-800">{userData.entity_id || "—"}</span>
                        </div>

                        <div>
                          <span className="text-muted-foreground uppercase text-[10px] block font-sans">Tipo (Entity):</span>
                          <span className="font-semibold text-purple-600 uppercase">
                            {userData.entity_type === "J" ? "Pessoa Jurídica (PJ)" : userData.entity_type === "F" ? "Pessoa Física (PF)" : (userData.entity_type || "—")}
                          </span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 bg-muted/40 rounded-xl border text-xs text-muted-foreground italic text-center">
                      Carregando dados do perfil...
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* GRID DE JORNADAS DE ACESSO VIA GATEWAY */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              <Card className="rounded-2xl border-border hover:shadow-md transition-shadow flex flex-col justify-between bg-white">
                <CardHeader>
                  <div className="h-20 w-20 flex items-center justify-center mb-1 overflow-hidden">
                    <img src="/assets/home/conta.png" alt="Conta sbXPAY" className="h-full w-full object-contain" />
                  </div>
                  <CardTitle className="text-lg">Landing Wallet sbX</CardTitle>
                  <CardDescription className="text-xs">Acesso ao hub de produtos e serviços financeiros (Via Gateway).</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {/* Botão sbxpay (form) */}
                  <Button 
                    onClick={handleSbxPayGatewayForm}
                    disabled={loadingAction === "sbxpay_form"}
                    variant="outline"
                    className="w-full rounded-xl gap-2 bg-white text-[#B300FF] border border-[#B300FF]/30 hover:bg-[#B300FF]/5 font-light text-xs shadow-sm"
                  >
                    {loadingAction === "sbxpay_form" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-[#B300FF]" /> Processando...
                      </>
                    ) : (
                      <>
                        <ExternalLink className="h-4 w-4" /> Ir para sbxpay (form)
                      </>
                    )}
                  </Button>

                  {/* Botão sbxpay (fetch) */}
                  <Button 
                    onClick={handleSbxPayGatewayAjax}
                    disabled={loadingAction === "sbxpay_ajax"}
                    variant="outline"
                    className="w-full rounded-xl gap-2 bg-white text-[#B300FF] border border-[#B300FF]/30 hover:bg-[#B300FF]/5 font-light text-xs shadow-sm"
                  >
                    <ExternalLink className="h-4 w-4" /> {loadingAction === "sbxpay_ajax" ? "Processando..." : "Ir para sbxpay (fetch)"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-border hover:shadow-md transition-shadow flex flex-col justify-between bg-white">
                <CardHeader>
                  <div className="h-20 w-20 flex items-center justify-center mb-1 overflow-hidden">
                    <img src="/assets/home/seguros.png" alt="Seguros de Veículos" className="h-full w-full object-contain" />
                  </div>
                  <CardTitle className="text-lg">Seguros de Veículos</CardTitle>
                  <CardDescription className="text-xs">Disparo direto ao gateway (Product ID: 9)</CardDescription>
                </CardHeader>
                {/* SEGUROS DE VEÍCULOS */}
                <CardContent className="pt-0 space-y-2">
                  {/* Botão Seguros Auto (form) */}
                  <Button 
                    onClick={() => handleDirectGatewayForm("SeguroAuto", "9")}
                    disabled={loadingAction === "SeguroAuto_form"}
                    variant="outline"
                    className="w-full rounded-xl gap-2 bg-white text-[#B300FF] border border-[#B300FF]/30 hover:bg-[#B300FF]/5 font-light text-xs shadow-sm"
                  >
                    {loadingAction === "SeguroAuto_form" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-[#B300FF]" /> Processando...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="h-4 w-4" /> Acessar Seguros Auto (form)
                      </>
                    )}
                  </Button>

                  <Button 
                    onClick={() => handleDirectGatewayAjax("SeguroAuto", "9")}
                    disabled={loadingAction === "SeguroAuto_ajax"}
                    variant="outline"
                    className="w-full rounded-xl gap-2 bg-white text-[#B300FF] border border-[#B300FF]/30 hover:bg-[#B300FF]/5 font-light text-xs shadow-sm"
                  >
                    <ShieldCheck className="h-4 w-4" /> {loadingAction === "SeguroAuto_ajax" ? "Processando..." : "Acessar Seguros Auto (fetch)"}
                  </Button>

                  <div className="flex justify-center items-center gap-2 pt-1 text-[11px] font-bold text-[#B300FF]">
                    <button
                      type="button"
                      onClick={() => handleOpenConsultarRota({ product_id: "9", title: "Seguros de Veículos" })}
                      className="hover:underline bg-transparent border-none cursor-pointer p-0"
                    >
                      consultar rota
                    </button>
                    <span className="text-slate-300">•</span>
                    <button
                      type="button"
                      onClick={() => handleOpenSimularErro('direct', { product_id: "9", title: "Seguros de Veículos" })}
                      className="hover:underline bg-transparent border-none cursor-pointer p-0 text-amber-600"
                    >
                      simular erro
                    </button>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-border hover:shadow-md transition-shadow flex flex-col justify-between bg-white">
                <CardHeader>
                  <div className="h-20 w-20 flex items-center justify-center mb-1 overflow-hidden">
                    <img src="/assets/home/carhomeequity.png" alt="Car Equity" className="h-full w-full object-contain" />
                  </div>
                  <CardTitle className="text-lg">Car Equity</CardTitle>
                  <CardDescription className="text-xs">Disparo direto ao gateway (Product ID: 7)</CardDescription>
                </CardHeader>
                {/* CAR EQUITY */}
                <CardContent className="pt-0 space-y-2">
                  <Button 
                    onClick={() => handleDirectGatewayForm("AutoEquity", "7")}
                    disabled={loadingAction === "AutoEquity_form"}
                    variant="outline"
                    className="w-full rounded-xl gap-2 bg-white text-[#B300FF] border border-[#B300FF]/30 hover:bg-[#B300FF]/5 font-light text-xs shadow-sm"
                  >
                    {loadingAction === "AutoEquity_form" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin text-[#B300FF]" /> Processando...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4" /> Simular Car Equity (form)
                      </>
                    )}
                  </Button>

                  <Button 
                    onClick={() => handleDirectGatewayAjax("AutoEquity", "7")}
                    disabled={loadingAction === "AutoEquity_ajax"}
                    variant="outline"
                    className="w-full rounded-xl gap-2 bg-white text-[#B300FF] border border-[#B300FF]/30 hover:bg-[#B300FF]/5 font-light text-xs shadow-sm"
                  >
                    <Play className="h-4 w-4" /> {loadingAction === "AutoEquity_ajax" ? "Processando..." : "Simular Car Equity (fetch)"}
                  </Button>

                  <div className="flex justify-center items-center gap-2 pt-1 text-[11px] font-bold text-[#B300FF]">
                    <button
                      type="button"
                      onClick={() => handleOpenConsultarRota({ product_id: "7", title: "Car Equity" })}
                      className="hover:underline bg-transparent border-none cursor-pointer p-0"
                    >
                      consultar rota
                    </button>
                    <span className="text-slate-300">•</span>
                    <button
                      type="button"
                      onClick={() => handleOpenSimularErro('direct', { product_id: "7", title: "Car Equity" })}
                      className="hover:underline bg-transparent border-none cursor-pointer p-0 text-amber-600"
                    >
                      simular erro
                    </button>
                  </div>
                </CardContent>
              </Card>

            </div>

            {/* SEÇÃO: VITRINE DE LOTES & OFERTAS */}
            <div className="space-y-4 pt-4 border-t">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Parcelamentos e Financiamentos nas Ofertas</h2>
                <p className="text-xs text-muted-foreground">Chamada da Edge Function de borda do gateway com access token da sbX por form.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {FLOW_OFFERS.map((item) => {
                  const data = vitrineOffers[item.key];
                  
                  const rawPhotos = data?.offer?.photos || [];
                  const sortedPhotos = [...rawPhotos].sort((a: any, b: any) => {
                    if (a.highlight && !b.highlight) return -1;
                    if (!a.highlight && b.highlight) return 1;
                    return 0;
                  }).map((p: any) => p.link);

                  const fotoAtualIndex = cardFotoIndex[item.key] || 0;
                  const photoUrl = sortedPhotos.length > 0 
                    ? sortedPhotos[fotoAtualIndex % sortedPhotos.length] 
                    : null;

                  const hasError = imageErrors[item.key] || !photoUrl;

                  const offerDesc = data?.offer?.offer_description || item.title;
                  const offerVal = data?.offer?.offer_value 
                    ? `R$ ${data.offer.offer_value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` 
                    : (data ? "Valor indisponível" : "Carregando...");
                  const sellerName = data?.seller?.trade_name || (data ? "Superbid" : "Carregando...");
                  const eventDate = data?.event?.event_start_date ? new Date(data.event.event_start_date).toLocaleDateString("pt-BR") : "—";

                  return (
                    <div key={item.key} className="rounded-2xl border border-border bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between group">
                      <div>
                        <div className="relative h-44 w-full bg-black overflow-hidden">
                          {hasError ? (
                            <div className="absolute inset-0 bg-[#B300FF] flex items-center justify-center">
                              <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center relative shadow-inner">
                                <svg className="w-9 h-9 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                <div className="absolute inset-0 flex items-center justify-center rotate-45 pointer-events-none">
                                  <div className="w-full h-0.5 bg-white rounded-full" />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <img 
                              src={photoUrl!} 
                              alt={offerDesc} 
                              className="h-full w-full object-cover"
                              onError={() => setImageErrors(prev => ({ ...prev, [item.key]: true }))}
                            />
                          )}

                          <span className="absolute bottom-2 left-2 bg-black/75 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-md z-10 shadow">
                            Lote #{item.offerId}
                          </span>

                          {!hasError && sortedPhotos.length > 1 && (
                            <>
                              <button 
                                onClick={(e) => handlePrevPhoto(item.key, sortedPhotos.length, e)}
                                className="absolute left-1.5 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-full transition-all opacity-0 group-hover:opacity-100 cursor-pointer border-none flex items-center justify-center z-20 shadow-md"
                              >
                                <ChevronLeft size={16} />
                              </button>
                              <button 
                                onClick={(e) => handleNextPhoto(item.key, sortedPhotos.length, e)}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-black/60 hover:bg-black/80 text-white p-1.5 rounded-full transition-all opacity-0 group-hover:opacity-100 cursor-pointer border-none flex items-center justify-center z-20 shadow-md"
                              >
                                <ChevronRight size={16} />
                              </button>
                              <div className="absolute bottom-2 right-2 bg-black/70 backdrop-blur-sm text-white px-2 py-0.5 rounded text-[10px] font-mono z-10">
                                {(fotoAtualIndex % sortedPhotos.length) + 1} / {sortedPhotos.length}
                              </div>
                            </>
                          )}
                        </div>

                        <div className="p-4 space-y-2">
                          <div className="text-xs text-muted-foreground font-medium">Início: {eventDate}</div>
                          <h3 className="font-bold text-sm text-foreground line-clamp-2">{offerDesc}</h3>
                          <div className="text-xs text-muted-foreground truncate">{sellerName}</div>
                          <div className="pt-2">
                            <div className="text-[10px] text-muted-foreground uppercase font-semibold">Valor da Oferta:</div>
                            <div className="text-lg font-extrabold text-foreground">{offerVal}</div>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 pt-0 space-y-2">
                        
                        {/* =========================================
                        BLOCO 1: SIMULAÇÃO LEGADA (TOKEN DA SBX) 
                        ========================================= */}
                        <Button 
                          onClick={() => handleSimulateOfferForm(item.flowKey, item.offerId, item.product_id, item.disabled, 'sbx')}
                          disabled={item.disabled || loadingAction === `${item.flowKey}_form_sbx`}
                          variant="outline"
                          className={`w-full rounded-xl shadow-sm ${item.variant}`}
                        >
                          {loadingAction === `${item.flowKey}_form_sbx` ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Processando...
                            </span>
                          ) : item.disabled ? (
                            "Indisponível (Em breve)"
                          ) : (
                            `${item.label} (sbX/form)`
                          )}
                        </Button>

                        <Button 
                          onClick={() => handleSimulateOfferAjax(item.flowKey, item.offerId, item.product_id, item.disabled, 'sbx')}
                          disabled={item.disabled || loadingAction === `${item.flowKey}_ajax_sbx`}
                          variant="outline"
                          className={`w-full rounded-xl shadow-sm ${item.variant}`}
                        >
                          {loadingAction === `${item.flowKey}_ajax_sbx` ? "Processando..." : (item.disabled ? "Indisponível (Em breve)" : `${item.label} (sbX/fetch)`)}
                        </Button>

                        {/* =========================================
                            BLOCO 2: SIMULAÇÃO INTERNA (NOSSO JWT) 
                            ========================================= */}
                        <div className="pt-2">
                          <Button 
                            onClick={() => handleSimulateOfferForm(item.flowKey, item.offerId, item.product_id, item.disabled, 'jwt')}
                            disabled={item.disabled || loadingAction === `${item.flowKey}_form_jwt`}
                            variant="outline"
                            className="w-full rounded-xl shadow-sm bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 font-light text-xs mb-2"
                          >
                            {loadingAction === `${item.flowKey}_form_jwt` ? (
                              <span className="flex items-center gap-2">
                                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Processando...
                              </span>
                            ) : item.disabled ? (
                              "Indisponível (Em breve)"
                            ) : (
                              `${item.label} (JWT/form)`
                            )}
                          </Button>

                          <Button 
                            onClick={() => handleSimulateOfferAjax(item.flowKey, item.offerId, item.product_id, item.disabled, 'jwt')}
                            disabled={item.disabled || loadingAction === `${item.flowKey}_ajax_jwt`}
                            variant="outline"
                            className="w-full rounded-xl shadow-sm bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100 font-light text-xs"
                          >
                            {loadingAction === `${item.flowKey}_ajax_jwt` ? "Processando..." : (item.disabled ? "Indisponível (Em breve)" : `${item.label} (JWT/fetch)`)}
                          </Button>
                        </div>

                        {/* =========================================
                            LINKS DE CONSULTA E ERROS 
                            ========================================= */}
                        <div className="flex flex-wrap justify-center items-center gap-x-1.5 gap-y-1 text-center pt-3 border-t mt-2">
                          <button
                            type="button"
                            onClick={() => handleOpenConsultarOferta(item.offerId)}
                            className="text-[11px] font-bold text-[#B300FF] hover:underline bg-transparent border-none cursor-pointer p-0"
                          >
                            consultar oferta
                          </button>
                          <span className="text-slate-300">•</span>
                          <button
                            type="button"
                            onClick={() => handleOpenConsultarRota(item)}
                            className="text-[11px] font-bold text-[#B300FF] hover:underline bg-transparent border-none cursor-pointer p-0"
                          >
                            consultar rota
                          </button>
                          <span className="text-slate-300">•</span>
                          <button
                            type="button"
                            onClick={() => handleOpenSimularErro('offer', item)}
                            className="text-[11px] font-bold text-amber-600 hover:underline bg-transparent border-none cursor-pointer p-0"
                          >
                            simular erro
                          </button>
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}

      </main>

      {/* PAINEL LATERAL (DRAWER) DE CONSULTA DE OFERTA */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-all">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-slate-50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#B300FF]" />
                <h3 className="text-sm font-black uppercase text-slate-800">Consulta de Oferta #{drawerOfferId}</h3>
              </div>
              <button onClick={() => setIsDrawerOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {drawerLoading ? (
                <div className="flex flex-col items-center justify-center py-24 space-y-3">
                  <Loader2 className="animate-spin text-[#B300FF]" size={32} />
                  <p className="text-xs text-slate-500 font-medium">Carregando detalhes da oferta...</p>
                </div>
              ) : selectedOfferPayload ? (
                <div className="space-y-6">
                  <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-[#B300FF] border-gray-100">
                    <h2 className="text-xs font-black uppercase text-[#B300FF] mb-2">Oferta Relacionada</h2>
                    <p className="font-bold text-sm mb-4 text-slate-900">{selectedOfferPayload.offer.offer_description}</p>

                    {drawerImagens.length > 0 && (
                      <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden mb-4">
                        <img src={drawerImagens[drawerFotoAtiva]} className="w-full h-full object-contain" alt="Ativo" />
                        {drawerImagens.length > 1 && (
                          <>
                            <button onClick={() => setDrawerFotoAtiva((p) => (p - 1 + drawerImagens.length) % drawerImagens.length)} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 text-white p-1.5 rounded-full text-xs">‹</button>
                            <button onClick={() => setDrawerFotoAtiva((p) => (p + 1) % drawerImagens.length)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 text-white p-1.5 rounded-full text-xs">›</button>
                            <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-0.5 rounded text-[9px] font-mono">
                              {drawerFotoAtiva + 1} / {drawerImagens.length}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    <div className="mt-4">
                      <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">Payload JSON (Oferta / Manager / Event / Seller):</p>
                      <pre className="font-mono text-[10px] bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-800 whitespace-pre-wrap break-all">
                        {JSON.stringify(selectedOfferPayload, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400 text-xs">Nenhuma informação encontrada para esta oferta.</div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 bg-slate-50 flex justify-end flex-shrink-0">
              <Button onClick={() => setIsDrawerOpen(false)} className="bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-xl px-5">
                Fechar Painel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* PAINEL LATERAL (DRAWER) DE CONSULTA DE ROTA */}
      {isRouteDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-all">
          <div className="w-full max-w-2xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-slate-50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#B300FF]" />
                <h3 className="text-sm font-black uppercase text-slate-800">Consulta de Rota: {routeDrawerTitle}</h3>
              </div>
              <button onClick={() => setIsRouteDrawerOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {routeDrawerLoading ? (
                <div className="flex flex-col items-center justify-center py-24 space-y-3">
                  <Loader2 className="animate-spin text-[#B300FF]" size={32} />
                  <p className="text-xs text-slate-500 font-medium">Buscando configurações da rota no banco...</p>
                </div>
              ) : routeConfigData ? (
                <div className="space-y-6">
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-1.5 font-mono">
                    <p><b>ID Config:</b> {routeConfigData.id} | <b>Lookup ID:</b> {routeConfigData.lookup_id}</p>
                    <p><b>Tipo:</b> {routeConfigData.config_type} ({routeConfigData.entity_type})</p>
                    <p><b>URL:</b> {routeConfigData.page_url}</p>
                    <p><b>Método:</b> {routeConfigData.integration_method}</p>
                  </div>

                  {routeConfigData.page_configs?.offer_panel && (
                    <div className="bg-white p-4 rounded-xl border shadow-sm">
                      <h4 className="text-[11px] font-bold uppercase text-purple-600 mb-3 flex items-center gap-1.5">
                        <Layers size={14} /> Offer Panel (Painel de Proposta)
                      </h4>
                      <OfferPanelRender config={routeConfigData.page_configs} />
                    </div>
                  )}

                  <div className="flex flex-col gap-4">
                    {routeConfigData.integration_details && Object.keys(routeConfigData.integration_details).length > 0 && (
                      <div className="bg-slate-50 p-4 rounded-xl border text-xs overflow-hidden">
                        <h4 className="font-bold text-slate-700 mb-2 uppercase text-[10px] tracking-wide">Integration Details</h4>
                        <pre className="font-mono text-[9px] text-slate-600 whitespace-pre-wrap break-all overflow-x-auto">
                          {JSON.stringify(routeConfigData.integration_details, null, 2)}
                        </pre>
                      </div>
                    )}
                    {routeConfigData.rules && Object.keys(routeConfigData.rules).length > 0 && (
                      <div className="bg-slate-50 p-4 rounded-xl border text-xs overflow-hidden">
                        <h4 className="font-bold text-slate-700 mb-2 uppercase text-[10px] tracking-wide">Rules / Installments</h4>
                        <pre className="font-mono text-[9px] text-slate-600 whitespace-pre-wrap break-all overflow-x-auto">
                          {JSON.stringify(routeConfigData.rules, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>

                  {routeConfigData.consent_configs && routeConfigData.consent_configs.length > 0 && (
                    <div className="bg-white p-4 rounded-xl border shadow-sm">
                      <h4 className="text-[11px] font-bold uppercase text-purple-600 mb-3 flex items-center gap-1.5">
                        <FileText size={14} /> Consentimentos da Rota (LGPD)
                      </h4>
                      <DynamicConsentsStatic configs={routeConfigData.consent_configs} />
                    </div>
                  )}

                  {routeConfigData.page_faqs && routeConfigData.page_faqs.length > 0 && (
                    <div className="bg-white p-4 rounded-xl border shadow-sm">
                      <h4 className="text-[11px] font-bold uppercase text-purple-600 mb-1 flex items-center gap-1.5">
                        <HelpCircle size={14} /> FAQ & Perguntas Frequentes
                      </h4>
                      <FAQSection items={routeConfigData.page_faqs} />
                    </div>
                  )}

                  {routeConfigData.page_configs?.footer && (
                    <div className="pt-2">
                      <FooterRender config={routeConfigData.page_configs.footer} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400 text-xs">
                  Configuração não encontrada para esta rota.
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 bg-slate-50 flex justify-end flex-shrink-0">
              <Button onClick={() => setIsRouteDrawerOpen(false)} className="bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-xl px-5">
                Fechar Painel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* PAINEL LATERAL (DRAWER) DE SIMULAÇÃO DE ERROS */}
      {isErrorDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-all">
          <div className="w-full max-w-xl bg-white h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-purple-50/60 flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#B300FF]" />
                <h3 className="text-sm font-black uppercase text-purple-900">{errorDrawerConfig?.title}</h3>
              </div>
              <button onClick={() => setIsErrorDrawerOpen(false)} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-700">
              <div className="bg-purple-50/40 border border-purple-200 p-4 rounded-xl space-y-2">
                <h4 className="font-bold text-purple-900 uppercase text-[11px]">Guia de Testes e Resiliência (Developer Guide)</h4>
                <p className="text-muted-foreground leading-relaxed">
                  Este painel simula cenários de falha na borda (<code className="bg-purple-100 px-1 py-0.5 rounded text-purple-900">financial-gateway-gate</code>). 
                  Você pode testar a resiliência disparando via <b>Fetch (AJAX)</b> para inspecionar o contrato de erro JSON diretamente aqui na aba, 
                  ou via <b>Form POST (Nativo)</b> para validar o redirecionamento com spinner de erro do front-end.
                </p>
              </div>

              {errorDrawerConfig?.type === 'offer' ? (
                <div className="space-y-4">
                  {/* Cenário 1: Oferta Inválida */}
                  <div className="border border-slate-200 p-4 rounded-xl space-y-3 bg-white shadow-sm">
                    <h5 className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500" /> 1. Simular Oferta Inválida (ID: 9999)
                    </h5>
                    <p className="text-muted-foreground">
                      Envia um ID inexistente para a API upstream da Superbid. A borda deve interceptar o erro e disparar <code className="bg-slate-100 px-1 py-0.5 rounded">OFFER_NOT_FOUND</code>.
                    </p>
                    <div className="flex gap-2 pt-1">
                      <Button 
                        onClick={() => executeErrorSimulation('fetch', 'offer')} 
                        disabled={simulating}
                        size="sm" 
                        variant="outline"
                        className="rounded-xl text-xs border-[#B300FF]/30 text-[#B300FF] hover:bg-[#B300FF]/5 flex items-center"
                      >
                        {simulating && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1" />} 
                        Testar via Fetch (JSON)
                      </Button>
                      <Button 
                        onClick={() => executeErrorSimulation('form', 'offer')} 
                        disabled={simulating}
                        size="sm" 
                        className="rounded-xl text-xs bg-[#B300FF] hover:bg-[#9f00e6] text-white flex items-center"
                      >
                        {simulating && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1" />} 
                        Testar via Form (Redirecionar)
                      </Button>
                    </div>
                  </div>

                  {/* Cenário 2: Token Inválido */}
                  <div className="border border-slate-200 p-4 rounded-xl space-y-3 bg-white shadow-sm">
                    <h5 className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500" /> 2. Simular Token de Acesso Inválido / Expirado
                    </h5>
                    <p className="text-muted-foreground">
                      Substitui o token ativo por uma credencial corrompida. A borda disparará o erro de sessão expirada ou não autorizada (<code className="bg-slate-100 px-1 py-0.5 rounded">SESSION_EXPIRED</code>).
                    </p>
                    <div className="flex gap-2 pt-1">
                      <Button 
                        onClick={() => executeErrorSimulation('fetch', 'token')} 
                        disabled={simulating}
                        size="sm" 
                        variant="outline"
                        className="rounded-xl text-xs border-[#B300FF]/30 text-[#B300FF] hover:bg-[#B300FF]/5"
                      >
                        {simulating ? <Loader2 className="animate-spin h-3.5 w-3.5 mr-1" /> : null} Testar via Fetch (JSON)
                      </Button>
                      <Button 
                        onClick={() => executeErrorSimulation('form', 'token')} 
                        disabled={simulating}
                        size="sm" 
                        className="rounded-xl text-xs bg-[#B300FF] hover:bg-[#9f00e6] text-white"
                      >
                        Testar via Form (Redirecionar)
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Cenário Direct: Produto Inválido */}
                  <div className="border border-slate-200 p-4 rounded-xl space-y-3 bg-white shadow-sm">
                    <h5 className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500" /> 1. Simular Produto Estrutural Inválido (ID: 999)
                    </h5>
                    <p className="text-muted-foreground">
                      Envia um ID de produto sem correspondência no orquestrador de rotas para testar a validação de destino.
                    </p>
                    <div className="flex gap-2 pt-1">
                      <Button 
                        onClick={() => executeErrorSimulation('fetch', 'product')} 
                        disabled={simulating}
                        size="sm" 
                        variant="outline"
                        className="rounded-xl text-xs border-[#B300FF]/30 text-[#B300FF] hover:bg-[#B300FF]/5 flex items-center"
                      >
                        {simulating && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1" />} 
                        Testar via Fetch (JSON)
                      </Button>
                      <Button 
                        onClick={() => executeErrorSimulation('form', 'product')} 
                        disabled={simulating}
                        size="sm" 
                        className="rounded-xl text-xs bg-[#B300FF] hover:bg-[#9f00e6] text-white flex items-center"
                      >
                        {simulating && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1" />} 
                        Testar via Form (Redirecionar)
                      </Button>
                    </div>
                  </div>

                  {/* Cenário Direct: Token */}
                  <div className="border border-slate-200 p-4 rounded-xl space-y-3 bg-white shadow-sm">
                    <h5 className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500" /> 2. Simular Token Inválido na Chamada Direta
                    </h5>
                    <p className="text-muted-foreground">
                      Valida o comportamento de segurança da borda ao receber requisições estruturais sem autenticação válida.
                    </p>
                    <div className="flex gap-2 pt-1">
                      <Button 
                        onClick={() => executeErrorSimulation('fetch', 'token')} 
                        disabled={simulating}
                        size="sm" 
                        variant="outline"
                        className="rounded-xl text-xs border-[#B300FF]/30 text-[#B300FF] hover:bg-[#B300FF]/5"
                      >
                        {simulating ? <Loader2 className="animate-spin h-3.5 w-3.5 mr-1" /> : null} Testar via Fetch (JSON)
                      </Button>
                      <Button 
                        onClick={() => executeErrorSimulation('form', 'token')} 
                        disabled={simulating}
                        size="sm" 
                        className="rounded-xl text-xs bg-[#B300FF] hover:bg-[#9f00e6] text-white"
                      >
                        Testar via Form (Redirecionar)
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Exibição do Retorno via Fetch na Própria Aba */}
              {simulationResult && (
                <div className="mt-4 p-4 rounded-xl border bg-slate-900 text-slate-100 space-y-2 font-mono text-[11px]">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <span className="font-bold text-purple-400">Retorno do Serviço (Fetch):</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] ${simulationResult.ok ? 'bg-green-900 text-green-200' : 'bg-red-900 text-red-200'}`}>
                      HTTP Status: {simulationResult.status}
                    </span>
                  </div>
                  <pre className="whitespace-pre-wrap break-all overflow-x-auto text-[10px]">
                    {JSON.stringify(simulationResult.data, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 bg-slate-50 flex justify-end flex-shrink-0">
              <Button onClick={() => setIsErrorDrawerOpen(false)} className="bg-[#B300FF] hover:bg-[#9f00e6] text-white text-xs rounded-xl px-5">
                Fechar Painel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE NAVIGATION TAB BAR */}
      <div className="fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 z-50 flex justify-around items-center pt-2 pb-4 md:hidden shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <a href="/sbxpay" className="flex flex-col items-center justify-center text-purple-600 min-w-[70px] gap-1">
          <Home className="w-6 h-6" strokeWidth={1.5} />
          <span className="text-[10px] font-bold">Início</span>
        </a>

        <a href="/sandbox" className="flex flex-col items-center justify-center text-purple-600 min-w-[70px] gap-1">
          <AppWindow className="w-6 h-6" strokeWidth={1.5} />
          <span className="text-[10px] font-bold">Sandbox</span>
        </a>

        {activeToken ? (
          <button 
            onClick={handleSandboxLogout} 
            disabled={loadingAction === "logout"}
            className={`flex flex-col items-center justify-center min-w-[70px] gap-1 transition-all ${loadingAction === "logout" ? "text-red-300" : "text-red-500"}`}
          >
            {loadingAction === "logout" ? (
              <Loader2 className="w-6 h-6 animate-spin" strokeWidth={1.5} />
            ) : (
              <LogOut className="w-6 h-6" strokeWidth={1.5} />
            )}
            <span className="text-[10px] font-medium">{loadingAction === "logout" ? "Saindo..." : "Sair"}</span>
          </button>
        ) : (
          <button onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex flex-col items-center justify-center text-slate-400 min-w-[70px] gap-1">
            <LogIn className="w-6 h-6" strokeWidth={1.5} />
            <span className="text-[10px] font-medium">Entrar</span>
          </button>
        )}
      </div>
    </div>
  );
}