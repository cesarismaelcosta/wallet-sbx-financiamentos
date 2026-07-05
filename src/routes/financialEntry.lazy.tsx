/**
 * @fileoverview Rota: financialEntry (Gateway de Entrada e Reidratação de Contexto)
 * 
 * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE]
 * =========================================================================
 * Implementa o padrão "Entry Point Gateway" (DMZ). Esta rota não possui interface 
 * de usuário final. Ela atua como um "Porteiro" protetor entre o ecossistema 
 * externo (ex: site/app da SBX) e o núcleo interno do Financial Hub.
 * 
 * [Responsabilidades]:
 * 1. Sanitização: Lê o contrato da URL (Identificadores + UTMs + Ambiente).
 * 2. Autenticação: Resolve conflitos de token (Prioridade para o token de entrada).
 * 3. Reidratação (BFF): Busca os dados brutos e os traduz para as nossas Interfaces estritas.
 * 4. Telemetria: Monta o InteractionContext para rastreamento de conversão.
 * 5. Delegação (CQRS): Passa o payload fortemente tipado para o Cérebro (Orchestrator).
 * 
 * =========================================================================
 * [MANUAL DE INTEGRAÇÃO PARA A EQUIPA SBX (COMO CHAMAR ESTA ROTA)]
 * =========================================================================
 * A SBX deve redirecionar o utilizador para esta rota passando os parâmetros via URL.
 * Base URL: https://[URL-DO-SEU-APP]/sandbox/financialEntry
 * 
 * --- CONTROLE DE AMBIENTE ---
 * @param {string} environment - O ambiente alvo da integração (Ex: "hml", "prd", "sandbox"). 
 *                               Por padrão, se omitido, assume-se "prd".
 * 
 * --- PILARES ESTRUTURAIS ---
 * @param {string} sbx_token  - Token JWT do usuário (Opcional se já autenticado).
 * @param {string} offer_id   - ID do Lote/Oferta na Superbid (Para financiamento de veículos/bens).
 * @param {string} product_id - ID do Produto Financeiro (Ex: 7 para Auto Equity, 9 para Seguro).
 * 
 * --- INTERACTION CONTEXT (UTMs PARA BI, MARKETING E OKRs) ---
 * @param {string} utm_medium   - [O AMBIENTE] (Ex: "home_page", "offer_detail_page", "email_crm")
 * @param {string} utm_source   - [O GATILHO] (Ex: "banner_principal", "box_financiamento")
 * @param {string} utm_campaign - [A CAMPANHA] (Ex: "flow_caminhoes", "promo_julho")
 * 
 * =========================================================================
 * [EXEMPLOS PRÁTICOS DE CHAMADA]
 * =========================================================================
 * CENÁRIO 1: Teste de Integração em Homologação (HML)
 * /sandbox/financialEntry?environment=hml&sbx_token=xxx&offer_id=123&utm_source=teste
 * 
 * CENÁRIO 2: Financiamento de Lote Real (PRD)
 * /sandbox/financialEntry?environment=prd&sbx_token=xxx&offer_id=4680825&utm_source=box_financiamento&utm_medium=offer_detail_page
 */

import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useFinancialAuth } from "@/integrations/auth/FinancialAuthContext";
import { fetchMyProfile } from "@/services/user";
import { fetchOfferDetails } from "@/services/offer";
import { callOrchestration } from "@/features/financial-hub/core/orchestrator";
import { callNavigation } from "@/features/financial-hub/core/navigator";
import { Loader2 } from "lucide-react";

// Importação das interfaces de domínio (O Padrão de Ferro)
import type { 
  UserProfile, 
  Offer, 
  Seller, 
  Event, 
  Manager, 
  InteractionContext,
  SimulationPayload 
} from "@/features/financial-hub/shared/types";

// =========================================================================
// [CONTRATO DE ENTRADA]: Validação estrita dos Query Params via TanStack Router
// =========================================================================
export const Route = createFileRoute("/sandbox/financialEntry")({
  validateSearch: (search: Record<string, unknown>) => ({
    // Controle de Ambiente
    environment: search.environment as string | undefined,

    // Pilares Estruturais
    sbx_token: search.sbx_token as string | undefined,
    offer_id: search.offer_id as string | undefined,
    product_id: search.product_id as string | undefined,
    
    // Pilares de Telemetria (Interaction Context)
    utm_source: search.utm_source as string | undefined,     
    utm_medium: search.utm_medium as string | undefined,     
    utm_campaign: search.utm_campaign as string | undefined, 
  }),
  component: FinancialEntry,
});

