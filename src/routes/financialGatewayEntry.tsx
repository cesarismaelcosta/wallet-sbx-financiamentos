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

import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { logSystemError } from "@/services/systemNotification";
import type { UserProfile, Offer, Seller, Event, Manager, SimulationPayload } from "@/features/financial-hub/components/shared/types";

interface SearchSchema {
  environment?: "staging" | "production";
  auth_token?: string;
  offer_id?: string;
  product_id?: string;
  return_uri?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

// Lista de domínios confiáveis.
// TODO: Remover o "*" e adicionar domínios reais (ex: "superbid.net") antes de fechar a segurança.
const ALLOWED_DOMAINS = ["*"];

// Valida Open Redirect (CWE-601) usando Allowlist
const getSafeRedirectUrl = (url?: string): string => {
  if (!url) return "/";
  try {
    if (url.startsWith('http')) {
      const parsed = new URL(url);
      // Libera se tiver o curinga "*" OU se bater com a lista
      const isAllowed = ALLOWED_DOMAINS.includes("*") || ALLOWED_DOMAINS.some(domain => 
        parsed.hostname === domain || parsed.hostname.endsWith(`.${domain}`)
      );
      
      if (isAllowed) return url;
      
      console.warn(`🚨 [Security] Open Redirect bloqueado para: ${parsed.hostname}`);
      return parsed.pathname + parsed.search; 
    }
  } catch (e) {
    // URL malformada morre silenciosamente aqui
  }
  
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  return "/";
};

export const Route = createFileRoute("/financialGatewayEntry")({
  validateSearch: (search: Record<string, unknown>): SearchSchema => ({
    environment: search.environment as "staging" | "production" | undefined,
    auth_token: search.auth_token as string | undefined,
    offer_id: search.offer_id as string | undefined,
    product_id: search.product_id as string | undefined,
    return_uri: getSafeRedirectUrl(search.return_uri as string | undefined),
    utm_source: search.utm_source as string | undefined,
    utm_medium: search.utm_medium as string | undefined,
    utm_campaign: search.utm_campaign as string | undefined,
  }),

  loaderDeps: ({ search }) => search,

loader: async ({ deps, context }: { deps: any, context: any }) => {
    
    let cookieToken = null;

    // Leitura Isomórfica do Cookie
    if (typeof document !== "undefined") {
      // Se estiver rodando no navegador (Client-Side Navigation)
      cookieToken = document.cookie.split('; ').find(row => row.trim().startsWith('session_token='))?.split('=')[1] || null;
    } else {
      // Se estiver rodando no servidor (SSR / F5)
      // Usamos optional chaining caso o request tenha sido injetado no root
      const cookieHeader = context?.request?.headers?.get("Cookie") || "";
      cookieToken = cookieHeader.split('; ').find((row: string) => row.trim().startsWith('session_token='))?.split('=')[1] || null;
    }

    if (!deps?.auth_token && !cookieToken) {
      throw redirect({ 
        to: "/accounts/signin",
        search: {
          redirect_uri: deps?.return_uri || "/"
        },
        replace: true 
      });
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
        signal: AbortSignal.timeout(10000),
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` 
        },
        body: JSON.stringify({
          auth_token: deps.auth_token,
          environment: currentEnvironment,
          offer_id: deps.offer_id
        }),
      });

      const sbxData = await sbxResponse.json();
      generatedSessionToken = sbxData.session_token;

      // Adiciona propriedades customizadas no erro
      if (!sbxResponse.ok) {
        const error = new Error(sbxData.message || `HTTP_SBX_${sbxResponse.status}`);
        const msg = error.message;

        // Classificação estrita baseada nos disparos do código fonte:
        if (msg.includes("UPSTREAM_USER_ERROR")) {
          (error as any).type = "SBX_LOADER_FAIL_USER";
        } 
        else if (msg.includes("SESSION_UPSTREAM_EXPIRED")) {
          (error as any).type = "SBX_LOADER_FAIL_TOKEN";
        } 
        else if (msg.includes("OFFER_NOT_FOUND")) {
          (error as any).type = "SBX_LOADER_FAIL_OFFER_NOT_FOUND";
        } 
        else if (msg.includes("UPSTREAM_OFFER_ERROR")) {
          (error as any).type = "SBX_LOADER_FAIL_OFFER";
        } 
        else if (msg.includes("BAD_REQUEST")) {
          (error as any).type = "SBX_LOADER_FAIL_BAD_REQUEST";
        } 
        else if (msg.includes("DB_INSERT_FAILURE")) {
          (error as any).type = "SBX_LOADER_FAIL_DATABASE";
        } 
        else {
          (error as any).type = "SBX_LOADER_FAIL_GENERIC";
        }

        (error as any).status = sbxResponse.status;
        (error as any).details = sbxData;
        
        console.error(`🛑 [SBX-LOADER] (${(error as any).type}):`, error.message);
        
        throw error;
      }

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

      // =====================================================================
      // FASE 2: ORQUESTRAÇÃO NA EDGE (Substitui o Lazy Import)
      // =====================================================================
      // 1. TERRA FIRME (Origem Lógica)
      // Se não houver return_uri válido, o fallback padrão evita quebrar a string.
      const partnerOrigin = deps.return_uri || "/"; 
      
      // 2. FALLBACK DE LOGIN
      // Se a sessão cair, vai pro Sign In. Quando terminar o Sign In, é devolvido
      // para a loja do parceiro (partnerOrigin) para recomeçar o fluxo limpo, 
      // e NUNCA para a rota fantasma do Gateway.
      const loginFallbackUrl = `/accounts/signin?redirect_uri=${encodeURIComponent(partnerOrigin)}`;

      // O Servidor faz a chamada pesada, poupando a rede 3G do cliente
      const orchestratorResponse = await fetch(`${supabaseUrl}/functions/v1/orchestrator`, {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          "x-session-token": sbxData.session_token, // Usa o token recém-criado
          "x-original-url": partnerOrigin,          // Usa a própria URI enviada pela origem por ser um loader
          "x-auth-fallback-url": loginFallbackUrl   // Login também volta para a própria URI enviada pela origem por ser um loader
        },
        body: JSON.stringify({
           ...payload
        }),
      });

      const orchestratorData = await orchestratorResponse.json();

      if (!orchestratorResponse.ok) {
        const error = new Error(orchestratorData.message || `HTTP_ORCH_${orchestratorResponse.status}`);
        const msg = (orchestratorData.message || "").toUpperCase();

        // Classificação direta dentro do seu IF original
        if (msg.includes("VALIDATION")) {
          (error as any).type = "ORCHESTRATOR_FAIL_VALIDATION";
        } 
        else if (msg.includes("TARGET_URL") || msg.includes("OBRIGATÓRIA")) {
          (error as any).type = "ORCHESTRATOR_FAIL_INVALID_TARGET_URL";
        } 
        else if (msg.includes("CONFIGURAÇÃO") || msg.includes("DESTINO")) {
          (error as any).type = "ORCHESTRATOR_FAIL_CONFIG";
        } 
        else if (msg.includes("VISITA")) {
          (error as any).type = "ORCHESTRATOR_FAIL_VISIT_INVALID";
        } 
        else if (msg.includes("OFFER")) {
          (error as any).type = "ORCHESTRATOR_FAIL_OFFER";
        } 
        else {
          (error as any).type = "ORCHESTRATOR_FAIL_GENERIC";
        }

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
        auth_token: deps.auth_token,
        orchestration_result: orchestratorData, // O Comando retornado pela Edge
        return_uri: deps.return_uri
      };

    } catch (error: any) {
      // AQUI VOCÊ VAI VER O QUE REALMENTE ESTÁ VINDO
      console.log("🚀 [DEBUG] Objeto de Erro Completo:", {
          message: error.message,
          type: error.type,
          fullObject: error // Isso vai mostrar se o 'type' realmente existe no objeto
      });
      
      // 1. Definição do Escopo de Erro
      // - sessionToken: Se a falha ocorreu na Fase 1 (sbx-loader), será undefined. Se ocorreu na Fase 2 (orchestrator), terá o JWT válido.
      // - errorContext: Prioriza a propriedade injetada no throw (ex: SBX_LOADER_FAIL). Faz fallback para busca na string da mensagem.
      const sessionToken = generatedSessionToken || "FALHA_GERACAO_TOKEN_SESSAO";
      const msg = error.message || "";
      const errorContext = error.type || (msg.includes("HTTP_ORCH") ? "ORCHESTRATOR_FAIL" : "SBX_LOADER_FAIL");

      // 2. Registro do Incidente (Isolado de Regras de UI)
      // O payload recebe `deps`, garantindo que o token externo (auth_token) e dados da URL originais sejam registrados para rastreio.
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
      // Erro de Autenticação: Intercepta o novo type de TOKEN ou o legado de mensagens.
      if (error.type === "SBX_LOADER_FAIL_TOKEN" || error.type === "SBX_LOADER_FAIL_USER") {
        return { 
          status: "ERROR_LOGIN", 
          return_uri: deps.return_uri // Retorna a URL limpa para o front
        };
      }

      console.log("🚨 [DEBUG] return_uri que está sendo enviada para o Front:", deps.return_uri);
      // 4. Erro de Sistema: Qualquer outra quebra devolve o usuário para a página de origem da simulação após aguardar no componente UI.
      return { status: "ERROR_OTHER", return_uri: deps.return_uri };
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

    useEffect(() => {
      if (!data) return;

      // 1. FLUXO DE SEGURANÇA (erro de autorização)
      if (data.status === "ERROR_LOGIN") {
        console.error("🚨 [FinancialGateway] Falha de sessão:", data);
        const loginTarget = `/accounts/signin?redirect_uri=${encodeURIComponent(data.return_uri || "/")}`;
        window.location.replace(loginTarget);
        return;
      }

      // 2. FLUXO DE ERRO (FAIL_SAFE) NÃO MAPEADO
      if (data.status === "ERROR_OTHER") {
        console.warn("⚠️ [FinancialGateway] Falha crítica detectada.");
        setIsError(true);
        return;
      }

      // 3. PERSISTÊNCIA ATÔMICA SE SUCESSO: Só salvamos se o acesso for autorizado (pós-guards)
      localStorage.setItem("auth_token", data.auth_token);
      localStorage.setItem("session_token", data.session_token);

      // 4. FLUXO DE ORQUESTRAÇÃO
      if (data?.orchestration_result?.url) {
        const target = data.orchestration_result.url || "/";
        window.location.replace(target);
      }
    }, [data]);
    // 3. [CONTADOR REGRESSIVO]: Lógica de timeout para retorno automático
    useEffect(() => {
      if (isError && countdown > 0) {
        const timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
        return () => clearTimeout(timer);
      }
      
      // Auto-retorno ao zerar o contador
      if (isError && countdown === 0) {
        const target = data.return_uri || "/";
        window.location.replace(target);
      }
    }, [isError, countdown]);

    // --- UI DE ERRO (Padronizada com aviso e espera) ---
    if (isError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
          
          {/* SPINNER AQUI, girando enquanto conta os segundos definidos em const [countdown, setCountdown] = useState(10); */}
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#B400FF] mb-6"></div>

          <p className="text-slate-500 font-medium text-sm">Falha ao carregar simulação...</p>
          <p className="text-slate-500 font-medium text-sm mb-4">Retornando em {countdown}s...</p>
          
          <button 
            onClick={() => window.location.replace(data.return_uri || "/")}
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