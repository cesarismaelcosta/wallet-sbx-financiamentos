/**
 * @fileoverview Contrato de Dados: SimulacaoWizardData
 * * PROPÓSITO:
 * Define a estrutura de estado global para a jornada de simulação.
 * * INTEGRAÇÃO:
 * - Utilizado pelo `useWizard<SimulacaoWizardData>()` em todos os steps.
 * 
 * [ATUALIZAÇÃO DE DESIGN SYSTEM]:
 * - Neutral Purity & Zero-Radius: Propriedades customizadas de `theme` forçam a consistência de cores e bordas em todos os componentes do Simulador.
 * - Tipografia: Propriedades customizadas de `theme` forçam a consistência de fontes, pesos e tamanhos em todos os componentes do Simulador.
 * - Layout: Propriedades customizadas de `theme` forçam a consistência de espaçamentos, margens e paddings em todos os componentes do Simulador.
 */

import type {
  ConsentConfig,
  Event,
  GatewayResult,
  HubData,
  HubEntity,
  Offer,
  PageConfigs,
  ProductRules,
} from "@/features/financial-hub/components/shared/types";

export interface SimulacaoWizardData extends HubData {
  page_configs: PageConfigs;
  offer: Partial<Offer>;
  rules: ProductRules | null; // o servidor manda null quando o produto não tem regras
  consent_configs: ConsentConfig[];
  simulationResult?: GatewayResult | null;
  // Estados Reativos do Simulador
  valorOferta?: number;
  valorVeiculo: number;
  valorEntrada: number;
  parcelas: number;
  taxa: number;
  entity: HubEntity;
  event: Partial<Event>;
}