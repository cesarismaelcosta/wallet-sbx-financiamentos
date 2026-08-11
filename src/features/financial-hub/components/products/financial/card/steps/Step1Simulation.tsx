/**
 * @fileoverview Componente: Step1Simulation (Cartão)
 * @path src/components/cartao/steps/Step1Simulation.tsx
 * * * * ÁRVORE DE DEPENDÊNCIAS:
 * --------------------------------------------------------------------------------
 * src/components/cartao/steps/
 * └── Step1Simulation.tsx
 * * * * INTEGRAÇÃO:
 * - Engine: WizardProvider (consumo de estado e atualização de dados).
 * - API: callSimulation (transporte de dados para o simulador financeiro).
 * - Utils: BRL (formatador de moeda).
 * --------------------------------------------------------------------------------
 * * * * RESPONSABILIDADE:
 * 1. Simulação: Dispara a chamada para o gateway financeiro ao identificar uma oferta válida.
 * 2. Segurança: Implementa travas de fluxo (isSimulating/hasAttempted) para impedir chamadas duplicadas e loops de renderização.
 * 3. Renderização: Exibe as opções de parcelamento (consults) retornadas pela API, permitindo a escolha do usuário.
 *
 * @author César Ismael Pereira da Costa
 */

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { callSimulation } from "@/features/financial-hub/core/services/gateway";
import { CardWizardData } from "../card.types";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import { useSafeCall } from "@/features/financial-hub/core/hooks/useSafeCall";

// =========================================================================
// [UX ARCHITECTURE]: Hook de Distração Cognitiva para APIs de alta latência
// =========================================================================
function useLoadingMessages(isLoading: boolean) {
  const messages = [
    "Iniciando simulação...",
    "Processando dados da oferta...",
    "Calculando opções de parcelamento...",
    "Finalizando simulação...",
  ];
  
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!isLoading) {
      setIndex(0);
      return;
    }
    // Rotaciona as mensagens a cada 2.5 segundos para cobrir longas esperas
    const interval = setInterval(() => {
      setIndex((prev) => (prev < messages.length - 1 ? prev + 1 : prev));
    }, 2500); 

    return () => clearInterval(interval);
  }, [isLoading, messages.length]);

  return messages[index];
}

