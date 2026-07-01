/**
 * @fileoverview Layout de Proteção da Sandbox
 * 
 * @description
 * Atua como o "Gatekeeper" central para todas as rotas da área de Sandbox.
 * Gerencia o acesso utilizando exclusivamente o FinancialAuthContext.
 */

import { createLazyFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";

export const Route = createLazyFileRoute("/sandbox")({
  component: SandboxLayout, 
});

function SandboxLayout() {
  const { token, isLoading } = useFinancialAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // [BUSINESS LOGIC]: Bloqueio de acesso não autenticado com trava anti-loop.
    // O location.pathname é salvo para que o login saiba para onde devolver o usuário.
    if (!isLoading && !token && location.pathname !== '/accounts/signin') {
      navigate({ 
        to: "/accounts/signin",
        search: { redirect: location.pathname }
      });
    }
  }, [token, isLoading, navigate, location.pathname]);

  // [COMPLIANCE]: Estado de carregamento seguro.
  // Mostra o feedback visual enquanto o sistema valida a sessão.
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Verificando acesso…
        </div>
      </div>
    );
  }

  // [COMPLIANCE]: Fail-safe de segurança.
  // Impede a renderização do conteúdo restrito no fundo enquanto ocorre o redirecionamento.
  if (!token) return null;

  return (
    <div className="sandbox-shell">
      <Outlet />
    </div>
  );
}