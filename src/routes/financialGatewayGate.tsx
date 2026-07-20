/**
 * @fileoverview financialGatewayGate (Front-end Error Fallback)
 * Front-end é "burro". Ele só carrega se o Edge Gateway falhar e 
 * fizer um Redirect 302 para cá.
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
}

export const Route = createFileRoute("/financialGatewayGate")({
  validateSearch: (search: Record<string, unknown>): SearchSchema => ({
    status: search.status as string | undefined,
    code: search.code as string | undefined,
    message: search.message as string | undefined,
    return_uri: search.return_uri as string | undefined,
  }),

  component: function FinancialGatewayFallback() {
    const { status, code, message, return_uri } = Route.useSearch();
    const [countdown, setCountdown] = useState(5);

    // Se o usuário cair aqui, logamos o erro visualizado e aguardamos os 5 segundos
    useEffect(() => {
      if (status === "error") {
        logSystemError("SESSION_N/A", {
          context: "Edge Gateway Redirect (financialGatewayGate)",
          subject: `Erro de Jornada: ${code}`,
          message: message || "Falha não especificada.",
          payload: { return_uri }
        });
      }
    }, [status, code, message, return_uri]);

    // Timer regressivo
    useEffect(() => {
      if (countdown > 0) {
        const timer = setTimeout(() => setCountdown(prev => prev - 1), 1000);
        return () => clearTimeout(timer);
      }
      
      // Auto-retorno ao zerar o contador (volta pra Superbid)
      if (countdown === 0) {
        const target = return_uri || "/";
        window.location.replace(target);
      }
    }, [countdown, return_uri]);

    // 1. Tratamento Específico: Token Expirado
    if (code === "SESSION_EXPIRED") {
      const loginTarget = `/accounts/signin?redirect_uri=${encodeURIComponent(return_uri || "/")}`;
      window.location.replace(loginTarget);
      return null;
    }

    // Tratamento para exibir apenas a mensagem limpa sem o código técnico na tela
    const rawMessage = message || "Não foi possível carregar a simulação desta oferta.";
    const cleanMessage = rawMessage.includes(":") 
      ? rawMessage.substring(rawMessage.indexOf(":") + 1).trim() 
      : rawMessage;

    // 2. UI Padrão de Falha (Oferta vendida, orchestrator falhou, etc)
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
          onClick={() => window.location.replace(return_uri || "/")}
          className="flex items-center text-[#B400FF] font-semibold text-sm hover:opacity-80 transition-opacity"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Retornar agora
        </button>
      </div>
    );
  }
});