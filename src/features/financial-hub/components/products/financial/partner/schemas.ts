/**
 * @fileoverview Definições de Schemas (Zod) para a Jornada de Simulação
 * @path src/components/simulacao/schemas.ts
 * * ÁRVORE DE DEPENDÊNCIAS:
 * --------------------------------------------------------------------------------
 * src/components/simulacao/
 * └── schemas.ts                     # [AQUI] Validação de dados
 * --------------------------------------------------------------------------------
 * * PROPÓSITO:
 * Centralizar as regras de validação (Zod) para garantir a integridade dos inputs
 * do simulador antes de disparar o Gateway.
 * * INTEGRAÇÃO:
 * - Utilizado nos componentes de Step para validação de formulário.
 */

import { z } from "zod";

export const simulacaoSchema = z.object({
  valorVeiculo: z.number().min(1000, "Valor do veículo inválido"),
  valorEntrada: z.number().min(0, "Entrada não pode ser negativa"),
  parcelas: z.number().min(1, "Selecione o número de parcelas"),
  aceiteTermos: z.literal(true, { message: "Termos obrigatórios" }),
});

export type SimulacaoData = z.infer<typeof simulacaoSchema>;