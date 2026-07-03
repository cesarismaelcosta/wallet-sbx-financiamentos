/**
 * @fileoverview Configuração de Rota Mestre: /seguros
 * @path src/routes/seguros.tsx
 * * --- ARQUITETURA DE TRANSPORTE DE ESTADO (ZERO-URL-STATE) ---
 * Assim como na rota de financiamentos, este arquivo atua como o Middleware 
 * de Handshake para as jornadas de seguros.
 * * * RESPONSABILIDADE:
 * Interceptar Deep Links (e-mail, SMS, parceiros) apontados para qualquer
 * jornada de seguros, sequestrar as chaves de sessão para o sessionStorage
 * e executar a higienização da URL antes da renderização do SegurosGuard.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/seguros')({
  /**
   * Interceptador de Pré-carregamento (Handshake Atômico).
   * @param {Object} context.search - Query params sujos da URL de entrada.
   * @param {Object} context.location - Path de destino limpo.
   */
  beforeLoad: ({ search, location }) => {
    // Extração segura dos parâmetros de transporte
    const { visit_id, visit_update_id } = search as Record<string, string | undefined>;

    if (visit_id) {
      
      // 1. COFRE: Isolamento do estado no nível da sessão do navegador
      sessionStorage.setItem("sbx_visit_id", visit_id);
      
      if (visit_update_id) {
        sessionStorage.setItem("sbx_last_update_id", visit_update_id);
      }

      // 2. NAVEGAÇÃO ATÔMICA: Aborta o carregamento sujo e força a rota limpa.
      // O 'replace: true' é o que garante que o usuário não caia em um loop
      // de redirecionamento caso utilize o botão "Voltar" do navegador.
      throw redirect({
        to: location.pathname,
        replace: true,
      });
    }
  }
});