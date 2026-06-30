/**
 * @fileoverview Layout de Proteção da Sandbox
 * 
 * @description
 * Atua como o "Gatekeeper" central para todas as rotas da área de Sandbox.
 * Gerencia o acesso utilizando exclusivamente o FinancialAuthContext.
 */

import { createLazyFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";

export const Route = createLazyFileRoute("/sandbox")({
  component: SandboxLayout, 
});

function SandboxLayout() {
  const { token, isLoading } = useFinancialAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !token) {
      navigate({ to: "/accounts/signin" });
    }
  }, [token, isLoading, navigate]);

  if (isLoading || !token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Verificando acesso…
        </div>
      </div>
    );
  }

  return (
    <div className="sandbox-shell">
      <Outlet />
    </div>
  );
}