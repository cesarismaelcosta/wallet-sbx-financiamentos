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

  // 1. Lógica de validação (mantém igual, apenas removemos o navigate daqui)
  useEffect(() => {
    if (isLoading || !token) return;

    let active = true;
    async function validate() {
      try {
        await fetchMyProfile(token!);
        if (active) setIsVerifying(false);
      } catch (err) {
        console.error("Sessão inválida:", err);
        // Não chamamos navigate aqui ainda
      }
    }
    validate();
    return () => { active = false; };
  }, [isLoading, token]);

  // 2. Renderização (o "Gateway")
  
  // Se está carregando, mostra o loader.
  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center">Verificando...</div>;
  }

  // Se não tem token, a ÚNICA coisa que o componente faz é redirecionar.
  // Isso não causa erro de transição porque é um componente, não uma função de estado.
  if (!token) {
    return <Navigate to="/accounts/signin" replace />;
  }

  // Se tem token, mas está verificando o perfil, mostra o loader.
  if (isVerifying) {
    return <div className="flex min-h-screen items-center justify-center">Verificando...</div>;
  }

  // Só chega aqui se o token é válido e a verificação passou.
  return (
    <div className="sandbox-shell">
      <Outlet />
    </div>
  );
}