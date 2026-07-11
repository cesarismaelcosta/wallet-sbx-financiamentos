/**
 * @fileoverview Rota: financialGatewayEntry (Gateway de Entrada e Reidratação de Contexto)
 * 
 * * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE: "THIN CLIENT"]
 * =========================================================================
 * Evolução da arquitetura para mitigar gargalos em redes 3G e blindar o SSR (F5).
 * A responsabilidade de orquestração foi movida do Client-Side (JS dinâmico) para
 * o Server-Side (Edge Functions), transformando o frontend em um receptor de comandos.
 * 
 * * [RESPONSABILIDADES TÉCNICAS]:
 * 1. [ATOMICIDADE BACKEND]: O loader consome o `sbx-loader` (para autenticação/payload)
 *    e, IMEDIATAMENTE, consome o `orchestrator` (regras de negócio). Tudo no servidor.
 * 2. [PERFORMANCE 3G]: O cliente faz apenas 1 requisição para a rota. O servidor 
 *    resolve a rede pesada (Supabase) e devolve apenas a "Ordem Final" (Redirecionamento).
 * 3. [SSR-SAFE ABSOLUTO]: A lógica pesada não desce para o browser, eliminando 
 *    downloads de "JS Chunks" e zerando o risco de 'window is not defined'.
 * 4. [CLIENT SYNC]: O componente fantasma retém o papel essencial de sincronizar 
 *    os tokens no localStorage para os legados, e executa a navegação decidida pela Edge.
 */

