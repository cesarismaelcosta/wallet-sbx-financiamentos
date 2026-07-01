/**
 * @fileoverview Rota Pai: /seguros
 * @description Wrapper de segurança e layout para as jornadas de seguros.
 * @context Garante a integridade da sessão do usuário antes de renderizar qualquer sub-rota de seguro.
 * @compliance Proteção de acesso e controle de sessão (Auth Guard) para evitar exposição de dados.
 */

import { createLazyFileRoute, Outlet, useNavigate, useLocation } from '@tanstack/react-router';
import { FinancialHubLayout } from "@/features/financial-hub/components/layout/FinancialHubLayout";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

/**
 * SegurosGuard
 * Componente responsável por proteger o acesso às rotas de seguro.
 * Interrompe a renderização caso o usuário não esteja autenticado.
 */
const SegurosGuard = () => {
  // Ajustado para 'token' e 'isLoading' vindos do contexto
  const { token, isLoading } = useFinancialAuth();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // [BUSINESS LOGIC]: Se não houver token, o acesso deve ser bloqueado imediatamente.
    // Redirecionamos para o login para evitar a exposição de dados sensíveis da jornada.
    // A condição '!== /accounts/signin' impede o loop infinito, garantindo o redirect correto.
    if (!isLoading && !token && location.pathname !== '/accounts/signin') {
      navigate({ 
        to: '/accounts/signin',
        search: { redirect: location.pathname }
      });
    }
  }, [token, isLoading, navigate, location.pathname]);

  // [COMPLIANCE]: Estado de carregamento seguro.
  // Evita o redirecionamento prematuro ou o "flash" de tela enquanto valida o token.
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // [COMPLIANCE]: Fail-safe de renderização.
  // Retorna null para garantir que nenhum layout ou componente filho seja montado
  // enquanto a navegação de redirecionamento ocorre no background.
  if (!token) return null;

  return (
    <FinancialHubLayout>
      <Outlet />
    </FinancialHubLayout>
  );
};

export const Route = createLazyFileRoute('/seguros')({
  component: SegurosGuard,
});