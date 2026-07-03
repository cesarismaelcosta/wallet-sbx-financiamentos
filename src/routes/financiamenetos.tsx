/**
 * @fileoverview Configuração de Rota Mestre: /financiamentos
 * @path src/routes/financiamentos.tsx
 * * --- ARQUITETURA DE TRANSPORTE DE ESTADO (ZERO-URL-STATE) ---
 * O ciclo de vida desta rota foi projetado para atuar como um Middleware de Handshake.
 * O objetivo fundamental é garantir que chaves primárias ou tokens de sessão (visit_id)
 * nunca permaneçam expostos na barra de endereços do cliente e nem poluam a History Stack.
 * * MECANISMO DE EXECUÇÃO (BEFORE LOAD):
 * 1. Interceptação: O método `beforeLoad` é acionado ANTES de qualquer componente visual (Lazy) ser montado.
 * 2. Extração e Custódia: Captura os parâmetros voláteis da URL e realiza o commit imediato no `sessionStorage`.
 * 3. Redirecionamento Atômico: Dispara um `redirect` com `replace: true`, substituindo a entrada suja no histórico
 * pelo caminho limpo. O componente UI só é instanciado após a barra de endereços estar higienizada.
 */

import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/financiamenetos')({
  /**
   * Interceptador de Pré-carregamento.
   * Executa a validação e o handoff do estado antes da resolução do componente assíncrono.
   * * @param {Object} context - Contexto de roteamento fornecido pelo TanStack Router.
   * @param {Object} context.search - Parâmetros de query string extraídos da URL atual.
   * @param {Object} context.location - Metadados de localização geográfica e path da rota.
   */
  beforeLoad: ({ search, location }) => {
    // Cast defensivo para mapear propriedades dinâmicas injetadas pelo Orquestrador Upstream
    const { visit_id, visit_update_id } = search as Record<string, string | undefined>;

    // Se a rota receber as chaves de transporte na URL, inicia o protocolo de sequestro de estado
    if (visit_id) {
      
      // 1. PERSISTÊNCIA NO COFRE: Salva os IDs na sessão isolada da aba atual
      sessionStorage.setItem("sbx_visit_id", visit_id);
      
      if (visit_update_id) {
        sessionStorage.setItem("sbx_last_update_id", visit_update_id);
      }

      // 2. HIGIENIZAÇÃO DO HISTÓRICO: Aborta a renderização da rota suja.
      // Redireciona o fluxo para o mesmo pathname atual, mas força a remoção de todos os query params.
      // O parâmetro 'replace: true' sobrescreve o index atual da pilha do browser, impedindo 
      // que o botão "Voltar" (Back Button) cause loops infinitos de re-hidratação.
      throw redirect({
        to: location.pathname,
        replace: true,
      });
    }
  }
});