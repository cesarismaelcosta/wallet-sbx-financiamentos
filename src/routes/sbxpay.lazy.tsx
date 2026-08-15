/**
 * @fileoverview Componente Mestre: sbXPAYLayOut (Gatekeeper de Acesso e Hidratação de Sessão)
 * @module features/financial-hub/core/layout
 * 
 * =========================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: HYBRID GATEKEEPER & ZERO-TRUST HANDOFF
 * =========================================================================
 * Este módulo atua como o orquestrador absoluto de ciclo de vida e estado do cliente.
 * Ele materializa o protocolo "Double JWT" no lado do frontend, fundindo a 
 * recepção stateless com o guardião de rotas tradicional do React.
 * 
 * [POSTURA DE SEGURANÇA E FLUXO DE ORQUESTRAÇÃO]:
 * 0. {Resgate Tático - Sniper}: O hook de inicialização opera com máxima prioridade
 *    para inspecionar a URL. Se detectar um Exchange JWT, bloqueia a árvore 
 *    de renderização e realiza o handoff (resgate), protegendo credenciais contra
 *    vazamento para scripts de rastreamento (GTM, Sentry) ou extensões do navegador.
 * 1. {Zero-Trust Guard}: Avalia o estado de autenticação antes de qualquer 
 *    montagem de DOM persistente. Acessos anônimos sofrem early-return preventivo, 
 *    preservando o estado da intenção de acesso via querystring `redirect_uri`.
 * 2. {BFF Rehydration}: Restaura a integridade estrutural do perfil do usuário 
 *    (BFFUserProfile) a partir da memória quente (Context) ou fria (sessionStorage).
 * 3. {Phantom Visit}: Aciona o motor do Orquestrador (`action: "VISIT"`) em 
 *    background, injetando o `visit_id` na URL via History API sem causar 
 *    repaints na tela (Zero Flash), garantindo telemetria sem engasgar a UI.
 * 4. {State Propagation}: Envelopa a aplicação no `UserDataContext`, garantindo
 *    propagação determinística da identidade (Perfil) e mecanismo de kill-switch (Logout).
 *
 * @author César Ismael Pereira da Costa
 * @version 6.0.0 (Integração de Resgate Stateless e Defesa Anti-Telemetry)
 */

import { createContext, useState, useEffect, useRef } from "react";
import { createLazyFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { PanelHeader } from "@/features/financial-hub/components/layout/PanelHeader";
import { BFFUserProfile } from "@/features/financial-hub/components/shared/types";
import { callOrchestrator } from "@/features/financial-hub/core/services/gateway";
import { getDefaultSbxEnvironment, USE_COOKIE, getTokenForPayload } from "@/services/session";
import { redeemHandoffSession } from "@/services/exchange";

export const Route = createLazyFileRoute("/sbxpay")({
  component: sbXPAYLayOut, 
});

/**
 * [CONTRATO DE CONTEXTO]
 * Garante a tipagem estrita do contexto de usuário trafegado para os componentes filhos.
 */
export const UserDataContext = createContext<{ 
  userData: BFFUserProfile | null; 
  performLogout: () => void; 
}>({
  userData: null,
  performLogout: () => {},
});

/**
 * [FALLBACK UI]: Spinner Genérico
 */
const Spinner = ({ msg }: { msg: string }) => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#B400FF] mb-4"></div>
    <p className="text-slate-500 font-medium text-sm">{msg}</p>
  </div>
);

/**
 * [PLACEHOLDER ESTRUTURAL]: Mitigação de Cumulative Layout Shift (CLS)
 * Preserva o grid e a altura dos elementos durante processos assíncronos de Gatekeeping.
 */
function HomeSkeleton() {
  return (
    <div className="min-h-screen bg-white">
      <PanelHeader showNav={true} showAuth={true} links={[]} />
      <main className="max-w-7xl mx-auto px-6 pt-28 space-y-12 animate-pulse">
        <div className="h-56 bg-slate-100 rounded-3xl w-full"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="h-64 bg-slate-100 rounded-2xl"></div>
          <div className="h-64 bg-slate-100 rounded-2xl"></div>
          <div className="h-64 bg-slate-100 rounded-2xl"></div>
        </div>
      </main>
    </div>
  );
}

