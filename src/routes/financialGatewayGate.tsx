/**
 * @fileoverview Rota: financialGatewayGate (Tela de Error Fallback do Gateway)
 * @path src/routes/financialGatewayGate.tsx
 *
 * Atua exclusivamente como receptora de erros redirecionados pela borda quando 
 * ocorre falha na autenticação ou orquestração. O handoff de sucesso (token #xt) 
 * é tratado diretamente pelo Sniper Tático nos guards de rota.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { logSystemError } from "@/services/systemNotification";

interface SearchSchema {
  status?: string;
  code?: string;
  message?: string;
  return_uri?: string;
  offer_id?: string;
  product_id?: string;
  entity_id?: string;
}

export const Route = createFileRoute("/financialGatewayGate")({
  validateSearch: (search: Record<string, unknown>): SearchSchema => ({
    status: search.status as string | undefined,
    code: search.code as string | undefined,
    message: search.message as string | undefined,
    return_uri: search.return_uri as string | undefined,
    offer_id: search.offer_id as string | undefined,
    product_id: search.product_id as string | undefined,
    entity_id: search.entity_id as string | undefined,
  }),

  component: function FinancialGatewayErrorScreen() {
    const { status, code, message, return_uri, offer_id, product_id, entity_id } = Route.useSearch();
    const [countdown, setCountdown] = useState(5);

    const targetReturnUrl = return_uri && return_uri !== "/" ? return_uri : "/";

    // =====================================================================
    // [AUDITORIA E TELEMETRIA]: Registro centralizado de falhas de jornada
    // =====================================================================
    useEffect(() => {
      if (status === "error") {
        logSystemError({
          context: "Gateway Redirect (financialGatewayGate)",
          subject: `Erro de Jornada: ${code || "UNKNOWN"}`,
          message: message || "Falha não especificada.",
          raw_payload: {
            error_code: code || null,
            entity_id: entity_id || null,
            offer_id: offer_id || null,
            product_id: product_id || null,
            metadata: {
              origin_url: targetReturnUrl,
            },
          },
        });
      }
    }, [status, code, message, targetReturnUrl, offer_id, product_id, entity_id]);

    // =====================================================================
    // [GUARDAS DE SEGURANÇA]: Interceptação de sessão expirada via useEffect
    // =====================================================================
    useEffect(() => {
      if (code === "SESSION_EXPIRED") {
        const loginTarget = `/accounts/signin?redirect_uri=${encodeURIComponent(targetReturnUrl)}`;
        window.location.replace(loginTarget);
      }
    }, [code, targetReturnUrl]);

    // =====================================================================
    // [CONTROLE DE FLUXO]: Temporizador regressivo para redirecionamento automático
    // =====================================================================
    useEffect(() => {
      if (code === "SESSION_EXPIRED") return; // Evita conflito com o redirect imediato acima

      if (countdown > 0) {
        const timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
        return () => clearTimeout(timer);
      }

      if (countdown === 0) {
        window.location.replace(targetReturnUrl);
      }
    }, [countdown, targetReturnUrl, code]);

    // Se a sessão expirou, retorna nulo momentaneamente enquanto o efeito executa o redirect
    if (code === "SESSION_EXPIRED") {
      return null;
    }

    // =====================================================================
    // [TRATAMENTO DE MENSAGEM]: Higienização textual para exibição amigável
    // =====================================================================
    const rawMessage = message || "Não foi possível carregar a simulação desta oferta.";
    const cleanMessage = rawMessage.includes(":")
      ? rawMessage.substring(rawMessage.indexOf(":") + 1).trim()
      : rawMessage;

    // =====================================================================
    // [RENDERIZAÇÃO DE INTERFACE]: UI Padrão de Falha e Recuperação
    // =====================================================================
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans']">
        <img src="/assets/error/error.webp" alt="Erro" className="w-34 h-34 object-contain mb-6" />
        <p className="text-slate-800 font-bold text-lg mb-2">Ops! Algo deu errado.</p>
        <p className="text-slate-500 font-medium text-sm text-center max-w-md px-4">{cleanMessage}</p>
        <p className="text-slate-400 font-medium text-xs mt-4 mb-6">Retornando em {countdown}s...</p>

        <button
          onClick={() => window.location.replace(targetReturnUrl)}
          className="flex items-center text-[#B400FF] font-semibold text-sm hover:opacity-80 transition-opacity"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retornar agora
        </button>
      </div>
    );
  },
});