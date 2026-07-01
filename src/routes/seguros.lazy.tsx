/**
 * @fileoverview Rota Pai: /seguros
 * @description Wrapper de segurança e layout para as jornadas de seguros.
 * @context Garante a integridade da sessão do usuário antes de renderizar qualquer sub-rota de seguro.
 * @compliance Proteção de acesso e controle de sessão (Auth Guard) para evitar exposição de dados.
 */

import { createLazyFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { FinancialHubLayout } from "@/features/financial-hub/components/layout/FinancialHubLayout";
import { useFinancialAuth } from "@/hooks/useFinancialAuth";
import { useEffect } from "react";

/**
 * SegurosGuard
 * Componente responsável por proteger o acesso às rotas de seguro.
 * Interrompe a renderização caso o usuário não esteja autenticado.
 */
const SegurosGuard = () => {
  const { sbxToken } = useFinancialAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // [BUSINESS LOGIC]: Se não houver token, o acesso deve ser bloqueado imediatamente.
    // Redirecionamos para o login para evitar a exposição de dados sensíveis da jornada.
    if (!sbxToken) {
      navigate({ to: '/accounts/signin' });
    }
  }, [sbxToken, navigate]);

  // [COMPLIANCE]: Fail-safe de renderização.
  // Retorna null para garantir que nenhum layout ou componente filho seja montado
  // enquanto a navegação de redirecionamento ocorre no background.
  if (!sbxToken) return null;

  return (
    <FinancialHubLayout>
      <Outlet />
    </FinancialHubLayout>
  );
};

export const Route = createLazyFileRoute('/seguros')({
  component: SegurosGuard,
});