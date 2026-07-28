/**
 * ============================================================================
 * @fileoverview Sandbox de Simulação de Jornadas (Topo de Funil / sbX)
 * @description Painel de controle e testes integrado com a API de Ofertas, Sessão, 
 *              Painel Lateral de Consulta de Oferta e Painel Lateral de Rota (Orchestrator Configs).
 *              Atua como hub de debug e roteamento isolado do front-end principal.
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
  Layers
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

// Mapeamento centralizado de URLs base da API da Superbid por ambiente
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
 * @description Renderiza blocos expansíveis (Accordion) baseados no array `page_faqs`
 * retornado pela edge function orchestrator_configs. Divide em duas colunas.
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
 * marcadores de hiperlink {texto} baseados no array de links da API.
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
 * @description Ponto de entrada legado. Autentica contra o ecossistema 
 * Superbid original via grant_type password para capturar o access_token primário.
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
 * @description Recebe o token legado da SBX e solicita à Edge Function de Exchange 
 * (sbx-auth-exchange) a geração de um JWT nativo seguro da nossa stack (Supabase).
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

export const Route = createLazyFileRoute("/sandbox")({
  component: SandboxPage,
});

/**
 * =========================================================================
 * COMPONENTE PRINCIPAL: SandboxPage
 * =========================================================================
 */
