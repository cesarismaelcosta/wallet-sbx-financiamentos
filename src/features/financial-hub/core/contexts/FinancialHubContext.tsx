/**
 * @fileoverview Contexto Global da Simulação (Fonte de Verdade Neutra)
 * * * MOTIVO DA EXISTÊNCIA:
 * Atuar como a memória central (Store) da jornada do usuário. Ele guarda os 
 * dados brutos da API (simData) e as chaves de controle de UI.
 */

import { createContext, useContext } from "react";

// 1. Criação do Contexto React
// AJUSTE: Iniciamos com 'undefined' em vez de 'null'. 
// 'undefined' significa que não há Provider por perto. 'null' significará que os dados estão carregando.
export const FinancialHubContext = createContext<any>(undefined);

// 2. Hook Customizado (Atalho com Failsafe)
export function useProductConsult() {
  const context = useContext(FinancialHubContext);
  
  // 3. O Failsafe (Trava de Segurança)
  // Se o contexto for undefined, significa que esqueceram de envelopar o componente no Provider.
  if (context === undefined) {
    throw new Error(
      "CRÍTICO: useProductConsult foi chamado fora do FinancialHubContext.Provider. " +
      "Certifique-se de que o componente atual está envelopado pelo Layout da jornada."
    );
  }

  return context;
}