import { createFileRoute, redirect, isRedirect, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { logSystemError } from "@/services/systemNotification";
import type { UserProfile, Offer, Seller, Event, Manager, SimulationPayload } from "@/features/financial-hub/shared/types";

interface SearchSchema {
  environment?: "staging" | "production";
  sbx_access_token?: string;
  offer_id?: string;
  product_id?: string;
  return_uri?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export const Route = createFileRoute("/financialGatewayEntry")({
  validateSearch: (search: Record<string, unknown>): SearchSchema => ({
    environment: search.environment as "staging" | "production" | undefined,
    sbx_access_token: search.sbx_access_token as string | undefined,
    offer_id: search.offer_id as string | undefined,
    product_id: search.product_id as string | undefined,
    return_uri: search.return_uri as string | undefined,
    utm_source: search.utm_source as string | undefined,
    utm_medium: search.utm_medium as string | undefined,
    utm_campaign: search.utm_campaign as string | undefined,
  }),

  loaderDeps: ({ search }) => search,

  loader: async ({ deps, location, request }) => {
    // 1. [PERSISTÊNCIA SSR]: Lê o cookie injetado automaticamente pelo navegador após o primeiro acesso
    const cookieHeader = request?.headers?.get("Cookie") || "";
    const cookieToken = cookieHeader.split('; ').find(row => row.startsWith('session_token='))?.split('=')[1] || null;

    if (!deps?.sbx_access_token && !cookieToken) {
       throw redirect({ to: '/accounts/signin', replace: true });
    }

    const currentEnvironment = deps.environment || "production";
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    let generatedSessionToken: string | undefined = undefined;

    try {
      // =====================================================================
      // FASE 1: HIDRATAÇÃO (sbx-loader)
      // =====================================================================
      const sbxResponse = await fetch(`${supabaseUrl}/functions/v1/sbx-loader`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` 
        },
        body: JSON.stringify({
          sbx_access_token: deps.sbx_access_token,
          environment: currentEnvironment,
          offer_id: deps.offer_id
        }),
      });

      const sbxData = await sbxResponse.json();
      generatedSessionToken = sbxData.session_token;

      if (!sbxResponse.ok) {
        // Cria o erro padrão do JS (que captura o stack trace)
        const error = new Error(sbxData.message || `HTTP_SBX_${sbxResponse.status}`);
        
        // Adiciona as suas propriedades customizadas nele
        (error as any).type = "SBX_LOADER_FAIL";
        (error as any).status = sbxResponse.status;
        (error as any).details = sbxData;
        
        throw error;
      }

      // 🐛 [DEBUG CRÍTICO]: Inspecionando o retorno exato da Edge Function
      console.log("🐛 [financialGatewayEntry] sbxData RAW:\n", JSON.stringify(sbxData, null, 2));

      // Montagem do Contrato
      const payload: SimulationPayload = {
        action: "CONSULT",
        timestamp: new Date().toISOString(),
        origin_url: deps.return_uri,
        environment: currentEnvironment,
        entity: sbxData.rehydration_payload.user_profile as UserProfile,
        product_id: deps.product_id || "",
        offer: sbxData.rehydration_payload.offer_details?.offer as Offer,
        seller: sbxData.rehydration_payload.offer_details?.seller as Seller,
        event: sbxData.rehydration_payload.offer_details?.event as Event,
        manager: sbxData.rehydration_payload.offer_details?.manager as Manager,
        interaction_context: {
          utm_source: deps.utm_source || "",
          utm_medium: deps.utm_medium || "",
          utm_campaign: deps.utm_campaign || "",
          origin_url: deps.return_uri,
        },
      };

      // 🛑 [TESTE DE FALHA]: Categoria inexistente
      payload.offer.category = "888888888888888888888888888888888888888888888888888888888"; // Força erro de categoria inexistente para teste

      // =====================================================================
      // FASE 2: ORQUESTRAÇÃO NA EDGE (Substitui o Lazy Import)
      // =====================================================================
      // O Servidor faz a chamada pesada, poupando a rede 3G do cliente
      const orchestratorResponse = await fetch(`${supabaseUrl}/functions/v1/orchestrator`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          "x-session-token": sbxData.session_token // Usa o token recém-criado
        },
        body: JSON.stringify({
           ...payload
        }),
      });

      const orchestratorData = await orchestratorResponse.json();

      if (!orchestratorResponse.ok) {
         const error = new Error(orchestratorData.message || `HTTP_ORCH_${orchestratorResponse.status}`);
         (error as any).type = "ORCHESTRATOR_FAIL";
         (error as any).status = orchestratorResponse.status;
         (error as any).details = orchestratorData;
         throw error;
      }

      // =====================================================================
      // FASE 3: ENTREGA PARA O COMPONENTE
      // =====================================================================
      // O Loader devolve tudo pronto. O frontend só precisa salvar o token e navegar.
      return { 
        session_token: sbxData.session_token, 
        sbx_access_token: deps.sbx_access_token,
        orchestration_result: orchestratorData // O Comando retornado pela Edge
      };

    } catch (error: any) {
      // 1. Definição do Escopo de Erro
      // - sessionToken: Se a falha ocorreu na Fase 1 (sbx-loader), será undefined. Se ocorreu na Fase 2 (orchestrator), terá o JWT válido.
      // - errorContext: Prioriza a propriedade injetada no throw (ex: SBX_LOADER_FAIL). Faz fallback para busca na string da mensagem.
      const sessionToken = generatedSessionToken;
      const msg = error.message || "";
      const errorContext = error.type || (msg.includes("HTTP_ORCH") ? "ORCHESTRATOR_FAIL" : "SBX_LOADER_FAIL");

      // 2. Registro do Incidente (Isolado de Regras de UI)
      // O payload recebe `deps`, garantindo que o token externo (sbx_access_token) e dados da URL originais sejam registrados para rastreio.
      await logSystemError(sessionToken, {
        context: "financialGatewayEntry",
        subject: `Alerta de Erro no Gateway de Financiamentos e Seguros: ${errorContext} ⚠️`,
        message: `Sistema encontrou uma falha ao ser chamado de ${deps.return_uri} : ${msg}`,
        payload: {
          api_details: error.details || "Sem detalhes adicionais",
          searchParams: deps
        }
      });

      // 3. Regras de Redirecionamento e Fail-safe
      // Erro de Autenticação: Intercepta HTTP 401 ou a flag específica do sbx-loader forçando renovação da sessão.
      if (error.message.includes("HTTP_SBX_401") || error.message.includes("SESSION_UPSTREAM_EXPIRED")) {
          // Captura a URL atual em que o Gateway estava (que contém todos os deps como offer_id)
          const currentUrl = encodeURIComponent(location.href);
          
          return { 
            status: "ERROR_LOGIN", 
            redirect_url: `/accounts/signin?redirect_uri=${currentUrl}` 
          };

      // 4. Erro de Sistema: Qualquer outra quebra devolve o usuário para a página de origem da simulação após aguardar no componente UI.
      return { status: "ERROR_FAIL_SAFE", redirect_url: deps.return_uri || "/" };
    }
  },
  
  // =========================================================================
  // [COMPONENTE FANTASMA]: Executor de Ordens
  // =========================================================================
  component: function FinancialGatewayComponent() {
    const data = Route.useLoaderData();
    const navigate = useNavigate();

    // Estado para controlar se o fluxo de dados falhou
    const [isError, setIsError] = useState(false);
    // Estado para o contador regressivo de erro
    const [countdown, setCountdown] = useState(5);

    console.log("🚀 [financialGatewayEntry] Component renderizado. Data:", data, "isError:", isError);

    useEffect(() => {
      // 1. [TRATAMENTO DE SUCESSO]: Processamento imediato se houver redirecionamento
      if (data?.redirect_url) {
        window.location.replace(data.redirect_url);
        return;
      }

      if (data?.orchestration_result?.url) {
        window.location.replace(data.orchestration_result.url);
        return;
      }

      // 2. [DETECÇÃO DE ERRO]: Se os dados foram carregados (loader finalizou) 
      // mas não contêm URL de destino, marcamos como falha.
      if (data) {
        console.warn("⚠️ [financialGatewayEntry] Nenhuma instrução de redirecionamento encontrada.");
        setIsError(true);
      }
    }, [data, navigate]);

    // 3. [CONTADOR REGRESSIVO]: Lógica de timeout para retorno automático
    useEffect(() => {
      if (isError && countdown > 0) {
        const timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
        return () => clearTimeout(timer);
      }
      
      // Auto-retorno ao zerar o contador
      if (isError && countdown === 0) {
        navigate(-1);
      }
    }, [isError, countdown, navigate]);

    // --- UI DE ERRO (Padronizada) ---
    if (isError) {
       console.warn("⚠️ [financialGatewayEntry] Entrando na contagem de 5s.");
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
          <p className="text-slate-500 font-medium text-sm">Falha ao carregar simulação...</p>
          <p className="text-slate-500 font-medium text-sm mb-4">Retornando em {countdown}s...</p>
          
          <button 
            onClick={() => navigate(-1)}
            className="flex items-center text-primary font-semibold text-sm hover:opacity-80 transition-opacity"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            retornar agora
          </button>
        </div>
      );
    }

    // --- UI DE CARREGAMENTO (Padronizada) ---
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
        <p className="text-slate-500 font-medium text-sm">
          Carregando informações...
        </p>
      </div>
    );
  },
});