/**
 * @fileoverview Passo 4: Simulação e Confirmação de Proposta
 * @path src/features/financial-hub/components/products/credit/auto-equity/steps/Step4Simulation.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO: STRICT THIN PAYLOAD & ARCHITECTURAL MECHANICS
 * =========================================================================
 * [MECÂNICA ARQUITETURAL]:
 * - Engine: Utiliza `useWizard<any>()` para interagir com o Motor Genérico.
 * - Estado: Lê valores de `state.data` (presets de simulação).
 * - Transportador: callSimulation (centralizado em lib/api/gateway.ts).
 * 
 * O payload de rede foi purificado. O uso do `...state.data` foi abolido para
 * evitar o envio de lixo de UI (estado interno, objetos aninhados) para a 
 * camada de rede. O componente monta um payload estritamente "Thin", extraindo 
 * os cursores temporais (`visit_id`, `visit_update_id`) da URL e enviando 
 * APENAS os IDs identificadores, o step e os detalhes da simulação necessários.
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
  /**
   * Dispara o motor de simulação via Gateway.
   * Constrói o payload fundindo estado global com preferências locais.
   */
  const handleSimular = async () => {
    if (loading || isSimulating.current) return;

    isSimulating.current = true;
    setLoading(true);

    try {
      const urlParams = new URLSearchParams(window.location.search);
      const urlVisitId = urlParams.get("visit_id");
      const urlVisitUpdateId = urlParams.get("visit_update_id");

      // Monta Payload Magro Zero-Trust encapsulando os dados no simulation_details
      const payload = {
        action: "SIMULATE",
        visit_id: urlVisitId || state.data.visit_id,
        visit_update_id: urlVisitUpdateId || state.data.visit_update_id,
        simulation_id: state.data.simulation_id, // Gerado na Elegibilidade
        product_id: state.data.product_id,
        partner_id: state.data.partner_id,
        step: "EXECUTE_SIMULATION",
        simulation_details: {
          requested_value: amount, // O backend puxa isso na linha 72 e 101
          purpose: purpose, // Vem da tela do Step 4
          personalIncome: state.data.personalIncome, // Vem da tela do Step 2
          vehicle: state.data.vehicle, // Vem da tela do Step 3
        },
      };

      // 🔒 LGPD: log removido — payload contém renda, veículo e consentimentos.

      // Chamada via Gateway
      const result = await execute(() => callSimulation(payload, "EXECUTE_SIMULATION"));

      // Alimentação síncrona do Cache de RAM Fast Path se houver estado
      if (result.state) {
        setFastPathState(result.state);
      }

      if (result.success) {
        // Atualiza estado global para o próximo step (Resultados)
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
      // Aqui acontece a mágica: dispara o evento global que o Layout ouve
      window.dispatchEvent(new CustomEvent("app-error", { detail: error }));
    } finally {
      setLoading(false);
      isSimulating.current = false;
    }
  };

  return (
    <div className="flex flex-col gap-6">
      
      {/* =========================================================================
       * 🤖 [SLIDER ARCHITECTURE]: Controle de Valor Desejado
       * ========================================================================= */}
      <div className="rounded-xl border border-border p-6 bg-muted/20">
        <Label>Valor desejado</Label>
        <div className="text-3xl font-bold text-foreground mt-2">{BRL(amount)}</div>

        <div className="mt-4" style={{ "--primary": "var(--brand-primary)" } as React.CSSProperties}>
          {/* Estilo scoped para o Slider do Shadcn */}
          <style>{`
            .slider-fix [role="slider"]:focus-visible {
              outline: none !important;
              box-shadow: 0 0 0 2px var(--brand-primary) !important;
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
      <div className="space-y-2">
        <Label>Motivo do empréstimo</Label>
        <Select value={purpose} onValueChange={setPurpose} disabled={loading}>
          <SelectTrigger
            className={`transition-all duration-300 
              ${purpose ? "bg-[var(--brand-primary)]/1 border-[var(--brand-primary)]/10" : "border-input"}
              focus:ring-[var(--brand-primary)] 
              focus:border-[var(--brand-primary)]`}
          >
            <SelectValue placeholder="Escolher..." />
          </SelectTrigger>
          <SelectContent>
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
                className="data-[highlighted]:!bg-[var(--brand-primary)]/10 data-[highlighted]:!text-[var(--brand-primary)] cursor-pointer"
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
      <div className="flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          onClick={back}
          disabled={loading} // Bloqueia o "Voltar" durante o loading
          className="..."
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Voltar
        </Button>
        <Button
          size="lg"
          className="h-12 flex-1 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/90 transition-all focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2"
          disabled={!purpose || loading}
          onClick={handleSimular}
        >
          {loading ? (
            <>
              <Loader2 className="animate-spin mr-2" /> Confirmando...
            </>
          ) : (
            "Confirmar Proposta"
          )}
        </Button>
      </div>
    </div>
  );
}