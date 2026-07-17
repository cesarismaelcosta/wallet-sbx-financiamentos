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
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, ThumbsUp } from "lucide-react";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { callSimulation } from "@/features/financial-hub/core/services/gateway";
import { CardWizardData } from "../card.types";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import { useSafeCall } from "@/features/financial-hub/core/hooks/useSafeCall";

export function Step1Simulation() {
  const [loading, setLoading] = useState(false);
  const { state, update } = useWizard<CardWizardData>();
  
  // DUAS TRAVAS: Uma para gerenciar estado visual, outra para impedir loops
  const isSimulating = useRef(false);
  const hasAttempted = useRef(false); 
  const { execute } = useSafeCall();

  if (!state || !state.data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-[var(--brand-primary)]" />
      </div>
    );
    
  }

  const offerValue = state.data?.offer?.offer_value;
  const simResult = state.data?.simulationResult;

  useEffect(() => {
    // Só dispara se houver oferta, se não houver resultado E se nunca tentou antes
    if (offerValue && !simResult && !isSimulating.current && !hasAttempted.current) {
      handleSimular();
    }
  }, [offerValue, simResult]);

  const handleSimular = async () => {
    if (hasAttempted.current) return; // Segurança extra contra dupla execução
    
    isSimulating.current = true;
    hasAttempted.current = true; // Trava a requisição para sempre nesta montagem
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
        }
      };

      // Chamada via Gateway centralizado e captura do resultado
      const result = await execute(() => callSimulation(payload));

      update({ 
        data: { 
          ...state.data, 
          simulationResult: result, 
          simulation_id: result.simulation_id,
          simulation_update_id: result.simulation_update_id 
        } 
      });
      
    } catch (error: any) {
      console.error("[Erro na Simulação Card]:", error);
      
      // DISPARA O EVENTO GLOBAL PARA O LAYOUT OUVIR
      // O Layout vai capturar esse erro e exibir o ErrorCountdown automaticamente.
      window.dispatchEvent(new CustomEvent('app-error', { detail: error }));
    } finally {
      setLoading(false);
      isSimulating.current = false;
      // ATENÇÃO: Nunca mudamos o hasAttempted para false aqui. O loop morre aqui.
    }
  };

  if (loading || !state.data.simulationResult) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <Loader2 className="h-10 w-10 animate-spin text-[var(--brand-primary)]" />
        <p className="text-sm text-slate-500 font-medium animate-pulse">
          Calculando condições...
        </p>
      </div>
    );
  }

  const simulationResult = state.data?.simulationResult;
  const offer = state.data?.offer;

  return (
    <div className="w-full space-y-10">
      <div className="bg-white space-y-4">
        <div className="flex items-start gap-6">
          {/* shrink-0 garante que o ícone nunca seja amassado se o texto for grande */}
          <div className="bg-primary/10 p-2 rounded-full shrink-0">
            <ThumbsUp className="h-6 w-6" style={{ color: "var(--brand-primary)" }} />
          </div>
          
          {/* flex-1 min-w-0 são essenciais para o 'truncate' com 3 pontinhos funcionar dentro do flex */}
          <div className="space-y-1 flex-1 min-w-0">
            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">
              Simulação de parcelamento*!
            </h3>
            
            {/* BLOCO AJUSTADO: Sem negrito, apenas o truncate para cortar com ... */}
            <p className="text-xs text-muted-foreground truncate">
              {offer?.offer_description 
                ? offer.offer_description.replace(/[.,]+$/, "") 
                : "Selecione o melhor parcelamento no cartão para você."}
            </p>
            
            <p className="flex items-baseline gap-1 mt-1">
              {/* BLOCO AJUSTADO: Sem font-black, deixando a fonte normal para não pesar */}
              <span className="text-slate-900 text-sm">{BRL(offerValue || 0)}</span>
            </p>
          </div>
        </div>
        
        {/* BLOCO DE AJUSTE DE ESPAÇAMENTO APLICADO AQUI ABAIXO */}
        {/* Reduzimos o padding vertical e horizontal e removemos o redundant space-y-4 */}
        <div className="py-2 md:py-3 px-4 md:px-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(simulationResult?.consults || []).map((item: any, index: number) => {
              const qtdParcelas = item.installments;
              const valorParcela = item.installment_value;
              const totalOpcao = qtdParcelas * valorParcela;

              return (
                <button
                  key={index}
                  className="w-full flex flex-col items-start p-4 bg-white border border-[var(--brand-primary)] rounded-xl overflow-hidden hover:bg-slate-50 transition-colors focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2"
                >
                  
                  {/* CONTAINER UNIFICADO ELÁSTICO */}
                  {/* flex-nowrap e whitespace-nowrap proíbem o texto de quebrar de linha */}
                  <div className="flex flex-nowrap items-baseline gap-1.5 w-full whitespace-nowrap">
                    
                    {/* Parcela (ex: 18x): Encolhe proporcionalmente */}
                    <span 
                      className="font-black shrink-0" 
                      style={{ color: "var(--brand-primary)", fontSize: "clamp(0.9rem, 3.5vw, 1.1rem)" }}
                    >
                      {qtdParcelas}x
                    </span>
                    
                    {/* Valor Principal: Encolhe junto sem NUNCA usar reticências (...) */}
                    <span 
                      className="font-black text-slate-900 tracking-tight shrink-0"
                      style={{ fontSize: "clamp(1.1rem, 4.5vw, 1.35rem)" }}
                    >
                      {BRL(valorParcela)}
                    </span>
                    
                  </div>
                  
                  {/* Valor Total fica embaixo tranquilo */}
                  <span className="text-xs text-slate-500 mt-1.5">
                    Total {BRL(totalOpcao)}
                  </span>
                  
                </button>
              );
            })}
          </div>
        </div>
        
        <p className="text-[12px] text-slate-400 font-medium leading-relaxed px-6 md:px-8 pb-4">
          * Considera o valor do lance no momento da simulação, sem adicionar eventuais comissões ou outras taxas que também podem ser parceladas.
        </p>
      </div>
    </div>
  );
}