/**
 * @fileoverview Hook Global de Sincronização de Histórico (PopState Shield)
 * @path src/features/financial-hub/core/hooks/useOrchestratorHistorySync.ts
 * 
 * ============================================================================
 * 🤖 ARQUITETURA DEFINITIVA: PATH-BOUND CURSORS & ACTIVE TRACKING
 * ============================================================================
 * [O DIAGNÓSTICO DOS LOOPS E FALHAS DE PAYLOAD]:
 * 1. Double-Renders (Atraso do Router): Deletar a trava cedo demais fazia o React
 *    re-ler a URL velha, causando um loop infinito de requisições. Resolvido com
 *    um "Cemitério de Assinaturas" (`deadSignatures`).
 * 2. Origem/Destino Iguais: Ler a URL atual para preencher a `origin_url` 
 *    enviava dados viciados pro OLAP. Resolvido com o rastreador `lastKnownFullUrl`
 *    que grava fisicamente a tela anterior antes do evento de voltar ocorrer.
 * 
 * [A SOLUÇÃO CIRÚRGICA]:
 * -currentActiveSignature: Bloqueia re-renders nativos do React.
 * -burnedSignatures: Identifica viagens no tempo (botão Back).
 * -deadSignatures: Tranca a URL obsoleta para sempre, matando loops.
 * -lastKnownFullUrl: Garante a integridade da Origem vs Destino na telemetria.
 * 
 * @author César Ismael Pereira da Costa
 */

import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { callOrchestrator } from "@/features/financial-hub/core/services/gateway";
import { setFastPathState } from "@/features/financial-hub/core/services/fastPathCache";

// 🌐 Memória RAM Global (Imune ao ciclo de vida do React)
const burnedSignatures = new Set<string>();
const deadSignatures = new Set<string>(); // CEMITÉRIO: O fim do loop de re-renders
let currentActiveSignature: string | null = null; // A PEÇA QUE FALTAVA PARA O RE-RENDER
let lastKnownFullUrl = ""; // RASTREADOR REAL DE ORIGEM PARA A TELEMETRIA

export function useOrchestratorHistorySync() {
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });

  const searchObj = (location.search as Record<string, any>) || {};
  const visitId = searchObj.visit_id as string | undefined;
  const updateId = searchObj.visit_update_id as string | undefined;
  const pathname = location.pathname;

  useEffect(() => {
    if (!visitId || !updateId) return;

    const incomingSignature = `${pathname}-${updateId}`;

    // 🛡️ REGRA 0: Re-renderização (A TRAVA DO LOOP INFINITO)
    // Se a assinatura avaliada agora for idêntica à que está ativada no momento,
    // o React apenas deu um re-render (ex: state local mudou). Aborta!
    if (incomingSignature === currentActiveSignature) return;

    // 🛡️ REGRA 1: Navegação Nova (PUSH ou Acesso Direto)
    if (!burnedSignatures.has(incomingSignature)) {
      burnedSignatures.add(incomingSignature);
      currentActiveSignature = incomingSignature; // Define como a tela ativa
      
      // Salva a URL real na RAM antes do usuário sequer pensar em dar o Back
      lastKnownFullUrl = window.location.href; 
      return; 
    }

    // 🛡️ REGRA 2: A TRAVA PERMANENTE (Cemitério contra o Stale Render Loop)
    // Se a API já foi chamada para consertar essa URL, ela morre aqui.
    // Isso impede que o atraso assíncrono do TanStack Router gere um loop infinito.
    if (deadSignatures.has(incomingSignature)) return;
    deadSignatures.add(incomingSignature);

    console.warn(`[HistorySync] ⚠️ Viagem no tempo! Reparando cursor obsoleto: ${updateId.split("-")[0]}`);

    const syncTemporalAnchor = async () => {
      try {
        const searchParams = new URLSearchParams(searchObj as any);
        const currentFullUrl = pathname + "?" + searchParams.toString();
        const absoluteUrl = window.location.origin + currentFullUrl;

        // Se por algum motivo bizarro a RAM estiver vazia, faz o fallback
        const safeOrigin = lastKnownFullUrl || absoluteUrl;

        const syncPayload = {
          action: "VISIT",
          action_description: "BROWSER_BACK_BUTTON",
          target_url: currentFullUrl,
          origin_url: safeOrigin, 
          visit_id: visitId,
          visit_update_id: updateId,
          interaction_context: {
            origin_url: safeOrigin,
            utm_source: "browser_history",
            utm_medium: "popstate",
            utm_campaign: "history_resync",
          },
        };

        const response = await callOrchestrator(syncPayload, "POST");

        if (response?.visit_update_id) {
          const newId = response.visit_update_id;
          const newSignature = `${pathname}-${newId}`;

          console.log(`[HistorySync] ✅ Borda renovou o cursor: ${newId.split("-")[0]}`);

          if (response.state) {
            setFastPathState(response.state);
          }

          // Prepara a RAM antes de disparar o navigate para evitar falha no próximo render
          burnedSignatures.add(newSignature);
          currentActiveSignature = newSignature;
          
          // Atualiza a origem para a nova URL limpa após o replace
          lastKnownFullUrl = window.location.origin + pathname + "?visit_id=" + (response.visit_id || visitId) + "&visit_update_id=" + newId;

          // Substitui a URL atomicamente. O router mudará o estado e o React fará um novo render (barrado pela Regra 0).
          navigate({
            to: pathname as any,
            search: ((prev: any) => ({
              ...prev,
              visit_id: response.visit_id || visitId,
              visit_update_id: newId,
            })) as any,
            replace: true,
            resetScroll: false, // ✨ Impede o TanStack Router de resetar o scroll para o topo
          });

          // ✨ SUCESSO: NÃO DELETAMOS O LOCK DO CEMITÉRIO. 
          // O fantasma da URL velha continua trancado para impedir falsos positivos.

        } else {
           // Em caso de erro lógico do backend (ex: retornou 200 sem ID), soltamos a trava para não bloquear a página para sempre
           deadSignatures.delete(incomingSignature);
        }
      } catch (error) {
        console.error("[HistorySync] Falha crítica no handshake:", error);
        // Só abrimos a porta de novo se der erro 500/timeout de rede
        deadSignatures.delete(incomingSignature);
      }
    };

    syncTemporalAnchor();

  }, [pathname, visitId, updateId, navigate]); 
}