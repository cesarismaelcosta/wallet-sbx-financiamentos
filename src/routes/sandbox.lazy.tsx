/**
 * @fileoverview Componente: SandboxLayout
 * * Esqueleto mestre de segurança da Sandbox.
 * * [RESPONSABILIDADES]:
 * 1. Pre-Login Gate: Intercepta utilizadores sem sessão para configurar o ambiente (HML/PRD).
 * 2. Gatekeeper: Valida a integridade da sessão no servidor (Edge Function) uma única vez.
 * 3. Provedor de Dados: Hidrata o estado do usuário e compartilha via Outlet context.
 * 4. Prevenção de Leak: Controla o estado de montagem e evita chamadas duplicadas.
 * 5. Segurança Passiva: Valida o JWT localmente antes de engatilhar chamadas de rede.
 */

import { createContext, useState, useEffect } from "react";
import { createLazyFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { fetchMyProfile } from "@/services/user";
import { jwtDecode } from "jwt-decode"; 
import { WalletLogo } from "@/components/brand/WalletLogo";

export const Route = createLazyFileRoute("/sandbox")({
  component: SandboxLayout, 
});

// contexto
export const UserDataContext = createContext<any>(null);

export function SandboxLayout() {
  // [SECURITY]: Apenas o token (JWT Próprio) é acessível no front.
  const { token, isLoading, logout } = useFinancialAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // [STATE - PRE-LOGIN]: Controle do ambiente antes de autenticar
  const [envPreLogin, setEnvPreLogin] = useState<"staging" | "production">(
    (localStorage.getItem("sandbox_env") as "staging" | "production") || "production"
  );

  // [DATA]: Armazena o perfil hidratado para consumo das rotas filhas.
  const [userData, setUserData] = useState<any>(null);
  const [isVerifying, setIsVerifying] = useState(true);

  // -----------------------------------------------------------------------
  // [SECURITY LOOP]: Validação Contínua de Acesso (Só roda se houver token)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (isLoading || !token) return;

    // [SECURITY]: Validação Local Passiva (Clock Drift)
    // Antes de bater na API, verificamos se o seu JWT ainda é válido localmente.
    console.log("🔍 [DEBUG] Token sendo decodificado:", {
        tokenValue: token,
        type: typeof token,
        length: token?.length
    });
    
    try {
      const decoded = jwtDecode<{ exp?: number }>(token);
      const timeDelta = parseInt(localStorage.getItem('time_delta') || '0', 10);
      const syncedCurrentTimeInSeconds = Math.floor((Date.now() + timeDelta) / 1000);

      if (decoded.exp && decoded.exp < syncedCurrentTimeInSeconds) {
        console.warn("🚨 [UX Guard - Sandbox] Token expirado localmente. Abortando fetch.");
        window.dispatchEvent(new CustomEvent('session_expired'));
        return; 
      }
    } catch (error) {
      console.warn("⚠️ [UX Guard - Sandbox] Token malformado.");
      window.dispatchEvent(new CustomEvent('session_expired'));
      return;
    }

    let isMounted = true;
    let isProcessing = false; 

    async function validate() {
      if (isProcessing) return; 
      isProcessing = true;

      try {
        // [NETWORK]: Chamada autenticada com o seu JWT
        const profile = await fetchMyProfile(token!);
        
        if (isMounted) {
          setUserData(profile);
          setIsVerifying(false);
        }
      } catch (err: any) {
        console.error("🔒 [Sandbox Gatekeeper] Falha de validação no backend:", err.message);
        
        // [ERROR HANDLING]: Fallback de segurança para erros não relacionados à expiração
        if (isMounted) logout();
      } finally {
        isProcessing = false;
      }
    }

    validate();
    return () => { isMounted = false; };
  }, [isLoading, token, logout]);

  // =========================================================================
  // [UI/UX - CENA 1]: Auth Context a inicializar
  // =========================================================================
  if (isLoading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-slate-500 font-medium">Sincronizando estado...</p>
      </div>
    );
  }

  // =========================================================================
  // [UI/UX - CENA 2]: Pre-Login Gate (Sem Sessão)
  // =========================================================================
  if (!token) {
    const irParaLogin = () => {
      // Guarda a decisão de ambiente e delega para o Login Component Genérico
      localStorage.setItem("sandbox_env", envPreLogin);
      navigate({ 
        to: '/accounts/signin',
        search: { redirect: location.pathname }
      });
    };

    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 font-['Plus_Jakarta_Sans']">
        <div className="w-full max-w-[400px] bg-white rounded-xl shadow-sm border border-gray-100 p-8 text-center">
          <div className="flex justify-center mb-6"><WalletLogo size="md" /></div>
          
          <h1 className="text-lg font-black text-slate-800 mb-2 tracking-tight">Ambiente de Simulação</h1>
          <p className="text-sm text-slate-500 mb-8">
            Para onde os dados gerados nesta sessão devem ser apontados?
          </p>

          <div className="flex bg-gray-100 rounded-full p-1 mb-8 border border-gray-200">
            <button
              onClick={() => setEnvPreLogin("staging")}
              className={`flex-1 py-2.5 text-xs font-bold rounded-full transition-all border ${
                envPreLogin === "staging" ? "bg-white text-[#B400FF] border-[#B400FF] shadow-sm" : "text-gray-400 border-transparent hover:text-gray-600"
              }`}
            >
              STAGE (HML)
            </button>
            <button
              onClick={() => setEnvPreLogin("production")}
              className={`flex-1 py-2.5 text-xs font-bold rounded-full transition-all border ${
                envPreLogin === "production" ? "bg-white text-[#B400FF] border-[#B400FF] shadow-sm" : "text-gray-400 border-transparent hover:text-gray-600"
              }`}
            >
              PRODUÇÃO (PRD)
            </button>
          </div>

          <button
            onClick={irParaLogin}
            className="w-full h-12 bg-[#B400FF] hover:bg-[#9a00db] text-white font-bold rounded-full transition-colors"
          >
            Avançar para Login
          </button>
        </div>
      </div>
    );
  }

  // =========================================================================
  // [UI/UX - CENA 3]: Reidratação em curso (Com Sessão, aguardando perfil)
  // =========================================================================
  if (isVerifying) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-slate-500 font-medium">Validando acessos seguros...</p>
      </div>
    );
  }

  // =========================================================================
  // [UI/UX - CENA 4]: Acesso Concedido (DATA FLOW)
  // =========================================================================
  return (
    <div className="sandbox-shell min-h-screen bg-white">
      <UserDataContext.Provider value={{ userData }}>
        <Outlet />
      </UserDataContext.Provider>
    </div>
  );
}