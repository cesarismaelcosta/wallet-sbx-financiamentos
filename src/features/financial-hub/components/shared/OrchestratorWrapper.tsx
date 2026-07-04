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

  // 2. BRANDING: Memoização das cores e assets dinâmicos
  const brandStyles = useMemo(() => {
    const fallback = {
      primary_color: "#B300FF",
    };

    // Segurança: Garantimos que page_configs existe antes de acessar theme
    const config = simData?.page_configs?.theme || fallback;
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

  // Se a API falhou miseravelmente (Erro 500, etc), ele pode ejetar um erro de sistema.
  // Caso contrário, ele NÃO bloqueia nada e não desenha Divs.
  if (error) {
    return <div className="p-10 text-center text-red-500">{error}</div>; // Único UI aceitável (Boundary)
  }

  // RETORNO HEADLESS: Não tem mais <div className="min-h-screen...">
  // Ele simplesmente invisivelmente repassa os dados para baixo.
  return <>{children(simData)}</>;
}