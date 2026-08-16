/**
 * @fileoverview Componente Mestre: sbXPAYLayOut (Gatekeeper de Acesso e Hidratação de Sessão)
 * @module features/financial-hub/core/layout
 * @path src/routes/sbxpay.lazy.tsx
 * 
 * =========================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: HYBRID GATEKEEPER & ZERO-TRUST HANDOFF
 * =========================================================================
 * Este módulo atua como o orquestrador absoluto de ciclo de vida e estado do cliente.
 * Ele materializa o protocolo "Double JWT" no lado do frontend, fundindo a 
 * recepção stateless com o guardião de rotas tradicional do React.
 * 
 * [MUDANÇAS ARQUITETURAIS - REFATORAÇÃO DE PERFORMANCE E SESSÃO]:
 * 1. {Idempotency Lock}: Introduzido o `hasRunPhantomVisit` (useRef). Como a logo 
 *    agora limpa o `visit_update_id` da URL, a Home sempre dispara um Phantom Visit 
 *    (um POST silencioso) para gerar um novo Pageview. O lock previne que o StrictMode 
 *    do React ou re-renders de contexto flodem o backend com requisições duplicadas.
 * 2. {Cart Preservation}: O Phantom Visit agora repassa o `visit_id` (se existir) 
 *    para o POST, garantindo que o novo pageview pertença à mesma sessão global do usuário.
 * 3. {Phantom Visit Seguro}: Inclusão da checagem `isEntityComplete` para prevenir
 *    erros `400 Bad Request`. O envio da `entity` agora exige que o perfil possua
 *    todos os campos obrigatórios validados pela Edge Function do Gateway.
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 * @version 7.8.0 (Phantom Visit Seguro & Preservação de Sessão)
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
 * [PLACEHOLDER ESTRUTURAL]: Mitigação de Cumulative Layout Shift (CLS)
 * Preserva o grid, o zigue-zague responsivo e as alturas dos elementos 
 * para uma transição invisível entre Skeleton e Conteúdo.
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

  // ✨ [IDEMPOTENCY LOCK]: Garante 1 único POST de Phantom Visit por montagem,
  // mesmo que o React StrictMode ou Hooks re-renderizem o componente várias vezes.
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
        const vId = searchParams.get('visit_id');
        const vUpId = searchParams.get('visit_update_id');
        const hasValidVisit = Boolean(vId && vUpId);

        if ((!userProfile && sessionToken) || !hasValidVisit) {
          try {
            let orchestratorData: any = null;

            if (hasValidVisit && !userProfile) {
              // CENÁRIO 1: F5 Refresh. Tem Visita, falta Profile -> GET
              console.log("🔄 [Home] Detectado Token sem Profile. Hidratando ativamente via Orquestrador GET...");
              orchestratorData = await callOrchestrator({ visit_id: vId, visit_update_id: vUpId }, "GET");
            } else if (!hasValidVisit) {
              // CENÁRIO 2: Aterrissagem Direta (#xt=) ou Clique na Logo (Sem Update_id)
              
              if (hasRunPhantomVisit.current) {
                console.log("⏭️ [Home] Phantom Visit já executado nesta montagem. Ignorando disparo duplicado.");
              } else {
                hasRunPhantomVisit.current = true;
                console.log("👻 [Home] Iniciando Phantom Visit Estéril...");
                const currentHref = window.location.href;
                
                // ✨ [PREVENÇÃO DE 400 BAD REQUEST]: Validador rígido de Entidade
                // Só envia `entity` quando o perfil está completo o suficiente para a Edge Function.
                const isEntityComplete = Boolean(
                  userProfile?.entity_id &&
                    userProfile?.name &&
                    userProfile?.document &&
                    userProfile?.phone &&
                    userProfile?.email &&
                    (String(userProfile.document).replace(/\D/g, "").length === 14 ||
                      (userProfile.birth_date && userProfile.gender))
                );

                const visitPayload = {
                  action: "VISIT",
                  environment: getDefaultSbxEnvironment(),
                  target_url: window.location.pathname,
                  origin_url: currentHref,
                  // [HOME ESTÉRIL E SEGURA]: Omitimos offer e enviamos entity apenas se completa.
                  ...(isEntityComplete ? { entity: userProfile } : {}),
                  ...(vId ? { visit_id: vId } : {}), // [CART PRESERVATION]: Se tem visit_id, reaproveita.
                  interaction_context: {
                    origin_url: currentHref,
                    utm_source: "sbxpay_direct",
                    utm_medium: "organic",
                    utm_campaign: "hub_layout_visit_init"
                  }
                };

                try {
                  // Como o POST agora usa `waitUntil`, essa chamada responde em ~50ms
                  orchestratorData = await callOrchestrator(visitPayload, "POST");
                } catch (postErr) {
                  // Libera a trava caso haja uma falha real de rede para permitir retentativa
                  hasRunPhantomVisit.current = false; 
                  throw postErr;
                }

                // Se o Phantom Visit trouxe uma nova URL, injeta e atualiza o Router (PopState)
                if (orchestratorData?.visit_id && orchestratorData?.url) {
                  const responseUrlObj = new URL(orchestratorData.url, window.location.origin);
                  const originalParams = new URLSearchParams(window.location.search);
                  
                  responseUrlObj.searchParams.forEach((val, key) => {
                    originalParams.set(key, val);
                  });

                  const finalCleanUrl = `${responseUrlObj.pathname}?${originalParams.toString()}`;
                  window.history.replaceState({}, '', finalCleanUrl);
                  window.dispatchEvent(new Event('popstate'));
                }
              }
            }

            // Populamos o Profile (caso faltasse)
            if (!userProfile && orchestratorData?.entity) {
              const e = orchestratorData.entity;
              const mappedProfile: BFFUserProfile = {
                entity_id: String(e.entity_id ?? ""),
                entity_type: String(e.document ?? "").replace(/\D/g, "").length > 11 ? "J" : "F",
                name: e.name || "Visitante",
                document: e.document || "",
                email: e.email || "",
                phone: e.phone || "",
                birth_date: e.birth_date || "",
                gender: e.gender || "",
                login: e.login || e.email || "",
                mothers_name: e.mothers_name || "",
                address: e.address ?? null,
              };

              userProfile = mappedProfile;
              sessionStorage.setItem("user_profile", JSON.stringify(mappedProfile));
              window.dispatchEvent(new Event('session_hydrated'));
              console.log("✅ [Home] Perfil recuperado via Orquestrador e injetado no ecossistema.");
            }

          } catch (apiErr: any) {
             if (apiErr?.code === 'SESSION_EXPIRED') throw apiErr;
             console.warn("⚠️ [Home] Falha na comunicação com Orquestrador.", apiErr);
          }
        }

        // Failsafe Resiliente
        if (!userProfile && sessionToken) {
           console.warn("⚠️ [Home] Perfil não localizado após chamadas. Montando Perfil Resiliente temporário.");
           userProfile = {
             entity_id: "anonymous",
             entity_type: "F",
             name: "Usuário",
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
  const isProfileMissing = sessionToken && !contextProfile && !userData;

  if ((isLoading && !hasLocalSession) || isProfileMissing) {
    return <HomeSkeleton />; 
  }

  if (!USE_COOKIE && !sessionToken) return null; 

  return (
    <div className="sbxpay-shell min-h-screen bg-white">
      <UserDataContext.Provider value={{ userData, performLogout }}>
        <Outlet />
      </UserDataContext.Provider>
    </div>
  );
}