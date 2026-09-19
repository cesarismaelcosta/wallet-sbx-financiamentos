/**
 * @fileoverview Componente: Step1Simulation (Cartão)
 * @path src/components/cartao/steps/Step1Simulation.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO: STRICT THIN PAYLOAD & ARCHITECTURAL MECHANICS
 * =========================================================================
 * [MECÂNICA ARQUITETURAL]:
 * - Engine: WizardProvider (consumo de estado e atualização de dados).
 * - API: callSimulation (transporte de dados para o simulador financeiro).
 * - Utils: BRL (formatador de moeda).
 * 
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
import { setFastPathState } from "@/features/financial-hub/core/services/fastPathCache"; 
import { CardWizardData } from "../card.types";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import { useSafeCall } from "@/features/financial-hub/core/hooks/useSafeCall";

// =========================================================================
// 🤖 [UX ARCHITECTURE]: Hook de Distração Cognitiva para APIs de alta latência
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
// 🤖 [UTILITY ARCHITECTURE]: Slugificação Segura para Ofertas sbX
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
  // =========================================================================
  // 🤖 [LOCAL STATE ARCHITECTURE]: Gerenciamento de Ciclo de Vida e Estados
  // =========================================================================
  const [loading, setLoading] = useState(false);
  const { state, update } = useWizard<CardWizardData>();

  const isSimulating = useRef(false);
  const hasAttempted = useRef(false);
  const { execute } = useSafeCall();

  const offerValue = state?.data?.offer?.offer_value;
  const simResult = state?.data?.simulationResult;
  const offer = state?.data?.offer;

  const prevOfferValueRef = useRef(offerValue);

  // [UX]: Inicializa o Tracker de Mensagens
  const isLoadingUI = loading || !state?.data?.simulationResult;
  const loadingMessage = useLoadingMessages(isLoadingUI);

  // =========================================================================
  // 🤖 [RENDER GUARD ARCHITECTURE]: Gatilho Automatizado de Simulação por Oferta
  // =========================================================================
  useEffect(() => {
    // Se o valor da oferta mudou, destrava e limpa o resultado anterior
    if (offerValue !== prevOfferValueRef.current) {
      prevOfferValueRef.current = offerValue;
      hasAttempted.current = false;
      update({
        data: {
          ...state.data,
          simulationResult: null,
        },
      });
      return;
    }

    if (offerValue && !simResult && !isSimulating.current && !hasAttempted.current) {
      handleSimular();
    }
  }, [offerValue, simResult]);

  // =========================================================================
  // 🤖 [ZERO-TRUST HANDLER ARCHITECTURE]: Execução de Rede e Thin Payload
  // =========================================================================
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
      const targetOfferId = rawOffer.offer_id;

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

      // O QUE FAZER COM O RESULT.STATE: Alimenta o Fast Path (Cache de RAM para o próximo passo)
      if (result.state) {
        setFastPathState(result.state);
      }

      // O QUE FAZER COM O RESULT.STATE: Alimenta o estado reativo do Wizard (Tela atual)
      update({
        data: {
          ...state.data,
          simulationResult: result,
          simulation_id: result.simulation_id,
          simulation_update_id: result.simulation_update_id,
          
          // Verdade absoluta do servidor injetada no state local
          ...(result.state && {
            offer: result.state.offer,
            rules: result.state.rules,
            entity: result.state.entity,
          })
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

  // =========================================================================
  // 🤖 [GUARD RAIL ARCHITECTURE]: Bailout de Estado Nulo / Vazio
  // =========================================================================
  if (!state || !state.data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-neutral-900" />
      </div>
    );
  }

  const simulationResult = state.data?.simulationResult;
  const loteSubIndex = offer?.lote_index || offer?.lote_numero || "1";
  const offerDescText = offer?.offer_description ? offer.offer_description.replace(/[.,]+$/, "") : "";

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      <div className="bg-white space-y-6">
        
        {/* =========================================================================
         * 🤖 [PROGRESSIVE DISCLOSURE ARCHITECTURE]: Header Síncrono e Contexto da Oferta
         * ========================================================================= */}
        <div className="flex items-start gap-4">
          {/* Imagem totalmente solta sem nenhum box */}
          <div className="hidden sm:flex shrink-0 items-center justify-center w-20 h-20">
            <img src="/assets/home/cartao.webp" alt="Cartão" className="w-full h-full object-contain relative" />
          </div>

          <div className="space-y-0.5 flex-1 w-0 min-w-0">
            <h3 className="text-[clamp(16px,4vw,20px)] sm:text-xl font-bold text-neutral-900 uppercase tracking-tight leading-snug">
              Simulação de parcelamento*
            </h3>

            <p className="text-[clamp(10px,3vw,12px)] sm:text-xs text-neutral-600 truncate pt-0.5 w-full block">
              {offerDescText}
            </p>

            {/* LINHA DO LOTE E PREÇO COM LINK AO LADO */}
            <div className="flex items-center pt-0.5">
              <p className="text-sm text-neutral-600 truncate">
                Lote {loteSubIndex} • <strong className="text-neutral-900 font-bold mr-2">{BRL(offerValue || 0)}</strong>
              </p>

              {offer && (
                <a
                  href={getSuperbidUrl(offer)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-neutral-400 hover:text-neutral-700 transition-colors flex items-center outline-none focus:outline-none focus:ring-0 ml-1"
                  title="Ver oferta original na Superbid"
                >
                  <ExternalLink size={18} strokeWidth={1.5} />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* =========================================================================
         * 🤖 [COGNITIVE DISTRACTION & SKELETON UI ARCHITECTURE]: Renderização Condicional de Carga
         * ========================================================================= */}
        <div className="py-2">
          {isLoadingUI ? (
            <div className="space-y-3 animate-in fade-in duration-300">
              {/* STATUS TRACKER (Minimalista) */}
              <div className="flex items-center gap-2 px-1 text-neutral-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 text-neutral-900" />
                <span className="text-xs font-normal tracking-wide transition-opacity duration-300 animate-in fade-in">
                  {loadingMessage}
                </span>
              </div>

              {/* GRID FANTASMA PADRONIZADO (Estilo Ofertas Cartão) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={`skeleton-${i}`}
                    className="w-full flex flex-col items-start p-4 bg-surface-alt border border-neutral-200 rounded-none overflow-hidden shadow-xs animate-pulse space-y-3"
                  >
                    <div className="flex items-baseline gap-2 w-full">
                      <div className="h-5 w-8 bg-neutral-200 rounded-none"></div>
                      <div className="h-6 w-28 bg-neutral-200 rounded-none"></div>
                    </div>
                    <div className="h-3 w-20 bg-neutral-100 rounded-none"></div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // [RESOLVED STATE]: Injeção dos dados reais com fundo bg-surface-alt e fonte serifada de destaque no multiplicador
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl animate-in slide-in-from-bottom-4 fade-in duration-500 ease-out">
              {(simulationResult?.consults || []).map((item: any, index: number) => {
                const qtdParcelas = item.installments;
                const valorParcela = item.installment_value;
                const totalOpcao = qtdParcelas * valorParcela;

                return (
                  <button
                    key={index}
                    className="w-full flex flex-col items-start pl-6 pr-4 py-3.5 bg-surface-alt border border-neutral-300 rounded-none overflow-hidden hover:bg-neutral-100 hover:border-neutral-900 transition-all focus-visible:ring-0 focus-visible:outline-none focus:border-neutral-900 hover:-translate-y-0.5 shadow-xs"
                  >
                    <div className="flex items-baseline gap-1.5 w-full">
                      <span className="text-[13px] md:text-sm font-medium text-neutral-500 shrink-0">
                        {qtdParcelas}x
                      </span>

                      <span className="text-lg md:text-xl font-bold tracking-tight text-brand-accent shrink-0">
                        {BRL(valorParcela)}
                      </span>
                    </div>

                    {/* Linha discreta alinhada com o multiplicador */}
                    <div className="w-7 h-px bg-neutral-200 mt-2 mb-1.5" />

                    <span className="text-xs font-normal text-neutral-500">
                      Total {BRL(totalOpcao)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <p className="text-[12px] text-neutral-400 font-medium leading-relaxed pb-4">
          * Considera o valor do lance no momento da simulação, sem adicionar eventuais comissões ou outras taxas que
          também podem ser parceladas.
        </p>
      </div>
    </div>
  );
}