/**
 * @fileoverview Componente: sbXPAYLayOut
 * * Esqueleto mestre de segurança da sbxpay.
 * * [RESPONSABILIDADES]:
 * 1. Pre-Login Gate: Intercepta utilizadores sem sessão para configurar o ambiente (HML/PRD).
 * 2. Gatekeeper: Valida a integridade da sessão no servidor (Edge Function) uma única vez.
 * 3. Provedor de Dados: Hidrata o estado do usuário e compartilha via Outlet context.
 * 4. Prevenção de Leak: Controla o estado de montagem e evita chamadas duplicadas.
 * 5. Segurança Passiva: Valida o JWT localmente antes de engatilhar chamadas de rede.
 */

import { createContext, useState, useEffect, useRef } from "react";
import { createLazyFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { fetchMyProfile } from "@/services/user";
import { jwtDecode } from "jwt-decode"; 
import { WalletLogo } from "@/components/brand/WalletLogo";

export const Route = createLazyFileRoute("/sbxpay")({
  component: sbXPAYLayOut, 
});

export const UserDataContext = createContext<any>(null);

const Spinner = ({ msg }: { msg: string }) => (
  <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
    <p className="text-slate-500 font-medium text-sm">{msg}</p>
  </div>
);

export function sbXPAYLayOut() {
  const { sessionToken, isLoading, logout } = useFinancialAuth();
  const navigate = useNavigate();
  const logoutRef = useRef(logout);
  useEffect(() => { logoutRef.current = logout; }, [logout]);

  // Controla logout sem perder o ambiente escolhido antes do login
  const performLogout = () => {
    const env = localStorage.getItem("sbx_environment");
    localStorage.clear();
    if (env) localStorage.setItem("sbx_environment", env);
    logout();
  };

  const [envPreLogin, setEnvPreLogin] = useState<"staging" | "production">("production");
  const [userData, setUserData] = useState<any>(null);
  const [isVerifying, setIsVerifying] = useState(true);

  // 1. [SYNC - AMBIENTE]: Carrega o estado inicial do localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedEnv = (localStorage.getItem("sbx_environment") as "staging" | "production") || "production";
      if (savedEnv) setEnvPreLogin(savedEnv);
    }
  }, []);

  // 2. [GATEKEEPER]: Validação Contínua
  useEffect(() => {
    if (isLoading || !sessionToken) return;

    // [SECURITY]: Validação Local Passiva
    try {
      const decoded = jwtDecode<{ exp?: number }>(sessionToken);
      const timeDelta = typeof window !== "undefined" ? parseInt(localStorage.getItem('time_delta') || '0', 10) : 0;
      const syncedCurrentTimeInSeconds = Math.floor((Date.now() + timeDelta) / 1000);

      if (decoded.exp && decoded.exp < syncedCurrentTimeInSeconds) {
        window.dispatchEvent(new CustomEvent('session_expired'));
        return; 
      }
    } catch (err) {
      console.error("🔒 [Gatekeeper] Erro de decoding:", err);
      window.dispatchEvent(new CustomEvent('session_expired'));
      return;
    }

    let isMounted = true;
    async function validate() {
      try {
        const profile = await fetchMyProfile(sessionToken);
        if (isMounted) {
          setUserData(profile);
          setIsVerifying(false);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error("🔒 [sbXPAY Gatekeeper] Falha de validação no backend:", err.message);
          logoutRef.current();
        }
      }
    }

    validate();
    return () => { isMounted = false; };
  }, [isLoading, sessionToken]);

  // =========================================================================
  // [UI/UX - CENA 1]: Auth Context inicializando
  // =========================================================================
  if (isLoading) {
    return (
      <Spinner msg="Validando seus dados na Wallet sbX..."/>     
    );
  }

  // =========================================================================
  // [UI/UX - CENA 2]: Pre-Login Gate (Sem Sessão)
  // =========================================================================
  if (!sessionToken) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-['Plus_Jakarta_Sans']">
        <div className="w-full max-w-[400px] bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="flex justify-center mb-6"><WalletLogo size="md" /></div>
          
          <h1 className="text-lg font-semibold text-slate-600 mb-2 tracking-tight">Jornadas de Simulação</h1>
          <p className="text-sm text-slate-500 mb-8">
            Selecione o ambiente para carregar as ofertas. O login segue o fluxo real.
          </p>

          <div className="flex bg-gray-100 rounded-full p-1 mb-8 border border-gray-200">
            <button
              onClick={() => setEnvPreLogin("staging")}
              className={`flex-1 py-2.5 text-xs font-bold rounded-full transition-all border ${
                envPreLogin === "staging" ? "bg-white text-[#B400FF] border-[#B400FF] shadow-sm" : "text-gray-400 border-transparent hover:text-gray-600"
              }`}
            >
              STAGE
            </button>
            <button
              onClick={() => setEnvPreLogin("production")}
              className={`flex-1 py-2.5 text-xs font-bold rounded-full transition-all border ${
                envPreLogin === "production" ? "bg-white text-[#B400FF] border-[#B400FF] shadow-sm" : "text-gray-400 border-transparent hover:text-gray-600"
              }`}
            >
              PRODUÇÃO
            </button>
          </div>

          <button
            onClick={() => {
               localStorage.setItem("sbx_environment", envPreLogin);
               navigate({ 
                 to: '/accounts/signin', 
                 search: { 
                   redirect_uri: (typeof window !== "undefined" ? (window.location.pathname + window.location.search) : "/") || "/"
                 } 
               });
            }}
            className="w-full h-12 bg-[#B400FF] hover:bg-[#9a00db] text-white font-bold rounded-full transition-colors"
          >
            Avançar para Login
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // [UI/UX - CENA 3]: Reidratação em curso
  // =========================================================================
  if (isVerifying) {
    return (
      <Spinner msg="Validando seus dados na Wallet sbX..."/>
    );
  }

  // =========================================================================
  // [UI/UX - CENA 4]: Acesso Concedido
  // =========================================================================
  return (
    <div className="sbxpay-shell min-h-screen bg-white">
      <UserDataContext.Provider value={{ userData, performLogout }}>
        <Outlet />
      </UserDataContext.Provider>
    </div>
  );
}