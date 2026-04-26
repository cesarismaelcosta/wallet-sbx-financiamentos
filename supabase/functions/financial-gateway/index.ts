import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const BASE_URL = 'https://api-hml.fandi.com.br/hml/v1';

// Função unificada aqui dentro
async function handleFandiRequest(payload: any) {
  const FANDI_API_KEY = Deno.env.get('FANDI_API_KEY');
  
  // 1. Gerar GUID
  const guidResponse = await fetch(`${BASE_URL}/checkout/gerar-guid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'fandi-tipo-servico': 'checkout' }
  });
  
  if (!guidResponse.ok) throw new Error("Erro ao gerar GUID na Fandi");
  const { retorno: guid } = await guidResponse.json();

  // 2. Inclusão do Checkout
  const response = await fetch(`${BASE_URL}/checkout/inclusao`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${FANDI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      guid,
      institucional: { empresaId: 199, pontoVendaId: 282, vendedorId: 5214, instituicaoFinanceiraId: 361 },
      simulacao: { valorVeiculo: payload.valorVeiculo, valorEntrada: payload.entrada, quantidadeParcelas: payload.parcelas }
    })
  });

  return await response.json();
}

// Roteador principal
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });

  try {
    const { categoria, ...payload } = await req.json();
    if (categoria === 'CARROS' || categoria === 'CAMINHOES') {
      const result = await handleFandiRequest(payload);
      return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'Categoria não suportada' }), { status: 400 });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});