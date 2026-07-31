/**
 * @fileoverview Rota: financialGatewayGate (Front-end Error Fallback & Resilient Recovery)
 * @path src/routes/financialGatewayGate.tsx
 * 
 * =========================================================================
 * [ARQUITETURA & CLEAN ARCHITECTURE: FALLBACK DE BORDA]
 * =========================================================================
 * 1. [RESPONSABILIDADE ÚNICA]: Atua como a tela receptora de erros disparados
 *    pelo Edge Gateway via redirecionamento HTTP 302.
 * 2. [HIGIENIZAÇÃO DE CONTEXTO]: Extrai query parameters de falha e metadados
 *    (como offer_id, product_id) de forma estrita e segura.
 * 3. [RETORNO CONTEXTUAL]: Garante que o usuário seja devolvido para a origem
 *    correta (`targetReturnUrl`) de forma atômica, eliminando loops ou saltos 
 *    para a raiz global (/).
 */

import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
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
  // =====================================================================
  // [VALIDAÇÃO DE PARÂMETROS]: Tipagem e saneamento da query string
  // =====================================================================
  validateSearch: (search: Record<string, unknown>): SearchSchema => ({
    status: search.status as string | undefined,
    code: search.code as string | undefined,
    message: search.message as string | undefined,
    return_uri: search.return_uri as string | undefined,
    offer_id: search.offer_id as string | undefined,
    product_id: search.product_id as string | undefined,
    entity_id: search.entity_id as string | undefined,
  }),

  component: function FinancialGatewayFallback() {
    const { status, code, message, return_uri, offer_id, product_id } = Route.useSearch();
    const [countdown, setCountdown] = useState(5);

    // =====================================================================
    // [RESOLUÇÃO DE DESTINO]: Saneamento da URI de retorno para evitar rotas vazias
    // =====================================================================
    const targetReturnUrl = return_uri && return_uri !== "/" ? return_uri : "/";

    // =====================================================================
    // [AUDITORIA E TELEMETRIA]: Registro centralizado de falhas de jornada
    // =====================================================================
    useEffect(() => {
      if (status === "error") {
        logSystemError({
          context: "Gateway Redirect (financialGatewayGate)",
          subject: `Erro de Jornada: ${code || 'UNKNOWN'}`,
          message: message || "Falha não especificada.",
          raw_payload: { 
            error_code: code || null,
            entity_id: entity_id || null,
            offer_id: offer_id || null,
            product_id: product_id || null,
            metadata: {
              page: window.location.pathname,
              return_uri: targetReturnUrl
            }
          }
        });
      }
    }, [status, code, message, targetReturnUrl, offer_id, product_id, entity_id]);


    // =====================================================================
    // [CONTROLE DE FLUXO]: Temporizador regressivo para redirecionamento automático
    // =====================================================================
    useEffect(() => {
      if (countdown > 0) {
        const timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
        return () => clearTimeout(timer);
      }
      
      // Auto-retorno ao zerar o contador usando a URL de destino tratada
      if (countdown === 0) {
        window.location.replace(targetReturnUrl);
      }
    }, [countdown, targetReturnUrl]);

    // =====================================================================
    // [GUARDAS DE SEGURANÇA]: Interceptação de cenários específicos de sessão
    // =====================================================================
    if (code === "SESSION_EXPIRED") {
      const loginTarget = `/accounts/signin?redirect_uri=${encodeURIComponent(targetReturnUrl)}`;
      window.location.replace(loginTarget);
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
        
        <img 
          src="/assets/error/error.png" 
          alt="Erro" 
          className="w-34 h-34 object-contain mb-6" 
        />
        <p className="text-slate-800 font-bold text-lg mb-2">Ops! Algo deu errado.</p>
        <p className="text-slate-500 font-medium text-sm text-center max-w-md px-4">
          {cleanMessage}
        </p>
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
  }
});