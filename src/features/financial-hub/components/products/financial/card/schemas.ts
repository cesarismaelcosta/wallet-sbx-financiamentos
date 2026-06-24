/**
 * @fileoverview Definição de Schemas de Validação - Jornada de Card
 * @path src/components/card/schemas.ts
 */

import { z } from "zod";

export const CardPageConfigSchema = z.object({
  headline: z.object({
    parts: z.array(z.object({ text: z.string(), type: z.string() }))
  }),
  description: z.object({
    parts: z.array(z.object({ text: z.string(), type: z.string() }))
  }),
  benefits: z.array(z.object({ 
    icon: z.string(), 
    title: z.string(), 
    description: z.string() 
  })),
  partner: z.object({ label: z.string(), name: z.string() }).optional(),
  box_bg: z.string().optional(),
  box_radius: z.string().optional(),
});

export const CardWizardDataSchema = z.object({
  page_configs: CardPageConfigSchema,
  offer: z.any(),
  rules: z.any(),
  consent_configs: z.array(z.any()),
  simulationResult: z.any().optional(),

  // Estado da Simulação
  valorLote: z.number(),

  entity: z.any(),
  event: z.any(),
}).catchall(z.any());

export type CardWizardDataSchemaType = z.infer<typeof CardWizardDataSchema>;