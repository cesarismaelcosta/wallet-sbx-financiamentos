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

  useEffect(() => {
    // [BUSINESS LOGIC]: Se o contexto ainda carrega, não fazemos nada.
    if (isLoading) return;

    // [BUSINESS LOGIC]: Se não tem token, redireciona de imediato (sem checagem de API).
    if (!token) {
      navigate({ to: "/accounts/signin", replace: true });
      return;
    }

    // [BUSINESS LOGIC]: Se temos token, validamos a sessão APENAS UMA VEZ.
    // Usamos um flag local no escopo do useEffect para garantir isso.
    let active = true;
    
    async function validate() {
      try {
        await fetchMyProfile(token!);
        if (active) setIsVerifying(false);
      } catch (err) {
        console.error("Sessão inválida:", err);
        if (active) navigate({ to: "/accounts/signin", replace: true });
      }
    }

    validate();
    return () => { active = false; };
  }, [isLoading, token, navigate]);

  // [COMPLIANCE]: O estado de carregamento é o MESTRE aqui.
  if (isLoading || isVerifying) {
    return <div className="flex min-h-screen items-center justify-center">Verificando...</div>;
  }

  // MUDANÇA: Em vez de return null, mantemos uma div de transição.
  // Isso impede que o React desmonte o componente e dispare o erro de transição.
  if (!token) {
    return <div className="flex min-h-screen items-center justify-center">Redirecionando...</div>;
  }

  return (
    <div className="sandbox-shell">
      <Outlet />
    </div>
  );
}