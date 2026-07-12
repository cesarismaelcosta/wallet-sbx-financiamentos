/**
 * @fileoverview Step: Simulação (Simulação - Portado de Veículos)
 * @path src/components/simulacao/steps/Step1Simulation.tsx
 * * RESPONSABILIDADE:
 * Centralizar captura de dados e disparar simulação via callOrchestrator com paridade total.
 */


import { useState, useEffect, useRef, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { DynamicConsents } from "@/features/financial-hub/components/layout/DynamicConsents";
import { SliderCustomizado } from "@/features/financial-hub/components/shared/SliderCustomizado";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import { callOrchestrator, callSimulation } from "@/features/financial-hub/core/services/gateway";
import { SimulacaoWizardData } from "../simulacao.types";

export function Step1Simulation() {
  const [acceptedConsents, setAcceptedConsents] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const { state, updateData, update } = useWizard<SimulacaoWizardData>();

  // Estados locais para controle fluido do Slider
  const [localValorOferta, setlocalValorOferta] = useState(0);
  const [localPercentualEntrada, setLocalPercentualEntrada] = useState(0);
  const [localParcelas, setLocalParcelas] = useState<number | null>(null);

  useEffect(() => {
    if (state?.data?.offer) {
      setlocalValorOferta(state.data.offer.offer_value ?? 0);
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

  const isSimulating = useRef(false);

  const handleSimular = async () => {
    if (loading || isSimulating.current) return;
    
    isSimulating.current = true;
    setLoading(true);

    try {
      const payload = {
        ...state.data,
        simulation_details: {
          requested_value: localValorOferta,
          installments: localParcelas,
          down_payment_amount: (localValorOferta * localPercentualEntrada) / 100,
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

      const result = await callSimulation(
        payload
      );
      
      update({
        meta: { ...state.meta, step: 2 },
        data: { ...state.data, simulationResult: result, simulation_id: result.simulation_id, simulation_update_id: result.simulation_update_id  }
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
      {/* HEADER: texto estático e descrição da oferta */}
      <div className="mb-4 space-y-0.5">
        <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
          Consulte nossas condições
        </h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {offer?.offer_description ? offer.offer_description.replace(/[.,]+$/, "") : "Vamos procurar uma oferta disponível para você:"}
        </p>
      </div>

      {/* Container: p-8 dá um respiro maior em relação às bordas */}
      <div className="bg-slate-50 border border-border rounded-lg p-7 space-y-4">

        {/* Grid: gap-8 garante que os dois campos não fiquem colados horizontalmente */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">

          {/* Valor do lance */}
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-black uppercase tracking-wider font-sans">Valor do lance</Label>
            <Input 
              value={BRL(localValorOferta)} 
              onChange={(e) => {
                  const rawValue = Number(e.target.value.replace(/\D/g, "")) / 100;
                  setlocalValorOferta(rawValue);
                  updateData({ valorOferta: rawValue });
              }}
              className="h-10 rounded-xl bg-white border-slate-200 font-semibold" 
            />
            <div className="pt-1 px-1">
              <SliderCustomizado 
                  value={localValorOferta}
                  onValueChange={(v: number) => setlocalValorOferta(v)}
                  onValueCommit={(v: number) => updateData({ valorOferta: v })}
                  min={offer?.offer_value} 
                  max={tetoMaximo} 
                  step={100}
                  isCurrency={true}
              />
            </div>
          </div>

          {/* Entrada */}
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-black uppercase tracking-wider font-sans">Entrada</Label>
            <Input 
              value={BRL((localValorOferta * localPercentualEntrada) / 100)} 
              onChange={(e) => {
                  const rawValue = Number(e.target.value.replace(/\D/g, "")) / 100;
                  const newPerc = localValorOferta > 0 ? (rawValue / localValorOferta) * 100 : 0;
                  setLocalPercentualEntrada(newPerc);
                  updateData({ valorEntrada: rawValue });
              }}
              className="h-10 rounded-xl bg-white border-slate-200 font-semibold" 
            />
            <div className="pt-1 px-1">
              <SliderCustomizado 
                  value={localPercentualEntrada}
                  onValueChange={(perc: number) => setLocalPercentualEntrada(perc)}
                  onValueCommit={(perc: number) => updateData({ valorEntrada: (localValorOferta * perc) / 100 })}
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
            disabled={loading}
            value={localParcelas ? String(localParcelas) : ""}
            onValueChange={(v) => { 
              const val = Number(v);
              setLocalParcelas(val);
            }}
            className="grid grid-cols-4 gap-2"
          >
            {(state.data?.rules?.installment_options || []).map((p: number) => (
              <div key={p}>
                <RadioGroupItem value={String(p)} id={`p-${p}`} className="peer sr-only" disabled={loading} />
                <Label htmlFor={`p-${p}`} className={`flex items-center justify-center p-2 border border-slate-200 rounded-xl bg-white hover:bg-slate-50 peer-data-[state=checked]:border-[var(--brand-primary)] peer-data-[state=checked]:bg-white transition-all shadow-sm ${loading ? "!cursor-wait opacity-50" : "cursor-pointer"}`}>
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
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando condições...
          </span>
        ) : (
          "Consultar condições"
        )}
      </button>
    </div>
  );
}
      