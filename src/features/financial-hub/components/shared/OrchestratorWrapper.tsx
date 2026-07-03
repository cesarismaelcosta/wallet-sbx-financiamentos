/**
 * @fileoverview Wrapper de Hidratação do Orquestrador
 * @path src/components/common/OrchestratorWrapper.tsx
 * * ARQUITETURA DE DADOS (ZERO-URL-STATE):
 * - Este componente é o ponto de corte do acoplamento. Ele desconhece completamente a URL.
 * - Atua como um "Headless Component": Injeta estado e branding sem poluir o DOM.
 * * * RESPONSABILIDADE:
 * 1. Hidratar a jornada delegando a busca de estado ao Hook autônomo (Cofre).
 * 2. Aplicar o Branding dinâmico (variáveis CSS) injetado pelo Orquestrador.
 * 3. Repassar o payload (simData) silenciosamente para os componentes visuais.
 */

import React, { useEffect, useMemo } from "react";
// Loader2 removido: O componente é "Headless", o controle de Loading visual fica na Layout.
import { useOrchestratorHydration } from "@/features/financial-hub/core/hooks/useOrchestrator";

interface OrchestratorWrapperProps {
  // CONTRATO ESTRITO: Parâmetros de rota (visit_id) foram intencionalmente removidos.
  // Isso força o componente a consumir os dados da sessão persistida e não da URL.
  children: (simData: any) => React.ReactNode;
}

export function OrchestratorWrapper({ children }: OrchestratorWrapperProps) {
  // 1. LÓGICA DE API (Autônoma): O hook não recebe argumentos de rota.
  // Ele próprio resolve os IDs lendo o sessionStorage.
  const { simData, loading, error } = useOrchestratorHydration();

  // 2. BRANDING: Memoização das cores e assets dinâmicos para evitar re-cálculos a cada render.
  const brandStyles = useMemo(() => {
    const fallback = {
      primary_color: "#B300FF",
    };

    // Navegação segura (?) para evitar estouro caso page_configs venha malformado do backend
    const config = simData?.page_configs?.theme || fallback;
    return {
      "--brand-primary": config.primary_color ?? fallback.primary_color,
    } as React.CSSProperties;
  }, [simData]);

  // 3. EFEITO GLOBAL (Side-Effect Arquitetural):
  // Injeta as cores no :root do HTML. A função de cleanup (return) garante que 
  // as propriedades sejam limpas no desmonte, evitando vazamento de estilos entre jornadas.
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(brandStyles).forEach(([key, value]) => root.style.setProperty(key, value as string));
    return () => Object.keys(brandStyles).forEach((key) => root.style.removeProperty(key));
  }, [brandStyles]);

  // 4. ERROR BOUNDARY (Failsafe Crítico): 
  // Se a API falhar no handhsake (Erro 500, etc), ele ejeta um erro visual 
  // e estanca a renderização dos filhos imediatamente.
  if (error) {
    return <div className="p-10 text-center text-red-500">{error}</div>; 
  }

  // 5. RETORNO HEADLESS (Inversão de Controle): 
  // Repassa os dados de forma invisível. Sem <div className="..."> extras.
  return <>{children(simData)}</>;
}