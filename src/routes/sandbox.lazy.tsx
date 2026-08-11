/**
 * @fileoverview Sandbox de Simulação de Jornadas (Topo de Funil / sbX - Stateless)
 * @path src/routes/sandbox.tsx
 * @description Painel de controle, debug e testes integrado com a API de Ofertas, Sessão
 * corporativa e Gateways de Borda.
 *
 * [MUDANÇAS CRÍTICAS DA ARQUITETURA STATELESS]:
 * 1. Fim da rota `sbx-user`: O perfil cadastral completo do usuário é obtido
 *    e hidratado em uma única passada durante o OAuth Exchange (`sbx-auth-exchange`),
 *    sendo entregue de bandeja no payload de login.
 * 2. Hidratação Local Segura: O perfil é armazenado em `sessionStorage` e
 *    recuperado instantaneamente na montagem, eliminando roundtrips desnecessários.
 * 3. Zero Banco de Dados: Toda a validação de acesso depende exclusivamente do
 *    JWT assinado criptografamente em memória.
 * 4. Idle & Session Integrity Guard: Monitoramento de foco/visibilidade da aba para
 *    expurgar tokens expirados após longos períodos de inatividade.
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
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
  Info,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { fetchEventDetails } from "@/services/event";
import { fetchOfferDetails, fetchOffersQuery } from "@/services/offer";
import { getDefaultSbxEnvironment } from "@/services/session";
import { WalletLogo } from "@/components/brand/WalletLogo";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { callOrchestratorConfigs } from "@/features/financial-hub/core/services/gateway";
import { ICON_MAP } from "@/features/financial-hub/components/shared/icons-map";

// Novos Componentes Compartilhados (Fábrica de Painéis)
import { PanelProduct } from "@/features/financial-hub/components/shared/renderes/PanelProduct";
import { PanelConsents } from "@/features/financial-hub/components/shared/renderes/PanelConsents";
import { PanelFAQ } from "@/features/financial-hub/components/shared/renderes/PanelFAQ";
import { PanelFooter } from "@/features/financial-hub/components/shared/renderes/PanelFooter";

/**
 * [CONTRATO DE PERFIL DO BFF]
 */
export interface BFFUserProfile {
  entity_id: string;
  entity_type: string;
  name: string;
  document: string;
  document_rg: string;
  email: string;
  phone: string;
  birth_date: string;
  gender: string;
  login: string;
  mothers_name: string;
  address: {
    street: string;
    number: string;
    complement: string;
    neighborhood: string;
    city: string;
    state: string;
    zip_code: string;
    country: string;
  } | null;
  metadata?: Record<string, any>;
}

/**
 * =========================================================================
 * [HELPERS]: Validação e Formatação de Documentos (CPF / CNPJ)
 * =========================================================================
 */
const isCPF = (str: string) => /^\d{11}$/.test(str.replace(/\D/g, ""));
const isCNPJ = (str: string) => /^\d{14}$/.test(str.replace(/\D/g, ""));
const formatCPF = (val: string) =>
  val
    .replace(/\D/g, "")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})/, "$1-$2")
    .slice(0, 14);
const formatCNPJ = (val: string) =>
  val
    .replace(/\D/g, "")
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})/, "$1-$2")
    .slice(0, 18);

const ENV_URLS = {
  production: "https://api.s4bdigital.net",
  staging: "https://stgapi.s4bdigital.net",
};

/**
 * =========================================================================
 * STEP 1 & 2: OAUTH2 & EXCHANGE (Motor de Autenticação Sandbox)
 * =========================================================================
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
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: details.toString(),
  });

  const rawResponse = await sbxLoginResponse.text();
  if (!sbxLoginResponse.ok) {
    throw new Error(`Credenciais inválidas ou erro na API: ${sbxLoginResponse.status}`);
  }
  const sbxData = JSON.parse(rawResponse);

  return {
    success: true,
    access_token: sbxData.access_token,
    userId: sbxData.userId,
    raw_oauth: sbxData,
  };
};

const trocarTokenNaEdgeFunction = async (rawTokenPayload: any, environment: "staging" | "production") => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  const sbxAccessToken = rawTokenPayload?.access_token || "";

  if (!sbxAccessToken) {
    throw new Error("BAD_REQUEST: Access token ausente no payload OAuth.");
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/sbx-auth-exchange`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${supabaseAnonKey}`,
      "x-access-token": sbxAccessToken, // 👈 Token da Superbid limpo no Header de Borda
    },
    body: JSON.stringify({
      environment: environment,
      // Nenhum token opaco trafega mais dentro do JSON do body!
    }),
  });

  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.message || `Erro HTTP no exchange: ${res.status}`);
  }
  return data;
};

/**
 * =========================================================================
 * COMPONENTE PRINCIPAL: SandboxPage
 * =========================================================================
 */
