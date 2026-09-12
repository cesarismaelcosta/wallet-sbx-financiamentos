/**
 * @fileoverview Componente: Step2Confirm (Simulação / Partners)
 * @path src/components/simulacao/steps/Step2Confirm.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO: ZERO-RADIUS GOVERNANCE & ARCHITECTURAL MECHANICS
 * =========================================================================
 * [MECÂNICA ARQUITETURAL]:
 * - PROPÓSITO: Exibir o resultado final da simulação (aprovado/recusado/análise).
 *   Atua como o segundo e último passo da jornada de Partners/Simulação.
 * - INTEGRAÇÃO: Consome o estado final do `WizardProvider`.
 * 
 * [ATUALIZAÇÃO VISUAL - SIMETRIA COM VEÍCULOS]:
 * - Header atualizado para espelhar a estrutura com thumbnail (Progressive Disclosure).
 * - Estado de recusa redesenhado usando a arte padronizada em escala de cinza 
 *   (financiamentocreditonegada.webp) ao invés do ícone vermelho.
 * - Substituição do branding roxo e de cores vivas pela escala `neutral-900`.
 * - Aplicação estrita da governança Zero-Radius (`rounded-none`) no card 
 *   de oferta e nos alertas.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { Button } from "@/components/ui/button";
import { ButtonWhatsApp } from "@/features/financial-hub/components/layout/ButtonWhatsApp";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { BRL } from "@/features/financial-hub/components/shared/formatters";

// =========================================================================
// 🤖 [UTILITY ARCHITECTURE]: Slugificação Segura para Ofertas sbX
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
  // =========================================================================
  // 🤖 [LOCAL STATE ARCHITECTURE]: Consumo de Estado do Wizard
  // =========================================================================
  const { state, back } = useWizard<any>();
  const result = state.data.simulationResult;
  const isApproved = result?.status_id === 1;
  const mainConsult = result?.consults?.[0];
  
  // Extraindo a config para verificar o WhatsApp
  const config = state.data?.integration_details;
  const whatsappContact = config?.urlWhatsApp || config?.whatsapp_number;

  // Validação do tipo de pessoa PJ via entity_type do payload
  const isPJ = state.data?.entity_type === "PJ";

  // Dados do lote obtidos do estado para manter o padrão visual do Step 1
  const offer = state.data?.offer;
  
  // Atributos ajustados do lote e valor
  const loteSubIndex = offer?.lote_index || offer?.lote_numero || "1";
  const offerDescText = offer?.offer_description ? offer.offer_description.replace(/[.,]+$/, "") : "";
  
  const valorOferta = state.data?.valorOferta || offer?.offer_value || 0;
  
  // PEGANDO OS VALORES EXATOS DO RETORNO DA API (Entrada + Valor Financiado)
  const valorEntradaAPI = 
    mainConsult?.down_payment_amount ?? 
    result?.retorno?.valorEntrada ?? 
    result?.valorEntrada ?? 
    state.data?.valorEntrada ?? 
    0;

  const valorFinanciadoAPI = 
    mainConsult?.financed_amount ?? 
    result?.retorno?.valorFinanciado ?? 
    result?.valorFinanciado ?? 
    0;

  return (
    <div className="w-full max-w-lg mx-auto space-y-10 animate-in fade-in duration-500">
      <div className="bg-white space-y-6">
        
        {isApproved ? (
          <>
            {/* =========================================================================
             * 🤖 [PROGRESSIVE DISCLOSURE ARCHITECTURE]: Header Síncrono e Contexto
             * ========================================================================= */}
            <div className="flex items-start gap-4">
              
              {/* Box com a Ilustração Fixa - Simetria 1:1 com o Step 1 */}
              <div className="hidden sm:flex shrink-0 items-center justify-center w-20 h-20">
                <img
                  src="/assets/home/financiamentoveiculossimulacao.webp"
                  alt="Veículos"
                  className="w-full h-full object-contain relative saturate-[10%]"
                />
              </div>
              
              <div className="space-y-0.5 flex-1 w-0 min-w-0">
                {/* Fonte cai para 14px no mobile, peso black, linha única forçada */}
                <h3 className="text-[clamp(14px,3.5vw,20px)] sm:text-2xl font-black text-neutral-900 uppercase tracking-tight leading-snug truncate w-full block">
                  {isPJ ? "Referência de preço encontrada" : "Oferta encontrada"}
                </h3>
                
                {/* Descrição do item */}
                <p className="text-[clamp(10px,3vw,12px)] sm:text-xs text-neutral-600 truncate pt-0.5 w-full block">
                  {offerDescText}
                </p>

                {/* Lote e valor com destaque + Link Externo Padronizado */}
                <div className="flex items-center pt-0.5">
                  <p className="text-sm text-neutral-600 truncate">
                    Lote {loteSubIndex} • <strong className="text-neutral-900 font-bold mr-2">{BRL(valorOferta)}</strong>
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
             * 🤖 [RESULT DISPLAY ARCHITECTURE]: Box da Oferta em bg-surface-alt
             * ========================================================================= */}
            <div className="bg-surface-alt border border-neutral-200 rounded-none p-6 sm:p-8 space-y-3 overflow-hidden">
              <p className="text-neutral-600 text-[11px] sm:text-sm font-medium mb-1 leading-tight w-full">
                {valorEntradaAPI > 0 ? (
                  <>
                    ent. <span className="text-[0.85em]">R$</span> {BRL(valorEntradaAPI).replace("R$", "").trim()} +{" "}
                  </>
                ) : (
                  <>sem entrada +{" "}</>
                )}
                <span className="text-[0.85em]">R$</span> {BRL(valorFinanciadoAPI).replace("R$", "").trim()} em
              </p>
              
              {/* CONTAINER EM UMA ÚNICA LINHA - PROIBIDO QUEBRAR (flex-nowrap) */}
              <div className="flex flex-nowrap items-baseline gap-1.5 sm:gap-2 w-full whitespace-nowrap">
                
                {/* Multiplicador padronizado */}
                <span 
                  className="font-medium text-neutral-500 shrink-0" 
                  style={{ fontSize: "clamp(1.2rem, 5.5vw, 1.5rem)" }}
                >
                  {mainConsult?.installments}x
                </span>
                
                {/* Valor Principal */}
                <span 
                  className="font-bold text-neutral-900 tracking-tight shrink-0 flex items-baseline gap-0.5"
                  style={{ fontSize: "clamp(1.6rem, 7vw, 2.25rem)" }}
                >
                  <span className="text-[0.75em] font-bold">R$</span>
                  <span>{BRL(mainConsult?.installment_value || 0).replace("R$", "").trim()}</span>
                </span>

                {/* Sufixo (/mês) */}
                <span 
                  className="text-neutral-400 font-medium shrink-0"
                  style={{ fontSize: "clamp(0.7rem, 3vw, 0.875rem)" }}
                >
                  /mês*
                </span>
              </div>

              <div className="text-xs text-neutral-500 mt-3 pt-3 border-t border-neutral-200">
                Taxa de juros de <span className="font-bold text-neutral-900">{Number(mainConsult?.cet_rate || 0).toFixed(2)}%</span> a.m.
              </div>
            </div>

            {/* Disclaimer */}
            <p className="text-[11px] text-neutral-400 font-medium leading-relaxed">
              {isPJ
                ? "*O valor de parcela é baseado em taxas de referência para financiamentos com nosso parceiro e não representa garantia de aprovação. Fale com nossos especialistas para seguirmos com a análise de crédito e buscarmos as melhores condições para você financiar essa oferta."
                : "*As condições apresentadas não são garantia de aprovação. Fale com nossos especialistas para seguirmos com a análise da sua linha de crédito."}
            </p>

            {/* =========================================================================
             * 🤖 [ACTION ARCHITECTURE]: Botões de Navegação com Governança Zero-Radius
             * ========================================================================= */}
            <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4 pt-4 w-full">
              <Button 
                variant="ghost" 
                onClick={back}
                className="w-full sm:w-auto text-neutral-900 hover:bg-neutral-100 hover:text-neutral-900 transition-all rounded-none font-medium"
              >
                <ArrowLeft className="mr-2 h-4 w-4" /> 
                Voltar
              </Button>
              
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
          /* =========================================================================
           * 🤖 [ERROR / FALLBACK STATE]: Estado de Recusa Simétrico a Veículos
           * ========================================================================= */
          <div className="text-center py-8 space-y-6 flex flex-col items-center">
            
            <div className="w-36 h-36 flex items-center justify-center">
              <img
                src="/assets/home/financiamentocreditonegada.webp"
                alt="Nenhuma oferta disponível"
                className="w-full h-full object-contain relative saturate-[10%]"
              />
            </div>

            <div className="space-y-2 max-w-xs mx-auto">
              <h3 className="text-xl font-bold text-neutral-900 tracking-tight">Nenhuma oferta disponível</h3>
              <p className="text-sm text-neutral-600 leading-relaxed">
                No momento não encontramos condições para os dados informados.
              </p>
            </div>

            <div className="bg-surface-alt px-4 py-2 border border-neutral-200 rounded-none">
              <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
                Sugestão: Tente aumentar a entrada.
              </p>
            </div>

            <Button 
              variant="ghost" 
              onClick={back}
              className="text-neutral-900 hover:bg-neutral-100 hover:text-neutral-900 transition-all rounded-none font-medium"
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Simular novamente
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}