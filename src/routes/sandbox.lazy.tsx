/**
 * @fileoverview Layout de Proteção da Sandbox
 * 
 * [RESPONSABILIDADES]:
 * 1. Gatekeeper: Valida a integridade da sessão no servidor antes de permitir a renderização.
 * 2. Prevenção de Loop: Interrompe ciclos de re-autenticação limpando dados inválidos via logout().
 */

import { useState, useEffect } from "react";
import { createLazyFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { fetchMyProfile } from "@/services/user";

export const Route = createLazyFileRoute("/sandbox")({
  component: SandboxLayout, 
});

function SandboxLayout() {
  // [STATE]: Extraímos o 'logout' para garantir a destruição de tokens inválidos
  const { token, isLoading, logout } = useFinancialAuth();
  const [isVerifying, setIsVerifying] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // [BUSINESS LOGIC]: Se o contexto ainda carrega do localStorage, aguardamos.
    if (isLoading) return;

    // [BUSINESS LOGIC]: Sem token absoluto, redirecionamento limpo para o login.
    if (!token) {
      navigate({ to: "/accounts/signin", replace: true });
      return;
    }

    // [BUSINESS LOGIC]: Validação de integridade do token junto ao servidor.
    let active = true;
    
    async function validate() {
      try {
        await fetchMyProfile(token!);
        if (active) setIsVerifying(false);
      } catch (err) {
        console.error("Sessão inválida ou expirada:", err);
        if (active) {
          // [CRITICAL FIX]: O token existe no front, mas foi rejeitado pela API.
          // Se apenas usarmos navigate(), a tela de login lerá o token fantasma 
          // e devolverá o usuário para cá, causando o loop infinito.
          // O logout() oblitera o token do estado e do storage antes de redirecionar.
          logout(); 
        }
      }
    }

    validate();
    
    return () => { active = false; };
  }, [isLoading, token, navigate, logout]);

  // [COMPLIANCE]: O estado de loading impera sobre o render.
  if (isLoading || isVerifying) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Verificando sessão...
      </div>
    );
  }

  // [ESTABILIDADE DO DOM]: Substitui o antigo 'return null'.
  // Garante que o componente permaneça na árvore do React de forma segura 
  // durante a fração de segundo em que o logout() limpa o estado e altera a rota,
  // prevenindo o erro Transitioner do TanStack Router.
  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        Redirecionando para login...
      </div>
    );
  } 

  return (
    <div className="sandbox-shell">
      <Outlet />
    </div>
  );
}