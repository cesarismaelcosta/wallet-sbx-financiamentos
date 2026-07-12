import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { callOrchestrator } from "@/features/financial-hub/core/services/gateway";
import { useState } from "react";

/**
 * Registro de intenções de navegação.
 * Define o mapeamento entre a ação de negócio e o comportamento do evento.
 */
export const NAVIGATION_INTENTS = {
  REDIRECT_PARTNER_PAGE: {
    action: 'REDIRECT',
    action_description: 'REDIRECT_PARTNER_PAGE',
    target: '_self' // Substitui a aba atual para manter o fluxo
  },
  REDIRECT_PARTNER_WHATSAPP: {
    action: 'CONTACT',
    action_description: 'REDIRECT_PARTNER_WHATSAPP',
    target: '_blank' // Abre em nova aba para não perder a página
  }
} as const;

/**
 * Hook customizado para centralizar a lógica de redirecionamento e rastreamento.
 * * Este hook garante que toda saída para parceiros ou suporte humano seja
 * devidamente registrada no backend via `orchestrateNavigation` antes da execução.
 * * @example
 * const { handleRedirect } = useNavigation();
 * // No botão:
 * onClick={() => handleRedirect(NAVIGATION_INTENTS.REDIRECT_PARTNER_WHATSAPP, config.urlWhatsApp)}
 */

export function useNavigation() {
  const { state } = useWizard<any>();
  const [loading, setLoading] = useState(false);

  /**
   * Executa a orquestração do evento e gerencia o redirecionamento.
   * * @param intent - A intenção de navegação (ver NAVIGATION_INTENTS).
   * @param externalUrl - (Opcional) URL externa para abrir (ex: WhatsApp).
   */
  const handleRedirect = async (
    intent: typeof NAVIGATION_INTENTS[keyof typeof NAVIGATION_INTENTS], 
    externalUrl?: string,
    consentsData?: any[]  // Dados de consentimentos da visita para enviar junto se a página tiver
  ) => {

    setLoading(true);
    // 1. Monta o payload padronizado
    const payload = {
      ...state.data,
      action: intent.action,
      action_description: intent.action_description,
      origin_url: window.location.origin + window.location.pathname,  // URL atual de onde o usuário está saindo
      target_url: externalUrl, // A URL de destino que o usuário será redirecionado (se aplicável)
      consents: consentsData || [], // Inclui os consentimentos atuais se fornecidos
      timestamp: new Date().toISOString()
    };

    if (import.meta.env.DEV) {
      console.group(`[useNavigation.ts | useNavigation] Navigation Event: ${intent.action_description}`);
      console.log("Estado Atual do Wizard:", state.data);
      console.log("Payload Enviado para Orquestração:", payload);
      console.log("Intent Recebida:", intent);
      console.groupEnd();
    }

    try {
      // 2. Dispara a orquestração (Obrigatório para rastreio)
      await callOrchestrator(payload, "POST");
      
      // 3. Executa a navegação usando o target configurado
      if (externalUrl) {
        window.open(externalUrl, intent.target);
      }
    } catch (error) {
      // 1. Log Estruturado: O erro agora é um objeto, então não tente concatenar ele em strings
      console.error("[useNavigation.ts | handleRedirect] Falha na orquestração:", {
        message: error.message,
        code: error.code,
        status: error.status,
        response: error.response // Esta chave agora existe e contém o JSON do servidor
      });
    } finally {
      // Se for WhatsApp (abriu nova aba), desbloqueia imediatamente
      // Se for página interna, deixa o loading até a navegação terminar
      if (intent.target === '_blank') {
        setLoading(false);
      }
    }
  };

  return { handleRedirect, loading };
}