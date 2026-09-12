/**
 * @fileoverview Passo 4: Simulação e Confirmação de Proposta
 * @path src/features/financial-hub/components/products/credit/auto-equity/steps/Step4Simulation.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO: ZERO-RADIUS GOVERNANCE & NEUTRAL PURITY
 * =========================================================================
 * [MECÂNICA ARQUITETURAL]:
 * - Engine: Utiliza `useWizard<any>()` para interagir com o Motor Genérico.
 * - Estado: Lê valores de `state.data` (presets de simulação).
 * - Transportador: callSimulation (centralizado em lib/api/gateway.ts).
 * - Conformidade: Zero-Radius Strict Governance & Neutral Purity (Sem tokens de marca corrompidos).
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 */

import { useRef, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BRL } from "@/features/financial-hub/components/shared/formatters";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider"; // Motor Genérico
import { callSimulation } from "@/features/financial-hub/core/services/gateway";
import { setFastPathState } from "@/features/financial-hub/core/services/fastPathCache";
import { useSafeCall } from "@/features/financial-hub/core/hooks/useSafeCall";

const commonInputClass = "h-11 text-sm rounded-none border-neutral-200 bg-white transition-all duration-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900";

export function Step4Simulation() {
  // =========================================================================
  // 🤖 [LOCAL STATE ARCHITECTURE]: Gerenciamento de Inputs e Ciclo de Vida
  // =========================================================================
  const { state, next, back, update } = useWizard<any>();
  const [loading, setLoading] = useState(false);
  const { execute } = useSafeCall();

  // Recuperação dos dados caso o utilizador volte atrás
  const [amount, setAmount] = useState(state.data?.desiredAmount ?? 20000);
  const [purpose, setPurpose] = useState<string>(state.data?.purpose ?? "");

  const isSimulating = useRef(false);

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
        simulation_id: state.data.simulation_id,
        product_id: state.data.product_id,
        partner_id: state.data.partner_id,
        step: "EXECUTE_SIMULATION",
        simulation_details: {
          requested_value: amount,
          purpose: purpose,
          personalIncome: state.data.personalIncome,
          vehicle: state.data.vehicle,
        },
      };

      const result = await execute(() => callSimulation(payload, "EXECUTE_SIMULATION"));

      if (result.state) {
        setFastPathState(result.state);
      }

      if (result.success) {
        update({
          data: { 
            ...state.data, 
            desiredAmount: amount,
            purpose: purpose,
            simulationResult: result,
            simulation_id: result.simulation_id,
            simulation_update_id: result.simulation_update_id || result.simulation__update_id,
            ...(result.state && {
              offer: result.state.offer,
              rules: result.state.rules,
              entity: result.state.entity,
            })
          },
        });
        next();
      } else {
        console.error("Erro na simulação:", result.message);
      }
    } catch (error: any) {
      window.dispatchEvent(new CustomEvent("app-error", { detail: error }));
    } finally {
      setLoading(false);
      isSimulating.current = false;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      
      {/* =========================================================================
       * 🤖 [SLIDER ARCHITECTURE]: Controle de Valor Desejado com Zero-Radius
       * ========================================================================= */}
      <div className="rounded-none border border-neutral-200 p-5 sm:p-6 bg-surface-alt shadow-xs space-y-3">
        <Label className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">Valor desejado</Label>
        <div className="text-2xl sm:text-3xl font-bold text-neutral-900 tracking-tight">{BRL(amount)}</div>

        <div className="pt-2">
          {/* Estilo scoped para o Slider do Shadcn com cores neutras */}
          <style>{`
            .slider-fix [role="slider"]:focus-visible {
              outline: none !important;
              box-shadow: 0 0 0 2px #171717 !important;
            }
          `}</style>

          <div className="slider-fix">
            <Slider
              value={[amount]}
              disabled={loading}
              min={5000}
              max={100000}
              step={1000}
              onValueChange={([v]) => setAmount(v)}
            />
          </div>
        </div>
      </div>

      {/* =========================================================================
       * 🤖 [SELECT ARCHITECTURE]: Seleção do Propósito do Empréstimo
       * ========================================================================= */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">Motivo do empréstimo</Label>
        <Select value={purpose} onValueChange={setPurpose} disabled={loading}>
          <SelectTrigger className={commonInputClass}>
            <SelectValue placeholder="Escolher..." />
          </SelectTrigger>
          <SelectContent className="rounded-none border-neutral-200">
            {[
              { value: "INVESTMENT_IN_OWN_BUSINESS", label: "Investimento em negócio próprio" },
              { value: "DEBTS_PAYMENT", label: "Pagamento de dívidas" },
              { value: "DEBTS_REFINANCING", label: "Refinanciamento de dívidas" },
              { value: "REAL_ESTATE_RENOVATION", label: "Reforma de casa" },
              { value: "GOODS_ACQUISITION", label: "Aquisição de Bens" },
              { value: "OTHERS", label: "Outros" },
            ].map((item) => (
              <SelectItem
                key={item.value}
                value={item.value}
                className="rounded-none data-[highlighted]:bg-neutral-100 data-[highlighted]:text-neutral-900 cursor-pointer"
              >
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* =========================================================================
       * 🤖 [ACTION ARCHITECTURE]: Botões de Navegação e Submissão
       * ========================================================================= */}
      <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4 pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={back}
          disabled={loading}
          className="w-full sm:w-auto rounded-none text-neutral-900 hover:bg-neutral-100 hover:text-neutral-900 font-medium"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Button
          size="lg"
          className="h-12 w-full sm:w-auto flex-1 rounded-none bg-neutral-900 hover:bg-neutral-800 text-white font-bold shadow-xs transition-all active:scale-[0.98] disabled:bg-neutral-100 disabled:text-neutral-400 disabled:shadow-none"
          disabled={!purpose || loading}
          onClick={handleSimular}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin mr-2 h-4 w-4" /> Confirmando...
            </>
          ) : (
            "Confirmar Proposta"
          )}
        </Button>
      </div>
    </div>
  );
}