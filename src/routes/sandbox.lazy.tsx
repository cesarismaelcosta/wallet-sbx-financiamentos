/**
 * @fileoverview Componente: SandboxLayout
 * * Esqueleto mestre de segurança da Sandbox.
 * * [RESPONSABILIDADES]:
 * 1. Gatekeeper: Valida a integridade da sessão no servidor (Edge Function) uma única vez.
 * 2. Provedor de Dados: Hidrata o estado do usuário e compartilha via Outlet context.
 * 3. Prevenção de Leak: Controla o estado de montagem e evita chamadas duplicadas.
 * 4. Delegação de Encerramento: Repassa falhas (401) ao AuthContext para expurgo de cache.
 */

import { createContext, useState, useEffect } from "react";
import { createLazyFileRoute, Outlet } from "@tanstack/react-router";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { fetchMyProfile } from "@/services/user";

export const Route = createLazyFileRoute("/sandbox")({
  component: SandboxLayout, 
});

// contexto
export const UserDataContext = createContext<any>(null);

export function SandboxLayout() {
  const { token, isLoading, logout } = useFinancialAuth();
  
  // [DATA]: Armazena o perfil hidratado para consumo das rotas filhas.
  const [userData, setUserData] = useState<any>(null);
  const [isVerifying, setIsVerifying] = useState(true);

  // -----------------------------------------------------------------------
  // [SECURITY LOOP]: Validação Contínua de Acesso
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (isLoading) return;

    // [GUARD]: Ejeção imediata caso o token esteja ausente (Acesso direto negado)
    if (!token) {
      const currentPath = window.location.pathname + window.location.search;
      window.location.href = `/accounts/signin?redirect=${encodeURIComponent(currentPath)}`;
      return;
    }

    let isMounted = true;
    let isProcessing = false; // [LOCK]: Impede Race Condition no React Strict Mode.

    async function validate() {
      if (isProcessing) return; 
      isProcessing = true;

      try {
        // [NETWORK]: Chamada única de hidratação.
        const profile = await fetchMyProfile(token!);
        
        if (isMounted) {
          setUserData(profile);
          setIsVerifying(false);
        }
      } catch (err: any) {
        console.error("🔒 [Sandbox Gatekeeper] Falha de validação:", err.message);
        // [ERROR HANDLING]: Qualquer erro de sessão limpa o estado global (logout).
        if (isMounted) logout();
      } finally {
        isProcessing = false;
      }
    }

    validate();
    return () => { isMounted = false; };
  }, [isLoading, token, logout]);

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

  console.log("DEBUG PAI:", userData);

  // [DATA FLOW]: O contexto é passado para o Outlet, permitindo que as rotas
  // filhas consumam 'userData' sem disparar novas chamadas à API.
  return (
    <div className="sandbox-shell min-h-screen bg-white">
      {/* 2. Envolva o Outlet com o Provider */}
      <UserDataContext.Provider value={{ userData }}>
        <Outlet />
      </UserDataContext.Provider>
    </div>
  );
}