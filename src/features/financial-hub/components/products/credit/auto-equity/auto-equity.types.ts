// auto-equity.types.ts

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