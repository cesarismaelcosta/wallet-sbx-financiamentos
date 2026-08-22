/**
 * @fileoverview 🛡️ Componente Mestre: sbXPAYLayOut (Gatekeeper de Acesso e Sessão)
 * @module features/financial-hub/core/layout
 * @path src/routes/sbxpay.lazy.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO ARQUITETURA: ZERO-TRUST & THIN PAYLOAD COMPLIANCE
 * =========================================================================
 * Este módulo atua como o Guardião de Rotas e Inicializador de Sessão Global (OLAP).
 * Ele envelopa as rotas filhas, garantindo que usuários não autenticados sejam 
 * ejetados e que o funil de telemetria seja iniciado corretamente.
 * 
 * [MECÂNICA ARQUITETURAL]:
 * 1. {Zero-Trust Auth}: Intercepta renderizações sem token válido e redireciona 
 *    para o Sign-in. O perfil básico do usuário consumido pela UI (Avatar, Nome)
 *    é derivado exclusivamente do cache da sessão (contextProfile), eliminando a
 *    necessidade de requisições GET adicionais ao backend.
 * 2. {Phantom Visit (Thin Payload)}: Quando o usuário aterrissa na raiz sem um cursor 
 *    temporal (ex: digitou a URL direto ou clicou na logo), este componente dispara 
 *    um POST estéril informando apenas a intenção (VISIT) e a origem. A responsabilidade 
 *    de cruzar essa visita com a Identidade (PII) é delegada 100% ao Orquestrador via JWT.
 * 3. {Idempotency Lock}: Utiliza `hasRunPhantomVisit` (useRef) para garantir que a 
 *    geração do Pageview ocorra estritamente 1 vez por ciclo de vida, blindando o 
 *    backend contra floods de rede causados por re-renders do React (StrictMode).
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 */

