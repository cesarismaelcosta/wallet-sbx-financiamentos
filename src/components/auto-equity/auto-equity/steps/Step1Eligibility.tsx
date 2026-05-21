import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, AlertCircle, ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useAutoEquityWizard } from "@/hooks/useAutoEquityWizard";
import { eligibilitySchema, type EligibilityData } from "../schemas";
import { checkEligibility } from "@/lib/auto-equity.mock";

const maskCPF = (v: string) =>
  v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2");

const maskPhone = (v: string) =>
  v
    .replace(/\D/g, "")
    .slice(0, 11)
    .replace(/(\d{2})(\d)/, "($1) $2")
    .replace(/(\d{5})(\d)/, "$1-$2")
    .replace(/(\d{4})(\d)/, "$1-$2");

/**
 * Passo 1 — Captura dados pessoais e dispara consulta de elegibilidade.
 * Se inelegível, troca para bloco de bloqueio dentro do mesmo card.
 */
export function Step1Eligibility() {
  const { update, next, state } = useAutoEquityWizard();
  const [loading, setLoading] = useState(false);

  const form = useForm<EligibilityData>({
    resolver: zodResolver(eligibilitySchema),
    defaultValues: state.eligibility ?? {
      fullName: "",
      email: "",
      cpf: "",
      phone: "",
      acceptScr: false as unknown as true,
    },
  });

  const onSubmit = async (data: EligibilityData) => {
    setLoading(true);
    const res = await checkEligibility({ cpf: data.cpf, email: data.email });
    setLoading(false);
    if (!res.eligible) {
      update({ blocked: { reason: res.reason ?? "Inelegível" }, eligibility: data });
      return;
    }
    update({ eligibility: data, blocked: undefined });
    next();
  };

  // Tela de bloqueio
  if (state.blocked) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Não foi dessa vez</h2>
        <p className="mt-2 text-sm text-muted-foreground">{state.blocked.reason}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Mas você ainda pode simular o financiamento padrão do bem.
        </p>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link to="/">Simular financiamento</Link>
          </Button>
          <Button variant="ghost" onClick={() => update({ blocked: undefined })}>
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <div>
        <Label htmlFor="fullName">Nome completo</Label>
        <Input id="fullName" placeholder="Como está no RG" {...form.register("fullName")} />
        {form.formState.errors.fullName && (
          <p className="mt-1 text-xs text-destructive">{form.formState.errors.fullName.message}</p>
        )}
      </div>

      <div>
        <Label htmlFor="email">E-mail</Label>
        <Input id="email" type="email" placeholder="voce@email.com" {...form.register("email")} />
        {form.formState.errors.email && (
          <p className="mt-1 text-xs text-destructive">{form.formState.errors.email.message}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="cpf">CPF</Label>
          <Input
            id="cpf"
            placeholder="000.000.000-00"
            value={form.watch("cpf") ?? ""}
            onChange={(e) => form.setValue("cpf", maskCPF(e.target.value), { shouldValidate: true })}
          />
          {form.formState.errors.cpf && (
            <p className="mt-1 text-xs text-destructive">{form.formState.errors.cpf.message}</p>
          )}
        </div>
        <div>
          <Label htmlFor="phone">Celular</Label>
          <Input
            id="phone"
            placeholder="(11) 99999-9999"
            value={form.watch("phone") ?? ""}
            onChange={(e) =>
              form.setValue("phone", maskPhone(e.target.value), { shouldValidate: true })
            }
          />
          {form.formState.errors.phone && (
            <p className="mt-1 text-xs text-destructive">{form.formState.errors.phone.message}</p>
          )}
        </div>
      </div>

      <label className="mt-2 flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <Checkbox
          checked={form.watch("acceptScr")}
          onCheckedChange={(c) =>
            form.setValue("acceptScr", Boolean(c) as true, { shouldValidate: true })
          }
          className="mt-0.5"
        />
        <span>
          Autorizo a consulta ao Sistema de Informações de Crédito (SCR) do Banco Central e aceito
          os <strong className="text-foreground">Termos de Uso</strong> e a{" "}
          <strong className="text-foreground">Política de Privacidade</strong>.
        </span>
      </label>
      {form.formState.errors.acceptScr && (
        <p className="-mt-2 text-xs text-destructive">{form.formState.errors.acceptScr.message}</p>
      )}

      <Button type="submit" size="lg" className="mt-2 h-12 rounded-xl" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando elegibilidade...
          </>
        ) : (
          "Continuar"
        )}
      </Button>
    </form>
  );
}
