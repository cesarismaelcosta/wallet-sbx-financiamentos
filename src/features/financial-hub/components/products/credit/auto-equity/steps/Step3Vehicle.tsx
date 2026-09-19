/**
 * @fileoverview Passo 3: Informações do Veículo
 * @path src/features/financial-hub/components/products/credit/auto-equity/steps/Step3Vehicle.tsx
 * 
 * =========================================================================
 * 🤖 PADRÃO GEMINI PRO: ZERO-RADIUS GOVERNANCE & NEUTRAL PURITY
 * =========================================================================
 * [MECÂNICA ARQUITETURAL]:
 * - Engine: Renderizado pela WizardEngine.
 * - Estado: Consome WizardProvider.
 * - Conformidade: Zero-Radius Strict Governance & Neutral Purity (Sem tokens de marca corrompidos).
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro (Architectural Mechanics)
 */

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from "@/components/ui/select"
import { vehicleSchema, type VehicleData } from "../schemas";
import { useWizard } from "@/features/financial-hub/components/shared/WizardProvider"; // Motor Genérico

// Classe padronizada para unificar tamanho, fonte e zero-radius estrito
const commonInputClass = "h-11 text-sm rounded-none border-neutral-200 bg-white transition-all duration-200 focus-visible:ring-1 focus-visible:ring-neutral-900 focus-visible:border-neutral-900";

export function Step3Vehicle() {
  // Acedemos ao motor genérico
  const { state, next, back, update } = useWizard<any>();

  // Acedemos aos dados guardados em state.data.vehicle
  const initialVehicleData = state.data?.vehicle;

  const form = useForm<VehicleData>({
    resolver: zodResolver(vehicleSchema),
    defaultValues: initialVehicleData ?? {
      licensePlate: "",
      ownerKinshipDegree: undefined,
    },
  });

  const err = form.formState.errors;
  const plate = form.watch("licensePlate");
  const kinship = form.watch("ownerKinshipDegree");

  const onSubmit = (data: VehicleData) => {
    // ATUALIZAÇÃO NO MOTOR:
    // Mantemos todo o state.data original e atualizamos apenas a chave 'vehicle', forçando Uppercase na placa
    update({ 
      data: { 
        ...state.data, 
        vehicle: {
          ...data,
          licensePlate: data.licensePlate.toUpperCase()
        }
      } 
    });
    next();
  };

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
      <section className="rounded-none border border-neutral-200 bg-surface-alt p-5 sm:p-6 shadow-xs space-y-4">
        <header className="flex items-center gap-2 text-sm font-bold text-neutral-900 uppercase tracking-wider">
          <Car className="h-4 w-4 text-neutral-900" strokeWidth={1.5} /> Informações do veículo
        </header>

        <div className="space-y-4">
          {/* Campo Placa */}
          <div className="space-y-1.5">
            <Label htmlFor="licensePlate" className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">Placa do veículo</Label>
            <Input 
              id="licensePlate"
              {...form.register("licensePlate")} 
              placeholder="Ex: ABC1D23" 
              maxLength={7}
              autoComplete="off"
              className={`${commonInputClass} uppercase`}
            />
            {err.licensePlate && (
              <p className="text-xs text-destructive font-medium">{err.licensePlate.message}</p>
            )}
          </div>

          {/* Campo Proprietário */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-neutral-700 uppercase tracking-wider">Quem é o proprietário do veículo?</Label>
            <Select 
              value={kinship ?? ""}
              onValueChange={(v) => form.setValue("ownerKinshipDegree", v as any, { shouldValidate: true })}
            >
              <SelectTrigger className={commonInputClass}>
                <SelectValue placeholder="Selecione o proprietário" />
              </SelectTrigger>
              <SelectContent className="rounded-none border-neutral-200">
                {[
                  { value: "SELF", label: "O próprio solicitante" },
                  { value: "SPOUSE", label: "Cônjuge" },
                  { value: "PARENTS", label: "Pai/Mãe" },
                  { value: "CHILDREN", label: "Filho(a)" },
                  { value: "SIBLINGS", label: "Irmão/Irmã" },
                  { value: "OTHERS", label: "Um terceiro" }
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
            {err.ownerKinshipDegree && (
              <p className="text-xs text-destructive font-medium">{err.ownerKinshipDegree.message}</p>
            )}
          </div>
        </div>
      </section>

      {/* Botões de Navegação com Zero-Radius e Neutral Purity */}
      <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-4 pt-2">
        <Button 
          type="button" 
          variant="ghost" 
          onClick={back}
          className="w-full sm:w-auto rounded-none text-neutral-900 hover:bg-neutral-100 hover:text-neutral-900 font-medium"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> 
          Voltar
        </Button>
        <Button 
          type="submit" 
          size="lg" 
          className="h-12 w-full sm:w-auto flex-1 rounded-none bg-neutral-900 hover:bg-neutral-800 text-white font-bold shadow-xs transition-all active:scale-[0.98]"
        >
          Continuar
        </Button>
      </div>
    </form>
  );
}