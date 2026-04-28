// supabase/functions/financial-gateway/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { tratarWebhookFandi } from './fandi-service.ts';
import { processSimulation } from "./simulation_handler.ts"; // Agora sim, usamos o handler robusto

serve(async (req) => {
  // 1. CORS Handle
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' } });
  }

  const url = new URL(req.url);

  // 2. Rota de Webhook
  if (url.pathname.endsWith('/webhook')) {
    try {
      const body = await req.json();
      await tratarWebhookFandi(body);
      return new Response(JSON.stringify({ message: "Processado com sucesso" }), { status: 200, headers: { 'Access-Control-Allow-Origin': '*' } });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
  }

  // 3. Rota Principal (A que o Sandbox chama)
  try {
    const payload = await req.json();
    
    // CHAMADA DO HANDLER ROBUSTO:
    // Em vez de if/else manuais, chamamos o handler que consulta o banco
    const result = await processSimulation(payload);
    
    return new Response(JSON.stringify(result), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
    });
    
  } catch (err: any) {
    console.error("ERRO NO GATEWAY:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 400, 
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
    });
  }
});