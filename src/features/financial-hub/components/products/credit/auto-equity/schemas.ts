/**
 * @fileoverview Definições de Schemas (Zod) e Tipagens da Jornada
 * @path src/components/auto-equity/schemas.ts
 * 
 * Definir os contratos de dados e regras de validação (Zod) para cada etapa da jornada.
 * Centralizar estas definições garante que o frontend e o motor de simulação 
 * falem a mesma língua.
 * * INTEGRAÇÃO:
 * - Utilizado por `react-hook-form` em cada `Step` para validação de campos.
 * - Exporta os tipos TypeScript (`infer`) para garantir Type Safety em toda a jornada.
 * * INTERDEPENDÊNCIAS:
 * - Zod: Biblioteca de validação de esquemas.
 */

import { z } from "zod";

// Step 0: Elegibilidade
export const eligibilitySchema = z.object({
  fullName: z.string().trim().min(3, "Informe seu nome completo").max(120),
  cpf: z.string().trim().regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/, "Use o formato 000.000.000-00"),
  birthDate: z.string().min(10, "Data inválida"), // Adicionado aqui
  phone: z.string().trim().regex(/^\(\d{2}\)\s\d{4,5}-\d{4}$/, "Use o formato (11) 99999-9999"),
  email: z.string().trim().email("E-mail inválido").max(160),
  acceptScr: z.boolean().optional(),
});

// Step 1: Dados Pessoais e Renda
export const personalIncomeSchema = z.object({
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

// Step 2: Veículo (collateral)
export const vehicleSchema = z.object({
  licensePlate: z.string().trim().regex(/^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/i, "Placa inválida"),
  
  // Se for capturar na tela, mantenha o .min(1). Se vier de API depois, coloque .optional()
  brand: z.string().min(1, "Informe a marca").optional(),
  model: z.string().min(1, "Informe o modelo").optional(),
  modelYear: z.string().regex(/^\d{4}$/, "Ano inválido").optional(),
  manufacturingYear: z.string().regex(/^\d{4}$/, "Ano inválido").optional(),
  modelVersion: z.string().min(1, "Informe a versão").optional(),
  fipeValue: z.number().min(5000, "Valor mínimo R$ 5.000").optional(),
  isOwner: z.boolean().optional(),
  ownerKinshipDegree: z.enum(["SELF", "SPOUSE", "PARENTS", "CHILDREN", "SIBLINGS", "OTHERS"], {
    required_error: "Selecione o proprietário do veículo.",
  }),
});

export type EligibilityData = z.infer<typeof eligibilitySchema>;
export type PersonalIncomeData = z.infer<typeof personalIncomeSchema>;
export type VehicleData = z.infer<typeof vehicleSchema>;

export const BRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// Dicionário de motivos para usar na interface (opcional, mas ajuda a manter organizado)
export const PURPOSE_LABELS: Record<string, string> = {
  INVESTMENT_IN_OWN_BUSINESS: "Investimento em negócio próprio",
  DEBTS_PAYMENT: "Pagamento de dívidas",
  DEBTS_REFINANCING: "Refinanciamento de dívidas",
  REAL_ESTATE_RENOVATION: "Reforma de casa",
  GOODS_ACQUISITION: "Aquisição de Bens",
  OTHERS: "Outros",
};

// Step 3: Simulação / Proposta
export const simulationSchema = z.object({
  desiredValue: z.number().min(1000, "Valor mínimo inválido"), // Ajuste o mínimo conforme sua regra
  purpose: z.enum([
    "INVESTMENT_IN_OWN_BUSINESS",
    "DEBTS_PAYMENT",
    "DEBTS_REFINANCING",
    "REAL_ESTATE_RENOVATION",
    "GOODS_ACQUISITION",
    "OTHERS"
  ], { 
    required_error: "Selecione o motivo do empréstimo." 
  }),
  confirmTerms: z.literal<boolean>(true, {
    errorMap: () => ({ message: "Você precisa confirmar os dados para prosseguir." })
  }),
});

export type SimulationData = z.infer<typeof simulationSchema>;