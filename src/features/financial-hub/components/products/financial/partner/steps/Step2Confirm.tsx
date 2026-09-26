/**
 * @fileoverview Componente: Step2Confirm
 * * PROPÓSITO:
 * Exibir o resultado final da simulação (aprovado/recusado/análise).
 * Atua como o segundo e último passo da jornada de Partner.
 * * INTEGRAÇÃO:
 * - Consome o estado final do `WizardProvider`.
 */

import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { Button } from "@/components/ui/button";
import { ButtonWhatsApp } from "@/features/financial-hub/components/layout/ButtonWhatsApp";
import { ThumbsUp, ShieldCheck, ArrowLeft, ExternalLink } from "lucide-react";
import { BRL } from "@/features/financial-hub/components/shared/formatters";

// =========================================================================
// Link para oferta na plataforma sbX
// =========================================================================
const getSuperbidUrl = (offerData: any) => {
  if (!offerData?.offer_id) return "#";
  const slug = (offerData.offer_description || "")
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `https://www.superbid.net/oferta/${slug}-${offerData.offer_id}`;
};

export function Step2Confirm() {
  const { state, back } = useWizard<any>();
  const result = state.data.simulationResult;
  const isApproved = result?.status_id === 1;
  const mainConsult = result?.consults?.[0];
  
  // Extraindo a config para verificar o WhatsApp
  const config = state.data?.integration_details;
  const whatsappContact = config?.urlWhatsApp || config?.whatsapp_number;

  // Dados do lote obtidos do estado para manter o padrão visual do Step 1
  const offer = state.data?.offer;
  
  // Atributos ajustados do lote e valor
  const loteSubIndex = offer?.lote_index || offer?.lote_numero || "1";
  const offerDescText = offer?.offer_description ? offer.offer_description.replace(/[.,]+$/, "") : "";
  
  const valorOferta = state.data?.valorOferta || offer?.offer_value || 0;
  
  // PEGANDO OS VALORES EXATOS DO RETORNO DA API (Entrada + Valor Financiado)
  const valorEntradaAPI = mainConsult?.down_payment_amount || result?.retorno?.valorEntrada || result?.valorEntrada || state.data?.valorEntrada || 0;
  const valorFinanciadoAPI = mainConsult?.financed_amount || result?.retorno?.valorFinanciado || result?.valorFinanciado || 0;

  return (
    // Max-w-lg e mx-auto centralizam e dão respiro lateral em telas grandes
    <div className="w-full max-w-lg mx-auto space-y-10">
      <div className="bg-white dark:bg-neutral-950 space-y-4">
        
        {isApproved ? (
          <>
            {/* Header: Ícone oculto no mobile (hidden sm:flex), linhas mais juntas (space-y-0.5) e maior respiro (mb-6) */}
            <div className="flex items-start gap-4 mb-6">
              <div className="bg-neutral-100 dark:bg-neutral-800 p-2.5 rounded-none border border-neutral-200 dark:border-neutral-800 shrink-0 hidden sm:flex">
                <ThumbsUp className="h-6 w-6 text-neutral-900 dark:text-neutral-100" />
              </div>
              
              <div className="space-y-0.5 flex-1 w-0 min-w-0">
                {/* Clamp de 14px com peso black e truncate, igual ao Step 1 */}
                <h3 className="text-[clamp(14px,3.5vw,20px)] sm:text-2xl font-black text-neutral-900 dark:text-neutral-100 uppercase tracking-tight leading-snug truncate w-full block">
                  Oferta encontrada
                </h3>
                
                {/* Cores convertidas de slate para neutral */}
                <p className="text-[clamp(10px,3vw,12px)] sm:text-xs text-neutral-600 dark:text-neutral-400 truncate pt-0.5 w-full block">
                  {offerDescText}
                </p>

                <div className="flex items-center pt-0.5">
                  <p className="text-sm text-neutral-600 dark:text-neutral-400 truncate">
                    Lote {loteSubIndex} • <strong className="text-neutral-900 dark:text-neutral-100 font-bold mr-2">{BRL(valorOferta)}</strong>
                  </p>

                  {offer && (
                    <a 
                      href={getSuperbidUrl(offer)} 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-neutral-400 dark:text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors flex items-center outline-none focus:outline-none focus:ring-0 ml-1"
                      title="Ver oferta original na Superbid"
                    >
                      <ExternalLink size={18} strokeWidth={1.5} />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Box da Oferta: Padrão Zero-Radius e Neutral */}
            <div className="bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-none p-6 sm:p-8 space-y-3 overflow-hidden">
              
              {/* Texto inline (sem flexbox) e com condicional exata validada para 'sem entrada' */}
              <p className="text-neutral-600 dark:text-neutral-400 text-[11px] sm:text-sm font-medium mb-1 leading-tight w-full">
                {valorEntradaAPI > 0 ? (
                  <>
                    ent. <span className="text-[0.85em]">R$</span> {BRL(valorEntradaAPI).replace("R$", "").trim()} +{" "}
                  </>
                ) : (
                  <>sem entrada +{" "}</>
                )}
                <span className="text-[0.85em]">R$</span> {BRL(valorFinanciadoAPI).replace("R$", "").trim()} em
              </p>
              
              {/* CONTAINER EM UMA ÚNICA LINHA ACHATADA - Fim do bug de Baseline (Degrau) */}
              <div className="flex flex-nowrap items-baseline w-full whitespace-nowrap">
                
                {/* Multiplicador: Fim do var(--brand-primary), agora é neutral-500 */}
                <span 
                  className="font-medium text-neutral-500 dark:text-neutral-400 shrink-0 mr-1.5 sm:mr-2" 
                  style={{ fontSize: "clamp(1.2rem, 5.5vw, 1.5rem)" }}
                >
                  {mainConsult?.installments}x
                </span>
                
                {/* Símbolo R$ no mesmo nível */}
                <span 
                  className="font-bold text-[#2246A7] tracking-tight shrink-0 mr-1"
                  style={{ fontSize: "clamp(1.2rem, 5.25vw, 1.68rem)" }}
                >
                  R$
                </span>

                {/* Valor Principal (Diretamente no mesmo nível) */}
                <span 
                  className="font-bold text-[#2246A7] tracking-tight shrink-0"
                  style={{ fontSize: "clamp(1.6rem, 7vw, 2.25rem)" }}
                >
                  {BRL(mainConsult?.installment_value || 0).replace("R$", "").trim()}
                </span>

                {/* Sufixo (/mês) */}
                <span 
                  className="text-neutral-400 dark:text-neutral-500 font-medium shrink-0 ml-1.5 sm:ml-2"
                  style={{ fontSize: "clamp(0.7rem, 3vw, 0.875rem)" }}
                >
                  /mês*
                </span>
              </div>

              {/* Escala neutral na taxa de juros */}
              <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-800">
                Taxa de juros de <span className="font-bold text-neutral-900 dark:text-neutral-100">{Number(mainConsult?.cet_rate || 0).toFixed(2)}%</span> a.m.
              </div>
            </div>

            {/* Disclaimer */}
            <p className="text-[11px] text-neutral-400 dark:text-neutral-500 font-medium leading-relaxed">
              *As condições apresentadas não são garantia de aprovação. Fale com nossos especialistas para seguirmos com a análise da sua linha de crédito.
            </p>

            {/* Botões: Layout Horizontal */}
            <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4 pt-6 w-full">
              
              {/* Botão Voltar */}
              <Button 
                variant="ghost" 
                onClick={back}
                className="w-full sm:w-auto text-[#2246A7] hover:bg-[#E7F2FD] dark:hover:bg-neutral-800 hover:text-[#2246A7] transition-all focus-visible:ring-2 focus-visible:ring-[#2246A7] focus-visible:ring-offset-2"
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
                    className="border-[#2246A7] text-[#2246A7] hover:bg-[#2246A7] hover:text-white"
                />
              </div>

            </div>
          </>
        ) : (
          /* Estado de Recusa - Padronizado e Minimalista */
          <div className="text-center py-12 space-y-6 flex flex-col items-center">

            <div className="bg-neutral-100 dark:bg-neutral-800 p-4 rounded-none w-fit border border-neutral-200 dark:border-neutral-800">
              <ShieldCheck className="h-8 w-8 text-neutral-900 dark:text-neutral-100" />
            </div>

            <div className="space-y-2 max-w-xs mx-auto">
              <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">Nenhuma oferta disponível</h3>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed">
                No momento não encontramos condições para os dados informados.
              </p>
            </div>

            <div className="bg-neutral-50 dark:bg-neutral-900 px-4 py-2 rounded-none border border-neutral-200 dark:border-neutral-800">
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500 dark:text-neutral-400">
                Sugestão: Tente aumentar a entrada.
              </p>
            </div>

            {/* Botão Voltar Padronizado */}
            <Button 
              variant="ghost" 
              onClick={back}
              className="text-neutral-900 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800 hover:text-neutral-900 dark:hover:text-neutral-100 transition-all focus-visible:ring-2 focus-visible:ring-neutral-900 dark:focus-visible:ring-neutral-100 focus-visible:ring-offset-2"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Simular novamente
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}