export function sbXPAYLayOut() {
  const authContext = useFinancialAuth();
  const { sessionToken: contextToken, userProfile: contextProfile, isLoading, logout } = authContext;
  
  // Resolução de credencial aplicando priorização: Memória Quente > LocalStorage/Cookies
  const sessionToken = contextToken || getTokenForPayload();

  const navigate = useNavigate();
  const logoutRef = useRef(logout);
  const isRedirecting = useRef(false);

  // [DEFESA]: Previne Stale Closures (variáveis de escopo antigas) injetando a função de logout no Ref
  useEffect(() => { 
    logoutRef.current = logout; 
  }, [logout]);

  // =========================================================================
  // ALOCAÇÃO DE ESTADOS DE CONTROLE DE FLUXO
  // =========================================================================
  const [userData, setUserData] = useState<BFFUserProfile | null>(contextProfile || null);
  const [isVerifying, setIsVerifying] = useState<boolean>(!contextProfile);
  
  // Indicador de montagem (impede incompatibilidade entre servidor SSR e cliente inicial)
  const [isClientMounted, setIsClientMounted] = useState(false);
  
  // ✨ [LOCK ESTRUTURAL] Mantém a UI em Skeleton até sabermos o resultado da varredura de URL
  const [isExchanging, setIsExchanging] = useState(true); 
  const exchangeAttempted = useRef(false); // Flag para inibir disparos duplos em StrictMode

  useEffect(() => {
    setIsClientMounted(true);
  }, []);

  // =========================================================================
  // 🎯 [STEP 0]: INTERCEPTAÇÃO STATELESS (O SNIPER TÁTICO)
  // [VETOR DE DEFESA]: Corre em prioridade máxima (antes da renderização final) 
  // para capturar e aniquilar o Exchange Token da URL, mitigando roubo passivo.
  // =========================================================================
  useEffect(() => {
    if (!isClientMounted) return;
    if (exchangeAttempted.current) return;
    
    // [HEURÍSTICA O(1)]: Verifica a existência do fragmento alvo na URL em microssegundos.
    // [CORREÇÃO FINAL]: Ajustado para procurar a nova tag 'xt=' ou a legada 'exchange_token='
    const hash = window.location.hash;
    if (!hash.includes("xt=") && !hash.includes("exchange_token=")) {
      exchangeAttempted.current = true;
      setIsExchanging(false); // Rota limpa. Libera o fluxo natural do app.
      return;
    }

    exchangeAttempted.current = true;

    async function processStatelessHandoff() {
      console.log("[AUTH GATEKEEPER] Aterrissagem cross-domain detectada. Iniciando protocolo de higienização de URL.");
      
      const result = await redeemHandoffSession();
      
      if (result.ok && result.session_token) {
        console.log("[AUTH GATEKEEPER] Protocolo Double JWT concluído. Sessão persistida pelo serviço.");
        
        // Propagação de Estado (Avisa o restante da árvore React que o usuário está logado)
        if (typeof (authContext as any).setSession === "function") {
          await (authContext as any).setSession(result.session_token);
        } else {
          window.dispatchEvent(new Event("storage"));
        }

      } else if (result.reason === "invalid" || result.reason === "expired") {
        console.error("[AUTH GATEKEEPER] Falha Crítica: Credencial efêmera expirada ou corrompida. Executando aborto de rota.");
        navigate({ 
          to: "/accounts/signin", 
          search: { redirect_uri: window.location.pathname } as any, 
          replace: true 
        });
        return;
      }

      // Desbloqueia o Render Tree para o Gatekeeper Principal assumir a Hidratação
      setIsExchanging(false);
    }

    processStatelessHandoff();
  }, [isClientMounted, navigate, authContext]);


  // =========================================================================
  // [SECUNDÁRIO]: HIDRATAÇÃO DE MEMÓRIA (Cold Start Fallback)
  // =========================================================================
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = sessionStorage.getItem("user_profile");
      if (stored) {
        setUserData(JSON.parse(stored));
        setIsVerifying(false);
      }
    }
  }, []);

  const performLogout = () => {
    setUserData(null);
    logoutRef.current();
  };

  // =========================================================================
  // 🛡️ [STEP 1 & 2]: ZERO-TRUST GUARD & ORQUESTRAÇÃO DE VISITAS
  // Pipeline de autorização que garante que nenhum componente filho seja 
  // renderizado sem um `session_token` e sem notificar o motor de Analytics.
  // =========================================================================
  useEffect(() => {
    let isMounted = true;

    // [WAIT-LOCK]: Impede a tomada de decisão do Guard se o Sniper ainda está operando 
    // ou se o contexto de autenticação ainda está realizando fetching.
    if (isLoading || isExchanging) return; 

    // ⛔ CENÁRIO A: Falha na Resolução de Credenciais (Acesso Anônimo)
    if (!USE_COOKIE && !sessionToken) {
      if (isMounted) setIsVerifying(false); 
      
      const currentPath = typeof window !== "undefined" 
        ? `${window.location.pathname}${window.location.search}` 
        : "/sbxpay";

      // Dispara Redirecionamento Proativo preservando a intenção na URL
      navigate({ 
        to: '/accounts/signin', 
        search: { redirect_uri: currentPath } as any,
        replace: true
      });
      return;
    }

    // ✅ CENÁRIO B: Credencial Válida (Autenticado). Procede para Hidratação e Telemetria.
    if (isMounted) setIsVerifying(true); 

    async function initializeHubSession() {
      try {
        // [HIDRATAÇÃO BFF] Restaura o JSON do usuário para prover os dados de cabeçalho e saudação
        const storedProfileStr = sessionStorage.getItem("user_profile");
        const fallbackProfile = storedProfileStr ? JSON.parse(storedProfileStr) : null;
        
        const userProfile = (contextProfile || fallbackProfile) as BFFUserProfile | null;

        if (!userProfile) {
          throw { code: 'SESSION_EXPIRED', fallback_url: '/accounts/signin' };
        }

        if (isMounted) {
          setUserData(userProfile);
          setIsVerifying(false); // UI liberada. O restante opera em background (Thread-Safe).

          // =====================================================================
          // 👻 [STEP 3] PHANTOM VISIT: Orquestração Silenciosa
          // Injeta a visita no banco de dados e anexa o `visit_id` na URL via History API
          // sem disparar ciclo de re-renderização do React Router.
          // =====================================================================
          const searchParams = new URLSearchParams(window.location.search);
          if (!searchParams.get('visit_id')) {
            try {
              const currentHref = window.location.href;
              const visitPayload = {
                action: "VISIT",
                environment: getDefaultSbxEnvironment(),
                target_url: window.location.pathname,
                origin_url: currentHref,
                entity: userProfile,
                interaction_context: {
                  origin_url: currentHref,
                  utm_source: "sbxpay_direct",
                  utm_medium: "organic",
                  utm_campaign: "hub_layout_visit_init"
                }
              };

              callOrchestrator(visitPayload, "POST").then((visitResponse) => {
                if (visitResponse?.visit_id && visitResponse?.url) {
                  // Concatena parâmetros originais com a URL de rastreamento do orquestrador
                  const originalParams = new URLSearchParams(window.location.search);
                  const responseUrlObj = new URL(visitResponse.url, window.location.origin);
                  
                  responseUrlObj.searchParams.forEach((val, key) => {
                    originalParams.set(key, val);
                  });

                  const finalCleanUrl = `${responseUrlObj.pathname}?${originalParams.toString()}`;
                  
                  // Injeção limpa de URL sem repaints da interface
                  window.history.replaceState({}, '', finalCleanUrl);
                }
              }).catch((visitErr: any) => {
                if (visitErr?.code === 'SESSION_EXPIRED') {
                  if (isRedirecting.current) return;
                  isRedirecting.current = true;

                  if (isMounted) {
                    performLogout();
                    const currentPath = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/sbxpay";
                    window.location.href = visitErr?.fallback_url || `/accounts/signin?redirect_uri=${encodeURIComponent(currentPath)}`;
                  }
                }
              });
            } catch (visitErr) {}
          }
        }
      } catch (err: any) {
        if (isRedirecting.current) return;
        isRedirecting.current = true;

        if (isMounted) {
          performLogout(); 
          const currentPath = typeof window !== "undefined" ? window.location.pathname : "/sbxpay";
          window.location.href = err?.fallback_url || `/accounts/signin?redirect_uri=${encodeURIComponent(currentPath)}`;
        }
      }
    }

    initializeHubSession();

    return () => { 
      isMounted = false; 
    }; 
  }, [isLoading, isExchanging, sessionToken, contextProfile, navigate]);

  // =========================================================================
  // [OUTPUT]: RESOLUÇÃO DE ÁRVORE DE RENDERIZAÇÃO
  // =========================================================================

  // ✨ [PREVENÇÃO DE HYDRATION MISMATCH] 
  // O servidor SSR (se houver) e o instante zero do cliente sempre renderizam o Skeleton puro.
  // Isso também segura a tela enquanto o Sniper vasculha a URL.
  if (!isClientMounted || isExchanging) {
    return <HomeSkeleton />;
  }

  const hasLocalSession = Boolean(sessionToken || (typeof window !== "undefined" && sessionStorage.getItem("user_profile")));

  if (isLoading && !hasLocalSession) {
    return <HomeSkeleton />; 
  }

  if (!USE_COOKIE && !sessionToken) return null; // Aborto silencioso em falha total

  // [INJEÇÃO DE CONTEXTO E RENDERIZAÇÃO DOM]
  // As sub-rotas (Outlet) ganham acesso direto ao Profile e a função de Logout.
  return (
    <div className="sbxpay-shell min-h-screen bg-white">
      <UserDataContext.Provider value={{ userData, performLogout }}>
        <Outlet />
      </UserDataContext.Provider>
    </div>
  );
}