import { createContext, useState, useEffect, useRef } from "react";
import { createLazyFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { PanelHeader } from "@/features/financial-hub/components/layout/PanelHeader";
import { BFFUserProfile } from "@/features/financial-hub/components/shared/types";
import { callOrchestrator } from "@/features/financial-hub/core/services/gateway";
import { getDefaultSbxEnvironment, USE_COOKIE, getTokenForPayload } from "@/services/session";
import { useHandoffRedeem } from "@/features/financial-hub/core/hooks/useHandoffRedeem";

export const Route = createLazyFileRoute("/sbxpay")({
  component: sbXPAYLayOut, 
});

/**
 * 🔐 [CONTRATO DE CONTEXTO]
 */
export const UserDataContext = createContext<{ 
  userData: BFFUserProfile | null; 
  performLogout: () => void; 
  isVerifying: boolean;
}>({
  userData: null,
  performLogout: () => {},
  isVerifying: true,
});

/**
 * 🎨 [PLACEHOLDER ESTRUTURAL]
 */
function HomeSkeleton() {
  const skeletonSections = [
    { isHero: true, isReverse: false },
    { isHero: false, isReverse: false },
    { isHero: false, isReverse: true },
    { isHero: false, isReverse: false },
  ];

  return (
    <div className="bg-white min-h-screen antialiased font-sans overflow-x-hidden relative flex flex-col">
      <PanelHeader showNav={true} showAuth={true} links={[]} />

      <div className="flex-1">
        {skeletonSections.map((section, index) => (
          <section
            key={index}
            className={`relative bg-white border-b border-gray-100 overflow-hidden ${
              section.isHero ? "pt-28 pb-10 md:pt-32 md:pb-12" : "py-10 md:py-12"
            }`}
          >
            <div className="max-w-7xl mx-auto px-6 relative z-10 animate-pulse">
              <div 
                className={`flex flex-col ${
                  section.isReverse ? "lg:flex-row-reverse" : "lg:flex-row"
                } items-center justify-between gap-8 lg:gap-12`}
              >
                <div className="w-full lg:w-6/12 space-y-5">
                  <div className="flex flex-row items-center gap-4 -ml-2 sm:block sm:ml-0">
                    <div className="w-24 h-24 sm:hidden flex-shrink-0 bg-slate-100 rounded-full"></div>
                    <div className="space-y-4 flex-1 mt-2 sm:mt-0">
                      <div className="h-6 w-24 bg-slate-100 rounded-full"></div>
                      <div className="space-y-2">
                        <div className="h-8 md:h-10 w-3/4 bg-slate-100 rounded-lg"></div>
                        <div className="h-8 md:h-10 w-1/2 bg-slate-100 rounded-lg"></div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <div className="h-4 w-full bg-slate-50 rounded"></div>
                    <div className="h-4 w-5/6 bg-slate-50 rounded"></div>
                    <div className="h-4 w-4/6 bg-slate-50 rounded"></div>
                  </div>

                  {section.isHero ? (
                    <div className="border-t border-gray-100 pt-5 space-y-4">
                       <div className="h-12 w-full bg-slate-50 rounded-lg"></div>
                       <div className="h-12 w-full bg-slate-50 rounded-lg"></div>
                       <div className="pt-2">
                         <div className="h-10 w-full md:w-40 bg-slate-100 rounded-lg"></div>
                       </div>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
                        <div className="h-24 bg-slate-50 rounded-xl"></div>
                        <div className="h-24 bg-slate-50 rounded-xl"></div>
                      </div>
                      <div className="flex flex-col md:flex-row gap-4 pt-4">
                        <div className="h-10 w-full md:w-48 bg-slate-100 rounded-lg"></div>
                        <div className="h-10 w-full md:w-48 bg-slate-50 rounded-lg"></div>
                      </div>
                    </>
                  )}
                </div>

                <div className="hidden sm:flex w-full lg:w-5/12 justify-center mt-8 lg:mt-0">
                  <div className="w-full max-w-sm aspect-square bg-slate-50/50 rounded-full flex items-center justify-center">
                     <div className="w-3/4 h-3/4 bg-slate-100 rounded-2xl rotate-3"></div>
                  </div>
                </div>
              </div>
            </div>
          </section>
        ))}
      </div>

      <footer className="w-full pt-10 pb-40 md:py-10 mt-auto bg-black border-t border-gray-800">
        <div className="container mx-auto px-6 flex flex-col items-center gap-4 text-center animate-pulse">
          <div className="h-20 w-20 rounded-md bg-gray-800"></div>
          <div className="h-3 w-48 bg-gray-800 rounded mt-2"></div>
          <div className="h-3 w-64 bg-gray-800 rounded"></div>
        </div>
      </footer>
    </div>
  );
}

export function sbXPAYLayOut() {
  const authContext = useFinancialAuth();
  const { sessionToken: contextToken, userProfile: contextProfile, isLoading, logout } = authContext;

  const sessionToken = contextToken || getTokenForPayload();

  const navigate = useNavigate();
  const logoutRef = useRef(logout);
  const isRedirecting = useRef(false);

  // 🔒 [IDEMPOTENCY LOCK]
  const hasRunPhantomVisit = useRef(false);

  useEffect(() => { 
    logoutRef.current = logout; 
  }, [logout]);

  const [userData, setUserData] = useState<BFFUserProfile | null>(contextProfile || null);
  const [isVerifying, setIsVerifying] = useState<boolean>(!contextProfile);
  const [isClientMounted, setIsClientMounted] = useState(false);

  useEffect(() => {
    setIsClientMounted(true);
  }, []);

  const { isExchanging, status, reason } = useHandoffRedeem();

  useEffect(() => {
    if (status === "error") {
      console.error(`[AUTH GATEKEEPER] Falha Crítica no Resgate Tático: ${reason}. O Zero-Trust Guard abortará a rota.`);
    }
  }, [status, reason]);

  const performLogout = () => {
    setUserData(null);
    logoutRef.current();
  };

  useEffect(() => {
    let isMounted = true;

    if (isLoading || isExchanging) return; 

    // ⛔ [FALLBACK DE SEGURANÇA]
    if (!USE_COOKIE && !sessionToken) {
      if (isMounted) setIsVerifying(false); 

      const currentPath = typeof window !== "undefined" 
        ? `${window.location.pathname}${window.location.search}` 
        : "/sbxpay";

      navigate({ 
        to: '/accounts/signin', 
        search: { redirect_uri: currentPath, handoff_error: reason } as any,
        replace: true
      });
      return;
    }

    if (isMounted) setIsVerifying(true); 

    async function initializeHubSession() {
      try {
        const storedProfileStr = sessionStorage.getItem("user_profile");
        const fallbackProfile = storedProfileStr ? JSON.parse(storedProfileStr) : null;
        let userProfile = (contextProfile || fallbackProfile) as BFFUserProfile | null;

        const searchParams = new URLSearchParams(window.location.search);
        let vId = searchParams.get('visit_id');
        let vUpId = searchParams.get('visit_update_id');

        // =====================================================================
        // 👻 GERAÇÃO DE PAGEVIEW (PHANTOM VISIT POST)
        // =====================================================================
        const hasValidVisit = Boolean(vId && vUpId);

        if (!hasValidVisit) {
          if (hasRunPhantomVisit.current) {
            console.log("⏭️ [Home] Phantom Visit já executado nesta montagem. Ignorando via Idempotency Lock.");
          } else {
            hasRunPhantomVisit.current = true;
            console.log("👻 [Home] Iniciando Phantom Visit Estéril...");
            const currentHref = window.location.href;

            // ✨ [THIN PAYLOAD ZERO-TRUST]
            // Front-end despacha a intenção burra. Backend hidrata PII via JWT.
            const visitPayload = {
              action: "VISIT",
              environment: getDefaultSbxEnvironment(),
              target_url: window.location.pathname,
              origin_url: currentHref,
              ...(vId ? { visit_id: vId } : {}), // Cart Preservation
              interaction_context: {
                origin_url: currentHref,
                utm_source: "sbxpay_direct",
                utm_medium: "organic",
                utm_campaign: "hub_layout_visit_init"
              }
            };

            try {
              const postData = await callOrchestrator(visitPayload, "POST");
              
              if (postData?.visit_id && postData?.url) {
                const responseUrlObj = new URL(postData.url, window.location.origin);
                const originalParams = new URLSearchParams(window.location.search);
                
                responseUrlObj.searchParams.forEach((val, key) => originalParams.set(key, val));

                navigate({
                  to: responseUrlObj.pathname,
                  search: Object.fromEntries(originalParams.entries()) as any,
                  replace: true
                });
              }
            } catch (postErr) {
              hasRunPhantomVisit.current = false;
              throw postErr;
            }
          }
        }

        // =====================================================================
        // 🚑 FAILSAFE RESILIENTE & MONTAGEM DA UI
        // =====================================================================
        if (!userProfile && sessionToken) {
           console.warn("⚠️ [Home] Perfil Ausente no Contexto Local. Backend fará o handoff via JWT.");
           userProfile = {
             entity_id: "anonymous",
             entity_type: "F",
             name: "Visitante Logado",
             document: "",
             email: "",
             phone: "",
             birth_date: "",
             gender: "",
             login: "",
             mothers_name: "",
             address: null,
           };
        } else if (!userProfile && !sessionToken) {
           throw { code: 'SESSION_EXPIRED', fallback_url: '/accounts/signin' };
        }

        if (isMounted) {
          setUserData(userProfile);
          setIsVerifying(false); 
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
  }, [isLoading, isExchanging, sessionToken, contextProfile, navigate, reason]);

  if (!isClientMounted || isExchanging) {
    return <HomeSkeleton />;
  }

  const hasLocalSession = Boolean(sessionToken || (typeof window !== "undefined" && sessionStorage.getItem("user_profile")));
  
  if (isLoading && !hasLocalSession) {
    return <HomeSkeleton />; 
  }

  if (!USE_COOKIE && !sessionToken) return null; 

  return (
    <div className="sbxpay-shell min-h-screen bg-white">
      <UserDataContext.Provider value={{ userData, performLogout, isVerifying }}>
        <Outlet />
      </UserDataContext.Provider>
    </div>
  );
}