/**
 * @fileoverview Passo 3: Informações do Veículo
 * * PROPÓSITO:
 * Recolher os dados do veículo (placa e parentesco do proprietário).
 * * INTEGRAÇÃO:
 * - Utiliza `useWizard<any>()` para interagir com o Motor Genérico.
 * - Lê valores iniciais de `state.data.vehicle` (vindo do Orquestrador ou passo anterior).
 * - Atualiza o estado da jornada através do `update` do Motor, mantendo 
 * a consistência dos dados (data) e navegação (meta).
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

// Classe padronizada para unificar tamanho e fonte
const commonInputClass = "h-10 text-sm transition-all duration-300 focus-visible:ring-2 focus-visible:ring-offset-0";

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
      <section className="rounded-xl border border-border p-4">
        <header className="mb-6 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Car className="h-4 w-4 text-[var(--brand-primary)]" /> Informações do veículo
        </header>

        <div className="space-y-5">
          {/* Campo Placa */}
          <div className="space-y-2">
            <Label htmlFor="licensePlate">Placa do veículo</Label>
            <Input 
              id="licensePlate"
              {...form.register("licensePlate")} 
              placeholder="Ex: ABC1D23" 
              maxLength={7}
              autoComplete="off"
              className={`${commonInputClass} uppercase ${plate && plate.length > 0 
                ? "bg-[var(--brand-primary)]/1 border-[var(--brand-primary)]/10" 
                : "border-input"
              } focus-visible:border-[var(--brand-primary)]`}
            />
            {err.licensePlate && (
              <p className="text-xs text-destructive">{err.licensePlate.message}</p>
            )}
          </div>

          {/* Campo Proprietário */}
          <div className="space-y-2">
            <Label>Quem é o proprietário do veículo?</Label>
            <Select 
              value={kinship ?? ""}
              onValueChange={(v) => form.setValue("ownerKinshipDegree", v as any, { shouldValidate: true })}
            >
              <SelectTrigger 
                className={`${commonInputClass} ${kinship 
                  ? "bg-[var(--brand-primary)]/1 border-[var(--brand-primary)]/10" 
                  : "border-input"
                } focus-visible:border-[var(--brand-primary)]`}
              >
                <SelectValue placeholder="Selecione o proprietário" />
              </SelectTrigger>
              <SelectContent>
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
                    className="data-[highlighted]:!bg-[var(--brand-primary)]/10 data-[highlighted]:!text-[var(--brand-primary)] cursor-pointer"
                  >
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {err.ownerKinshipDegree && (
              <p className="text-xs text-destructive">{err.ownerKinshipDegree.message}</p>
            )}
          </div>
        </div>
      </section>

      {/* Botões de Navegação */}
      <div className="flex items-center justify-between gap-3">
        <Button 
          type="button" 
          variant="ghost" 
          onClick={back}
          className="text-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/10 hover:text-[var(--brand-primary)] transition-colors focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> 
          Voltar
        </Button>
        <Button 
          type="submit" 
          size="lg" 
          className="h-12 flex-1 rounded-xl transition-all bg-[var(--brand-primary)] hover:bg-[var(--brand-primary)]/90 focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)] focus-visible:ring-offset-2"
        >
          Continuar
        </Button>
      </div>
    </form>
  );
}