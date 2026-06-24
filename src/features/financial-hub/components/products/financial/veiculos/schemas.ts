/**
 * @fileoverview Definições de Schemas (Zod) para a Jornada de Veículos
 * * PROPÓSITO:
 * Centralizar as regras de validação (Zod) para a jornada de Veículos.
 */

import { z } from "zod";

export const veiculosSimulationSchema = z.object({
  valorProposta: z.number().min(1000, "Valor mínimo obrigatório"),
  valorEntrada: z.number().min(0, "Entrada não pode ser negativa"),
  parcelas: z.number().min(1, "Selecione o prazo"),
  aceiteTermos: z.literal(true, { message: "Você precisa aceitar os termos" }),
});

export type VeiculosSimulationData = z.infer<typeof veiculosSimulationSchema>;