/**
 * @fileoverview Componente: sbXPAYLayOut (Esqueleto Mestre e Gatekeeper do Hub Financeiro)
 * @path src/routes/sbxpay.lazy.tsx
 * 
 * =========================================================================
 * [ARQUITETURA E FLUXO DE SEGURANÇA]
 * =========================================================================
 * Funciona como o Gatekeeper de Sessão e Provedor de Contexto do Hub Financeiro (sbxpay).
 * Toda a responsabilidade de escolha de ambiente (Pre-Login Gate) foi REMOVIDA deste layout,
 * delegando essa definição para as variáveis de build (`VITE_APP_ENV`) ou para a UI do Login.
 * 
 * [PRINCIPAIS RESPONSABILIDADES]
 * 1. Gatekeeper de Redirecionamento: Intercepta qualquer tentativa de acesso sem sessão ativa
 *    e redireciona o usuário para `/accounts/signin` preservando a rota de origem (`redirect_uri`).
 * 2. Hidratação da Sessão (`fetchMyProfile`): Valida a sessão diretamente no servidor (BFF)
 *    através de Cookies HttpOnly (`credentials: "include"`), sem ler dados de `localStorage`.
 * 3. Tratamento de Exsurgência/Expiração (`SESSION_EXPIRED`): Intercepta falhas de autenticação 
 *    e respeita rigorosamente o `fallback_url` enviado pelo backend para quebrar loops de redirecionamento.
 * 4. Gerenciamento de Estado em Memória (`UserDataContext`): Provê os dados do perfil hidratado
 *    (`BFFUserProfile`) e a ação de `performLogout` para todas as rotas filhas via `<Outlet />`.
 * 5. Prevenção de Memory Leaks e Abort Control: Cancela requisições pendentes via `AbortController`
 *    caso o componente seja desmontado durante a validação.
 */

import { createContext, useState, useEffect, useRef } from "react";
import { createLazyFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { fetchMyProfile } from "@/services/user";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { BFFUserProfile } from "@/features/financial-hub/components/shared/types";

// =========================================================================
// CONFIGURAÇÃO DA ROTA (TanStack Router)
// =========================================================================
export const Route = createLazyFileRoute("/sbxpay")({
  component: sbXPAYLayOut, 
});

// =========================================================================
// CONTEXTO DE DADOS DO USUÁRIO
// =========================================================================
export const UserDataContext = createContext<{ 
  userData: BFFUserProfile | null; 
  performLogout: () => void; 
} | null>(null);

// =========================================================================
// [COMPONENTES AUXILIARES]: Indicador Visual de Carregamento
// =========================================================================
const Spinner = ({ msg }: { msg: string }) => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#B400FF] mb-4"></div>
    <p className="text-slate-500 font-medium text-sm">{msg}</p>
  </div>
);

// =========================================================================
// [COMPONENTE PRINCIPAL]: Layout e Gatekeeper Mestre
// =========================================================================
export function sbXPAYLayOut() {
  const { sessionToken, isLoading, logout } = useFinancialAuth();
  const navigate = useNavigate();
  const logoutRef = useRef(logout);

  // Mantém a referência atualizada da função de logout para evitar stale closures em async effects
  useEffect(() => { 
    logoutRef.current = logout; 
  }, [logout]);

  const [userData, setUserData] = useState<BFFUserProfile | null>(null);
  const [isVerifying, setIsVerifying] = useState(true);

  /**
   * Encapsula o encerramento da sessão limpando o estado em memória e acionando o contexto global
   */
  const performLogout = () => {
    setUserData(null);
    logoutRef.current();
  };

  // =========================================================================
  // [GATEKEEPER & REHYDRATION]: Redirecionamento Direto ou Validação de Perfil
  // =========================================================================
  useEffect(() => {
    let isMounted = true;

    // Aguarda a inicialização do contexto de autenticação antes de tomar decisões
    if (isLoading) return; 

    // CENÁRIO A: Usuário não autenticado -> Redireciona imediatamente para o Login
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

    // CENÁRIO B: Usuário com sessão ativa -> Inicia hidratação do perfil via BFF
    if (isMounted) setIsVerifying(true); 
    const controller = new AbortController();

    async function validateSession() {
      try {
        const profile = await fetchMyProfile({ signal: controller.signal });
        
        // Validação defensiva caso o perfil retorne um indicativo explícito de falha/expiração
        if (!profile || (profile as any).success === false) {
          throw { 
            code: (profile as any)?.code || 'SESSION_EXPIRED', 
            fallback_url: (profile as any)?.fallback_url 
          };
        }

        if (isMounted) {
          setUserData(profile as BFFUserProfile);
          setIsVerifying(false);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error("🔒 [Gatekeeper] Falha na validação do perfil ou sessão expirada:", err);
          
          // Executa a limpeza da sessão atual
          performLogout(); 

          // Respeita obrigatoriamente o fallback_url fornecido pelo backend para evitar loops
          const currentPath = typeof window !== "undefined" ? window.location.pathname : "/sbxpay";
          const fallback = err?.fallback_url || `/accounts/signin?redirect_uri=${encodeURIComponent(currentPath)}`;
          
          // Redireciona de forma absoluta para a URL de login correta
          window.location.href = fallback;
        }
      }
    }

    validateSession();

    return () => { 
      isMounted = false; 
      controller.abort(); 
    }; 
  }, [isLoading, sessionToken, navigate]);

  // =========================================================================
  // [RENDERIZAÇÃO DE ESTADOS]
  // =========================================================================

  // [CENA 1]: Carregamento inicial do contexto ou reidratação do perfil
  if (isLoading || isVerifying) {
    return <Spinner msg="Validando seus dados na Wallet sbX..." />;
  }

  // [CENA 2]: Sessão Validada -> Renderização do Shell Principal e Sub-rotas via Outlet
  return (
    <div className="sbxpay-shell min-h-screen bg-white">
      <UserDataContext.Provider value={{ userData, performLogout }}>
        <Outlet />
      </UserDataContext.Provider>
    </div>
  );
}