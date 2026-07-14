/**
 * @fileoverview Wrapper de Hidratação do Orquestrador
 * @path src/components/common/OrchestratorWrapper.tsx
 * * RESPONSABILIDADE DESTE COMPONENTE:
 * 1. Gerenciar o estado visual (Loading/Error/Success).
 * 2. Aplicar o Branding dinâmico (variáveis CSS) injetado pelo Orchestrator.
 * 3. Envelopar o conteúdo da página com o estilo e contexto necessários.
 */

import React, { useEffect, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useOrchestratorHydration } from "@/features/financial-hub/core/hooks/useOrchestrator";

interface OrchestratorWrapperProps {
  visitId: string;
  visitUpdateId?: string | null;
  children: (simData: any) => React.ReactNode;
}

export function OrchestratorWrapper({ visitId, visitUpdateId, children }: OrchestratorWrapperProps) {
  // 1. LÓGICA DE API: Delegamos a busca de dados ao hook especializado
  const { simData, loading, error } = useOrchestratorHydration(visitId, visitUpdateId);

  // ADICIONE ISSO
  console.log("DEBUG [OrchestratorWrapper] Renderizando com:", { loading, hasError: !!error, error });
  // DEBUG DE ESTADO DO HOOK
  useEffect(() => {
    console.log("DEBUG [OrchestratorWrapper] Ocorreu uma mudança no erro:", error);
  }, [error]);

  // 2. BRANDING: Memoização das cores e assets dinâmicos
  const brandStyles = useMemo(() => {
    const fallback = {
      primary_color: "#B300FF",
    };

    const config = simData?.page_configs.theme || fallback;
    return {
      "--brand-primary": config.primary_color ?? fallback.primary_color,
    } as React.CSSProperties;
  }, [simData]);

  // Efeito Global: Injeta as cores no :root do HTML (Isso é válido aqui pois é um side-effect lógico)
  useEffect(() => {
    const root = document.documentElement;
    Object.entries(brandStyles).forEach(([key, value]) => root.style.setProperty(key, value as string));
    return () => Object.keys(brandStyles).forEach((key) => root.style.removeProperty(key));
  }, [brandStyles]);

  const payload = useMemo(() => {
    // Se houver erro, retornamos o objeto de erro
    if (error) {
      console.log("DEBUG COMPLETO DO ERRO QUE CHEGOU NO WRAPPER:", JSON.stringify(error, null, 2));
      return {
        success: false,
        message: typeof error === 'string' ? error : "Erro desconhecido",
        fallback_url: error.response?.fallback_url || "/"
      };
    }
    
    // SE ESTIVER CARREGANDO OU NULO, retornamos um objeto de "carregando" 
    // para não quebrar o layout
    if (!simData) {
      return { success: 'loading' }; 
    }

    return simData; // Dados carregados com sucesso
  }, [error, simData]);

  return <>{children(payload)}</>;
}
