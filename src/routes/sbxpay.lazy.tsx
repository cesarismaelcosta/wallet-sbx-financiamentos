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
import { getDefaultSbxEnvironment } from "@/services/session"; // 👈 Resolução segura de ambiente (Zero LocalStorage)

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
  const { sessionToken, isLoading, logout } = useFinancialAuth();
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
  // [GATEKEEPER & REHYDRATION MESTRE]: Validação de Perfil + Visita Automática
  // =========================================================================
  useEffect(() => {
    let isMounted = true;

    // Aguarda o contexto de autenticação inicializar antes de decidir qualquer rota
    if (isLoading) return; 

    // 🔒 CENÁRIO A: Sem credencial ativa -> Despacha imediatamente para o Login
    if (!sessionToken) {
      if (isMounted) setIsVerifying(false); 
      
      const currentPath = typeof window !== "undefined" 
        ? `${window.location.pathname}` 
        : "/sbxpay";

      navigate({ 
        to: '/accounts/signin', 
        search: { redirect_uri: currentPath } as any,
        replace: true
      });
      return;
    }

    // 🚀 CENÁRIO B: Sessão presente -> Inicia o ciclo de validação e rastreio
    if (isMounted) setIsVerifying(true); 
    const controller = new AbortController();

    async function validateSessionAndInitializeVisit() {
      try {
        // 1. Hidrata o perfil do usuário consultando o BFF upstream
        const profile = await fetchMyProfile({ signal: controller.signal });
        
        if (!profile || (profile as any).success === false) {
          throw { 
            code: (profile as any)?.code || 'SESSION_EXPIRED', 
            fallback_url: (profile as any)?.fallback_url 
          };
        }

        const userProfile = profile as BFFUserProfile;

        if (isMounted) {
          setUserData(userProfile);

          // =========================================================================
          // [GATEKEEPER DE VISITA CENTRALIZADO]: 
          // Verifica se o visit_id já está presente na URL atual. Caso contrário,
          // inicializa a visita de forma transparente no carregamento do layout.
          // =========================================================================
          const searchParams = new URLSearchParams(window.location.search);
          if (!searchParams.get('visit_id')) {
            try {
              const currentHref = window.location.href;
              const visitPayload = {
                action: "VISIT",
                environment: getDefaultSbxEnvironment(),
                target_url: window.location.pathname,
                origin_url: currentHref,
                entity: userProfile, // Injeta o perfil recém-hidratado diretamente
                interaction_context: {
                  origin_url: currentHref,
                  utm_source: "sbxpay_direct",
                  utm_medium: "organic",
                  utm_campaign: "hub_layout_visit_init"
                }
              };

              const visitResponse = await callOrchestrator(visitPayload, "POST");
              
              // Se o orquestrador retornar a URL com o visit_id, atualizamos a barra 
              // de endereços silenciosamente via history.replaceState (Evita Hard Reload)
              if (visitResponse?.visit_id && visitResponse?.url) {
                window.history.replaceState({}, '', visitResponse.url);
              }
            } catch (visitErr) {
              console.error("🚨 [Gatekeeper] Falha não bloqueante ao inicializar visita automática:", visitErr);
            }
          }

          // Libera o carregamento do shell principal
          setIsVerifying(false);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError' && isMounted) {
          console.error("🔒 [Gatekeeper] Falha na validação do perfil ou sessão expirada:", err);
          
          // Limpa os dados da sessão corrompida
          performLogout(); 

          // Redireciona respeitando estritamente o fallback_url fornecido pelo backend
          const currentPath = typeof window !== "undefined" ? window.location.pathname : "/sbxpay";
          const fallback = err?.fallback_url || `/accounts/signin?redirect_uri=${encodeURIComponent(currentPath)}`;
          
          window.location.href = fallback;
        }
      }
    }

    validateSessionAndInitializeVisit();

    // Função de limpeza para evitar memory leaks caso o componente seja desmontado
    return () => { 
      isMounted = false; 
      controller.abort(); 
    }; 
  }, [isLoading, sessionToken, navigate]);

  // =========================================================================
  // [RENDERIZAÇÃO DE ESTADOS VISUAIS]
  // =========================================================================

  // Exibe o spinner nativo enquanto o perfil é validado e a visita inicial é aberta
  if (isLoading || isVerifying) {
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