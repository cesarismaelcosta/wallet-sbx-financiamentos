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
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO: STRICT THIN PAYLOAD (ZERO-TRUST)
 * =========================================================================
 * [MECÂNICA ARQUITETURAL]:
 * O payload de rede foi purificado. O uso do `...state.data` foi abolido para
 * evitar o envio de lixo de UI (estado interno, objetos aninhados) para a 
 * camada de rede. O componente monta um payload estritamente "Thin", extraindo 
 * os cursores temporais (`visit_id`, `visit_update_id`) da URL e enviando 
 * APENAS os IDs identificadores e os inputs financeiros (valor e parcelas) 
 * que o Gateway exige.
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, ExternalLink } from "lucide-react";
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

// =========================================================================
// Link para oferta na plataforma sbX
// =========================================================================
const getSuperbidUrl = (offerData: any) => {
  if (!offerData?.offer_id) return "#";
  const slug = (offerData.offer_description || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `https://www.superbid.net/oferta/${slug}-${offerData.offer_id}`;
};

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
      const urlParams = new URLSearchParams(window.location.search);
      const urlVisitId = urlParams.get("visit_id");
      const urlVisitUpdateId = urlParams.get("visit_update_id");
      
      const rawOffer = state.data.offer || {};
      const targetOfferId = rawOffer.offer_id || rawOffer.id;

      // ✨ [STRICT THIN PAYLOAD]
      // Abolido o uso de `...state.data`! Montagem cirúrgica e explícita.
      const payload = {
        ...(urlVisitId && { visit_id: urlVisitId }),
        ...(urlVisitUpdateId && { visit_update_id: urlVisitUpdateId }),
        ...(targetOfferId && { offer_id: String(targetOfferId) }),
        
        product_id: 8, // Produto: Cartão

        simulation_details: {
          requested_value: offerValue || 0,
          installments: state.data.parcelas || 1, // Default fallback de segurança
          down_payment_amount: 0,
          down_payment_percentage: 0,
          cet_rate: null,
        },
      };

      const result = await execute(() => callSimulation(payload));

      // Atualiza o estado da UI com o resultado, mantendo o histórico
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
        {/* [CABEÇALHO COM LINK] */}
        <div className="flex items-start gap-4">
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

            {/* LINHA DO LOTE E PREÇO COM LINK AO LADO */}
            <div className="flex items-center pt-0.5">
              <p className="text-sm text-slate-600 truncate">
                Lote {loteSubIndex} • <strong className="text-slate-900 font-bold mr-2">{BRL(offerValue || 0)}</strong>
              </p>

              {offer && (
                <a
                  href={getSuperbidUrl(offer)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#B300FF] hover:text-[#9300cc] transition-colors flex items-center outline-none focus:outline-none focus:ring-0"
                  title="Ver oferta original na Superbid"
                >
                  <ExternalLink size={18} />
                </a>
              )}
            </div>
          </div>
        </div>

        {/*
         * [SKELETON UI + COGNITIVE DISTRACTION]
         */}
        <div className="py-2">
          {isLoadingUI ? (
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
                    <div className="flex items-baseline gap-2 w-full">
                      <div className="h-5 w-8 bg-slate-200 rounded-md"></div>
                      <div className="h-6 w-28 bg-slate-200 rounded-md"></div>
                    </div>
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