/**
 * @fileoverview Rota: financialGatewayGate (Tela de Error Fallback do Gateway)
 * @path src/routes/financialGatewayGate.tsx
 *
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO: ZERO-RADIUS GOVERNANCE & NEUTRAL PURITY
 * =========================================================================
 * Atua exclusivamente como receptora de erros redirecionados pela borda quando 
 * ocorre falha na autenticação ou orquestração. O handoff de sucesso (token #xt) 
 * é tratado diretamente pelo Sniper Tático nos guards de rota.
 * 
 * [MECÂNICA ARQUITETURAL]:
 * 1. {Zero-Radius Strict Governance}: Eliminação total de cantos arredondados.
 * 2. {Neutral Purity}: Monocromia estrita (`neutral-900`, `neutral-600`, `neutral-200`).
 * 3. {Image Filtering}: Tratamento de imagem de erro em escala de cinza limpa.
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
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

// =========================================================================
// [SEGURANÇA - SBXW-07 FIX]: Open Redirect Shield, mesmo critério já aplicado
// em accounts.signin.tsx (SBXW-22) e no orchestrator (SBXW-12). Só aceita
// caminho relativo simples (começa com "/", não com "//" protocol-relative),
// recusando qualquer URL absoluta ou esquema estranho. Validado aqui no
// contrato da rota (validateSearch), não só no componente, porque a rota é
// acessível diretamente por URL.
// =========================================================================
const ALLOWED_RETURN_DOMAINS = [
  "localhost", "127.0.0.1",
  "lovable.app", "lovableproject.com", "lovable.dev",
  "superbid.net",
];

function sanitizeReturnUri(uri: unknown): string | undefined {
  if (typeof uri !== "string" || !uri) return undefined;
  // caminho relativo interno
  if (uri.startsWith("/") && !uri.startsWith("//")) return uri;
  // URL completa: só se o domínio estiver na lista permitida (mesma do backend, _shared/security.ts)
  try {
    const { protocol, hostname } = new URL(uri);
    if (protocol !== "https:" && protocol !== "http:") return undefined;
    const ok = ALLOWED_RETURN_DOMAINS.some(
      (d) => hostname === d || hostname.endsWith(`.${d}`),
    );
    return ok ? uri : undefined;
  } catch {
    return undefined;
  }
}

export const Route = createFileRoute("/financialGatewayGate")({
  validateSearch: (search: Record<string, unknown>): SearchSchema => ({
    status: search.status as string | undefined,
    code: search.code as string | undefined,
    message: search.message as string | undefined,
    return_uri: sanitizeReturnUri(search.return_uri),
    offer_id: search.offer_id as string | undefined,
    product_id: search.product_id as string | undefined,
    entity_id: search.entity_id as string | undefined,
  }),

  component: function FinancialGatewayErrorScreen() {
    const { status, code, message, return_uri, offer_id, product_id, entity_id } = Route.useSearch();
    const [countdown, setCountdown] = useState(5);

    // return_uri já chega sanitizado (relativo ou undefined) via sanitizeReturnUri em validateSearch.
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
    // [CONTROLE DE FLUXO]: Temporizador regressivo para redirecionamento automático
    // =====================================================================
    // [SESSION_EXPIRED]: token da Superbid expirado segue o mesmo fluxo dos
    // demais erros -- tela de erro + contagem + retorno para a página que
    // chamou (return_uri). Quem renova o token é a Superbid, não o nosso login.
    useEffect(() => {
      if (countdown > 0) {
        const timer = setTimeout(() => setCountdown((prev) => prev - 1), 1000);
        return () => clearTimeout(timer);
      }

      if (countdown === 0) {
        window.location.replace(targetReturnUrl);
      }
    }, [countdown, targetReturnUrl]);

    // =====================================================================
    // [TRATAMENTO DE MENSAGEM]: Higienização textual para exibição amigável
    // =====================================================================
    const rawMessage =
      code === "SESSION_EXPIRED"
        ? "Sua sessão na Superbid expirou. Faça login novamente para continuar."
        : message || "Não foi possível carregar a simulação desta oferta.";
    const cleanMessage = rawMessage.includes(":")
      ? rawMessage.substring(rawMessage.indexOf(":") + 1).trim()
      : rawMessage;

    // =====================================================================
    // [RENDERIZAÇÃO DE INTERFACE]: UI Padrão de Falha e Recuperação (Neutral Purity)
    // =====================================================================
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-white font-['Plus_Jakarta_Sans'] p-4">
        {/* Imagem de erro tratada em escala de cinza */}
        <img 
          src="/assets/error/error-320.webp" 
          alt="Erro" 
          className="w-34 h-34 object-contain relative saturate-[10%]" 
        />
        
        <p className="text-neutral-900 font-bold text-lg mb-2 tracking-tight">Ops! Algo deu errado.</p>
        <p className="text-neutral-600 font-medium text-sm text-center max-w-md px-4 leading-relaxed">{cleanMessage}</p>
        <p className="text-neutral-400 font-medium text-xs mt-4 mb-6">Retornando em {countdown}s...</p>

        <button
          onClick={() => window.location.replace(targetReturnUrl)}
          className="flex items-center text-neutral-900 font-bold text-sm hover:text-neutral-600 transition-colors cursor-pointer"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retornar agora
        </button>
      </div>
    );
  },
});