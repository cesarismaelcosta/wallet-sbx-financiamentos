/**
 * @fileoverview Step: Simulação (Veículos)
 * @path src/components/veiculos/steps/Step1Simulation.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO: ZERO-RADIUS GOVERNANCE & ARCHITECTURAL MECHANICS
 * =========================================================================
 * [MECÂNICA ARQUITETURAL]:
 * - Engine: Renderizado pela WizardEngine.
 * - Estado: Consome WizardProvider.
 * - Transportador: callSimulation (centralizado em lib/api/gateway.ts).
 * 
 * O payload de rede foi purificado. O uso do `...state.data` foi abolido para
 * evitar o envio de lixo de UI (estado interno, objetos aninhados) para a 
 * camada de rede. O componente monta um payload estritamente "Thin", extraindo 
 * os cursores temporais (`visit_id`, `visit_update_id`) da URL e enviando 
 * APENAS os IDs identificadores e os inputs financeiros necessários que o Gateway exige.
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { Loader2, ExternalLink } from "lucide-react";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { DynamicConsents } from "@/features/financial-hub/components/layout/DynamicConsents";
import { SliderCustomizado } from "@/features/financial-hub/components/shared/SliderCustomizado";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import { callSimulation } from "@/features/financial-hub/core/services/gateway";
import { setFastPathState } from "@/features/financial-hub/core/services/fastPathCache";
import { useSafeCall } from "@/features/financial-hub/core/hooks/useSafeCall";

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

export function Step1Simulation() {
  // =========================================================================
  // 🤖 [LOCAL STATE ARCHITECTURE]: Gerenciamento de Inputs e Ciclo de Vida
  // =========================================================================
  const [acceptedConsents, setAcceptedConsents] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [entradaFocused, setEntradaFocused] = useState(false); // controla o badge do slider de Entrada enquanto o input está em foco
  const { state, updateData, update } = useWizard<any>();
  const [loadingMessage, setLoadingMessage] = useState("Consultando ofertas...");

  // Estados locais para controle fluido do Slider (evita race condition)
  const [localValorVeiculo, setLocalValorVeiculo] = useState(0);
  const [localPercentualEntrada, setLocalPercentualEntrada] = useState(0);
  const [localParcelas, setLocalParcelas] = useState<number | null>(null);

  // =========================================================================
  // 🤖 [UX ARCHITECTURE]: Roteiro de Loading Progressivo (Mitiga latência Fandi)
  // =========================================================================
  useEffect(() => {
    let timers: NodeJS.Timeout[] = [];
    
    if (loading) {
      setLoadingMessage("Iniciando simulação...");
      
      timers.push(setTimeout(() => {
        setLoadingMessage("Enviando seus dados...");
      }, 4000));

      timers.push(setTimeout(() => {
        setLoadingMessage("Consultando condições...");
      }, 12000));

      timers.push(setTimeout(() => {
        setLoadingMessage("Buscando mais condições...");
      }, 24000));
      
      timers.push(setTimeout(() => {
        setLoadingMessage("Finalizando as consultas...");
      }, 35000));
    } else {
      timers.forEach(clearTimeout);
      setLoadingMessage("Consultando ofertas...");
    }

    return () => timers.forEach(clearTimeout);
  }, [loading]);

  // =========================================================================
  // 🤖 [RENDER GUARD ARCHITECTURE]: Proteção contra Regressões de Ciclo
  // =========================================================================
  const initializedOfferIdRef = useRef<any>(null);

  useEffect(() => {
    const currentOfferId = state?.data?.offer?.offer_id || state?.data?.offer?.id;
    
    if (currentOfferId && initializedOfferIdRef.current !== currentOfferId) {
      initializedOfferIdRef.current = currentOfferId;
      setLocalValorVeiculo(state.data.offer.offer_value ?? 0);
      setLocalPercentualEntrada(state.data.rules?.min_down_payment_percentage ?? 0);
      setLocalParcelas(state.data.rules?.default_installments ?? null);
    }
  }, [state?.data?.offer, state?.data?.rules]);

  // =========================================================================
  // 🤖 [COMPLIANCE ARCHITECTURE]: Validação Otimizada de Consentimentos
  // =========================================================================
  const areConsentsValid = useMemo(() => {
    const configs = state.data?.consent_configs || [];
    return configs.filter((opt: any) => opt.is_required).every((opt: any) => acceptedConsents[opt.id] === true);
  }, [state.data?.consent_configs, acceptedConsents]);

  const isSimulating = useRef(false);
  const { execute } = useSafeCall();

  // =========================================================================
  // 🤖 [ZERO-TRUST HANDLER ARCHITECTURE]: Execução de Rede e Thin Payload
  // =========================================================================
  const handleSimular = async () => {
    if (loading || isSimulating.current) return;

    isSimulating.current = true;
    setLoading(true);

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlVisitId = urlParams.get("visit_id");
      const urlVisitUpdateId = urlParams.get("visit_update_id");

      const payload = {
        action: "SIMULATE",
        visit_id: urlVisitId || state.data.visit_id,
        visit_update_id: urlVisitUpdateId || state.data.visit_update_id,
        offer_id: state.data.offer?.offer_id,
        product_id: state.data.product_id,
        simulation_details: {
          requested_value: localValorVeiculo,
          installments: localParcelas,
          down_payment_amount: (localValorVeiculo * localPercentualEntrada) / 100,
          down_payment_percentage: localPercentualEntrada,
          cet_rate: state.data.taxa || 0,
        },
        consents: state.data.consent_configs
          ?.filter((c: any) => acceptedConsents[c.id])
          .map((c: any) => ({
            consent_id: c.id,
            acceptedConsents: true,
            acceptedConsents_at: new Date().toISOString(),
            legal_text_snapshot: { template_text: c.template_text, links: c.links },
          })),
      };

      const result = await execute(() => callSimulation(payload));

      if (result.state) {
        setFastPathState(result.state);
      }

      update({
        meta: { ...state.meta, step: 2 },
        data: {
          ...state.data,
          simulationResult: result,
          simulation_id: result.simulation_id,
          simulation_update_id: result.simulation_update_id,
          ...(result.state && {
            offer: result.state.offer,
            rules: result.state.rules,
            entity: result.state.entity,
          }),
        },
      });
    } catch (error: any) {
      console.error("[Erro na Simulação Veículos]:", error);
      window.dispatchEvent(new CustomEvent("app-error", { detail: error }));
    } finally {
      setLoading(false);
      isSimulating.current = false;
    }
  };

  // =========================================================================
  // 🤖 [GUARD RAIL ARCHITECTURE]: Bailout de Estado Nulo / Vazio
  // =========================================================================
  if (!state?.data || Object.keys(state.data).length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-neutral-400">Carregando...</span>
      </div>
    );
  }

  const { rules, consent_configs, offer } = state.data;
  const tetoMaximo =
    offer?.vehicle_details?.fipe_value ?? 
    ((offer?.offer_value || 0) * (1 + (rules?.max_offer_cap_percent ?? 20) / 100));

  const loteSubIndex = offer?.lote_index || offer?.lote_numero || "1";
  const offerDescText = offer?.offer_description ? offer.offer_description.replace(/[.,]+$/, "") : "";

  return (
    <div className="w-full space-y-8 animate-in fade-in duration-500">
      <div className="bg-white space-y-6">
        
        {/* =========================================================================
         * 🤖 [PROGRESSIVE DISCLOSURE ARCHITECTURE]: Header Síncrono da Oferta
         * ========================================================================= */}
        <div className="flex items-start gap-4">
          <div className="hidden sm:flex shrink-0 items-center justify-center w-20 h-20">
            <img
              src="/assets/home/financiamentoveiculossimulacao.webp"
              alt="Veículos"
              className="w-full h-full object-contain relative"
            />
          </div>

          <div className="space-y-0.5 flex-1 w-0 min-w-0">
            {/* Fonte cai para 14px no mobile, peso black, linha única forçada */}
            <h3 className="text-[clamp(14px,3.5vw,20px)] sm:text-2xl font-black text-neutral-900 uppercase tracking-tight leading-snug truncate w-full block">
              Simule seu financiamento
            </h3>

            <p className="text-[clamp(10px,3vw,12px)] sm:text-xs text-neutral-600 truncate pt-0.5 w-full block">
              {offerDescText}
            </p>

            <div className="flex items-center pt-0.5">
              <p className="text-sm text-neutral-600 truncate">
                Lote {loteSubIndex} • <strong className="text-neutral-900 font-bold mr-2">{BRL(localValorVeiculo)}</strong>
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
         * 🤖 [ZERO-TRUST INPUTS & SLIDER CONTROLS]: Container de Simulação
         * ========================================================================= */}
        <div className="bg-surface-alt border border-neutral-200 rounded-none p-4 sm:p-7 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 sm:gap-x-8 gap-y-4">
            
            {/* Valor do lance */}
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-neutral-900 uppercase tracking-wider font-sans">
                Valor do lance
              </Label>
              <Input
                disabled={loading}
                value={BRL(localValorVeiculo)}
                onChange={(e) => {
                  if (loading) return;
                  const rawValue = Number(e.target.value.replace(/\D/g, "")) / 100;
                  setLocalValorVeiculo(rawValue);
                  updateData({ valorVeiculo: rawValue });
                }}
                className={`h-10 rounded-none bg-white border-neutral-200 text-brand-accent font-semibold disabled:bg-neutral-100 disabled:text-neutral-500 disabled:!cursor-wait ${loading ? "!cursor-wait" : "cursor-text"}`}
              />
              <div className="pt-1 px-1">
                <SliderCustomizado
                  value={localValorVeiculo}
                  onValueChange={(v: number) => {
                    if (loading) return;
                    setLocalValorVeiculo(v);
                  }}
                  onValueCommit={(v: number) => {
                    if (loading) return;
                    updateData({ valorVeiculo: v });
                  }}
                  min={offer?.offer_value}
                  max={tetoMaximo}
                  step={100}
                  isCurrency={true}
                  disabled={loading}
                />
              </div>
            </div>

            {/* Entrada */}
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-neutral-900 uppercase tracking-wider font-sans">Entrada</Label>
              <Input
                disabled={loading}
                value={BRL((localValorVeiculo * localPercentualEntrada) / 100)}
                onChange={(e) => {
                  if (loading) return;
                  const rawValue = Number(e.target.value.replace(/\D/g, "")) / 100;
                  const newPerc = localValorVeiculo > 0 ? (rawValue / localValorVeiculo) * 100 : 0;
                  setLocalPercentualEntrada(newPerc);
                  updateData({ valorEntrada: rawValue });
                }}
                onFocus={() => setEntradaFocused(true)}
                onBlur={() => setEntradaFocused(false)}
                className={`h-10 rounded-none bg-white border-neutral-200 text-brand-accent font-semibold disabled:bg-neutral-100 disabled:text-neutral-500 disabled:!cursor-wait ${loading ? "!cursor-wait" : "cursor-text"}`}
              />
              <div className="pt-1 px-1">
                <SliderCustomizado
                  value={localPercentualEntrada}
                  onValueChange={(perc: number) => {
                    if (loading) return;
                    setLocalPercentualEntrada(perc);
                  }}
                  onValueCommit={(perc: number) => {
                    if (loading) return;
                    updateData({ valorEntrada: (localValorVeiculo * perc) / 100 });
                  }}
                  min={rules?.min_down_payment_percentage}
                  max={rules?.max_down_payment_percentage}
                  step={1}
                  disabled={loading}
                  active={entradaFocused}
                />
              </div>
            </div>
          </div>

          {/* Parcelas */}
          <div className="space-y-3">
            <Label className="text-[11px] font-medium text-neutral-900 uppercase tracking-wider font-sans">Parcelas</Label>
            <RadioGroup
              disabled={loading}
              value={localParcelas ? String(localParcelas) : ""}
              onValueChange={(v) => {
                const val = Number(v);
                setLocalParcelas(val);
              }}
              className="flex flex-wrap gap-2"
            >
              {(state.data?.rules?.installment_options ?? []).map((p: number) => {
                const isSelected = localParcelas === p;
                return (
                  <div key={p} className="flex-1">
                    <RadioGroupItem value={String(p)} id={`p-${p}`} className="peer sr-only" disabled={loading} />
                    <Label
                      htmlFor={`p-${p}`}
                      className={`flex items-center justify-center p-2 border rounded-none transition-all shadow-xs ${
                        isSelected
                          ? "border-transparent fill-gradient"
                          : "border-neutral-300 bg-surface-alt hover:bg-neutral-100"
                      } ${loading ? "!cursor-wait opacity-50" : "cursor-pointer"}`}
                    >
                      <span className={`font-bold text-xs ${isSelected ? "text-white" : "text-brand-accent/60"}`}>{p}x</span>
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </div>
        </div>

        {/* =========================================================================
         * 🤖 [CONSENTS ARCHITECTURE]: Módulo Dinâmico de Termos Legais
         * ========================================================================= */}
        <div
          className={`transition-opacity duration-200 pt-1 ${loading ? "pointer-events-none opacity-50" : "opacity-100"}`}
        >
          <DynamicConsents configs={consent_configs} value={acceptedConsents} onChange={setAcceptedConsents} />
        </div>

        {/* =========================================================================
         * 🤖 [ACTION ARCHITECTURE]: Botão de Disparo com Estados de Loading
         * ========================================================================= */}
        <Button
          type="button"
          onClick={handleSimular}
          disabled={!areConsentsValid || !localParcelas || loading}
          className="w-full h-12 rounded-none text-white shadow-xs transition-all active:scale-[0.98] bg-neutral-900 hover:bg-neutral-800 disabled:opacity-50 disabled:!cursor-wait flex items-center justify-center gap-2 mt-1"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2 animate-pulse">
              <Loader2 className="h-4 w-4 animate-spin" /> {loadingMessage}
            </span>
          ) : (
            "Simular financiamento"
          )}
        </Button>
      </div>
    </div>
  );
}