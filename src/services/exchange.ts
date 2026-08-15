/**
 * @fileoverview Serviço de Resgate Stateless (Double JWT)
 * @path src/services/exchange.ts
 * 
 * =========================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: FRONTEND HANDOFF
 * =========================================================================
 * Responsável por interceptar a aterrissagem cross-domain.
 * REGRA DE OURO: A URL deve ser higienizada (replaceState) ANTES de qualquer
 * operação assíncrona (await) para evitar que bibliotecas de telemetria 
 * (Sentry, GTM) capturem a credencial no location.href inicial.
 */

import { supabase } from "@/integrations/supabase/client";
import { setSessionToken, setSbxEnvironmentPreference } from "@/services/session";

interface ExchangeResult {
  ok: boolean;
  session_token?: string;
  environment?: "staging" | "production";
  reason?: "not_found" | "invalid" | "network" | "expired";
}

export async function consumeExchangeTokenFromUrl(): Promise<ExchangeResult> {
  // 1. [INTERCEPTAÇÃO SÍNCRONA] Lê o fragmento bruto
  const hash = window.location.hash;
  
  // Procura pelo novo padrão 'xt=' definido no Gate
  if (!hash || (!hash.includes("xt=") && !hash.includes("exchange_token="))) {
    return { ok: false, reason: "not_found" };
  }

  // 2. Extrai a credencial provisória de 60 segundos
  // Usar substring(1) tira o '#' para o URLSearchParams ler perfeitamente as variáveis
  const params = new URLSearchParams(hash.substring(1));
  const exchangeToken = params.get("xt") || params.get("exchange_token");

  if (!exchangeToken) {
    return { ok: false, reason: "not_found" };
  }

  // 3. [HIGIENIZAÇÃO IMEDIATA - INEGOCIÁVEL]
  // Limpa a URL apagando o fragmento ANTES de ir para a rede.
  // Preserva os query parameters (se houver), tira apenas o hash.
  const cleanUrl = window.location.pathname + window.location.search;
  window.history.replaceState(null, document.title, cleanUrl);

  try {
    // 4. [REDEEM] Dispara a troca AJAX na Função Híbrida
    const { data, error } = await supabase.functions.invoke("sbx-auth-exchange", {
      method: "POST",
      headers: {
        "x-exchange-token": exchangeToken,
      },
    });

    let responseData = data;

    // Se houver erro na invocação HTTP (não-2xx), o SDK do Supabase preenche `error` 
    // e deixa `data` nulo. Precisamos ler o corpo do erro na propriedade `error.context`.
    if (error && typeof error === "object" && "context" in error && error.context) {
      try {
        responseData = await (error.context as Response).json();
      } catch (_) {
        // Se falhar ao parsear o JSON do contexto, mantém o objeto nulo
      }
    }

    if (error || !responseData?.success) {
      console.error("[AUTH HANDOFF] Falha ao trocar credencial:", error || responseData);
      return { 
        ok: false, 
        reason: responseData?.code === "EXCHANGE_EXPIRED" ? "expired" : "invalid" 
      };
    }

    // 5. Sucesso! Retorna a chave mestra (6h) e o ambiente.
    return {
      ok: true,
      session_token: responseData.session_token,
      environment: responseData.environment,
    };
  } catch (err) {
    console.error("[AUTH HANDOFF] Erro de rede durante o resgate:", err);
    return { ok: false, reason: "network" };
  }
}

/**
 * Resgata o Exchange JWT do fragmento E persiste a sessão pela API central
 * (`setSessionToken`), gravando também a preferência de ambiente selada no token.
 */
export async function redeemHandoffSession(): Promise<ExchangeResult> {
  const res = await consumeExchangeTokenFromUrl();
  if (res.ok && res.session_token) {
    setSessionToken(res.session_token);
    if (res.environment) {
      setSbxEnvironmentPreference(res.environment);
    }
  }
  return res;
}