export function Step1Simulation() {
  const [loading, setLoading] = useState(false);
  const { state, update } = useWizard<CardWizardData>();

  const isSimulating = useRef(false);
  const hasAttempted = useRef(false);
  const { execute } = useSafeCall();

  const offerValue = state?.data?.offer?.offer_value;
  const simResult = state?.data?.simulationResult;
  const offer = state?.data?.offer;

  // [UX]: Inicializa o Tracker de Mensagens
  const isLoadingUI = loading || !state?.data?.simulationResult;
  const loadingMessage = useLoadingMessages(isLoadingUI);

  useEffect(() => {
    if (offerValue && !simResult && !isSimulating.current && !hasAttempted.current) {
      handleSimular();
    }
  }, [offerValue, simResult]);

  const handleSimular = async () => {
    if (hasAttempted.current || !state?.data) return; 

    isSimulating.current = true;
    hasAttempted.current = true; 
    setLoading(true);

    try {
      const payload = {
        ...state.data,
        simulation_details: {
          requested_value: offerValue || 0,
          installments: state.data.parcelas,
          down_payment_amount: 0,
          down_payment_percentage: 0,
          cet_rate: null,
        },
      };

      const result = await execute(() => callSimulation(payload));

      update({
        data: {
          ...state.data,
          simulationResult: result,
          simulation_id: result.simulation_id,
          simulation_update_id: result.simulation_update_id,
        },
      });
    } catch (error: any) {
      console.error("[Erro na Simulação Card]:", error);
      window.dispatchEvent(new CustomEvent("app-error", { detail: error }));
    } finally {
      setLoading(false);
      isSimulating.current = false;
    }
  };

  if (!state || !state.data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
  }

  const simulationResult = state.data?.simulationResult;
  const loteSubIndex = offer?.lote_index || offer?.lote_numero || "1";
  const offerDescText = offer?.offer_description ? offer.offer_description.replace(/[.,]+$/, "") : "";

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      <div className="bg-white space-y-6">
        
        {/* 
          * [PROGRESSIVE DISCLOSURE]
          * Rationale: Renderização imediata do contexto síncrono (Dados da Oferta).
          */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex shrink-0 items-center justify-center w-20 h-20">
            <img src="/assets/home/cartao.webp" alt="Cartão" className="w-full h-full object-contain" />
          </div>

          <div className="space-y-0.5 flex-1 w-0 min-w-0">
            <h3 className="text-[clamp(14px,4vw,20px)] sm:text-xl font-black text-slate-900 uppercase tracking-tight leading-snug truncate w-full block">
              Simulação de parcelamento*!
            </h3>
            <p className="text-[clamp(10px,3vw,12px)] sm:text-xs text-slate-600 truncate pt-0.5 w-full block">
              {offerDescText}
            </p>
            <p className="text-xs text-slate-600 truncate pt-0.5 w-full block">
              Lote {loteSubIndex} • <strong className="text-slate-900 font-bold">{BRL(offerValue || 0)}</strong>
            </p>
          </div>
        </div>

        {/* 
          * [SKELETON UI + COGNITIVE DISTRACTION]
          * Rationale: O usuário recebe a estrutura visual (mitigando CLS) e um 
          * tracker de status dinâmico com design minimalista.
          */}
        <div className="py-2">
          {isLoadingUI ? (
            // [PENDING STATE]: Status dinâmico sutil + Skeletons
            <div className="space-y-3 animate-in fade-in duration-300">
              
              {/* STATUS TRACKER (Minimalista) */}
              <div className="flex items-center gap-2 px-1 text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-[var(--brand-primary)]" />
                <span className="text-xs font-normal tracking-wide transition-opacity duration-300 animate-in fade-in">
                  {loadingMessage}
                </span>
              </div>

              {/* GRID FANTASMA PADRONIZADO (Estilo Ofertas Cartão) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div 
                    key={`skeleton-${i}`} 
                    className="w-full flex flex-col items-start p-4 bg-white border border-slate-200/80 rounded-xl overflow-hidden shadow-xs animate-pulse space-y-3"
                  >
                    {/* Linha do valor da parcela */}
                    <div className="flex items-baseline gap-2 w-full">
                      <div className="h-5 w-8 bg-slate-200 rounded-md"></div>
                      <div className="h-6 w-28 bg-slate-200 rounded-md"></div>
                    </div>
                    {/* Linha do valor total */}
                    <div className="h-3 w-20 bg-slate-100 rounded-md"></div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // [RESOLVED STATE]: Injeção dos dados reais com animação
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-in slide-in-from-bottom-4 fade-in duration-500 ease-out">
              {(simulationResult?.consults || []).map((item: any, index: number) => {
                const qtdParcelas = item.installments;
                const valorParcela = item.installment_value;
                const totalOpcao = qtdParcelas * valorParcela;

                return (
                  <button
                    key={index}
                    className="w-full flex flex-col items-start p-4 bg-white border border-[var(--brand-primary)] rounded-xl overflow-hidden hover:bg-slate-50 transition-all focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="flex flex-nowrap items-baseline gap-1.5 w-full whitespace-nowrap">
                      <span
                        className="font-black shrink-0"
                        style={{ color: "var(--brand-primary)", fontSize: "clamp(0.9rem, 3.5vw, 1.1rem)" }}
                      >
                        {qtdParcelas}x
                      </span>

                      <span
                        className="font-black text-slate-900 tracking-tight shrink-0"
                        style={{ fontSize: "clamp(1.1rem, 4.5vw, 1.35rem)" }}
                      >
                        {BRL(valorParcela)}
                      </span>
                    </div>

                    <span className="text-xs text-slate-500 mt-1.5">Total {BRL(totalOpcao)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-[12px] text-slate-400 font-medium leading-relaxed pb-4">
          * Considera o valor do lance no momento da simulação, sem adicionar eventuais comissões ou outras taxas que
          também podem ser parceladas.
        </p>
      </div>
    </div>
  );
}