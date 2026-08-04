/**
 * @fileoverview Step: Simulação (Veículos)
 * @path src/components/veiculos/steps/Step1Simulation.tsx
 * * * * ÁRVORE DE DEPENDÊNCIAS:
 * --------------------------------------------------------------------------------
 * src/components/veiculos/steps/
 * └── Step1Simulation.tsx               # [FIX] Integração consolidada via callOrchestrator
 * --------------------------------------------------------------------------------
 * * * * INTEGRAÇÃO:
 * - Engine: Renderizado pela WizardEngine.
 * - Estado: Consome WizardProvider.
 * - Transportador: callOrchestrator (centralizado em lib/api/gateway.ts).
 * --------------------------------------------------------------------------------
 * * * * RESPONSABILIDADE:
 * Centralizar a captura de dados e disparar a simulação financeira via Gateway,
 * garantindo paridade total com a estrutura do veiculos-old.
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { Loader2, ThumbsUp } from "lucide-react";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { DynamicConsents } from "@/features/financial-hub/components/layout/DynamicConsents";
import { SliderCustomizado } from "@/features/financial-hub/components/shared/SliderCustomizado";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import { callSimulation } from "@/features/financial-hub/core/services/gateway";
import { useSafeCall } from "@/features/financial-hub/core/hooks/useSafeCall";

export function Step1Simulation() {
  const [acceptedConsents, setAcceptedConsents] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const { state, updateData, update } = useWizard<any>();

  // Estados locais para controle fluido do Slider (evita race condition)
  const [localValorVeiculo, setLocalValorVeiculo] = useState(0);
  const [localPercentualEntrada, setLocalPercentualEntrada] = useState(0);
  const [localParcelas, setLocalParcelas] = useState<number | null>(null);

  // Inicialização sob demanda: apenas quando a API retornar os dados
  useEffect(() => {
    if (state?.data?.offer) {
      setLocalValorVeiculo(state.data.offer.offer_value ?? 0);
      setLocalPercentualEntrada(state.data.rules?.min_down_payment_percentage ?? 0);
      setLocalParcelas(state.data.rules?.default_installments ?? null);
    }
  }, [state?.data?.offer, state?.data?.rules]);

  const areConsentsValid = useMemo(() => {
    const configs = state.data?.consent_configs || [];
    return configs
      .filter((opt: any) => opt.is_required)
      .every((opt: any) => acceptedConsents[opt.id] === true);
  }, [state.data?.consent_configs, acceptedConsents]);

  /**
   * handleSimular: Integração consolidada via callOrchestrator.
   * Sintaxe validada e isolada para garantir que o compilador reconheça o 'async'.
   */
  const isSimulating = useRef(false);
  const { execute } = useSafeCall();

  const handleSimular = async () => {
    // 1. Prevenção de cliques múltiplos
    if (loading || isSimulating.current) return;
    
    isSimulating.current = true;
    setLoading(true);

    try {
      // 2. Montagem do Payload de Paridade
      const payload = {
        ...state.data,
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
            legal_text_snapshot: { template_text: c.template_text, links: c.links }
          }))
      };

      // 3. Chamada via Gateway centralizado e captura do resultado
      const result = await execute(() => callSimulation(payload));

      // 4. Atualização de estado e avanço correto para o Step 2
      update({
        meta: { ...state.meta, step: 2 },
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
    }
  };

  if (!state?.data || Object.keys(state.data).length === 0) {
    return <div className="flex items-center justify-center h-64"><span className="text-slate-400">Carregando...</span></div>;
  }

  const { rules, consent_configs, offer } = state.data;
  const tetoMaximo = offer?.vehicle_details?.fipe_value ?? (offer?.offer_value * (1 + (rules?.max_offer_cap_percent ?? 20) / 100));
  
  // Atributo do lote (índice ou número)
  const loteSubIndex = offer?.lote_index || offer?.lote_numero || "1";
  
  // Descrição limpa do veículo
  const offerDescText = offer?.offer_description ? offer.offer_description.replace(/[.,]+$/, "") : "";

  return (
    <div className="space-y-5 max-w-xl mx-auto lg:mx-0">
      
      {/* HEADER EXATO COM 2 LINHAS: Linha 1 = Descrição em cinza claro, Linha 2 = Lote e Valor em destaque */}
      <div className="flex items-start gap-4 mb-6">
        <div className="bg-primary/10 p-2.5 rounded-full shrink-0 hidden sm:flex">
          <ThumbsUp className="h-6 w-6" style={{ color: "var(--brand-primary)" }} />
        </div>
        
        <div className="space-y-0.5 flex-1 w-0 min-w-0">
          {/* Título Principal */}
          <h3 className="text-base sm:text-xl font-black text-slate-900 uppercase tracking-tight leading-snug truncate w-full">
            Simule seu financiamento*!
          </h3>

          {/* Linha 1 (antiga linha 2): Descrição do veículo em cinza claro */}
          <p className="text-xs text-slate-600 truncate pt-0.5 w-full">
            {offerDescText}
          </p>

          {/* Linha 2 (antiga linha 3): Lote e valor com destaque */}
          <p className="text-xs text-slate-600 truncate pt-0.5 w-full">
            Lote {loteSubIndex} • <strong className="text-slate-900 font-bold">{BRL(localValorVeiculo)}</strong>
          </p>
        </div>
      </div>

      {/* Container: p-4 (mobile) / p-7 (desktop) e gap-x-4 (mobile) / gap-x-8 (desktop) */}
      <div className="bg-slate-50 border border-border rounded-lg p-4 sm:p-7 space-y-4">

        {/* Grid: gap-x-4 (mobile) / gap-x-8 (desktop) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 sm:gap-x-8 gap-y-4">
          
          {/* Valor do lance */}
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-black uppercase tracking-wider font-sans">Valor do lance</Label>
            <Input 
              disabled={loading} 
              value={BRL(localValorVeiculo)} 
              onChange={(e) => {
                  const rawValue = Number(e.target.value.replace(/\D/g, "")) / 100;
                  setLocalValorVeiculo(rawValue);
                  updateData({ valorVeiculo: rawValue });
              }}
              className={`h-10 rounded-xl bg-white border-slate-200 font-semibold disabled:bg-slate-100 disabled:text-slate-500 disabled:!cursor-wait ${loading ? "!cursor-wait" : "cursor-text"}`}
            />
            <div className="pt-1 px-1">
              <SliderCustomizado 
                  value={localValorVeiculo}
                  onValueChange={(v: number) => setLocalValorVeiculo(v)}
                  onValueCommit={(v: number) => updateData({ valorVeiculo: v })}
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
            <Label className="text-[11px] font-medium text-black uppercase tracking-wider font-sans">Entrada</Label>
            <Input 
              disabled={loading}
              value={BRL((localValorVeiculo * localPercentualEntrada) / 100)} 
              onChange={(e) => {
                  const rawValue = Number(e.target.value.replace(/\D/g, "")) / 100;
                  const newPerc = localValorVeiculo > 0 ? (rawValue / localValorVeiculo) * 100 : 0;
                  setLocalPercentualEntrada(newPerc);
                  updateData({ valorEntrada: rawValue });
              }}
              className={`h-10 rounded-xl bg-white border-slate-200 font-semibold disabled:bg-slate-100 disabled:text-slate-500 disabled:!cursor-wait ${loading ? "!cursor-wait" : "cursor-text"}`}
            />
            <div className="pt-1 px-1">
              <SliderCustomizado 
                  value={localPercentualEntrada}
                  onValueChange={(perc: number) => setLocalPercentualEntrada(perc)}
                  onValueCommit={(perc: number) => updateData({ valorEntrada: (localValorVeiculo * perc) / 100 })}
                  min={rules?.min_down_payment_percentage} 
                  max={rules?.max_down_payment_percentage} 
                  step={1}
                  disabled={loading}
              />
            </div>
          </div>
        </div> 

        {/* Parcelas */}
        <div className="space-y-3">
          <Label className="text-[11px] font-medium text-black uppercase tracking-wider font-sans">Parcelas</Label>
          <RadioGroup
            disabled={loading}
            value={localParcelas ? String(localParcelas) : ""}
            onValueChange={(v) => { 
              const val = Number(v);
              setLocalParcelas(val);
            }}
            className="flex flex-wrap gap-2"
          >
            {(state.data?.rules?.installment_options ?? []).map((p: number) => (
              <div key={p} className="flex-1">
                <RadioGroupItem value={String(p)} id={`p-${p}`} className="peer sr-only" disabled={loading} />
                <Label 
                  htmlFor={`p-${p}`} 
                  className={`flex items-center justify-center p-2 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 peer-data-[state=checked]:border-[var(--brand-primary)] peer-data-[state=checked]:bg-white transition-all shadow-sm ${loading ? "!cursor-wait opacity-50" : "cursor-pointer"}`}
                >
                  <span className="font-bold text-xs text-black">{p}x</span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>
      </div>
      
      <div className={`transition-opacity duration-200 ${loading ? "pointer-events-none opacity-50" : "opacity-100"}`}>
        <DynamicConsents 
          configs={consent_configs} 
          value={acceptedConsents} 
          onChange={setAcceptedConsents} 
        />
      </div>

    <button 
      type="button"
      onClick={handleSimular} 
      disabled={!areConsentsValid || !localParcelas || loading}
      className="w-full h-12 rounded-xl text-white shadow-sm transition-all active:scale-[0.98] bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/90 disabled:opacity-50 disabled:!cursor-wait focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 flex items-center justify-center gap-2"
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2 animate-pulse">
          <Loader2 className="h-4 w-4 animate-spin" /> Consultando ofertas...
        </span>
      ) : (
        "Simular financiamento"
      )}
    </button>
    </div>
  );
}