/**
 * @fileoverview Componente: sbXPAYLayOut (Esqueleto Mestre e Gatekeeper do Hub Financeiro)
 *
 * ARQUITETURA E FLUXO DE SEGURANÇA:
 * Funciona como o Gatekeeper de Sessão e Provedor de Contexto do Hub Financeiro (sbxpay).
 * Toda a responsabilidade de escolha de ambiente (Pre-Login Gate) foi REMOVIDA deste layout,
 * delegando essa definição para as variáveis de build (`VITE_APP_ENV`) ou para a UI do Login.
 *
 * PRINCIPAIS RESPONSABILIDADES:
 * 1. Gatekeeper de Redirecionamento: Intercepta qualquer tentativa de acesso sem sessão ativa
 *    e redireciona o usuário para `/accounts/signin` preservando a rota de origem (`redirect_uri`).
 * 2. Hidratação da Sessão (`fetchMyProfile`): Valida a sessão diretamente no servidor (BFF)
 *    através de Cookies HttpOnly (`credentials: "include"`), sem ler dados de `localStorage`.
 * 3. Gerenciamento de Estado em Memória (`UserDataContext`): Provê os dados do perfil hidratado
 *    (`BFFUserProfile`) e a ação de `performLogout` para todas as rotas filhas via `<Outlet />`.
 * 4. Prevenção de Memory Leaks e Abort Control: Cancela requisições pendentes via `AbortController`
 *    caso o componente seja desmontado durante a validação.
 */

import { createContext, useState, useEffect, useRef } from "react";
import { createLazyFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { fetchMyProfile } from "@/services/user";
import { WalletLogo } from "@/components/brand/WalletLogo";
import { BFFUserProfile } from "@/features/financial-hub/components/shared/types";

export const Route = createLazyFileRoute("/sbxpay")({
  component: sbXPAYLayOut, 
});

export const UserDataContext = createContext<{ 
  userData: BFFUserProfile | null; 
  performLogout: () => void; 
} | null>(null);

/**
 * Componente visual de indicação de carregamento/reidratação de estado.
 */
const Spinner = ({ msg }: { msg: string }) => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#B400FF] mb-4"></div>
    <p className="text-slate-500 font-medium text-sm">{msg}</p>
  </div>
);

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
        ? `${window.location.pathname}${window.location.search}` 
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
        if (isMounted) {
          setUserData(profile);
          setIsVerifying(false);
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error("🔒 [Gatekeeper] Falha na validação do perfil:", err);
          performLogout(); 
        }
      }
    }

    validateSession();

    return () => { 
      isMounted = false; 
      controller.abort(); 
    }; 
  }, [isLoading, sessionToken, navigate]);

  // [CENA 1]: Carregamento inicial do contexto ou reidratação do perfil
  if (isLoading || isVerifying) {
    return <Spinner msg="Validando seus dados na Wallet sbX..." />;
  }

  // [CENA 2]: Sessão Validada -> Renderização do Shell e Sub-rotas
  return (
    <div className="sbxpay-shell min-h-screen bg-white">
      <UserDataContext.Provider value={{ userData, performLogout }}>
        <Outlet />
      </UserDataContext.Provider>
    </div>
  );
}