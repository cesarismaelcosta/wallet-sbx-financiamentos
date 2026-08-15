/**
 * @fileoverview Hook de Interceptação e Resgate Handoff (Sniper Tático Unificado)
 * @path src/hooks/useHandoffRedeem.ts
 */

import { useEffect, useState, useRef } from "react";
import { redeemHandoffSession } from "@/services/exchange";

export function useHandoffRedeem(onSuccess?: () => void) {
  const [isExchanging, setIsExchanging] = useState(false);
  const handoffAttempted = useRef(false);

  useEffect(() => {
    const hash = window.location.hash;
    if ((hash.includes("xt=") || hash.includes("exchange_token=")) && !handoffAttempted.current) {
      handoffAttempted.current = true;
      setIsExchanging(true);

      redeemHandoffSession().then((res) => {
        if (res.ok && res.session_token) {
          console.log("[Handoff] Token e ambiente resgatados com sucesso via Sniper Tático.");
          // Limpa o fragmento da URL de forma limpa sem recarregar a página
          window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
          setIsExchanging(false);
          if (onSuccess) {
            onSuccess();
          }
        } else {
          console.error("[Handoff] Falha no resgate do token.");
          setIsExchanging(false);
        }
      });
    }
  }, [onSuccess]);

  return { isExchanging };
}