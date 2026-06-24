/**
 * @fileoverview Componente: Step2Confirm
 * * PROPÓSITO:
 * Exibir o resultado final da simulação (aprovado/recusado/análise).
 * Atua como o segundo e último passo da jornada de Veículos.
 * * INTEGRAÇÃO:
 * - Consome o estado final do `WizardProvider`.
 */

import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { Button } from "@/components/ui/button";
import { ButtonWhatsApp } from "@/features/financial-hub/components/layout/ButtonWhatsApp";
import { ThumbsUp, ShieldCheck, MessageCircle, ArrowLeft } from "lucide-react";
import { BRL } from "@/features/financial-hub/components/shared/formatters";

export function Step2Confirm() {
  const { state, back } = useWizard<any>();
  const result = state.data.simulationResult;
  const isApproved = result?.status_id === 1;
  const financiado = (result?.consults?.[0].financed_amount || 0);
  const mainConsult = result?.consults?.[0];
  
  // Extraindo a config para verificar o WhatsApp
  const config = state.data?.integration_details;
  const whatsappContact = config?.urlWhatsApp || config?.whatsapp_number;

  console.log("Resultado da simulação:", result);
  console.log("Dados do estado:", isApproved, financiado, mainConsult);

  return (
    // Max-w-lg e mx-auto centralizam e dão respiro lateral em telas grandes
    <div className="w-full max-w-lg mx-auto space-y-10">
      <div className="bg-white space-y-4">
        
        {isApproved ? (
          <>
            {/* Header: Ícone e Texto */}
            <div className="flex items-start gap-6">
              <div className="bg-primary/10 p-2 rounded-full">
                 <ThumbsUp className="h-6 w-6" style={{ color: "var(--brand-primary)" }} />
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Oferta encontrada!</h3>
                <p className="text-sm text-slate-500">Temos uma proposta pré-aprovada para você.</p>
              </div>
            </div>

            {/* Box da Oferta: Estruturado com wrap para evitar estouro */}
            {/* Ajustado com Fonte Proporcional (Elástica) */}
            <div className="bg-slate-50 border border-border rounded-lg p-6 sm:p-8 space-y-3 overflow-hidden">
              <p className="text-slate-600 text-xs sm:text-sm font-medium mb-0 leading-tight w-full">
                {BRL(financiado)} em
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
                  className="font-black text-slate-900 tracking-tight shrink-0"
                  style={{ fontSize: "clamp(1.6rem, 7vw, 2.25rem)" }}
                >
                  {BRL(mainConsult?.installment_value || 0).replace("R$", "").trim()}
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
              *As condições apresentadas não são garantia de aprovação. Fale com nossos especialistas para seguirmos com a análise da sua linha de crédito.
            </p>

            {/* Botões: Layout Horizontal com estilo Auto-Equity */}
            {/* Botões: Layout Responsivo (Empilhado no Mobile, Lado a Lado no Desktop) */}
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
              
              {/* Botão de contato: O w-full dentro de uma div faz ele crescer até o limite no mobile, 
                  mas a classe sm:w-auto garante que ele se comporte no PC */}
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
          /* Estado de Recusa - Padronizado e Minimalista */
          <div className="text-center py-12 space-y-6 flex flex-col items-center">
            
            <div className="bg-red-50 p-4 rounded-full w-fit border border-slate-100">
              <ShieldCheck className="h-8 w-8 text-red-500" />
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

            {/* Botão Voltar Padronizado (Ghost + Cores da Marca) */}
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