import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, Car, Wallet } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

import { useAutoEquityWizard } from "@/hooks/useAutoEquityWizard";
import { vehicleIncomeSchema, type VehicleIncomeData, BRL } from "../schemas";

const maskPlate = (v: string) =>
  v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);

const maskMoney = (v: string) => {
  const n = Number(v.replace(/\D/g, "")) / 100;
  return Number.isFinite(n) ? n : 0;
};

/**
 * Passo 2 — Dados do veículo (collateral) + renda.
 * Dividido em dois blocos visuais para reduzir carga cognitiva.
 */
export function Step2VehicleIncome() {
  const { state, update, next, back } = useAutoEquityWizard();

  const form = useForm<VehicleIncomeData>({
    resolver: zodResolver(vehicleIncomeSchema),
    defaultValues:
      state.vehicleIncome ??
      ({
        licensePlate: "",
        brand: "",
        model: "",
        modelYear: "",
        manufacturingYear: "",
        modelVersion: "",
        fipeValue: 0,
        isOwner: true,
        monthlyIncome: 0,
        professionalStatus: "CLT",
        timeOfEmployment: "MORE_THAN_THREE_YEARS",
      } as VehicleIncomeData),
  });

  const isOwner = form.watch("isOwner");
  const fipe = form.watch("fipeValue");
  const income = form.watch("monthlyIncome");

  const onSubmit = (data: VehicleIncomeData) => {
    update({ vehicleIncome: data, desiredAmount: data.fipeValue * 0.7 });
    next();
  };

  const err = form.formState.errors;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6">
      {/* Bloco veículo */}
      <section className="rounded-xl border border-border p-4">
        <header className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Car className="h-4 w-4 text-primary" /> Veículo em garantia
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="plate">Placa</Label>
            <Input
              id="plate"
              placeholder="ABC1D23"
              value={form.watch("licensePlate") ?? ""}
              onChange={(e) =>
                form.setValue("licensePlate", maskPlate(e.target.value), { shouldValidate: true })
              }
            />
            {err.licensePlate && (
              <p className="mt-1 text-xs text-destructive">{err.licensePlate.message}</p>
            )}
          </div>
          <div>
            <Label htmlFor="brand">Marca</Label>
            <Input id="brand" placeholder="Toyota" {...form.register("brand")} />
          </div>
          <div>
            <Label htmlFor="model">Modelo</Label>
            <Input id="model" placeholder="Hilux" {...form.register("model")} />
          </div>
          <div>
            <Label htmlFor="version">Versão</Label>
            <Input id="version" placeholder="CD SRX 2.8" {...form.register("modelVersion")} />
          </div>
          <div>
            <Label htmlFor="modelYear">Ano modelo</Label>
            <Input id="modelYear" placeholder="2022" {...form.register("modelYear")} />
          </div>
          <div>
            <Label htmlFor="mfYear">Ano fabricação</Label>
            <Input id="mfYear" placeholder="2022" {...form.register("manufacturingYear")} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="fipe">Valor FIPE</Label>
            <Input
              id="fipe"
              placeholder="R$ 0,00"
              value={fipe ? BRL(fipe) : ""}
              onChange={(e) =>
                form.setValue("fipeValue", maskMoney(e.target.value), { shouldValidate: true })
              }
            />
            {err.fipeValue && (
              <p className="mt-1 text-xs text-destructive">{err.fipeValue.message}</p>
            )}
          </div>

          <label className="sm:col-span-2 flex items-center gap-2 text-sm text-foreground">
            <Checkbox
              checked={isOwner}
              onCheckedChange={(c) => form.setValue("isOwner", Boolean(c))}
            />
            Sou o proprietário do veículo
          </label>

          {!isOwner && (
            <div className="sm:col-span-2">
              <Label>Grau de parentesco</Label>
              <Select
                value={form.watch("ownerKinship") ?? ""}
                onValueChange={(v) =>
                  form.setValue("ownerKinship", v as VehicleIncomeData["ownerKinship"])
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SPOUSE">Cônjuge</SelectItem>
                  <SelectItem value="PARENT">Pai/Mãe</SelectItem>
                  <SelectItem value="CHILD">Filho(a)</SelectItem>
                  <SelectItem value="SIBLING">Irmão(ã)</SelectItem>
                  <SelectItem value="OTHER">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </section>

      {/* Bloco renda */}
      <section className="rounded-xl border border-border p-4">
        <header className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Wallet className="h-4 w-4 text-primary" /> Sua renda
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="income">Renda mensal</Label>
            <Input
              id="income"
              placeholder="R$ 0,00"
              value={income ? BRL(income) : ""}
              onChange={(e) =>
                form.setValue("monthlyIncome", maskMoney(e.target.value), { shouldValidate: true })
              }
            />
            {err.monthlyIncome && (
              <p className="mt-1 text-xs text-destructive">{err.monthlyIncome.message}</p>
            )}
          </div>

          <div>
            <Label>Vínculo profissional</Label>
            <Select
              value={form.watch("professionalStatus")}
              onValueChange={(v) =>
                form.setValue(
                  "professionalStatus",
                  v as VehicleIncomeData["professionalStatus"],
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CLT">CLT</SelectItem>
                <SelectItem value="PJ">PJ</SelectItem>
                <SelectItem value="AUTONOMOUS">Autônomo</SelectItem>
                <SelectItem value="RETIRED">Aposentado</SelectItem>
                <SelectItem value="PUBLIC_SERVANT">Servidor público</SelectItem>
                <SelectItem value="ENTREPRENEUR">Empresário</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Tempo de vínculo</Label>
            <Select
              value={form.watch("timeOfEmployment")}
              onValueChange={(v) =>
                form.setValue(
                  "timeOfEmployment",
                  v as VehicleIncomeData["timeOfEmployment"],
                )
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="LESS_THAN_SIX_MONTHS">Menos de 6 meses</SelectItem>
                <SelectItem value="SIX_TO_TWELVE_MONTHS">6 a 12 meses</SelectItem>
                <SelectItem value="ONE_TO_THREE_YEARS">1 a 3 anos</SelectItem>
                <SelectItem value="MORE_THAN_THREE_YEARS">Mais de 3 anos</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <Button type="button" variant="ghost" onClick={back}>
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Button>
        <Button type="submit" size="lg" className="h-12 flex-1 rounded-xl sm:flex-none sm:px-10">
          Continuar
        </Button>
      </div>
    </form>
  );
}
