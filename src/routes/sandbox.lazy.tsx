/**
 * @fileoverview Layout de Proteção da Sandbox
 * * [RESPONSABILIDADES]:
 * 1. Gatekeeper: Valida a integridade da sessão no servidor (Edge Function).
 * 2. Prevenção de Leak: Controla o estado de montagem do componente.
 * 3. Delegação de Encerramento: Repassa falhas para o AuthContext limpar o cache.
 */

import { useState, useEffect } from "react";
import { createLazyFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { fetchMyProfile } from "@/services/user";

export const Route = createLazyFileRoute("/sandbox")({
  component: SandboxLayout, 
});

export function SandboxLayout() {
  const { token, isLoading, logout } = useFinancialAuth();
  const [isVerifying, setIsVerifying] = useState(true);

  // -----------------------------------------------------------------------
  // [SECURITY LOOP]: Validação Contínua de Acesso
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (isLoading) return;

    // Se não tem token (limpamos o cache), manda pro login
    if (!token) {
      const currentPath = window.location.pathname + window.location.search;
      window.location.href = `/accounts/signin?redirect=${encodeURIComponent(currentPath)}`;
      return;
    }

    let isMounted = true;
    
    async function validate() {
      try {
        await fetchMyProfile(token!);
        if (isMounted) setIsVerifying(false);
      } catch (err: any) {
        console.error("🔒 [Sandbox Gatekeeper] Falha de validação:", err.message);
        if (isMounted) {
          // AQUI ESTÁ A MÁGICA: O logout volta a ficar ativo.
          // Se der qualquer problema de token, ele apaga o cache e te salva do limbo!
          logout(); 
        }
      }
    }

    validate();
    return () => { isMounted = false; };
  }, [isLoading, token, logout]);

  // =========================================================================
  // [UI/UX]: Renderização com o Loader Oficial
  // =========================================================================
  if (isLoading || isVerifying) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-slate-500 font-medium">Autenticando acesso...</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-slate-500 font-medium">Redirecionando...</p>
      </div>
    );
  } 

  return (
    <div className="sandbox-shell min-h-screen bg-white">
      <Outlet />
    </div>
  );
}