function SandboxPage() {
  const navigate = useNavigate();
  const { sessionToken, logout, setSession } = useFinancialAuth();

  const [isScrolled, setIsScrolled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const [customOfferId, setCustomOfferId] = useState("4755461");
  const [tempOfferId, setTempOfferId] = useState("4755461");
  const [apiOfferData, setApiOfferData] = useState<any>(null);
  const [userData, setUserData] = useState<BFFUserProfile | null>(null);
  const [vitrineOffers, setVitrineOffers] = useState<Record<string, any>>({});
  const [cardFotoIndex, setCardFotoIndex] = useState<Record<string, number>>({});
  const [imageErrors, setImageErrors] = useState<Record<string, boolean>>({});

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedOfferPayload, setSelectedOfferPayload] = useState<any>(null);
  const [selectedEventPayload, setSelectedEventPayload] = useState<any>(null);
  const [drawerFotoAtiva, setDrawerFotoAtiva] = useState(0);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerOfferId, setDrawerOfferId] = useState("");

  const [isRouteDrawerOpen, setIsRouteDrawerOpen] = useState(false);
  const [routeConfigData, setRouteConfigData] = useState<any>(null);
  const [routeDrawerLoading, setRouteDrawerLoading] = useState(false);
  const [routeDrawerTitle, setRouteDrawerTitle] = useState("");

  const [isErrorDrawerOpen, setIsErrorDrawerOpen] = useState(false);
  const [errorDrawerConfig, setErrorDrawerConfig] = useState<any>(null);
  const [simulationResult, setSimulationResult] = useState<any>(null);
  const [simulating, setSimulating] = useState(false);

  /**
   * =========================================================================
   * [IDLE & SESSION INTEGRITY GUARD]: Validação de Expiração por Inatividade
   * =========================================================================
   * Intercepta períodos prolongados de inatividade (ex: 10h com a aba aberta)
   * decodificando o JWT e forçando o redirecionamento imediato para o login
   * caso a sessão tenha perecido.
   */
  const handleExpiredSession = () => {
    sessionStorage.removeItem("access_token_sbx");
    sessionStorage.removeItem("user_profile");
    sessionStorage.removeItem("session_token");

    // Reseta o state para forçar o render do formulário interno na mesma página
    setAccessTokenSBX("");
    setUserData(null);
    setApiOfferData(null);
    setVitrineOffers({});

    // Limpa o token do contexto global para sumir do cabeçalho
    if (logout) {
      logout({ purgeEnv: true } as any);
    }
  };

  const validateSessionBeforeAction = () => {
    const token = sessionStorage.getItem("access_token_sbx") || sessionToken;
    if (!token) {
      handleExpiredSession();
      return false;
    }

    try {
      const payloadBase64 = token.split(".")[1];
      if (payloadBase64) {
        const payloadJson = JSON.parse(atob(payloadBase64));
        if (payloadJson.exp) {
          const expirationTime = payloadJson.exp * 1000;
          if (Date.now() >= expirationTime) {
            handleExpiredSession();
            return false;
          }
        }
      }
    } catch (e) {
      // Ignora erro de parsing em tokens opacos puros, delegando para a borda
    }

    return true;
  };

  /**
   * Helper unificado para checar se o erro retornado indica expiração/falha de sessão
   */
  const checkAndHandleSessionError = (errMessage: string, errorCode?: string) => {
    const msg = (errMessage || "").toLowerCase();
    const code = (errorCode || "").toUpperCase();

    if (
      code === "SESSION_EXPIRED" ||
      code === "UNAUTHORIZED" ||
      code === "TOKEN_EXPIRED" ||
      code === "SBX_LOADER_FAIL_USER" ||
      msg.includes("401") ||
      msg.includes("403") ||
      msg.includes("unauthorized") ||
      msg.includes("session") ||
      msg.includes("expired") ||
      msg.includes("upstream_user_error") ||
      msg.includes("falha de autenticação")
    ) {
      handleExpiredSession();
      return true;
    }
    return false;
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        validateSessionBeforeAction();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [sessionToken]);

  useEffect(() => {
    const handlePageShow = (event: PageTransitionEvent) => {
      if (event.persisted || window.performance?.navigation?.type === 2) {
        setLoadingAction(null);
        validateSessionBeforeAction();
      }
    };
    window.addEventListener("pageshow", handlePageShow);
    const handleFocus = () => {
      setLoadingAction(null);
      validateSessionBeforeAction();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("focus", handleFocus);
    };
  }, [sessionToken]);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
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

  useEffect(() => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("sandbox_active_env", ambienteAtivo);
    }
  }, [ambienteAtivo]);

  const [accessTokenSBX, setAccessTokenSBX] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return sessionStorage.getItem("access_token_sbx") || "";
    }
    return "";
  });

  /**
   * [HIDRATAÇÃO LOCAL DE SESSÃO E PERFIL]
   * Lê o token bruto e o perfil unificado direto do sessionStorage ao montar,
   * fazendo fallback automático caso a sessão global esteja ativa.
   */
  useEffect(() => {
    if (typeof window !== "undefined") {
      const storedToken = sessionStorage.getItem("access_token_sbx");
      if (storedToken && !accessTokenSBX) {
        setAccessTokenSBX(storedToken);
      } else if (!storedToken && sessionToken) {
        sessionStorage.setItem("access_token_sbx", sessionToken);
        setAccessTokenSBX(sessionToken);
      }

      const storedProfile = sessionStorage.getItem("user_profile");
      if (storedProfile && !userData) {
        try {
          setUserData(JSON.parse(storedProfile));
        } catch (e) {
          console.error("Erro ao parsear perfil armazenado:", e);
        }
      }
    }
  }, [sessionToken]);

  const [tipoPessoa, setTipoPessoa] = useState<"F" | "J">("F");
  const [loginCred, setLoginCred] = useState("");
  const [passwordCred, setPasswordCred] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [generalError, setGeneralError] = useState("");

  const FLOW_OFFERS = [
    {
      key: "Cartão",
      label: "Cartão em até 18x",
      title: "Parcelamento com Cartão",
      product_id: 8,
      flowKey: "Cartão",
      disabled: false,
      variant: "bg-white text-[#B300FF] border border-[#B300FF]/30 hover:bg-[#B300FF]/5 font-light text-xs",
    },
    {
      key: "Carros",
      label: "Financiar em até 60x",
      title: "Financiamento de Carros",
      product_id: 2,
      flowKey: "Carros",
      disabled: false,
      variant: "bg-white text-[#B300FF] border border-[#B300FF]/30 hover:bg-[#B300FF]/5 font-light text-xs",
    },
    {
      key: "Caminhões",
      label: "Financiar em até 48x",
      title: "Financiamento de Caminhões",
      product_id: 5,
      flowKey: "Caminhões",
      disabled: false,
      variant: "bg-white text-[#B300FF] border border-[#B300FF]/30 hover:bg-[#B300FF]/5 font-light text-xs",
    },
    {
      key: "Imóveis",
      label: "Financiar em até 240x",
      title: "Financiamento de Imóveis",
      product_id: 1,
      flowKey: "Imóveis",
      disabled: true,
      variant: "bg-slate-50 text-slate-400 border border-slate-200 cursor-not-allowed opacity-60 font-light text-xs",
    },
  ];

  // O Sandbox agora é 100% isolado. Ele só olha para o token bruto guardado no sessionStorage.
  const activeToken =
    accessTokenSBX || (typeof window !== "undefined" ? sessionStorage.getItem("access_token_sbx") : null);

  /**
   * [HIDRATAÇÃO DE PRATELEIRA DE OFERTAS]
   * Coleta dados dinâmicos de lotes e prateleiras em memória.
   */
  useEffect(() => {
    const loadSandboxData = async () => {
      const tokenToUse = activeToken || sessionToken;
      if (!tokenToUse) return;

      if (!validateSessionBeforeAction()) return;

      setLoading(true);
      setError(null);

      try {
        try {
          const offer = await fetchOfferDetails(customOfferId);
          setApiOfferData(offer);
        } catch (e) {
          console.error("Erro na inspeção principal:", e);
        }

        const promises = FLOW_OFFERS.map(async (item) => {
          if (item.disabled || !item.product_id) return { key: item.key, data: null };

          try {
            const data = await fetchOffersQuery({
              productId: item.product_id,
              sort: "relevancia",
              pageNumber: 1,
              pageSize: 1,
            });

            const firstOffer = data?.offers?.[0] || null;
            return { key: item.key, data: firstOffer };
          } catch (err: any) {
            console.error(`Falha na query de ${item.key}:`, err);
            return { key: item.key, data: null };
          }
        });

        const results = await Promise.all(promises);
        const newVitrine: Record<string, any> = {};

        results.forEach((res) => {
          if (res && res.data) {
            newVitrine[res.key] = res.data;
          }
        });

        setVitrineOffers(newVitrine);
      } catch (err: any) {
        if (!checkAndHandleSessionError(err.message)) {
          setError(err.message || "Erro ao carregar dados do sandbox.");
        }
      } finally {
        setLoading(false);
      }
    };

    loadSandboxData();
  }, [activeToken, sessionToken, customOfferId, ambienteAtivo]);

  const handleInspectOffer = async () => {
    if (!validateSessionBeforeAction()) return;

    if (!activeToken) {
      alert("Autentique-se primeiro no formulário abaixo.");
      return;
    }

    setCustomOfferId(tempOfferId);
    setLoading(true);
    setError(null);
    setApiOfferData(null);

    try {
      const offer = await fetchOfferDetails(tempOfferId);
      setApiOfferData(offer);
    } catch (err: any) {
      if (!checkAndHandleSessionError(err.message)) {
        setError(err.message || `Oferta não encontrada (Lote: ${tempOfferId}).`);
      }
      setApiOfferData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenConsultarOferta = async (targetOfferId: string) => {
    if (!validateSessionBeforeAction()) return;

    if (!activeToken) {
      alert("Faça o login primeiro!");
      return;
    }
    setDrawerOfferId(targetOfferId);
    setIsDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerFotoAtiva(0);
    setSelectedOfferPayload(null);
    setSelectedEventPayload(null); // 👈 Reseta o evento anterior

    try {
      // 1. Busca os detalhes da oferta primeiro
      const offerData = await fetchOfferDetails(targetOfferId);
      setSelectedOfferPayload(offerData);

      // 2. Se a oferta possuir o event_id mapeado, busca os detalhes do evento em paralelo/sequência
      const eventId = offerData?.event?.event_id;
      if (eventId) {
        const eventData = await fetchEventDetails(eventId);
        setSelectedEventPayload(eventData);
      }
    } catch (err: any) {
      console.error("[DRAWER_FETCH_ERROR]:", err);
      checkAndHandleSessionError(err.message);
    } finally {
      setDrawerLoading(false);
    }
  };

  const handleOpenConsultarRota = async (item: any) => {
    if (!item) return;

    if (!validateSessionBeforeAction()) return;

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
      checkAndHandleSessionError(err.message);
    } finally {
      setRouteDrawerLoading(false);
    }
  };

  const handleOpenSimularErro = (type: "offer" | "direct", item?: any) => {
    if (!validateSessionBeforeAction()) return;

    setSimulationResult(null);
    setErrorDrawerConfig({
      type,
      title:
        type === "offer"
          ? `Simulação de Erros: ${item?.title || "Oferta"}`
          : `Simulação de Erros: ${item?.title || "Acesso Direto"}`,
      item,
    });
    setIsErrorDrawerOpen(true);
  };

  const executeErrorSimulation = async (method: "form" | "fetch", errorTarget: "offer" | "token" | "product") => {
    if (!validateSessionBeforeAction()) return;

    setSimulating(true);
    setSimulationResult(null);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    const gatewayUrl = `${supabaseUrl}/functions/v1/financial-gateway-gate`;

    const invalidOfferId = errorTarget === "offer" ? "9999" : errorDrawerConfig.item?.offerId || "4846218";
    const invalidToken =
      errorTarget === "token"
        ? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid_token_payload_test.signature"
        : accessTokenSBX || sessionStorage.getItem("access_token_sbx");
    const invalidProductId = errorTarget === "product" ? "999" : errorDrawerConfig.item?.product_id || "8";

    const payload = {
      environment: ambienteAtivo,
      auth_token: invalidToken,
      offer_id: errorDrawerConfig.type === "offer" ? invalidOfferId : undefined,
      product_id: errorDrawerConfig.type === "direct" ? invalidProductId : errorDrawerConfig.item?.product_id || "",
      return_uri: window.location.origin + window.location.pathname,
      utm_source: "sandbox_error_simulation",
      utm_medium: "debug",
      utm_campaign: `error_${errorTarget}_${method}`,
    };

    if (method === "fetch") {
      try {
        const { auth_token, ...bodyPayload } = payload;

        const res = await fetch(gatewayUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            "x-access-token": String(auth_token),
          },
          body: JSON.stringify(bodyPayload),
        });

        const data = await res.json();
        setSimulationResult({
          status: res.status,
          ok: res.ok,
          data,
        });
      } catch (err: any) {
        setSimulationResult({
          status: 500,
          ok: false,
          data: { error: err.message || "Erro de rede ao comunicar com a borda." },
        });
      } finally {
        setSimulating(false);
      }
    } else {
      const form = document.createElement("form");
      form.method = "POST";
      form.action = gatewayUrl;

      Object.entries(payload).forEach(([key, value]) => {
        if (value !== undefined) {
          const input = document.createElement("input");
          input.type = "hidden";
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
   * [LOGIN & EXCHANGE UNIFICADO]
   * Executa a autenticação na Superbid e o exchange na Edge Function unificada,
   * capturando tanto o token JWT quanto o perfil unificado retornado no payload.
   */
  const handleSandboxLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError("");
    setPasswordError("");
    setGeneralError("");
    setError(null);

    let hasError = false;
    if (!loginCred.trim()) {
      setLoginError(
        tipoPessoa === "F" ? "O e-mail ou login devem ser informados" : "O CNPJ ou login devem ser informados",
      );
      hasError = true;
    }
    if (!passwordCred.trim()) {
      setPasswordError("A senha deve ser informada");
      hasError = true;
    }

    const cleanLogin = loginCred.replace(/\D/g, "");
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
        const exchangeResponse = await trocarTokenNaEdgeFunction(loginResponse.raw_oauth, ambienteAtivo);

        if (exchangeResponse?.success && exchangeResponse.session_token) {
          sessionStorage.setItem("access_token_sbx", loginResponse.access_token);
          setAccessTokenSBX(loginResponse.access_token);

          if (exchangeResponse.user_profile) {
            sessionStorage.setItem("user_profile", JSON.stringify(exchangeResponse.user_profile));
            setUserData(exchangeResponse.user_profile);
          }

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
   * [LOGOUT SEGURO]
   * Realiza a purificação completa do estado local e remoção do storage.
   */
  const handleSandboxLogout = () => {
    setLoadingAction("logout");

    setTimeout(() => {
      setAccessTokenSBX("");
      sessionStorage.removeItem("access_token_sbx");
      sessionStorage.removeItem("user_profile");
      setError(null);
      setGeneralError("");

      setUserData(null);
      setApiOfferData(null);
      setVitrineOffers({});

      if (logout) logout({ purgeEnv: true } as any);

      setLoadingAction(null);
    }, 50);
  };

  const handleSimulateOfferForm = (flowKey: string, offerId: string, productId: string, isDisabled?: boolean) => {
    if (isDisabled) return;

    if (!validateSessionBeforeAction()) return;

    const tokenToUse: string | null = accessTokenSBX || activeToken;

    if (!tokenToUse) {
      alert(`Token de autenticação não encontrado. Faça o login primeiro.`);
      return;
    }

    setLoadingAction(`${flowKey}_form`);
    setError(null);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    const gatewayUrl = `${supabaseUrl}/functions/v1/financial-gateway-gate`;

    const form = document.createElement("form");
    form.method = "POST";
    form.action = gatewayUrl;

    const searchPayload: Record<string, string> = {
      environment: ambienteAtivo,
      auth_token: tokenToUse,
      offer_id: String(offerId),
      product_id: String(productId || ""),
      return_uri: window.location.origin + window.location.pathname,
      utm_source: "sandbox",
      utm_medium: "referral",
      utm_campaign: `flow_${flowKey.toLowerCase()}_form`,
    };

    Object.entries(searchPayload).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
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

  const handleSimulateOfferAjax = async (flowKey: string, offerId: string, productId: string, isDisabled?: boolean) => {
    if (isDisabled) return;

    if (!validateSessionBeforeAction()) return;

    const tokenToUse: string | null = accessTokenSBX || activeToken;

    if (!tokenToUse) {
      alert(`Token de autenticação não encontrado. Faça o login primeiro.`);
      return;
    }

    setLoadingAction(`${flowKey}_ajax`);
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
      const gatewayUrl = `${supabaseUrl}/functions/v1/financial-gateway-gate`;

      const res = await fetch(gatewayUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-access-token": tokenToUse,
        },
        body: JSON.stringify({
          environment: ambienteAtivo,
          offer_id: String(offerId),
          product_id: String(productId || ""),
          return_uri: window.location.origin + window.location.pathname,
          utm_source: "sandbox",
          utm_medium: "referral",
          utm_campaign: "flow_sbxpay_ajax",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        // Verifica se é erro de sessão expirada ou token inválido para redirecionar automático
        if (checkAndHandleSessionError(data.message || "", data.code)) {
          return;
        }
        throw new Error(data.message || `Erro no gateway AJAX: ${res.status}`);
      }

      if (data.session_token) {
        sessionStorage.setItem("session_token", data.session_token);
      }

      if (data.redirect_url) {
        window.open(data.redirect_url, "_blank");
      } else {
        throw new Error("URL de redirecionamento ausente na resposta.");
      }
    } catch (err: any) {
      console.error("[AJAX_GATEWAY_ERROR]:", err);
      if (!checkAndHandleSessionError(err.message)) {
        const errorMsg = err.message || "Erro desconhecido";
        setError(`Erro no disparo AJAX: ${errorMsg}`);
      }
    } finally {
      setLoadingAction(null);
    }
  };

  /**
   * =========================================================================
   * [GATEWAY TRANSPORT]: handleSbxPayGatewayForm
   * =========================================================================
   * Responsável por disparar o acesso à Landing Wallet (sbX Pay) através de
   * uma submissão tradicional de formulário HTML (POST nativo).
   *
   * [FLUXO TÉCNICO]:
   * 1. Validação de Credencial: Assegura o uso primário do token bruto da
   *    Superbid (`accessTokenSBX`) para a validação inicial na borda.
   * 2. Injeção de Payload: Cria campos ocultos (`inputs hidden`) contendo o token,
   *    o ambiente ativo, o alvo de redirecionamento (`target_url: "/sbxpay"`)
   *    e metadados de rastreio (UTMs).
   * 3. Navegação: Submete o formulário, provocando um redirecionamento de
   *    página inteira (Full Page Redirection) para a borda.
   */
  const handleSbxPayGatewayForm = () => {
    if (!validateSessionBeforeAction()) return;

    // 🔒 CORREÇÃO: Busca estritamente o token bruto (SBX). Ignora o JWT (activeToken).
    const tokenToUse: string | null =
      accessTokenSBX || (typeof window !== "undefined" ? sessionStorage.getItem("access_token_sbx") : null);

    if (!tokenToUse) {
      alert("Token bruto da Superbid não encontrado. Faça o login primeiro.");
      handleExpiredSession();
      return;
    }

    setLoadingAction("sbxpay_form");
    setError(null);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    const gatewayUrl = `${supabaseUrl}/functions/v1/financial-gateway-gate`;

    const form = document.createElement("form");
    form.method = "POST";
    form.action = gatewayUrl;

    const searchPayload: Record<string, string> = {
      environment: ambienteAtivo,
      auth_token: tokenToUse, // Correto para Form: enviado no payload para a borda ler
      target_url: "/sbxpay",
      return_uri: window.location.origin + window.location.pathname,
      utm_source: "sandbox",
      utm_medium: "referral",
      utm_campaign: "flow_sbxpay_form",
    };

    Object.entries(searchPayload).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
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
   * [GATEWAY TRANSPORT]: handleSbxPayGatewayAjax
   * =========================================================================
   * Responsável por disparar o acesso à Landing Wallet (sbX Pay) de forma
   * assíncrona utilizando requisição AJAX (`fetch`).
   *
   * [FLUXO TÉCNICO]:
   * 1. Validação de Credencial: Coleta o token bruto da Superbid (`accessTokenSBX`).
   * 2. Requisição Fetch: Envia um JSON estruturado para o Edge Gateway de borda.
   * 3. Tratamento de Resposta: Processa o JSON retornado pela borda, armazena
   *    o novo token stateless gerado e abre a URL de redirecionamento em uma
   *    nova aba (`window.open`), mantendo o painel do Sandbox intacto.
   */
  const handleSbxPayGatewayAjax = async () => {
    if (!validateSessionBeforeAction()) return;

    // 🔒 CORREÇÃO: Busca estritamente o token bruto (SBX). Ignora o JWT (activeToken).
    const tokenToUse: string | null =
      accessTokenSBX || (typeof window !== "undefined" ? sessionStorage.getItem("access_token_sbx") : null);

    if (!tokenToUse) {
      alert("Token bruto da Superbid não encontrado. Faça o login primeiro.");
      handleExpiredSession();
      return;
    }

    setLoadingAction("sbxpay_ajax");
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
      const gatewayUrl = `${supabaseUrl}/functions/v1/financial-gateway-gate`;

      const res = await fetch(gatewayUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-access-token": tokenToUse, // Correto para AJAX: token vai no header
        },
        body: JSON.stringify({
          environment: ambienteAtivo,
          target_url: "/sbxpay",
          return_uri: window.location.origin + window.location.pathname,
          utm_source: "sandbox",
          utm_medium: "referral",
          utm_campaign: "flow_sbxpay_ajax",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (checkAndHandleSessionError(data.message || "", data.code)) {
          return;
        }
        throw new Error(data.message || `Erro no gateway AJAX: ${res.status}`);
      }

      if (data.session_token) {
        sessionStorage.setItem("session_token", data.session_token);
      }

      if (data.redirect_url) {
        window.open(data.redirect_url, "_blank");
      } else {
        throw new Error("URL de redirecionamento ausente na resposta.");
      }
    } catch (err: any) {
      console.error("[AJAX_GATEWAY_ERROR]:", err);
      if (!checkAndHandleSessionError(err.message)) {
        const errorMsg = err.message || "Erro desconhecido";
        setError(`Erro no disparo AJAX: ${errorMsg}`);
      }
    } finally {
      setLoadingAction(null);
    }
  };

  /**
   * =========================================================================
   * [GATEWAY TRANSPORT]: handleDirectGatewayForm
   * =========================================================================
   * Executa a submissão tradicional via formulário HTML (POST) para acessar
   * produtos financeiros estruturais específicos (ex: Seguros Auto, Car Equity)
   * mapeados por ID de produto (`product_id`).
   *
   * [FLUXO TÉCNICO]:
   * 1. Validação de Credencial: Injeta o token bruto da Superbid (`accessTokenSBX`).
   * 2. Parametrização: Serializa o `product_id` junto com os metadados contextuais.
   * 3. Navegação: Realiza a submissão do DOM form provocando redirecionamento total.
   */
  const handleDirectGatewayForm = (flowKey: string, productId: string) => {
    if (!validateSessionBeforeAction()) return;

    // 🔒 CORREÇÃO: Busca estritamente o token bruto (SBX). Ignora o JWT (activeToken).
    const tokenToUse: string | null =
      accessTokenSBX || (typeof window !== "undefined" ? sessionStorage.getItem("access_token_sbx") : null);

    if (!tokenToUse) {
      alert("Token bruto da Superbid não encontrado. Faça o login primeiro.");
      handleExpiredSession();
      return;
    }

    setLoadingAction(`${flowKey}_form`);
    setError(null);

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    const gatewayUrl = `${supabaseUrl}/functions/v1/financial-gateway-gate`;

    const form = document.createElement("form");
    form.method = "POST";
    form.action = gatewayUrl;

    const searchPayload: Record<string, string> = {
      environment: ambienteAtivo,
      auth_token: tokenToUse, // Correto para Form: enviado no payload para a borda ler
      product_id: String(productId),
      return_uri: window.location.origin + window.location.pathname,
      utm_source: "sandbox",
      utm_medium: "referral",
      utm_campaign: `flow_${flowKey.toLowerCase()}_form`,
    };

    Object.entries(searchPayload).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
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
   * [GATEWAY TRANSPORT]: handleDirectGatewayAjax
   * =========================================================================
   * Executa uma requisição assíncrona AJAX (`fetch`) para acessar produtos
   * financeiros estruturais específicos com base no `product_id`.
   *
   * [FLUXO TÉCNICO]:
   * 1. Validação de Credencial: Envia o token bruto da Superbid (`accessTokenSBX`).
   * 2. Comunicação Assíncrona: Posta o JSON estruturado para a borda do gateway.
   * 3. Processamento de Retorno: Trata a resposta JSON, armazena o token de sessão
   *    atualizado e abre a URL de destino em uma nova aba via `window.open`.
   */
  const handleDirectGatewayAjax = async (flowKey: string, productId: string) => {
    if (!validateSessionBeforeAction()) return;

    // 🔒 CORREÇÃO: Busca estritamente o token bruto (SBX). Ignora o JWT (activeToken).
    const tokenToUse: string | null =
      accessTokenSBX || (typeof window !== "undefined" ? sessionStorage.getItem("access_token_sbx") : null);

    if (!tokenToUse) {
      alert("Token bruto da Superbid não encontrado. Faça o login primeiro.");
      handleExpiredSession();
      return;
    }

    setLoadingAction(`${flowKey}_ajax`);
    setError(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
      const gatewayUrl = `${supabaseUrl}/functions/v1/financial-gateway-gate`;

      const res = await fetch(gatewayUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "x-access-token": tokenToUse, // Correto para AJAX: token vai no header
        },
        body: JSON.stringify({
          environment: ambienteAtivo,
          product_id: String(productId),
          return_uri: window.location.origin + window.location.pathname,
          utm_source: "sandbox",
          utm_medium: "referral",
          utm_campaign: `flow_${flowKey.toLowerCase()}_ajax`,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        if (checkAndHandleSessionError(data.message || "", data.code)) {
          return;
        }
        throw new Error(data.message || `Erro no gateway AJAX: ${res.status}`);
      }

      if (data.session_token) {
        sessionStorage.setItem("session_token", data.session_token);
      }

      if (data.redirect_url) {
        window.open(data.redirect_url, "_blank");
      } else {
        throw new Error("URL de redirecionamento ausente na resposta.");
      }
    } catch (err: any) {
      console.error("[AJAX_GATEWAY_ERROR]:", err);
      if (!checkAndHandleSessionError(err.message)) {
        const errorMsg = err.message || "Erro desconhecido";
        setError(`Erro no disparo AJAX: ${errorMsg}`);
      }
    } finally {
      setLoadingAction(null);
    }
  };

  const handleNextPhoto = (cardKey: string, totalPhotos: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCardFotoIndex((prev) => ({ ...prev, [cardKey]: ((prev[cardKey] || 0) + 1) % totalPhotos }));
  };

  const handlePrevPhoto = (cardKey: string, totalPhotos: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCardFotoIndex((prev) => ({ ...prev, [cardKey]: ((prev[cardKey] || 0) - 1 + totalPhotos) % totalPhotos }));
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

  const ghostBtn =
    "border-2 border-purple-600 text-purple-600 hover:bg-purple-600 hover:text-white transition-all rounded-lg px-4 py-2 text-xs font-bold transform hover:scale-[1.02]";
  const loginLabelText = tipoPessoa === "F" ? "E-mail, login ou CPF" : "CNPJ ou login";

  return (
    <div className="bg-white text-slate-900 antialiased font-sans overflow-x-hidden relative min-h-screen pb-24 md:pb-10">
      <style>{`
        .glass { background: rgba(255, 255, 255, 0.85); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); }
      `}</style>

      {/* HEADER INSTITUCIONAL */}
      <header
        className={`fixed top-0 left-0 w-full z-50 glass border-b border-gray-100 transition-all duration-300 ${isScrolled ? "shadow-sm py-2" : "py-3"}`}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <a href="#" className="flex items-center">
            <WalletLogo size="md" withTagline />
          </a>

          <div className="hidden md:flex flex-col items-start">
            <div className="flex items-center space-x-3 text-[13px] font-semibold text-slate-600">
              <span className="text-purple-600 font-bold">Painel de Sandbox</span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-500 uppercase text-[11px] font-bold tracking-wide">
                Ambiente: {ambienteAtivo}
              </span>
            </div>
            <div className="flex flex-col font-mono text-[10px] text-slate-500 mt-1 space-y-0.5">
              <span>
                <b>access_token_sbx:</b> {formatTokenSnippet(accessTokenSBX)}
              </span>
              <span>
                <b>session_token:</b> {formatTokenSnippet(sessionToken)}
              </span>
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
          <div className="bg-red-50 p-4 text-red-700 rounded-xl border border-red-200 text-sm font-medium">{error}</div>
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
                      ambienteAtivo === "staging"
                        ? "bg-white text-[#B400FF] border-[#B400FF] shadow-sm"
                        : "text-gray-500 border-transparent hover:text-gray-700"
                    }`}
                  >
                    STAGE
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmbienteAtivo("production")}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-full transition-all border ${
                      ambienteAtivo === "production"
                        ? "bg-white text-[#B400FF] border-[#B400FF] shadow-sm"
                        : "text-gray-500 border-transparent hover:text-gray-700"
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
                    onClick={() => {
                      setTipoPessoa("F");
                      setLoginCred("");
                      setLoginError("");
                      setPasswordError("");
                    }}
                    className={`flex-1 text-sm font-semibold py-3 transition-all border-b-2 outline-none ${tipoPessoa === "F" ? "text-gray-900 border-gray-900" : "text-gray-400 border-transparent"}`}
                  >
                    Pessoa Física
                  </button>
                  <button
                    type="button"
                    disabled={isLoggingIn}
                    onClick={() => {
                      setTipoPessoa("J");
                      setLoginCred("");
                      setLoginError("");
                      setPasswordError("");
                    }}
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
                      const isNumeric = /^\d+$/.test(rawValue.replace(/\D/g, ""));
                      setLoginCred(
                        isNumeric ? (tipoPessoa === "F" ? formatCPF(rawValue) : formatCNPJ(rawValue)) : rawValue,
                      );
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
                      onChange={(e) => {
                        setPasswordCred(e.target.value);
                        if (passwordError) setPasswordError("");
                      }}
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
                  {passwordError && (
                    <span className="text-[#C13535] text-[11px] pl-5 font-medium mt-1">{passwordError}</span>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isLoggingIn}
                  className={`w-full h-12 bg-[#B400FF] text-white font-semibold rounded-full transition-all duration-300 flex items-center justify-center gap-2 ${isLoggingIn ? "opacity-70 cursor-wait" : "hover:bg-[#9a00db]"}`}
                >
                  {isLoggingIn ? (
                    <>
                      <Loader2 className="animate-spin" size={20} /> Processando...
                    </>
                  ) : (
                    "Entrar"
                  )}
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
                  <CardDescription className="text-xs">
                    Edge Function autenticada com token interno que chama /offer na sbX.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-xs">
                  <div className="flex gap-2">
                    <Input
                      value={tempOfferId}
                      onChange={(e) => setTempOfferId(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleInspectOffer();
                      }}
                      className="rounded-xl font-mono text-xs"
                    />
                    <Button
                      onClick={handleInspectOffer}
                      disabled={loading}
                      size="sm"
                      className="rounded-xl bg-[#B300FF] text-white hover:bg-[#9f00e6]"
                    >
                      {loading ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : "Buscar"}
                    </Button>
                    <Button
                      onClick={() => handleOpenConsultarOferta(customOfferId)}
                      variant="outline"
                      size="sm"
                      className="rounded-xl text-[#B300FF] border-[#B300FF]/30 hover:bg-[#B300FF]/5"
                    >
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
                  ) : apiOfferData ? (
                    (() => {
                      const rawPhotos = apiOfferData?.offer?.photos || [];
                      const sortedPhotos = [...rawPhotos]
                        .sort((a: any, b: any) => {
                          if (a.highlight && !b.highlight) return -1;
                          if (!a.highlight && b.highlight) return 1;
                          return 0;
                        })
                        .map((p: any) => p.link);

                      const currentCardIndex = cardFotoIndex["inspection"] || 0;
                      const activePhotoUrl =
                        sortedPhotos.length > 0 ? sortedPhotos[currentCardIndex % sortedPhotos.length] : null;

                      const hasPhotoError = imageErrors["inspection"] || !activePhotoUrl;

                      const catName =
                        apiOfferData?.offer?.category_name ||
                        apiOfferData?.offer?.category ||
                        "Categoria não informada";
                      const formattedValue = apiOfferData?.offer?.offer_value
                        ? `R$ ${apiOfferData.offer.offer_value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                        : "Valor sob consulta";

                      const eventId = apiOfferData?.event?.event_id || "";
                      const eventDesc =
                        apiOfferData?.event?.event_description || apiOfferData?.offer?.event_description || "";

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
                                onError={() => setImageErrors((prev) => ({ ...prev, ["inspection"]: true }))}
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
                            <p
                              className="font-bold text-sm text-foreground truncate"
                              title={apiOfferData.offer?.offer_description}
                            >
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
                    })()
                  ) : (
                    <div className="p-3 bg-muted/40 rounded-xl border text-muted-foreground text-center italic">
                      Nenhuma oferta carregada. Insira um ID válido e clique em Buscar.
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-border bg-white shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-bold flex items-center gap-2 text-[#B300FF]">
                    <UserCheck className="h-4 w-4" /> Perfil Carregado da sbX (Unificado)
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Perfil hidratado diretamente no login (Zero chamadas adicionais de rede).
                  </CardDescription>
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
                          <span className="text-muted-foreground uppercase text-[10px] block font-sans">
                            Documento:
                          </span>
                          <span className="font-semibold text-slate-800">{userData.document || "—"}</span>
                        </div>

                        <div>
                          <span className="text-muted-foreground uppercase text-[10px] block font-sans">Telefone:</span>
                          <span className="font-semibold text-slate-800">{userData.phone || "—"}</span>
                        </div>

                        <div>
                          <span className="text-muted-foreground uppercase text-[10px] block font-sans">
                            Entity ID:
                          </span>
                          <span className="font-semibold text-slate-800">{userData.entity_id || "—"}</span>
                        </div>

                        <div>
                          <span className="text-muted-foreground uppercase text-[10px] block font-sans">
                            Tipo (Entity):
                          </span>
                          <span className="font-semibold text-purple-600 uppercase">
                            {userData.entity_type === "J"
                              ? "Pessoa Jurídica (PJ)"
                              : userData.entity_type === "F"
                                ? "Pessoa Física (PF)"
                                : userData.entity_type || "—"}
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
                    <img src="/assets/home/conta.webp" alt="Conta sbXPAY" className="h-full w-full object-contain" />
                  </div>
                  <CardTitle className="text-lg">Landing Wallet sbX</CardTitle>
                  <CardDescription className="text-xs">
                    Acesso ao hub de produtos e serviços financeiros (Via Gateway).
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
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

                  <Button
                    onClick={handleSbxPayGatewayAjax}
                    disabled={loadingAction === "sbxpay_ajax"}
                    variant="outline"
                    className="w-full rounded-xl gap-2 bg-white text-[#B300FF] border border-[#B300FF]/30 hover:bg-[#B300FF]/5 font-light text-xs shadow-sm"
                  >
                    <ExternalLink className="h-4 w-4" />{" "}
                    {loadingAction === "sbxpay_ajax" ? "Processando..." : "Ir para sbxpay (fetch)"}
                  </Button>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-border hover:shadow-md transition-shadow flex flex-col justify-between bg-white">
                <CardHeader>
                  <div className="h-20 w-20 flex items-center justify-center mb-1 overflow-hidden">
                    <img
                      src="/assets/home/seguros.webp"
                      alt="Seguros de Veículos"
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <CardTitle className="text-lg">Seguros de Veículos</CardTitle>
                  <CardDescription className="text-xs">Disparo direto ao gateway (Product ID: 9)</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
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
                    <ShieldCheck className="h-4 w-4" />{" "}
                    {loadingAction === "SeguroAuto_ajax" ? "Processando..." : "Acessar Seguros Auto (fetch)"}
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
                      onClick={() => handleOpenSimularErro("direct", { product_id: "9", title: "Seguros de Veículos" })}
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
                    <img
                      src="/assets/home/carhomeequity.webp"
                      alt="Car Equity"
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <CardTitle className="text-lg">Car Equity</CardTitle>
                  <CardDescription className="text-xs">Disparo direto ao gateway (Product ID: 7)</CardDescription>
                </CardHeader>
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
                    <Play className="h-4 w-4" />{" "}
                    {loadingAction === "AutoEquity_ajax" ? "Processando..." : "Simular Car Equity (fetch)"}
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
                      onClick={() => handleOpenSimularErro("direct", { product_id: "7", title: "Car Equity" })}
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
                <p className="text-xs text-muted-foreground">
                  Chamada da Edge Function de borda do gateway com access token da sbX por form.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {FLOW_OFFERS.map((item) => {
                  const data = vitrineOffers[item.key];

                  // Extrai dinamicamente o ID da oferta que veio da query
                  const resolvedOfferId = data?.offer?.offer_id || data?.offer_id || data?.id || "";

                  const rawPhotos = data?.offer?.photos || data?.photos || [];
                  const sortedPhotos = [...rawPhotos]
                    .sort((a: any, b: any) => {
                      if (a.highlight && !b.highlight) return -1;
                      if (!a.highlight && b.highlight) return 1;
                      return 0;
                    })
                    .map((p: any) => p.link);

                  const fotoAtualIndex = cardFotoIndex[item.key] || 0;
                  const photoUrl = sortedPhotos.length > 0 ? sortedPhotos[fotoAtualIndex % sortedPhotos.length] : null;

                  const hasError = imageErrors[item.key] || !photoUrl;

                  const offerDesc = data?.offer?.offer_description || data?.offer_description || item.title;
                  const offerValueNum = data?.offer?.offer_value ?? data?.offer_value;
                  const offerVal = offerValueNum
                    ? `R$ ${Number(offerValueNum).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                    : data
                      ? "Valor indisponível"
                      : "Carregando...";
                  const sellerName = data?.seller?.trade_name || data?.seller_name || (data ? "Superbid" : "Carregando...");
                  const rawEventDate = data?.event?.event_start_date || data?.event_start_date;
                  const eventDate = rawEventDate
                    ? new Date(rawEventDate).toLocaleDateString("pt-BR")
                    : "—";

                  return (
                    <div
                      key={item.key}
                      className="rounded-2xl border border-border bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col justify-between group"
                    >
                      <div>
                        <div className="relative h-44 w-full bg-black overflow-hidden">
                          {hasError ? (
                            <div className="absolute inset-0 bg-[#B300FF] flex items-center justify-center">
                              <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center relative shadow-inner">
                                <svg
                                  className="w-9 h-9 text-white"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth="1.8"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
                                  />
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
                                  />
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
                              onError={() => setImageErrors((prev) => ({ ...prev, [item.key]: true }))}
                            />
                          )}

                          <span className="absolute bottom-2 left-2 bg-black/75 backdrop-blur-sm text-white text-[10px] font-bold px-2 py-0.5 rounded-md z-10 shadow">
                            Lote #{resolvedOfferId || "—"}
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
                            <div className="text-[10px] text-muted-foreground uppercase font-semibold">
                              Valor da Oferta:
                            </div>
                            <div className="text-lg font-extrabold text-foreground">{offerVal}</div>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 pt-0 space-y-2">
                        <Button
                          onClick={() =>
                            handleSimulateOfferForm(item.flowKey, resolvedOfferId, String(item.product_id ?? ""), item.disabled)
                          }
                          disabled={item.disabled || !resolvedOfferId || loadingAction === `${item.flowKey}_form`}
                          variant="outline"
                          className={`w-full rounded-xl shadow-sm ${item.variant}`}
                        >
                          {loadingAction === `${item.flowKey}_form` ? (
                            <span className="flex items-center gap-2">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Processando...
                            </span>
                          ) : item.disabled ? (
                            "Indisponível (Em breve)"
                          ) : (
                            `${item.label} (form)`
                          )}
                        </Button>

                        <Button
                          onClick={() =>
                            handleSimulateOfferAjax(item.flowKey, resolvedOfferId, String(item.product_id ?? ""), item.disabled)
                          }
                          disabled={item.disabled || !resolvedOfferId || loadingAction === `${item.flowKey}_ajax`}
                          variant="outline"
                          className={`w-full rounded-xl shadow-sm ${item.variant}`}
                        >
                          {loadingAction === `${item.flowKey}_ajax`
                            ? "Processando..."
                            : item.disabled
                              ? "Indisponível (Em breve)"
                              : `${item.label} (fetch)`}
                        </Button>

                        <div className="flex flex-wrap justify-center items-center gap-x-1.5 gap-y-1 text-center pt-3 border-t mt-2">
                          <button
                            type="button"
                            onClick={() => handleOpenConsultarOferta(resolvedOfferId)}
                            disabled={!resolvedOfferId}
                            className="text-[11px] font-bold text-[#B300FF] hover:underline bg-transparent border-none cursor-pointer p-0 disabled:opacity-50"
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
                            onClick={() => handleOpenSimularErro("offer", item)}
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
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
              >
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
                    <p className="font-bold text-sm mb-4 text-slate-900">
                      {selectedOfferPayload.offer.offer_description}
                    </p>

                    {drawerImagens.length > 0 && (
                      <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden mb-4">
                        <img
                          src={drawerImagens[drawerFotoAtiva]}
                          className="w-full h-full object-contain"
                          alt="Ativo"
                        />
                        {drawerImagens.length > 1 && (
                          <>
                            <button
                              onClick={() =>
                                setDrawerFotoAtiva((p) => (p - 1 + drawerImagens.length) % drawerImagens.length)
                              }
                              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 text-white p-1.5 rounded-full text-xs"
                            >
                              ‹
                            </button>
                            <button
                              onClick={() => setDrawerFotoAtiva((p) => (p + 1) % drawerImagens.length)}
                              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 text-white p-1.5 rounded-full text-xs"
                            >
                              ›
                            </button>
                            <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-0.5 rounded text-[9px] font-mono">
                              {drawerFotoAtiva + 1} / {drawerImagens.length}
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    <div className="mt-4">
                      <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">
                        Payload JSON (Oferta / Manager / Event / Seller):
                      </p>
                      <pre className="font-mono text-[10px] bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-800 whitespace-pre-wrap break-all">
                        {JSON.stringify(selectedOfferPayload, null, 2)}
                      </pre>
                    </div>
                    {/* PAYLOAD EVENTO */}
                    <div className="mt-6 pt-4 border-t border-slate-200">
                      <h2 className="text-xs font-black uppercase text-[#B300FF] mb-2">Evento / Leilão Consolidado</h2>
                      <p className="text-[11px] font-bold text-slate-500 uppercase mb-1">
                        Payload JSON (sbx-event):
                      </p>
                      {selectedEventPayload ? (
                        <pre className="font-mono text-[10px] bg-slate-50 p-3 rounded-lg border border-slate-200 text-slate-800 whitespace-pre-wrap break-all">
                          {JSON.stringify(selectedEventPayload, null, 2)}
                        </pre>
                      ) : (
                        <p className="text-xs text-slate-400 italic">Nenhum evento vinculado a esta oferta ou falha ao carregar.</p>
                      )}
                    </div>

                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-slate-400 text-xs">
                  Nenhuma informação encontrada para esta oferta.
                </div>
              )}
            </div>

            <div className="p-4 border-t border-gray-200 bg-slate-50 flex justify-end flex-shrink-0">
              <Button
                onClick={() => setIsDrawerOpen(false)}
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-xl px-5"
              >
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
              <button
                onClick={() => setIsRouteDrawerOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
              >
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
                    <p>
                      <b>ID Config:</b> {routeConfigData.id} | <b>Lookup ID:</b> {routeConfigData.lookup_id}
                    </p>
                    <p>
                      <b>Tipo:</b> {routeConfigData.config_type} ({routeConfigData.entity_type})
                    </p>
                    <p>
                      <b>URL:</b> {routeConfigData.page_url}
                    </p>
                    <p>
                      <b>Método:</b> {routeConfigData.integration_method}
                    </p>
                  </div>

                  {/* ========================================== */}
                  {/* COMPONENTES DA FÁBRICA (PADRÃO SIMULATIONS)  */}
                  {/* ========================================== */}

                  {/* 1. Panel Product */}
                  {routeConfigData.page_configs && (
                    <PanelProduct
                      config={
                        typeof routeConfigData.page_configs === "string"
                          ? JSON.parse(routeConfigData.page_configs)
                          : routeConfigData.page_configs
                      }
                    />
                  )}

                  {/* Detalhes de Integração e Regras (Mantidos nativos do Sandbox) */}
                  <div className="flex flex-col gap-4 my-4">
                    {routeConfigData.integration_details &&
                      Object.keys(routeConfigData.integration_details).length > 0 && (
                        <div className="bg-slate-50 p-4 rounded-xl border text-xs overflow-hidden">
                          <h4 className="font-bold text-slate-700 mb-2 uppercase text-[10px] tracking-wide">
                            Integration Details
                          </h4>
                          <pre className="font-mono text-[9px] text-slate-600 whitespace-pre-wrap break-all overflow-x-auto">
                            {JSON.stringify(routeConfigData.integration_details, null, 2)}
                          </pre>
                        </div>
                      )}
                    {routeConfigData.rules && Object.keys(routeConfigData.rules).length > 0 && (
                      <div className="bg-slate-50 p-4 rounded-xl border text-xs overflow-hidden">
                        <h4 className="font-bold text-slate-700 mb-2 uppercase text-[10px] tracking-wide">
                          Rules / Installments
                        </h4>
                        <pre className="font-mono text-[9px] text-slate-600 whitespace-pre-wrap break-all overflow-x-auto">
                          {JSON.stringify(routeConfigData.rules, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>

                  {/* 2. Panel Consents */}
                  {routeConfigData.consent_configs && routeConfigData.consent_configs.length > 0 && (
                    <PanelConsents configs={routeConfigData.consent_configs} />
                  )}

                  {/* 3. Panel FAQs */}
                  {routeConfigData.page_faqs && routeConfigData.page_faqs.length > 0 && (
                    <PanelFAQ faqs={routeConfigData.page_faqs} isPrint={false} />
                  )}

                  {/* 4. Panel Footer */}
                  {routeConfigData.page_configs?.footer && (
                    <div className="pt-2 break-inside-avoid">
                      <PanelFooter footer={routeConfigData.page_configs.footer} />
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
              <Button
                onClick={() => setIsRouteDrawerOpen(false)}
                className="bg-purple-600 hover:bg-purple-700 text-white text-xs rounded-xl px-5"
              >
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
              <button
                onClick={() => setIsErrorDrawerOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-700">
              <div className="bg-purple-50/40 border border-purple-200 p-4 rounded-xl space-y-2">
                <h4 className="font-bold text-purple-900 uppercase text-[11px]">
                  Guia de Testes e Resiliência (Developer Guide)
                </h4>
                <p className="text-muted-foreground leading-relaxed">
                  Este painel simula cenários de falha na borda (
                  <code className="bg-purple-100 px-1 py-0.5 rounded text-purple-900">financial-gateway-gate</code>).
                  Você pode testar a resiliência disparando via <b>Fetch (AJAX)</b> para inspecionar o contrato de erro
                  JSON diretamente aqui na aba, ou via <b>Form POST (Nativo)</b> para validar o redirecionamento com
                  spinner de erro do front-end.
                </p>
              </div>

              {errorDrawerConfig?.type === "offer" ? (
                <div className="space-y-4">
                  <div className="border border-slate-200 p-4 rounded-xl space-y-3 bg-white shadow-sm">
                    <h5 className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500" /> 1. Simular Oferta Inválida (ID: 9999)
                    </h5>
                    <p className="text-muted-foreground">
                      Envia um ID inexistente para a API upstream da Superbid. A borda deve interceptar o erro e
                      disparar <code className="bg-slate-100 px-1 py-0.5 rounded">OFFER_NOT_FOUND</code>.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <Button
                        onClick={() => executeErrorSimulation("fetch", "offer")}
                        disabled={simulating}
                        size="sm"
                        variant="outline"
                        className="rounded-xl text-xs border-[#B300FF]/30 text-[#B300FF] hover:bg-[#B300FF]/5 flex items-center justify-center"
                      >
                        {simulating && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1" />}
                        Testar via Fetch (JSON)
                      </Button>
                      <Button
                        onClick={() => executeErrorSimulation("form", "offer")}
                        disabled={simulating}
                        size="sm"
                        className="rounded-xl text-xs bg-[#B300FF] hover:bg-[#9f00e6] text-white flex items-center justify-center"
                      >
                        {simulating && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1" />}
                        Testar via Form (Redirecionar)
                      </Button>
                    </div>
                  </div>

                  <div className="border border-slate-200 p-4 rounded-xl space-y-3 bg-white shadow-sm">
                    <h5 className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500" /> 2. Simular Token de Acesso Inválido /
                      Expirado
                    </h5>
                    <p className="text-muted-foreground">
                      Substitui o token ativo por uma credencial corrompida. A borda disparará o erro de sessão expirada
                      ou não autorizada (<code className="bg-slate-100 px-1 py-0.5 rounded">SESSION_EXPIRED</code>).
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <Button
                        onClick={() => executeErrorSimulation("fetch", "token")}
                        disabled={simulating}
                        size="sm"
                        variant="outline"
                        className="rounded-xl text-xs border-[#B300FF]/30 text-[#B300FF] hover:bg-[#B300FF]/5 flex items-center justify-center"
                      >
                        {simulating ? <Loader2 className="animate-spin h-3.5 w-3.5 mr-1" /> : null} Testar via Fetch
                        (JSON)
                      </Button>
                      <Button
                        onClick={() => executeErrorSimulation("form", "token")}
                        disabled={simulating}
                        size="sm"
                        className="rounded-xl text-xs bg-[#B300FF] hover:bg-[#9f00e6] text-white flex items-center justify-center"
                      >
                        {simulating && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1" />}
                        Testar via Form (Redirecionar)
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="border border-slate-200 p-4 rounded-xl space-y-3 bg-white shadow-sm">
                    <h5 className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500" /> 1. Simular Produto Estrutural Inválido (ID:
                      999)
                    </h5>
                    <p className="text-muted-foreground">
                      Envia um ID de produto sem correspondência no orquestrador de rotas para testar a validação de
                      destino.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <Button
                        onClick={() => executeErrorSimulation("fetch", "product")}
                        disabled={simulating}
                        size="sm"
                        variant="outline"
                        className="rounded-xl text-xs border-[#B300FF]/30 text-[#B300FF] hover:bg-[#B300FF]/5 flex items-center justify-center"
                      >
                        {simulating && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1" />}
                        Testar via Fetch (JSON)
                      </Button>
                      <Button
                        onClick={() => executeErrorSimulation("form", "product")}
                        disabled={simulating}
                        size="sm"
                        className="rounded-xl text-xs bg-[#B300FF] hover:bg-[#9f00e6] text-white flex items-center justify-center"
                      >
                        {simulating && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1" />}
                        Testar via Form (Redirecionar)
                      </Button>
                    </div>
                  </div>

                  <div className="border border-slate-200 p-4 rounded-xl space-y-3 bg-white shadow-sm">
                    <h5 className="font-bold text-slate-900 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-red-500" /> 2. Simular Token Inválido na Chamada Direta
                    </h5>
                    <p className="text-muted-foreground">
                      Valida o comportamento de segurança da borda ao receber requisições estruturais sem autenticação
                      válida.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 pt-1">
                      <Button
                        onClick={() => executeErrorSimulation("fetch", "token")}
                        disabled={simulating}
                        size="sm"
                        variant="outline"
                        className="rounded-xl text-xs border-[#B300FF]/30 text-[#B300FF] hover:bg-[#B300FF]/5 flex items-center justify-center"
                      >
                        {simulating ? <Loader2 className="animate-spin h-3.5 w-3.5 mr-1" /> : null} Testar via Fetch
                        (JSON)
                      </Button>
                      <Button
                        onClick={() => executeErrorSimulation("form", "token")}
                        disabled={simulating}
                        size="sm"
                        className="rounded-xl text-xs bg-[#B300FF] hover:bg-[#9f00e6] text-white flex items-center justify-center"
                      >
                        {simulating && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1" />}
                        Testar via Form (Redirecionar)
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {simulationResult && (
                <div className="mt-4 p-4 rounded-xl border bg-slate-900 text-slate-100 space-y-2 font-mono text-[11px]">
                  <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                    <span className="font-bold text-purple-400">Retorno do Serviço (Fetch):</span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] ${simulationResult.ok ? "bg-green-900 text-green-200" : "bg-red-900 text-red-200"}`}
                    >
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
              <Button
                onClick={() => setIsErrorDrawerOpen(false)}
                className="bg-[#B300FF] hover:bg-[#9f00e6] text-white text-xs rounded-xl px-5"
              >
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
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex flex-col items-center justify-center text-slate-400 min-w-[70px] gap-1"
          >
            <LogIn className="w-6 h-6" strokeWidth={1.5} />
            <span className="text-[10px] font-medium">Entrar</span>
          </button>
        )}
      </div>
    </div>
  );
}

export const Route = createLazyFileRoute("/sandbox")({
  component: SandboxPage,
});