function SandboxPage() {
  const navigate = useNavigate();
  const { sessionToken, logout, setSession } = useFinancialAuth();

  // Estados Visuais e de UI
  const [isScrolled, setIsScrolled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // Estados de Contexto e Prateleira
  const [customOfferId, setCustomOfferId] = useState("4755461");
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

  // Handler de Scroll
  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const [ambienteAtivo, setAmbienteAtivo] = useState<"staging" | "production">(() => {
    return (getDefaultSbxEnvironment() as "staging" | "production") || "production";
  });

  // [GEMINI PRO]: PROTEÇÃO SSR
  // O uso estrito de `typeof window` previne o erro "sessionStorage is not defined" 
  // durante a compilação/renderização servida (SSR) do TanStack/Vite, 
  // garantindo que o storage só seja acessado no client-side.
  const [accessTokenSbx, setAccessTokenSbx] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("access_token_sbx") || "";
    }
    return "";
  });

  // Estados do Formulário de Login
  const [tipoPessoa, setTipoPessoa] = useState<"F" | "J">("F");
  const [loginCred, setLoginCred] = useState("");
  const [passwordCred, setPasswordCred] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [generalError, setGeneralError] = useState("");

  // =========================================================================
  // ARQUITETURA DE VITRINE: Definição Estática
  // =========================================================================
  const FLOW_OFFERS = [
    { 
      key: "Cartão", 
      label: "Parcelar com cartão em até 18x", 
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
      offerId: ambienteAtivo === "production" ? "4858961" : "2969794", 
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

  const activeToken = sessionToken || accessTokenSbx;

  // =========================================================================
  // HOOKS DE INICIALIZAÇÃO E HIDRATAÇÃO DE DADOS
  // =========================================================================
  useEffect(() => {
    const loadSandboxData = async () => {
      if (!activeToken) return;
      setLoading(true);
      try {
        const profile = await fetchMyProfile(activeToken);
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
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadSandboxData();
  }, [activeToken, customOfferId, ambienteAtivo]);

  const handleInspectOffer = async () => {
    if (!activeToken) {
      alert("Autentique-se primeiro no formulário abaixo.");
      return;
    }
    setLoading(true);
    try {
      const offer = await fetchOfferDetails(customOfferId);
      setApiOfferData(offer);
      setError(null);
    } catch (err: any) {
      setError(err.message || "Oferta não encontrada.");
    } finally {
      setLoading(false);
    }
  };

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
   * =========================================================================
   * FETCH DE CONFIGURAÇÃO DE ROTA VIA GATEWAY
   * =========================================================================
   * @function handleOpenConsultarRota
   * @description Aciona a utilitária callOrchestratorConfigs enviando os parâmetros 
   * dinâmicos (event_id, seller_id, category_id e product_id), espelhando 
   * rigorosamente a lógica de cascata do backend.
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

  const handleSandboxLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(""); 
    setPasswordError(""); 
    setGeneralError("");

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
        const sbxToken = loginResponse.access_token;
        setAccessTokenSbx(sbxToken);
        sessionStorage.setItem("access_token_sbx", sbxToken);

        const exchangeResponse = await trocarTokenNaEdgeFunction(sbxToken, ambienteAtivo);
        if (exchangeResponse?.success && exchangeResponse.session_token) {
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

  const handleSandboxLogout = () => {
    setAccessTokenSbx("");
    sessionStorage.removeItem("access_token_sbx");
    if (logout) logout({ purgeEnv: true } as any);
  };

/**
   * =========================================================================
   * [GATEWAY DISPATCH]: Chamada Oficial ao financial-gateway-gate (Vitrine/Lotes)
   * =========================================================================
   * @function handleSimulateOffer
   * @description Dispara o POST para a Edge Function de Borda. Abre a aba 
   * apenas após o sucesso da resposta para evitar abas em branco (`about:blank`) órfãs.
   */
  const handleSimulateOffer = async (flowKey: string, offerId: string, productId: string, isDisabled?: boolean) => {
    if (isDisabled) return;
    if (!accessTokenSbx) {
      alert("Token access_token_sbx não encontrado. Faça o login primeiro.");
      return;
    }

    setLoadingAction(flowKey);
    setError(null);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    const controller = new AbortController();
    const safetyTimeout = setTimeout(() => controller.abort(), 10000);

    const searchPayload: Record<string, string> = {
      environment: ambienteAtivo,
      auth_token: accessTokenSbx,
      offer_id: String(offerId),
      product_id: String(productId || ''),
      return_uri: window.location.origin + window.location.pathname,
      utm_source: "sandbox",
      utm_medium: "referral",
      utm_campaign: `flow_${flowKey.toLowerCase()}`,
    };

    try {
      const gatewayResponse = await fetch(`${supabaseUrl}/functions/v1/financial-gateway-gate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(searchPayload),
        signal: controller.signal
      });

      clearTimeout(safetyTimeout);
      if (!gatewayResponse.ok) {
        const gwErrText = await gatewayResponse.text();
        throw new Error(`Gateway falhou (HTTP ${gatewayResponse.status}): ${gwErrText}`);
      }

      const data = await gatewayResponse.json();
      if (gatewayResponse.status === 401 || data.code === 'SESSION_EXPIRED') {
        setError("Seu token de Sandbox expirou ou é inválido. Por favor, logue novamente.");
        handleSandboxLogout();
        return;
      }

      if (data.success && data.redirect_url) {
        if (data.redirect_url.includes("signin") || data.redirect_url.includes("login")) {
          setError(`🚨 O Gateway rejeitou o token silenciosamente e tentou forçar a ida para a tela de login.`);
          handleSandboxLogout();
          return;
        }
        
        // Abre a aba diretamente com a URL válida retornada pela Borda
        window.open(data.redirect_url, '_blank');
      } else {
        setError(data.message || "Falha na liberação do Gateway Financeiro.");
      }
    } catch (err: any) {
      console.error("[GATEWAY_ERROR]:", err);
      setError(`Erro Técnico: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  /**
   * =========================================================================
   * [GATEWAY DISPATCH DIRETO]: Chamada Exclusiva para Produtos sem Lote (Equities & Seguros)
   * =========================================================================
   * @description Produtos como Car Equity e Seguro Auto não exigem offer_id,
   * enviando estritamente o product_id, token e UTMs para a Borda.
   */
  const handleDirectGateway = async (flowKey: string, productId: string) => {
    if (!accessTokenSbx) {
      alert("Token access_token_sbx não encontrado. Faça o login primeiro.");
      return;
    }

    setLoadingAction(flowKey);
    setError(null);
    const newWindow = window.open('about:blank', '_blank');

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    const controller = new AbortController();
    const safetyTimeout = setTimeout(() => controller.abort(), 10000);

    const searchPayload: Record<string, string> = {
      environment: ambienteAtivo,
      auth_token: accessTokenSbx,
      product_id: String(productId),
      return_uri: window.location.origin + window.location.pathname,
      utm_source: "sandbox",
      utm_medium: "referral",
      utm_campaign: `flow_${flowKey.toLowerCase()}`,
    };

    try {
      const gatewayResponse = await fetch(`${supabaseUrl}/functions/v1/financial-gateway-gate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(searchPayload),
        signal: controller.signal
      });

      clearTimeout(safetyTimeout);
      if (!gatewayResponse.ok) {
        if (newWindow) newWindow.close();
        const gwErrText = await gatewayResponse.text();
        throw new Error(`Gateway falhou (HTTP ${gatewayResponse.status}): ${gwErrText}`);
      }

      const data = await gatewayResponse.json();
      if (gatewayResponse.status === 401 || data.code === 'SESSION_EXPIRED') {
        if (newWindow) newWindow.close();
        setError("Seu token de Sandbox expirou ou é inválido. Por favor, logue novamente.");
        handleSandboxLogout();
        return;
      }

      if (data.success && data.redirect_url) {
        if (data.redirect_url.includes("signin") || data.redirect_url.includes("login")) {
          if (newWindow) newWindow.close();
          setError(`🚨 O Gateway rejeitou o token silenciosamente e tentou forçar a ida para a tela de login.`);
          handleSandboxLogout();
          return;
        }
        if (newWindow) {
          newWindow.location.href = data.redirect_url;
        } else {
          window.location.href = data.redirect_url;
        }
      } else {
        if (newWindow) newWindow.close();
        setError(data.message || "Falha na liberação do Gateway Financeiro.");
      }
    } catch (err: any) {
      if (newWindow) newWindow.close();
      console.error("[GATEWAY_ERROR]:", err);
      setError(`Erro Técnico: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

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

      {/* HEADER */}
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
              <span><b>access_token_sbx:</b> {formatTokenSnippet(accessTokenSbx)}</span>
              <span><b>session_token:</b> {formatTokenSnippet(sessionToken)}</span>
            </div>
          </div>

          <div className="hidden md:flex items-center space-x-3">
            <a href="/backoffice" className={ghostBtn}>Backoffice</a>
            {activeToken ? (
              <button onClick={handleSandboxLogout} className={`flex items-center gap-2 ${ghostBtn}`}>
                Sair <LogOut className="w-3 h-3" />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL */}
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
                  className={`w-full h-12 bg-[#B400FF] text-white font-semibold rounded-full transition-all duration-300 flex items-center justify-center gap-2 ${isLoggingIn ? "animate-pulse" : "hover:bg-[#9a00db]"}`}
                >
                  {isLoggingIn ? <><Loader2 className="animate-spin" size={20} /> Validando...</> : "Entrar"}
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
                    <Search className="h-4 w-4" /> Inspeção de Oferta (API)
                  </CardTitle>
                  <CardDescription className="text-xs">Dados da oferta carregados utilizando o ID ativo.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="flex gap-2">
                    <Input 
                      value={customOfferId} 
                      onChange={(e) => setCustomOfferId(e.target.value)} 
                      className="rounded-xl font-mono text-xs" 
                    />
                    <Button onClick={handleInspectOffer} disabled={loading} size="sm" className="rounded-xl bg-[#B300FF] text-white hover:bg-[#9f00e6]">
                      {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Buscar"}
                    </Button>
                  </div>
                  {apiOfferData && (
                    <div className="p-3 bg-muted/40 rounded-xl border space-y-1">
                      <p className="font-bold">{apiOfferData.offer?.offer_description}</p>
                      <p className="text-muted-foreground">Valor: R$ {apiOfferData.offer?.offer_value?.toLocaleString("pt-BR")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-border bg-white shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-[#B300FF]">
                    <UserCheck className="h-4 w-4" /> Perfil Hidratado (BFF /me)
                  </CardTitle>
                  <CardDescription className="text-xs">Sessão validada diretamente com o servidor.</CardDescription>
                </CardHeader>
                <CardContent>
                  {userData ? (
                    <div className="p-3 bg-muted/40 rounded-xl border space-y-1 text-xs">
                      <p className="font-bold">{userData.name || "Usuário Identificado"}</p>
                      <p className="text-muted-foreground font-mono">E-mail: {userData.email || "—"}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground italic">Carregando perfil...</p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* GRID DE JORNADAS DE ACESSO VIA GATEWAY (financial-gateway-gate) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Card 1: sbxpay.index */}
              <Card className="rounded-2xl border-border hover:shadow-md transition-shadow flex flex-col justify-between bg-white">
                <CardHeader>
                  <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold mb-2">💳</div>
                  <CardTitle className="text-lg">sbxpay.index</CardTitle>
                  <CardDescription className="text-xs">Acesso ao hub central de pagamentos.</CardDescription>
                </CardHeader>
                <CardContent className="pt-0">
                  <Button 
                    onClick={() => navigate({ to: "/sbxpay" as any })}
                    variant="outline"
                    className="w-full rounded-xl gap-2 bg-white text-[#B300FF] border border-[#B300FF]/30 hover:bg-[#B300FF]/5 font-light text-xs shadow-sm"
                  >
                    <ExternalLink className="h-4 w-4" /> Ir para sbxpay
                  </Button>
                </CardContent>
              </Card>

              {/* Card 2: Seguros de Veículos (Product ID: 9 - Sem Offer ID) */}
              <Card className="rounded-2xl border-border hover:shadow-md transition-shadow flex flex-col justify-between bg-white">
                <CardHeader>
                  <div className="h-10 w-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center font-bold mb-2">🛡️</div>
                  <CardTitle className="text-lg">Seguros de Veículos</CardTitle>
                  <CardDescription className="text-xs">Disparo direto ao gateway (Product ID: 9)</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <Button 
                    onClick={() => handleDirectGateway("SeguroAuto", "9")}
                    disabled={loadingAction === "SeguroAuto"}
                    variant="outline"
                    className="w-full rounded-xl gap-2 bg-white text-[#B300FF] border border-[#B300FF]/30 hover:bg-[#B300FF]/5 font-light text-xs shadow-sm"
                  >
                    <ShieldCheck className="h-4 w-4" /> {loadingAction === "SeguroAuto" ? "Processando..." : "Acessar Seguros Auto"}
                  </Button>
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenConsultarRota({ product_id: "9", title: "Seguros de Veículos" })}
                      className="text-[11px] font-bold text-[#B300FF] hover:underline bg-transparent border-none cursor-pointer p-0"
                    >
                      consultar rota
                    </button>
                  </div>
                </CardContent>
              </Card>

              {/* Card 3: Car Equity (Product ID: 7 - Sem Offer ID) */}
              <Card className="rounded-2xl border-border hover:shadow-md transition-shadow flex flex-col justify-between bg-white">
                <CardHeader>
                  <div className="h-10 w-10 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center font-bold mb-2">🚗</div>
                  <CardTitle className="text-lg">Car Equity</CardTitle>
                  <CardDescription className="text-xs">Disparo direto ao gateway (Product ID: 7)</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  <Button 
                    onClick={() => handleDirectGateway("AutoEquity", "7")}
                    disabled={loadingAction === "AutoEquity"}
                    variant="outline"
                    className="w-full rounded-xl gap-2 bg-white text-[#B300FF] border border-[#B300FF]/30 hover:bg-[#B300FF]/5 font-light text-xs shadow-sm"
                  >
                    <Play className="h-4 w-4" /> {loadingAction === "AutoEquity" ? "Processando..." : "Simular Car Equity"}
                  </Button>
                  <div className="flex justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenConsultarRota({ product_id: "7", title: "Car Equity" })}
                      className="text-[11px] font-bold text-[#B300FF] hover:underline bg-transparent border-none cursor-pointer p-0"
                    >
                      consultar rota
                    </button>
                  </div>
                </CardContent>
              </Card>

            </div>

            {/* SEÇÃO 4: VITRINE DE LOTES & OFERTAS */}
            <div className="space-y-4 pt-4 border-t">
              <div>
                <h2 className="text-xl font-bold tracking-tight">Vitrine de Lotes & Ofertas (Dinâmica da API)</h2>
                <p className="text-xs text-muted-foreground">Fotos e metadados reais obtidos diretamente do ecossistema de ofertas.</p>
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

                      {/* AÇÕES DA PRATELEIRA */}
                      <div className="p-4 pt-0 space-y-2">
                        <Button 
                          onClick={() => handleSimulateOffer(item.flowKey, item.offerId, item.product_id, item.disabled)}
                          disabled={item.disabled || loadingAction === item.flowKey}
                          variant="outline"
                          className={`w-full rounded-xl shadow-sm ${item.variant}`}
                        >
                          {loadingAction === item.flowKey ? "Processando..." : (item.disabled ? "Indisponível (Em breve)" : item.label)}
                        </Button>

                        <div className="flex flex-col gap-1 text-center pt-1">
                          <button
                            type="button"
                            onClick={() => handleOpenConsultarOferta(item.offerId)}
                            className="text-[11px] font-bold text-[#B300FF] hover:underline bg-transparent border-none cursor-pointer p-0"
                          >
                            consultar oferta
                          </button>

                          <button
                            type="button"
                            onClick={() => handleOpenConsultarRota(item)}
                            className="text-[11px] font-bold text-[#B300FF] hover:underline bg-transparent border-none cursor-pointer p-0"
                          >
                            consultar rota
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

      {/* MOBILE TAB BAR */}
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
          <button onClick={handleSandboxLogout} className="flex flex-col items-center justify-center text-red-500 min-w-[70px] gap-1">
            <LogOut className="w-6 h-6" strokeWidth={1.5} />
            <span className="text-[10px] font-medium">Sair</span>
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