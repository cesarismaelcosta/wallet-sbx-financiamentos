// supabase/functions/financial-gateway/fandiService.ts

const BASE_URL = 'https://api-hml.fandi.com.br/hml/v1';

export async function handleFandi(payload: any) {
  const FANDI_API_KEY = Deno.env.get('FANDI_API_KEY');

  try {
    console.log('Iniciando comunicação com a Fandi...');

    // 1. Obter GUID
    const guidResponse = await fetch(`${BASE_URL}/checkout/gerar-guid`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'fandi-tipo-servico': 'checkout' 
      }
    });
    
    if (!guidResponse.ok) {
      const errorText = await guidResponse.text();
      console.error('Erro ao gerar GUID:', errorText);
      throw new Error(`Falha ao gerar GUID: ${guidResponse.status}`);
    }
    
    const guidData = await guidResponse.json();
    const guid = guidData.retorno;
    console.log('GUID gerado com sucesso:', guid);

    // 2. Inclusão do Checkout
    const bodyPayload = {
      guid: guid,
      institucional: {
        empresaId: 199,
        pontoVendaId: 282,
        vendedorId: 5214,
        instituicaoFinanceiraId: 361
      },
      simulacao: {
        valorVeiculo: payload.valorVeiculo,
        valorEntrada: payload.entrada,
        quantidadeParcelas: payload.parcelas
      }
    };

    console.log('Enviando dados para inclusão:', JSON.stringify(bodyPayload));

    const inclusaoResponse = await fetch(`${BASE_URL}/checkout/inclusao`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FANDI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bodyPayload)
    });

    const result = await inclusaoResponse.json();
    
    if (!inclusaoResponse.ok) {
      console.error('Erro da API Fandi na inclusão:', result);
      return new Response(JSON.stringify(result), { status: inclusaoResponse.status });
    }

    console.log('Checkout incluído com sucesso!');
    return new Response(JSON.stringify(result), { 
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('ERRO CRÍTICO NO fandiService:', error.message);
    return new Response(JSON.stringify({ error: error.message }), { status: 502 });
  }
}