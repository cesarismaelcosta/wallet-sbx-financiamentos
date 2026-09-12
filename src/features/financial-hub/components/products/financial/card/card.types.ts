/**
 * @fileoverview Definição de Tipos - Jornada de Cartão
 * 
 * [ATUALIZAÇÃO DE DESIGN SYSTEM]:
 * - Neutral Purity & Zero-Radius: Propriedades customizadas de `theme` forçam a consistência de cores e bordas em todos os componentes do Card.
 * - Tipografia: Propriedades customizadas de `theme` forçam a consistência de fontes, pesos e tamanhos em todos os componentes do Card.
 * - Layout: Propriedades customizadas de `theme` forçam a consistência de espaçamentos, margens e paddings em todos os componentes do Card.
 */

export interface PageConfig {
  offer_panel: {
    partner: {
      name: string;
      label: string;
    };
    headline: {
      parts: { text: string; type: 'normal' | 'highlight' | 'bold' }[];
    };
    description: {
      parts: { text: string; type: 'normal' | 'highlight' | 'bold' }[];
    };
    benefits: {
      icon: string;
      title: string;
      description: string;
    }[];
  };
  footer?: {
    links: { url: string; text: string }[];
    template_text: string;
  };
}

export interface CardWizardData extends Record<string, any> {
  page_configs: PageConfig;
  offer: any;
  rules: any;
  consent_configs: any[];
  simulationResult?: any;

  // Estados Reativos do Simulador
  valorVeiculo: number;
  valorEntrada: number;
  parcelas: number;
  taxa: number;

  entity: any;
  event: any;
}