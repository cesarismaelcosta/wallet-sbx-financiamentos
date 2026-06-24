/**
 * @fileoverview Definição de Tipos para Manifestos
 * @path src/features/financial-hub/components/shared/manifest.types.ts
 * * @description Contrato estrito para estrutura de dados de navegação das jornadas.
 */

import React from "react";

export type StepComponent = React.ComponentType;

export interface WizardManifest {
  meta: {
    showProgress: boolean;
    // Adicionamos a configuração de grid opcional para flexibilidade
    layoutConfig?: {
      gridCols?: string; 
    };
    steps: {
      [stepNumber: number]: {
        label?: string;      // Rótulo curto para a régua
        title: string;       // Título principal do passo
        description: string; // Descrição de contexto
      };
    };
  };
  steps: Record<number, StepComponent>;
}