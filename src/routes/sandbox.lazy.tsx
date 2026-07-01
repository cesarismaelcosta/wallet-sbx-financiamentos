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
    // [CRÍTICO]: A verificação de loading PRECISA ser a primeira coisa.
    // Se o contexto ainda está lendo o storage, não podemos decidir nada.
    if (isLoading) return;

    // [BUSINESS LOGIC]: Sem token absoluto, redirecionamento limpo para o login passando pagina atual.
    if (!token) {
      // Captura onde o usuário está ANTES de mandar para o login
      const currentPath = window.location.pathname + window.location.search;
      
      // Passa esse caminho como parâmetro para o login
      navigate({ 
        to: "/accounts/signin", 
        search: { redirect: currentPath }, 
        replace: true 
      });
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
          // logout(); 
          // O redirecionamento aqui é importante caso a validação falhe em uma rota protegida
          navigate({ 
            to: "/accounts/signin", 
            search: { redirect: window.location.pathname + window.location.search },
            replace: true 
          });
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