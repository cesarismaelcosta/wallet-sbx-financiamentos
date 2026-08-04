/**
 * @fileoverview Componente: Step2Confirm
 * * PROPÓSITO:
 * Exibir o resultado final da simulação (aprovado/recusado/análise).
 * Atua como o segundo e último passo da jornada de Veículos.
 * * INTEGRAÇÃO:
 * - Consome o estado final do `WizardProvider`.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { Button } from "@/components/ui/button";
import { ButtonWhatsApp } from "@/features/financial-hub/components/layout/ButtonWhatsApp";
import { ArrowLeft } from "lucide-react";
import { BRL } from "@/features/financial-hub/components/shared/formatters";

export function Step2Confirm() {
  const { state, back } = useWizard<any>();
  const result = state.data.simulationResult;
  const isApproved = result?.status_id === 1;
  const mainConsult = result?.consults?.[0];
  
  // Extraindo a config para verificar o WhatsApp
  const config = state.data?.integration_details;
  const whatsappContact = config?.urlWhatsApp || config?.whatsapp_number;

  // Validação do tipo de pessoa PJ via entity_type do payload
  const isPJ = state.data?.entity_type === 'PJ';

  // Dados do lote obtidos do estado para manter o padrão visual do Step 1
  const offer = state.data?.offer;
  
  // Atributos ajustados do lote e valor
  const loteSubIndex = offer?.lote_index || offer?.lote_numero || "1";
  const offerDescText = offer?.offer_description ? offer.offer_description.replace(/[.,]+$/, "") : "";
  
  const valorVeiculo = state.data?.valorVeiculo || offer?.offer_value || 0;
  
  // PEGANDO OS VALORES EXATOS DO RETORNO DA API (sem conta de padaria)
  const valorEntradaAPI = mainConsult?.down_payment_amount || result?.retorno?.valorEntrada || result?.valorEntrada || state.data?.valorEntrada || 0;
  const valorFinanciadoAPI = mainConsult?.financed_amount || result?.retorno?.valorFinanciado || result?.valorFinanciado || 0;

  return (
    // Max-w-lg e mx-auto centralizam e dão respiro lateral em telas grandes
    <div className="w-full max-w-lg mx-auto space-y-10">
      <div className="bg-white space-y-4">
        
        {isApproved ? (
          <>
            {/* Header: Imagem de simulação idêntica ao Step 1 no desktop */}
            <div className="flex items-center gap-4 mb-6">
              <div className="hidden sm:flex shrink-0 items-center justify-center w-20 h-20">
                <img 
                  src="/assets/home/financiamentoveiculossimulacao.png" 
                  alt="Simulação de Financiamento" 
                  className="w-full h-full object-contain"
                />
              </div>
              
              <div className="space-y-0.5 flex-1 w-0 min-w-0">
                <h3 className="text-base sm:text-xl font-black text-slate-900 uppercase tracking-tight leading-snug truncate w-full">
                  {isPJ ? "Referência de preço encontrada!" : "Oferta encontrada!"}
                </h3>
                
                {/* Linha 1: Descrição do veículo em cinza claro (igual ao Step 1) */}
                <p className="text-xs text-slate-600 truncate pt-0.5 w-full">
                  {offerDescText}
                </p>

                {/* Linha 2: Lote e valor com destaque (igual ao Step 1) */}
                <p className="text-xs text-slate-600 truncate pt-0.5 w-full">
                  Lote {loteSubIndex} • <strong className="text-slate-900 font-bold">{BRL(valorVeiculo)}</strong>
                </p>
              </div>
            </div>

            {/* Box da Oferta: Estruturado com wrap para evitar estouro e cor original mais clara */}
            <div className="bg-slate-50 border border-border rounded-lg p-6 sm:p-8 space-y-3 overflow-hidden">
              <p className="text-slate-600 text-xs sm:text-sm font-medium mb-0 leading-tight w-full flex flex-wrap items-center gap-1">
                <span>ent.</span> 
                <span className="font-medium text-slate-600">
                  <span className="text-[0.85em]">R$</span> {BRL(valorEntradaAPI).replace("R$", "").trim()}
                </span> 
                <span>+</span> 
                <span className="font-medium text-slate-600">
                  <span className="text-[0.85em]">R$</span> {BRL(valorFinanciadoAPI).replace("R$", "").trim()}
                </span> 
                <span>em</span>
              </p>
              
              {/* CONTAINER EM UMA ÚNICA LINHA - PROIBIDO QUEBRAR (flex-nowrap) */}
              <div className="flex flex-nowrap items-baseline gap-1 sm:gap-1.5 w-full whitespace-nowrap">
                
                {/* Parcelas: Encolhe proporcionalmente até no mínimo 18px (1.1rem) */}
                <span 
                  className="font-black shrink-0" 
                  style={{ color: "var(--brand-primary)", fontSize: "clamp(1.1rem, 5vw, 1.5rem)" }}
                >
                  {mainConsult?.installments}x
                </span>
                
                {/* Valor Principal: Encolhe proporcionalmente até no mínimo 26px (1.6rem) */}
                <span 
                  className="font-black text-slate-900 tracking-tight shrink-0 flex items-baseline gap-0.5"
                  style={{ fontSize: "clamp(1.6rem, 7vw, 2.25rem)" }}
                >
                  <span className="text-[0.75em] font-bold">R$</span>
                  <span>{BRL(mainConsult?.installment_value || 0).replace("R$", "").trim()}</span>
                </span>

                {/* Sufixo (/mês): Encolhe um pouco, mas nunca some */}
                <span 
                  className="text-slate-400 font-medium shrink-0"
                  style={{ fontSize: "clamp(0.7rem, 3vw, 0.875rem)" }}
                >
                  /mês*
                </span>
              </div>

              <div className="text-xs text-slate-500 mt-3 pt-3 border-t border-slate-200">
                Taxa de juros de <span className="font-bold text-slate-900">{Number(mainConsult?.cet_rate || 0).toFixed(2)}%</span> a.m.
              </div>
            </div>

            {/* Disclaimer */}
            <p className="text-[11px] text-slate-400 font-medium leading-relaxed">
              {isPJ ? (
                "*O valor de parcela é baseado em taxas de referência para financiamentos com nosso parceiro e não representa garantia de aprovação. Fale com nossos especialistas para seguirmos com a análise de crédito e buscarmos as melhores condições para você financiar essa oferta."
              ) : (
                "*As condições apresentadas não são garantia de aprovação. Fale com nossos especialistas para seguirmos com a análise da sua linha de crédito."
              )}
            </p>

            {/* Botões: Layout Horizontal com estilo Auto-Equity */}
            <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4 pt-6 w-full">
              
              {/* Botão Voltar */}
              <Button 
                variant="ghost" 
                onClick={back}
                className="w-full sm:w-auto text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/10 hover:text-[var(--brand-primary)] transition-all focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2"
              >
                <ArrowLeft className="mr-2 h-4 w-4" /> 
                Voltar
              </Button>
              
              {/* Botão de contato */}
              <div className="w-full sm:w-auto flex-1 flex justify-end">
                <ButtonWhatsApp 
                    variant="button"
                    config={state.data?.integration_details} 
                    data={state.data} 
                />
              </div>

            </div>
          </>
        ) : (
          /* Estado de Recusa - Com a ilustração refinada */
          <div className="text-center py-8 space-y-6 flex flex-col items-center">
            
            <div className="w-36 h-36 flex items-center justify-center">
              <img 
                src="/assets/home/financiamentocreditonegada.png" 
                alt="Nenhuma oferta disponível" 
                className="w-full h-full object-contain"
              />
            </div>

            <div className="space-y-2 max-w-xs mx-auto">
              <h3 className="text-xl font-bold text-slate-900 tracking-tight">Nenhuma oferta disponível</h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                No momento não encontramos condições para os dados informados.
              </p>
            </div>

            <div className="bg-slate-50 px-4 py-2 rounded-lg border border-slate-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                Sugestão: Tente aumentar a entrada.
              </p>
            </div>

            {/* Botão Voltar Padronizado */}
            <Button 
              variant="ghost" 
              onClick={back}
              className="text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/10 hover:text-[var(--brand-primary)] transition-all focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Simular novamente
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}