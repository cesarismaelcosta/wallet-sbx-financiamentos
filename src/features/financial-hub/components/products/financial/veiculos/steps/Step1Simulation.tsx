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
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { DynamicConsents } from "@/features/financial-hub/components/layout/DynamicConsents";
import { SliderCustomizado } from "@/features/financial-hub/components/shared/SliderCustomizado";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import { callOrchestrator, callSimulation } from "@/features/financial-hub/core/services/gateway";

export function Step1Simulation() {
  const [acceptedConsents, setacceptedConsents] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const { state, next, updateData, update } = useWizard<any>();

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

      // 3. Chamada via Gateway centralizado
      const result = await callSimulation(
        payload
      );
      
      // 4. Atualização de estado
      update({
        meta: { ...state.meta, step: 2 }, // Isso move o ponteiro de navegação
        data: { ...state.data, simulationResult: result, simulation_id: result.simulation_id, simulation_update_id: result.simulation_update_id } // Isso salva o resultado
      });
      
    } catch (error) {
      console.error("[Simulação Error]:", error);
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

  return (
    <div className="space-y-5 max-w-xl mx-auto lg:mx-0">
      {/* HEADER: Substituído texto estático pela descrição da oferta */}
      <div className="mb-4 space-y-0.5">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
          Simule seu financiamento
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {offer?.offer_description 
            ? offer.offer_description.replace(/[.,]+$/, "") 
            : "Vamos procurar uma oferta disponível para você:"}
        </p>
      </div>

      {/* Container: p-8 dá um respiro maior em relação às bordas */}
      <div className="bg-slate-50 border border-border rounded-lg p-7 space-y-4">

          {/* Grid: gap-8 garante que os dois campos não fiquem colados horizontalmente */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            
            {/* Campo 1 */}
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-black uppercase tracking-wider font-sans">Valor do lance</Label>
              <Input 
                value={BRL(localValorVeiculo)} 
                onChange={(e) => {
                    const rawValue = Number(e.target.value.replace(/\D/g, "")) / 100;
                    setLocalValorVeiculo(rawValue);
                    updateData({ valorVeiculo: rawValue });
                }}
                className="h-10 rounded-xl bg-white border-slate-200 font-semibold" 
              />
              <div className="pt-1 px-1"> {/* px-1 protege o slider de encostar na borda */}
                <SliderCustomizado 
                    value={localValorVeiculo}
                    onValueChange={(v: number) => setLocalValorVeiculo(v)}
                    onValueCommit={(v: number) => updateData({ valorVeiculo: v })}
                    min={offer?.offer_value} 
                    max={tetoMaximo} 
                    step={100}
                    isCurrency={true}
                />
              </div>
            </div>

            {/* Campo 2 */}
            <div className="space-y-1">
              <Label className="text-[11px] font-medium text-black uppercase tracking-wider font-sans">Entrada</Label>
              <Input 
                value={BRL((localValorVeiculo * localPercentualEntrada) / 100)} 
                onChange={(e) => {
                    const rawValue = Number(e.target.value.replace(/\D/g, "")) / 100;
                    const newPerc = localValorVeiculo > 0 ? (rawValue / localValorVeiculo) * 100 : 0;
                    setLocalPercentualEntrada(newPerc);
                    updateData({ valorEntrada: rawValue });
                }}
                className="h-10 rounded-xl bg-white border-slate-200 font-semibold" 
              />
              <div className="pt-1 px-1">
                <SliderCustomizado 
                    value={localPercentualEntrada}
                    onValueChange={(perc: number) => setLocalPercentualEntrada(perc)}
                    onValueCommit={(perc: number) => updateData({ valorEntrada: (localValorVeiculo * perc) / 100 })}
                    min={rules?.min_down_payment_percentage} 
                    max={rules?.max_down_payment_percentage} 
                    step={1}
                />
              </div>
            </div>
          </div>

          {/* Parcelas */}
          <div className="space-y-3">
            <Label className="text-[11px] font-medium text-black uppercase tracking-wider font-sans">Parcelas</Label>
            <RadioGroup
              value={localParcelas ? String(localParcelas) : ""}
              onValueChange={(v) => { 
                const val = Number(v);
                setLocalParcelas(val);
              }}
              className="flex flex-wrap gap-2"
            >
              {(state.data?.rules?.installment_options ?? []).map((p: number) => (
                <div key={p} className="flex-1">
                  <RadioGroupItem value={String(p)} id={`p-${p}`} className="peer sr-only" />
                  <Label htmlFor={`p-${p}`} className="flex items-center justify-center p-2 border border-slate-200 rounded-xl cursor-pointer bg-white hover:bg-slate-50 peer-data-[state=checked]:border-[var(--brand-primary)] peer-data-[state=checked]:bg-white transition-all shadow-sm">
                    <span className="font-bold text-xs text-black">{p}x</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

      </div>
      
      <DynamicConsents configs={consent_configs} value={acceptedConsents} onChange={setacceptedConsents} />

    <button 
      type="button"
      onClick={handleSimular} 
      disabled={!areConsentsValid || !localParcelas || loading}
      className="w-full h-12 rounded-xl text-white shadow-sm transition-all active:scale-[0.98] bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/90 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2 flex items-center justify-center gap-2"
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