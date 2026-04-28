// supabase/functions/financial-gateway/fandi-service.ts

// Centralize aqui para facilitar futuras alterações
const WEBHOOK_URL = "https://qadgbfhjtgufioxtyamq.supabase.co/functions/v1/financial-gateway/webhook";

// Simução da fandi
export async function processarFluxoFandi(payload: any) {
  const FANDI_API_KEY = Deno.env.get("FANDI_API_KEY");
  const CNPJ_LOJA = "67793652000100";
  const GUID_URL = 'https://core.fandi.com.br/v1/checkout/obter-guid';

  if (!FANDI_API_KEY) throw new Error("FANDI_API_KEY não encontrada.");

  const bodyGuid = { 
    config: { 
      chaveAcesso: FANDI_API_KEY, 
      cnpjLoja: CNPJ_LOJA, 
      confirmarDados: [], 
      exibeTelaFinalizacao: false
    },
    cliente: {
      nome: payload.cliente?.nome || "",
      celular: payload.cliente?.celular || "",
      sexo: payload.cliente?.sexo || "M",
      possuiCnh: payload.cliente?.possuiCnh ?? true,
      usoComercial: payload.cliente?.usoComercial ?? false,
      pcd: payload.cliente?.pcd ?? false,
      usoTaxi: payload.cliente?.usoTaxi ?? false
    },
    simulacao: { 
      valorEntrada: payload.entrada ?? null, 
      quantidadeParcelas: 
      payload.parcelas ?? null 
    },
    veiculo: {
      modeloId: payload.veiculo?.modeloId,
      valorVeiculo: payload.veiculo?.valorVeiculo,
      zeroKm: payload.veiculo?.zeroKm ?? false,
      anoFabricacao: payload.veiculo?.anoFabricacao,
      anoModelo: payload.veiculo?.anoModelo,
      fipe: payload.veiculo?.fipe || ""
    }
  };

  console.log("ENVIO GUID ESTRUTURADO:", JSON.stringify(bodyGuid));
  
  const guidResponse = await fetch(GUID_URL, { 
    method: 'POST', 
    headers: { 'Content-Type': 'application/json', 'fandi-tipo-servico': 'checkout' }, 
    body: JSON.stringify(bodyGuid) 
  });
  
  const guidResult = await guidResponse.json();
  if (!guidResponse.ok) throw new Error(`Erro GUID: ${JSON.stringify(guidResult)}`);
  const guid = guidResult.retorno;
  console.log("GUID gerado:", guid);

  const contextResponse = await fetch(`https://core.fandi.com.br/v1/checkout/${guid}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', 'fandi-tipo-servico': 'checkout', 'chave-acesso': FANDI_API_KEY! }
  });

  const contextData = await contextResponse.json();
  if (!contextData || !contextData.retorno) throw new Error(`Falha ao obter contexto: ${JSON.stringify(contextData)}`);
  
  const dr = contextData.retorno;
  const urlFandi = dr.urlFandi; // A URL que o sistema te dá
  const tokenAcesso = dr.tokenAcesso; // O token que o sistema te dá
  
  console.log("RESPOSTA CONTEXTO (DEBUG):", JSON.stringify(contextData));

  // 3. SIMULAÇÃO (POST)
  // 3.1. Definição do objeto antes da chamada
  const bodySimulacao = {
    cliente: {
      nome: payload.cliente?.nome || "",
      cpf: payload.cliente?.cpf || "",
      celular: payload.cliente?.celular || "",
      email: payload.cliente?.email || "",
      sexo: payload.cliente?.sexo || "M",
      dataNascimento: payload.cliente?.dataNascimento || "",
      possuiCnh: payload.cliente?.possuiCnh ?? true,
      usoComercial: payload.cliente?.usoComercial ?? false,
      pcd: payload.cliente?.pcd ?? false,
      usoTaxi: payload.cliente?.usoTaxi ?? false
    },
    institucional: {
      empresaId: dr.empresaId,
      pontoVendaId: String(dr.pontoVendaId),
      ...(dr.vendedorId && Number(dr.vendedorId) > 0 && { vendedorId: Number(dr.vendedorId) })
    },
    simulacao: {
      valorEntrada: payload.entrada ?? 0,
      quantidadeParcelas: payload.parcelas ?? 48
    },
    veiculo: {
      anoFabricacao: payload.veiculo?.anoFabricacao,
      anoModelo: payload.veiculo?.anoModelo,
      chassi: payload.veiculo?.chassi || null,
      cor: payload.veiculo?.cor || null,
      modeloId: payload.veiculo?.modeloId,
      placa: payload.veiculo?.placa || null,
      quilometragem: payload.veiculo?.quilometragem || 0,
      renavam: payload.veiculo?.renavam || null,      
      valor: payload.veiculo?.valorVeiculo,
      zeroKm: payload.veiculo?.zeroKm,
      fipe: payload.veiculo?.fipe || "", 
      fabricante: dr.veiculo?.fabricante?.fabricanteId || 0,
      codigoParceiro: dr.veiculo?.codigoParceiro || ""
    }
  };

  // 3.2. EXIBIR NO LOG (Formatado com 2 espaços para fácil leitura)
  console.log("PAYLOAD SIMULACAO ENVIADO:", JSON.stringify(bodySimulacao, null, 2));

  // 3.3. Fazer o fetch usando a variável
  const simResponse = await fetch(`${urlFandi}/v1/checkout/simulacao`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'fandi-tipo-servico': 'checkout',
      'Authorization': tokenAcesso // Use o token que veio do contextData
    },
    body: JSON.stringify(bodySimulacao)
  });

  // 3.4. Após o POST de simulação, capture o retorno
  const simResult = await simResponse.json();
  const retSimulacao = simResult.retorno; 

  // 3.5. Log do retorno da simulação
  console.log("RETORNO SIMULACAO:", JSON.stringify(simResult, null, 2));

  // 4. INCLUSÃO (POST)
  // 4.1. Construção do Payload para Debug
  const bodyInclusao = {
    guid: guid, 
    clienteId: retSimulacao.clienteId,
    urlCallback: WEBHOOK_URL,
    veiculo: {
      modeloId: payload.veiculo?.modeloId,
      estadoLicenciamento: payload.veiculo?.estadoLicenciamento || "SP",
      valor: payload.veiculo?.valorVeiculo,
      zeroKm: !!payload.veiculo?.zeroKm,
      anoFabricacao: payload.veiculo?.anoFabricacao,
      anoModelo: payload.veiculo?.anoModelo,
      quilometragem: payload.veiculo?.quilometragem ?? null,
      cor: payload.veiculo?.cor ?? null,
      chassi: payload.veiculo?.chassi ?? null,
      renavam: payload.veiculo?.renavam ?? null,
      placa: payload.veiculo?.placa ?? null,
      molicar: payload.veiculo?.molicar ?? null,
      fabricante: retSimulacao.veiculo?.fabricante || "", 
      familia: retSimulacao.veiculo?.familia || "",
      modelo: retSimulacao.veiculo?.modelo || ""
    },
    simulacao: {
      valorEntrada: retSimulacao.valorEntrada,
      quantidadeParcelas: retSimulacao.quantidadeParcelas,
      retornoId: retSimulacao.simulacao.retornoId,
      possuiIntegracao: false,
      sistemaIntegrado: 0,
      sistemaEhPrecificacao: false,
      taxa: retSimulacao.simulacao.taxa, 
      menuSelling: retSimulacao.simulacao.menuSelling 
    },
    institucional: {
      empresaId: Number(dr.empresaId || 0),
      pontoVendaId: String(dr.pontoVendaId || ""),
      instituicaoFinanceiraId: retSimulacao.institucional.instituicaoFinanceiraId,
      ...(retSimulacao.institucional.vendedorId && { vendedorId: Number(retSimulacao.institucional.vendedorId) })
    }
  };

  // 4.2. Log do payload para verificação antes do envio
  console.log("PAYLOAD INCLUSÃO ENVIADO:", JSON.stringify(bodyInclusao, null, 2));

  // 4.3. Chamada de Inclusão
  const incResponse = await fetch(`${urlFandi}/v1/checkout/inclusao`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'fandi-tipo-servico': 'checkout', 
      'Authorization': tokenAcesso 
    },
    body: JSON.stringify(bodyInclusao)
  });

  const incResult = await incResponse.json();
  if (!incResponse.ok) throw new Error(`Erro INCLUSÃO: ${JSON.stringify(incResult)}`);
  console.log("Inclusão concluída com sucesso!");

  return { guid, simResult, inclusao: incResult };
}

// Webhook de retorno de simução da fandi
// No seu fandi-service.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export async function tratarWebhookFandi(body: any) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Exemplo: atualizar o status da proposta na tabela 'propostas'
  await supabase
    .from('propostas')
    .update({ 
      status: body.status, 
      updated_at: new Date().toISOString() 
    })
    .eq('guid', body.guid);
}