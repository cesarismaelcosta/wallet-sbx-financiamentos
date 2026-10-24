/**
 * @fileoverview Contrato de Dados: VeiculosWizardData
 * @path src/features/financial-hub/components/products/financial/veiculos/veiculos.types.ts
 *
 * Estado do wizard da jornada de Veículos (mesmo padrão de card.types / simulacao.types).
 */

import type { HubData } from "@/features/financial-hub/components/shared/types";

export interface VeiculosWizardData extends HubData {
  // Estados Reativos do Simulador
  valorVeiculo?: number;
  valorEntrada?: number;
  taxa?: number;
}
