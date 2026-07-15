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
 */
export function useNavigation() {
  const { state } = useWizard<any>();
  const [loading, setLoading] = useState(false);

  /**
   * Executa a orquestração do evento e gerencia o redirecionamento.
   * * @param intent - A intenção de navegação (ver NAVIGATION_INTENTS).
   * @param externalUrl - (Opcional) URL externa para abrir (ex: WhatsApp).
   * @param consentsData - Dados de consentimentos da visita para enviar junto.
   */
  const handleRedirect = async (
    intent: typeof NAVIGATION_INTENTS[keyof typeof NAVIGATION_INTENTS], 
    externalUrl?: string,
    consentsData?: any[]  
  ) => {

    setLoading(true);
    
    // 1. Monta o payload padronizado com os dados do estado do Wizard
    const payload = {
      ...state.data,
      action: intent.action,
      action_description: intent.action_description,
      origin_url: window.location.origin + window.location.pathname,
      target_url: externalUrl,
      consents: consentsData || [],
      timestamp: new Date().toISOString()
    };

    try {
      // 2. Dispara a orquestração (Obrigatório para rastreio)
      // Se o token estiver expirado, o Gateway lançará um erro aqui.
      await callOrchestrator(payload, "POST");
      
      // 3. Executa a navegação apenas se o rastreio for bem-sucedido
      if (externalUrl) {
        window.open(externalUrl, intent.target);
      }
    } catch (error: any) {
      // =========================================================================
      // INTERCEPTADOR DE SESSÃO
      // A fonte da verdade é o Backend (Gateway). Se ele envia um fallback_url,
      // nós obedecemos e redirecionamos. Não calculamos rotas no frontend.
      // =========================================================================
      const redirectUrl = error.response?.fallback_url;

      if ((error?.code === 'SESSION_EXPIRED' || error?.code === 'UNAUTHORIZED') && redirectUrl) {
        window.location.href = redirectUrl;
        return new Promise(() => {}); 
      }

      // 4. LOG ESTRUTURADO
      // O erro é um objeto contendo {message, code, status, response}.
      console.error("[useNavigation.ts | handleRedirect] Falha na orquestração:", {
        message: error?.message,
        code: error?.code,
        status: error?.status,
        response: error?.response
      });

      // 5. PROPAGAÇÃO DO ERRO
      // "Quem trata isso está acima". Repassamos o erro para o componente
      // de tela (Step1PartnersPanel ou outro) para que ele decida se exibe
      // Toast, altera estado de erro ou faz outra tratativa de UI.
      throw error;
      
    } finally {
      // Gerencia o loading: se abriu em nova aba, libera o botão imediatamente.
      // Se for navegação interna, o loading permanece até a troca de página.
      if (intent.target === '_blank') {
        setLoading(false);
      }
    }
  };

  return { handleRedirect, loading };
}