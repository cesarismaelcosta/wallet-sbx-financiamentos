/**
 * @fileoverview Step: Simulação (Simulação - Portado de Veículos)
 * @path src/components/simulacao/steps/Step1Simulation.tsx
 * * RESPONSABILIDADE:
 * Centralizar captura de dados e disparar simulação via callOrchestrator com paridade total.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { Loader2, ThumbsUp, ExternalLink } from "lucide-react";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider";
import { DynamicConsents } from "@/features/financial-hub/components/layout/DynamicConsents";
import { SliderCustomizado } from "@/features/financial-hub/components/shared/SliderCustomizado";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import { callOrchestrator, callSimulation } from "@/features/financial-hub/core/services/gateway";
import { SimulacaoWizardData } from "../simulacao.types";
import { useSafeCall } from "@/features/financial-hub/core/hooks/useSafeCall";

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
  const { execute } = useSafeCall();

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

      // Chamada via Gateway centralizado e captura do resultado
      const result = await execute(() => callSimulation(payload));
      
      update({
        meta: { ...state.meta, step: 2 },
        data: { ...state.data, simulationResult: result, simulation_id: result.simulation_id, simulation_update_id: result.simulation_update_id  }
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

  // Atributos extraídos com segurança idênticos aos de Veículos
  const loteSubIndex = offer?.lote_index || offer?.lote_numero || "1";
  const offerDescText = offer?.offer_description ? offer.offer_description.replace(/[.,]+$/, "") : "";

  return (
    <div className="space-y-5 max-w-xl mx-auto lg:mx-0">
      
      {/* HEADER EXATO COM 2 LINHAS (Paridade com Veículos) */}
      <div className="flex items-start gap-4 mb-6">
        <div className="bg-primary/10 p-2.5 rounded-full shrink-0 hidden sm:flex">
          <ThumbsUp className="h-6 w-6" style={{ color: "var(--brand-primary)" }} />
        </div>
        
        <div className="space-y-0.5 flex-1 w-0 min-w-0">
          {/* Título Principal (Fonte fluida 14px a 20px) */}
          <h3 className="text-[clamp(14px,4vw,20px)] sm:text-xl font-black text-slate-900 uppercase tracking-tight leading-snug truncate w-full block">
            Simule seu financiamento*!
          </h3>

          {/* Linha 1: Descrição do item em cinza claro (Fonte fluida 10px a 12px) */}
          <p className="text-[clamp(10px,3vw,12px)] sm:text-xs text-slate-600 truncate pt-0.5 w-full block">
            {offerDescText}
          </p>

          {/* Linha 2: Substituiu apenas o <p> original por esta div com o link */}
          <div className="flex items-center pt-0.5">
            <p className="text-sm text-slate-600 truncate">
              Lote {loteSubIndex} • <strong className="text-slate-900 font-bold mr-2">{BRL(localValorOferta)}</strong>
            </p>

            {offer && (
              <a 
                href={getSuperbidUrl(offer)} 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-[#B300FF] hover:text-[#9300cc] transition-colors flex items-center outline-none focus:outline-none focus:ring-0"
                title="Ver oferta original na Superbid"
              >
                <ExternalLink size={18} />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Container adaptativo p-4 (mobile) / p-7 (desktop) */}
      <div className="bg-slate-50 border border-border rounded-lg p-4 sm:p-7 space-y-4">

        {/* Grid com espaçamento responsivo */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 sm:gap-x-8 gap-y-4">

          {/* Valor do lance */}
          <div className="space-y-1">
            <Label className="text-[11px] font-medium text-black uppercase tracking-wider font-sans">Valor do lance</Label>
            <Input 
              disabled={loading}
              value={BRL(localValorOferta)} 
              onChange={(e) => {
                if (loading) return;
                const rawValue = Number(e.target.value.replace(/\D/g, "")) / 100;
                setlocalValorOferta(rawValue);
                updateData({ valorOferta: rawValue });
              }}
              className={`h-10 rounded-xl bg-white border-slate-200 font-semibold disabled:bg-slate-100 disabled:text-slate-500 disabled:!cursor-wait ${loading ? "!cursor-wait" : "cursor-text"}`} 
            />
            <div className="pt-1 px-1">
              <SliderCustomizado 
                value={localValorOferta}
                onValueChange={(v: number) => {
                  if (loading) return;
                  setlocalValorOferta(v);
                }}
                onValueCommit={(v: number) => {
                  if (loading) return;
                  updateData({ valorOferta: v });
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
            <Label className="text-[11px] font-medium text-black uppercase tracking-wider font-sans">Entrada</Label>
            <Input 
              disabled={loading}
              value={BRL((localValorOferta * localPercentualEntrada) / 100)} 
              onChange={(e) => {
                if (loading) return;
                const rawValue = Number(e.target.value.replace(/\D/g, "")) / 100;
                const newPerc = localValorOferta > 0 ? (rawValue / localValorOferta) * 100 : 0;
                setLocalPercentualEntrada(newPerc);
                updateData({ valorEntrada: rawValue });
              }}
              className={`h-10 rounded-xl bg-white border-slate-200 font-semibold disabled:bg-slate-100 disabled:text-slate-500 disabled:!cursor-wait ${loading ? "!cursor-wait" : "cursor-text"}`} 
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
                  updateData({ valorEntrada: (localValorOferta * perc) / 100 });
                }}
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
              if (loading) return;
              const val = Number(v);
              setLocalParcelas(val);
            }}
            className="flex flex-wrap gap-2"
          >
            {(state.data?.rules?.installment_options || []).map((p: number) => (
              <div key={p} className="flex-1">
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

      <Button 
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
      </Button>
    </div>
  );
}