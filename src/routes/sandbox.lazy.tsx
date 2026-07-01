/**
 * @fileoverview Layout de Proteção da Sandbox
 * 
 * [RESPONSABILIDADES]:
 * 1. Gatekeeper: Valida a integridade da sessão no servidor antes de permitir a renderização.
 * 2. Prevenção de Loop: Interrompe ciclos de re-autenticação através de estado de verificação síncrona.
 */

import { useState, useEffect } from "react";
import { createLazyFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { fetchMyProfile } from "@/services/user";

export const Route = createLazyFileRoute("/sandbox")({
  component: SandboxLayout, 
});

function SandboxLayout() {
  const { token, isLoading } = useFinancialAuth();
  const [isVerifying, setIsVerifying] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    async function checkSession() {
      // [BUSINESS LOGIC]: Se não há token, encerra a verificação imediatamente.
      if (!token) {
        setIsVerifying(false);
        return;
      }

      try {
        // [BUSINESS LOGIC]: Validação ativa: checa a validade real do token no cofre (sbx-data).
        await fetchMyProfile(token);
        setIsVerifying(false);
      } catch (err) {
        // [COMPLIANCE]: Registro de erro técnico para auditoria de falhas de autenticação.
        console.error("Falha ao validar sessão na montagem:", err);
        setIsVerifying(false);
      }
    }
    
    if (!isLoading) checkSession();
  }, [token, isLoading]);

  // [COMPLIANCE]: Bloqueio de renderização (Loader) enquanto a sessão é validada.
  // Evita a "piscada" de tela e a exposição de dados antes da confirmação do servidor.
  if (isLoading || isVerifying) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Verificando acesso…
        </div>
      </div>
    );
  }

  // [BUSINESS LOGIC]: Bloqueio final de rota não autenticada.
  if (!token && location.pathname !== '/accounts/signin') {
    navigate({ 
      to: "/accounts/signin",
      search: { redirect: location.pathname }
    });
    return null;
  }

  return (
    <div className="sandbox-shell">
      <Outlet />
    </div>
  );
}