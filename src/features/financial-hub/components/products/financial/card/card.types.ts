/**
 * @fileoverview Definição de Tipos - Jornada de Cartão
 * @path src/components/card/cartao.types.ts
 */

export interface PageConfig {
  theme: {
    primary_color: string;
    box_bg: string;
    box_radius: string;
  };
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