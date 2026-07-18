/**
 * @file financial-gateway-webhook/index.ts
 * @description Roteador central. Usa o withSecurity para infraestrutura e delega o negócio.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { withSecurity } from "../_shared/server.ts";
import { tratarWebhookFandi } from './fandi-service.ts';

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
import { debugLog } from "../_shared/logger.ts";

// O withSecurity envolve toda a execução, garantindo CORS e tratamento global de erros
serve(withSecurity('financial-gateway-webhook', async (req: Request) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.toLowerCase().split("/").filter(Boolean);

  // Roteamento puro
  const partner = pathParts[0]; 
  const params = pathParts.slice(1); // [simId, updateId, timestamp, signature]

  switch (partner) {
    case "fandi":
      // A função especializada fará o trabalho pesado de HMAC e banco de dados
      const result = await tratarWebhookFandi(req, params);
      return new Response(JSON.stringify(result), { status: 200 });

    default:
      console.warn(`[GATEWAY] Tentativa de acesso em rota não mapeada: ${partner}`);
      return new Response(JSON.stringify({ error: "Parceiro não mapeado" }), { status: 404 });
  }
}));