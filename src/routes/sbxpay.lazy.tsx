/**
 * @fileoverview Componente: sbXPAYLayOut (Esqueleto Mestre e Gatekeeper do Hub Financeiro)
 * @path src/routes/sbxpay.lazy.tsx
 * 
 * =========================================================================
 * [ARQUITETURA E FLUXO DE SEGURANÇA & ORQUESTRAÇÃO]
 * =========================================================================
 * Funciona como o Gatekeeper centralizado de Sessão, Hidratação e Visitas do Hub (sbxpay).
 * 
 * RESPONSABILIDADES CENTRAIS:
 * 1. GATEKEEPER DE AUTENTICAÇÃO: Intercepta acessos sem token ativo e redireciona 
 *    para o login preservando o `redirect_uri`.
 * 2. HIDRATAÇÃO DE PERFIL (BFF): Valida a sessão e puxa os dados do usuário logado.
 * 3. GATEKEEPER DE VISITA AUTOMÁTICA: Valida se a URL já possui um `visit_id`. 
 *    Caso contrário, aciona o Orquestrador (`action: "VISIT"`) antes de renderizar as filhas,
 *    atualizando a URL silenciosamente via `replaceState` (Zero Flash / Zero Piscar).
 * 4. PROVEDOR DE ESTADO (`UserDataContext`): Compartilha o perfil (`BFFUserProfile`) 
 *    e a função de logout com toda a árvore de sub-rotas via `<Outlet />`.
 */

import { createContext, useState, useEffect, useRef } from "react";
import { createLazyFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { fetchMyProfile } from "@/services/user";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { BFFUserProfile } from "@/features/financial-hub/components/shared/types";
import { callOrchestrator } from "@/features/financial-hub/core/services/gateway"; // 👈 Serviço de Gateway para chamadas ao Orquestrador
import { getDefaultSbxEnvironment, USE_COOKIE } from "@/services/session"; // 👈 Resolução segura de ambiente e flag híbrida USE_COOKIE

// =========================================================================
// CONFIGURAÇÃO DA ROTA (TanStack Router)
// =========================================================================
export const Route = createLazyFileRoute("/sbxpay")({
  component: sbXPAYLayOut, 
});

// =========================================================================
// CONTEXTO GLOBAL DE DADOS DO USUÁRIO
// =========================================================================
export const UserDataContext = createContext<{ 
  userData: BFFUserProfile | null; 
  performLogout: () => void; 
} | null>(null);

// =========================================================================
// [COMPONENTES AUXILIARES]: Indicador Visual de Carregamento Nativo
// =========================================================================
const Spinner = ({ msg }: { msg: string }) => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#B400FF] mb-4"></div>
    <p className="text-slate-500 font-medium text-sm">{msg}</p>
  </div>
);

// =========================================================================
// [COMPONENTE PRINCIPAL]: Layout e Gatekeeper Mestre do Hub
// =========================================================================
export function sbXPAYLayOut() {
  const { sessionToken: contextToken, isLoading, logout } = useFinancialAuth();
  // Resgate preventivo imediato no sessionStorage caso o contexto ainda esteja se hidratando
  const sessionToken = contextToken || (typeof window !== 'undefined' ? sessionStorage.getItem('session_token') : null);

  const navigate = useNavigate();
  const logoutRef = useRef(logout);

  // Mantém a referência da função de logout atualizada para evitar stale closures
  useEffect(() => { 
    logoutRef.current = logout; 
  }, [logout]);

  const [userData, setUserData] = useState<BFFUserProfile | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);

  /**
   * Encerra a sessão limpando os estados e acionando o contexto global de auth
   */
  const performLogout = () => {
    setUserData(null);
    logoutRef.current();
  };

  // =========================================================================
  // [GATEKEEPER & REHYDRATION MESTRE]: Leitura Local + Visita Automática
  // =========================================================================
  useEffect(() => {
    let isMounted = true;

    // Aguarda o contexto de autenticação inicializar
    if (isLoading) return; 

    // 🔒 CENÁRIO A: Sem credencial ativa
    if (!USE_COOKIE && !sessionToken) {
      if (isMounted) setIsVerifying(false); 
      
      const currentPath = typeof window !== "undefined" 
        ? `${window.location.pathname}${window.location.search}` 
        : "/sbxpay";

      navigate({ 
        to: '/accounts/signin', 
        search: { redirect_uri: currentPath } as any,
        replace: true
      });
      return;
    }

    // 🚀 CENÁRIO B: Sessão presente -> Hidrata do Storage e gerencia a Visita
    if (isMounted) setIsVerifying(true); 

    async function initializeHubSession() {
      try {
        // 1. Hidrata o perfil direto de onde ele veio: do LOGIN (armazenado no sessionStorage)
        const storedProfile = sessionStorage.getItem("user_profile");
        if (!storedProfile) {
          throw { code: 'SESSION_EXPIRED', fallback_url: '/accounts/signin' };
        }

        const userProfile = JSON.parse(storedProfile) as BFFUserProfile;

        if (isMounted) {
          setUserData(userProfile);

          // 2. Gatekeeper de Visita: Se a URL ainda não tem visit_id, chama o Orquestrador
          const searchParams = new URLSearchParams(window.location.search);
          if (!searchParams.get('visit_id')) {
            try {
              const currentHref = window.location.href;
              const visitPayload = {
                action: "VISIT",
                environment: getDefaultSbxEnvironment(),
                target_url: window.location.pathname,
                origin_url: currentHref,
                entity: userProfile, // Usa o perfil que já veio do login
                interaction_context: {
                  origin_url: currentHref,
                  utm_source: "sbxpay_direct",
                  utm_medium: "organic",
                  utm_campaign: "hub_layout_visit_init"
                }
              };

              const visitResponse = await callOrchestrator(visitPayload, "POST");
              
              if (visitResponse?.visit_id && visitResponse?.url) {
                window.history.replaceState({}, '', visitResponse.url);
              }
            } catch (visitErr) {
              console.error("🚨 [Gatekeeper] Falha não bloqueante ao inicializar visita automática:", visitErr);
            }
          }

          // Libera o shell principal instantaneamente
          setIsVerifying(false);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error("🔒 [Gatekeeper] Sessão inválida ou perfil ausente no storage:", err);
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
  }, [isLoading, sessionToken, navigate]);

  // =========================================================================
  // [RENDERIZAÇÃO DE ESTADOS VISUAIS]
  // =========================================================================

  // Exibe o spinner nativo enquanto o contexto de auth carrega
  if (isLoading) {
    return <Spinner msg="Validando seus dados e preparando o ambiente Wallet sbX..." />;
  }

  // Fail-safe em DEV caso não haja sessionToken (confia no cookie HttpOnly em PROD)
  if (!USE_COOKIE && !sessionToken) return null;

  // Exibe o spinner enquanto o perfil e a visita são validados
  if (isVerifying) {
    return <Spinner msg="Validando seus dados e preparando o ambiente Wallet sbX..." />;
  }

  // Sessão validada e visita aberta: Renderiza o esqueleto e distribui o contexto para as rotas filhas
  return (
    <div className="sbxpay-shell min-h-screen bg-white">
      <UserDataContext.Provider value={{ userData, performLogout }}>
        <Outlet />
      </UserDataContext.Provider>
    </div>
  );
}