/**
 * @fileoverview Componente: SandboxLayout
 * * Esqueleto mestre de segurança da Sandbox.
 * * [RESPONSABILIDADES]:
 * 1. Gatekeeper: Valida a integridade da sessão no servidor (Edge Function) uma única vez.
 * 2. Provedor de Dados: Hidrata o estado do usuário e compartilha via Outlet context.
 * 3. Prevenção de Leak: Controla o estado de montagem e evita chamadas duplicadas.
 * 4. Segurança Passiva: Valida o JWT localmente antes de engatilhar chamadas de rede.
 */

import { createContext, useState, useEffect } from "react";
import { createLazyFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { fetchMyProfile } from "@/services/user";
import { jwtDecode } from "jwt-decode"; 

export const Route = createLazyFileRoute("/sandbox")({
  component: SandboxLayout, 
});

// contexto
export const UserDataContext = createContext<any>(null);

export function SandboxLayout() {
  // [CORREÇÃO]: Apenas o token (JWT Próprio) é acessível no front. sbxToken não deve existir aqui.
  const { token, isLoading, logout } = useFinancialAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // [DATA]: Armazena o perfil hidratado para consumo das rotas filhas.
  const [userData, setUserData] = useState<any>(null);
  const [isVerifying, setIsVerifying] = useState(true);

  // -----------------------------------------------------------------------
  // [SECURITY LOOP]: Validação Contínua de Acesso
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (isLoading) return;

    // 1. [GUARD]: Ejeção imediata caso o token esteja ausente
    if (!token && location.pathname !== '/accounts/signin') {
      navigate({ 
        to: '/accounts/signin',
        search: { redirect: location.pathname }
      });
      return;
    }

    // 2. [SECURITY]: Validação Local Passiva (Clock Drift)
    // Antes de bater na API, verificamos se o seu JWT ainda é válido localmente.
    if (token) {
      // [DEBUGGING]: Imprima o que está chegando antes de decodificar
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
  }, [isLoading, token, logout, navigate, location.pathname]);

  // =========================================================================
  // [UI/UX]: Renderização (Anti-Flicker)
  // =========================================================================
  if (isLoading || isVerifying) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-slate-500 font-medium">Autenticando acesso seguro...</p>
      </div>
    );
  }

  // [DATA FLOW]: O contexto é passado para o Outlet
  return (
    <div className="sandbox-shell min-h-screen bg-white">
      <UserDataContext.Provider value={{ userData }}>
        <Outlet />
      </UserDataContext.Provider>
    </div>
  );
}