/**
 * @fileoverview Passo 4: Simulação e Confirmação de Proposta
 * * PROPÓSITO:
 * Permite ao utilizador definir o valor desejado, selecionar o motivo do empréstimo
 * e submeter a proposta para o Orquestrador/Simulador.
 * * INTEGRAÇÃO:
 * - Utiliza `useWizard<any>()` para interagir com o Motor Genérico.
 * - Lê valores de `state.data` (presets de simulação).
 * - Após submissão, injeta o resultado (proposalId/status) em `state.data`, 
 * que será consumido pelo Step 5 (Confirmação).
 */

import { useRef, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BRL } from "../schemas";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider"; // Motor Genérico
import { callSimulation } from "@/features/financial-hub/core/services/gateway";
import { useSafeCall } from "@/features/financial-hub/core/hooks/useSafeCall";

export function Step4Simulation() {
  // Motor Genérico
  const { state, next, back, update } = useWizard<any>();
  const [loading, setLoading] = useState(false);
  const { execute } = useSafeCall();

  // Recuperação dos dados caso o utilizador volte atrás
  const [amount, setAmount] = useState(state.data?.desiredAmount ?? 20000);
  const [purpose, setPurpose] = useState<string>(state.data?.purpose ?? "");
  const [submitting, setSubmitting] = useState(false);

  const isSimulating = useRef(false);

  /**
   * Dispara o motor de simulação via Gateway.
   * Constrói o payload fundindo estado global com preferências locais.
   */
  const handleSimular = async () => {
    if (loading || isSimulating.current) return;
    
    isSimulating.current = true;
    setLoading(true);

    try {
      const payload = {
        ...state.data,
        step: 'EXECUTE_SIMULATION'
      };
      
      console.log("step4 payload:", payload)

      // Chamada via Gateway centralizado e captura do resultado
      const result = await execute(() => callSimulation(payload, 'EXECUTE_SIMULATION'));

      if (result.success) {
        // Atualiza estado global para o próximo step (Resultados)
        update({
          data: { ...state.data, simulationResult: result }
        });
        next(); 
      } else {
        console.error("Erro na simulação:", result.message);
      }
      
    } catch (error: any) {
      // Aqui acontece a mágica: dispara o evento global que o Layout ouve
      window.dispatchEvent(new CustomEvent('app-error', { detail: error }));
    } finally {
      setLoading(false);
      isSimulating.current = false;
    }
  };

  const isApproved = state.data?.simulationResult?.status_id === 1;
  const mainConsult = state.data?.simulationResult?.consults?.[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border border-border p-6 bg-muted/20">
        <Label>Valor desejado</Label>
        <div className="text-3xl font-bold text-foreground mt-2">{BRL(amount)}</div>
 
        <div 
          className="mt-4"
          style={{ '--primary': 'var(--brand-primary)' } as React.CSSProperties}
        >
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
              min={5000} max={100000} step={1000} 
              onValueChange={([v]) => setAmount(v)} 
            />
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Motivo do empréstimo</Label>
        <Select value={purpose} onValueChange={setPurpose} disabled={loading}>
          <SelectTrigger 
            className={`transition-all duration-300 
              ${purpose 
                ? "bg-[var(--brand-primary)]/1 border-[var(--brand-primary)]/10" 
                : "border-input"
              }
              focus:ring-[var(--brand-primary)] 
              focus:border-[var(--brand-primary)]`
            }
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
              { value: "OTHERS", label: "Outros" }
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

      {/* Botões de Navegação */}
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
            <><Loader2 className="animate-spin mr-2"/> Confirmando...</>
          ) : (
            "Confirmar Proposta"
          )}
        </Button>
      </div>
    </div>
  );
}
