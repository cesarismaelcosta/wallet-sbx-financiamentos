/**
 * @fileoverview Hook de Interceptação e Resgate Handoff (Sniper Tático Unificado)
 * @path src/features/financial-hub/core/hooks/useHandoffRedeem.ts
 * 
 * =========================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: STATELESS HANDOFF REDEEM HOOK
 * =========================================================================
 * Este módulo implementa o "Sniper Tático" de interceptação de tokens efêmeros
 * de transição (`#xt=` ou `#exchange_token=`) vindos de aplicações cross-domain.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { redeemHandoffSession } from "@/services/exchange";

export interface HandoffResult {
  ok: boolean;
  session_token?: string;
  environment?: "staging" | "production";
  reason?: "not_found" | "invalid" | "network" | "expired";
}

export function useHandoffRedeem(onDone?: () => void) {
  // =========================================================================
  // 🎯 [STATE INITIALIZATION]: Blindagem contra race conditions do Guard
  // =========================================================================
  const [isExchanging, setIsExchanging] = useState(() => {
    if (typeof window === "undefined") return false;
    const hash = window.location.hash;
    return hash.includes("xt=") || hash.includes("exchange_token=");
  });

  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [reason, setReason] = useState<HandoffResult["reason"]>(undefined);
  const [environment, setEnvironment] = useState<HandoffResult["environment"]>(undefined);
  
  // Ref para travar o loop de montagem automático, mas permitir retentativas manuais
  const autoAttempted = useRef(false);

  // 🛡️ LATEST REF PATTERN: Evita que onDone recrie o redeem a cada render 
  // caso o pai passe uma função anônima.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  /**
   * @function redeem
   * @description Executa a chamada AJAX. Exposta no retorno para retentativas manuais.
   */
  const redeem = useCallback(async () => {
    setIsExchanging(true);
    setStatus("idle");
    setReason(undefined);

    try {
      // Garantimos o cast para a interface correta
      const res = await redeemHandoffSession() as HandoffResult;

      if (res.ok && res.session_token) {
        console.log("🎯 [Handoff] Token e ambiente resgatados com sucesso via Sniper Tático.");
        
        // 🧹 FIX: Removido o history.replaceState duplicado. 
        // A higiene da URL já foi feita pelo consumeExchangeTokenFromUrl antes deste ponto.
        
        setStatus("success");
        setEnvironment(res.environment);

        // RE-HIDRATAÇÃO REACTIVA: Avisa o FinancialAuthContext
        window.dispatchEvent(new CustomEvent("session_hydrated"));
      } else {
        console.warn("⚠️ [Handoff] Falha no resgate do token de transição.");
        setStatus("error");
        setReason(res.reason || "invalid");
      }
    } catch (err) {
      console.error("🚨 [Handoff] Erro de rede ou exceção crítica no resgate:", err);
      setStatus("error");
      setReason("network");
    } finally {
      setIsExchanging(false);
      // Dispara o callback independente de sucesso ou falha, lendo da ref atualizada
      if (onDoneRef.current) {
        onDoneRef.current();
      }
    }
  }, []);

  // =========================================================================
  // ⚡ [EFFECT]: Gatilho de detecção automática na montagem
  // =========================================================================
  useEffect(() => {
    const hash = window.location.hash;
    if ((hash.includes("xt=") || hash.includes("exchange_token=")) && !autoAttempted.current) {
      autoAttempted.current = true; // Trava apenas o disparo automático do mount
      redeem();
    }
  }, [redeem]);

  return { 
    isExchanging, 
    status, 
    reason, 
    environment, 
    redeem 
  };
}