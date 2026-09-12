/**
 * @fileoverview Wrapper de Hidratação do Orquestrador
 * @path src/components/common/OrchestratorWrapper.tsx
 * * RESPONSABILIDADE DESTE COMPONENTE:
 * 1. Gerenciar o estado de hidratação (Loading/Error/Success).
 * 2. Repassar o payload resolvido pelo Orchestrator para os filhos (Wizard).
 * 
 * [ATUALIZAÇÃO DE DESIGN SYSTEM]:
 * - Neutral Purity & Zero-Radius: Lógica de injeção de CSS customizado 
 *   (--brand-primary via `theme`) removida. O branding visual customizado não é mais suportado.
 */

import React, { useMemo } from "react";
import { useOrchestratorHydration } from "@/features/financial-hub/core/hooks/useOrchestrator";
import { GatewayErrorResponse } from "@/features/financial-hub/core/services/gateway";

interface OrchestratorWrapperProps {
  visitId: string;
  visitUpdateId?: string | null;
  children: (simData: any) => React.ReactNode;
}

export function OrchestratorWrapper({ visitId, visitUpdateId, children }: OrchestratorWrapperProps) {
  // 1. LÓGICA DE API: Delegamos a busca de dados ao hook especializado
  const { simData, loading, error } = useOrchestratorHydration(visitId, visitUpdateId);

  const payload = useMemo(() => {
    // Se houver erro, extraímos os dados conforme a estrutura do Gateway
    if (error) {
      // O 'error' aqui é o objeto que você deu throw no gateway.ts
      const errData = error as Partial<GatewayErrorResponse>;
      
      return {
        success: false,
        code: errData.code || "UNKNOWN_ERROR",
        message: errData.message || "Ocorreu um erro inesperado.",
        fallback_url: errData.fallback_url || "/"
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