// =========================================================================
// [COMPONENTE PRINCIPAL]: Controlador de Bootstrapping
// =========================================================================
export function FinancialEntry() {
  const search = Route.useSearch();
  const auth = useFinancialAuth();
  
  // Estado de UI para feedback visual de progresso
  const [statusText, setStatusText] = useState("A inicializar ambiente seguro...");

  useEffect(() => {
    const bootstrapContext = async () => {
      // Definição do ambiente (Fallback seguro para produção se não for enviado)
      const currentEnvironment = search.environment || "prd";

      // -------------------------------------------------------------------
      // 1. RESOLUÇÃO DE IDENTIDADE
      // Prioridade: Token da URL > Token de Sessão Local.
      // -------------------------------------------------------------------
      const activeToken = search.sbx_token || auth.token || auth.accessToken;

      if (!activeToken) {
        setStatusText("Sessão não identificada. A redirecionar para autenticação...");
        callNavigation({ target: "/login" });
        return;
      }

      // Injeta o token externo fresco no cofre global da aplicação
      if (search.sbx_token) {
        auth.setToken(search.sbx_token);
      }

      try {
        // -------------------------------------------------------------------
        // 2. REIDRATAÇÃO DE DADOS VIA BFF (Backend For Frontend)
        // Dica: O currentEnvironment pode ser repassado para as funções fetch
        // caso o backend precise rotear para bancos HML/PRD.
        // -------------------------------------------------------------------
        setStatusText(`A recuperar o seu perfil financeiro (${currentEnvironment.toUpperCase()})...`);
        const userProfile = await fetchMyProfile(activeToken);

        let offerData = null;
        
        // Operação condicional: Certos produtos (ex: Auto Equity) funcionam sem lote.
        if (search.offer_id) {
          setStatusText(`A sincronizar os dados do lote ${search.offer_id}...`);
          offerData = await fetchOfferDetails(activeToken, search.offer_id);
        }

        // -------------------------------------------------------------------
        // 3. MONTAGEM DO CONTEXTO DE INTERAÇÃO (BI & Telemetria)
        // -------------------------------------------------------------------
        const interactionContext: InteractionContext = {
          utm_source: search.utm_source || "sbx_external_unknown",
          utm_medium: search.utm_medium || "financial_gateway",
          utm_campaign: search.utm_campaign || (search.product_id ? `product_${search.product_id}_flow` : "generic_flow"),
          origin_url: window.location.href, // Garante a rastreabilidade exata
        };

        // -------------------------------------------------------------------
        // 4. PREPARAÇÃO DO PAYLOAD FORTEMENTE TIPADO
        // O TypeScript garante que a base de dados receberá os JSONs corretos.
        // -------------------------------------------------------------------
        const payload: SimulationPayload = {
          action: "SIMULATE",
          timestamp: new Date().toISOString(),
          environment: currentEnvironment, // Repassando o ambiente para o motor
          
          entity: userProfile as UserProfile,
          product_id: search.product_id || null,
          
          // O BFF garante as propriedades. Caso falhe, injetamos null de forma segura.
          offer: (offerData?.offer as Offer) || null,
          seller: (offerData?.seller as Seller) || null,
          event: (offerData?.event as Event) || null,
          manager: (offerData?.manager as Manager) || null,
          
          interaction_context: interactionContext,
        };

        // -------------------------------------------------------------------
        // 5. DELEGAÇÃO DE RESPONSABILIDADE (Decisão + Execução)
        // -------------------------------------------------------------------
        setStatusText("A processar regras de aprovação...");
        
        // O Cérebro avalia o Payload completo e define o alvo
        const decision = await callOrchestration("SIMULATE", payload);

        // As Pernas executam a navegação (Mudança física de página no TanStack Router)
        if (decision) {
          callNavigation(decision);
        }
        
      } catch (error: any) {
        console.error(`[FINANCIAL_ENTRY FATAL ERROR - ENV: ${currentEnvironment}]:`, error);
        setStatusText("Ocorreu uma falha ao iniciar a simulação.");
        
        // Proteção contra ecrã branco (Fallback elegante)
        callNavigation({ 
          target: "/error", 
          params: { code: "ENTRY_BOOTSTRAP_FAILED", message: error.message } 
        });
      }
    };

    // Atraso intencional curto (400ms) para evitar layout shift ("flicker" brusco)
    // Garantindo que a UX do loading overlay ocorra de forma suave
    const timer = setTimeout(() => {
      bootstrapContext();
    }, 400);

    return () => clearTimeout(timer);
  }, [search, auth]);

  // =========================================================================
  // [VIEW]: Interface minimalista (Design System do Hub)
  // Utiliza a sobreposição com desfoque (backdrop-blur) e o ícone pulsante.
  // =========================================================================
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
      <Loader2 
        className="h-10 w-10 animate-spin mb-4" 
        style={{ color: "#B300FF" }} 
      />
      <p className="text-sm text-slate-500 font-medium animate-pulse">
        {statusText}
      </p>
    </div>
  );
}