import { z } from "zod";

/**
 * Schemas e tipos compartilhados do wizard Auto Equity.
 * Cada passo valida sua própria slice e faz merge no estado global.
 */

// ---------- Passo 1 ----------
export const eligibilitySchema = z.object({
  fullName: z.string().trim().min(3, "Informe seu nome completo").max(120),
  email: z.string().trim().email("E-mail inválido").max(160),
  cpf: z
    .string()
    .trim()
    .regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, "Use o formato 000.000.000-00"),
  phone: z
    .string()
    .trim()
    .regex(/^\(\d{2}\)\s\d{4,5}-\d{4}$/, "Use o formato (11) 99999-9999"),
  acceptScr: z.literal<boolean>(true, {
    errorMap: () => ({ message: "É necessário aceitar a consulta SCR" }),
  }),
});
export type EligibilityData = z.infer<typeof eligibilitySchema>;

// ---------- Passo 2 ----------
export const vehicleIncomeSchema = z.object({
  // collateral
  licensePlate: z
    .string()
    .trim()
    .regex(/^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/i, "Placa inválida"),
  brand: z.string().min(1, "Informe a marca"),
  model: z.string().min(1, "Informe o modelo"),
  modelYear: z.string().regex(/^\d{4}$/, "Ano inválido"),
  manufacturingYear: z.string().regex(/^\d{4}$/, "Ano inválido"),
  modelVersion: z.string().min(1, "Informe a versão"),
  fipeValue: z.number().min(5000, "Valor mínimo R$ 5.000"),
  isOwner: z.boolean(),
  ownerKinship: z
    .enum(["SPOUSE", "PARENT", "CHILD", "SIBLING", "OTHER"])
    .optional(),
  // income
  monthlyIncome: z.number().min(1000, "Renda mínima R$ 1.000"),
  professionalStatus: z.enum([
    "CLT",
    "PJ",
    "AUTONOMOUS",
    "RETIRED",
    "PUBLIC_SERVANT",
    "ENTREPRENEUR",
  ]),
  timeOfEmployment: z.enum([
    "LESS_THAN_SIX_MONTHS",
    "SIX_TO_TWELVE_MONTHS",
    "ONE_TO_THREE_YEARS",
    "MORE_THAN_THREE_YEARS",
  ]),
});
export type VehicleIncomeData = z.infer<typeof vehicleIncomeSchema>;

// ---------- Estado global ----------
export type WizardState = {
  step: 1 | 2 | 3 | 4;
  eligibility?: EligibilityData;
  vehicleIncome?: VehicleIncomeData;
  desiredAmount?: number;
  selectedInstallments?: number;
  offerId?: string;
  proposalId?: string;
  blocked?: { reason: string };
};

export const BRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
