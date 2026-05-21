/**
 * @file fandi-service.ts
 * @description Motor de processamento assíncrono para retornos da Fandi.
 * * Este serviço implementa a técnica de "Payload Normalization" para lidar com a 
 * inconsistência de nomenclatura do parceiro (PascalCase vs camelCase).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Helper para extrair OS e Device básico do User Agent
 */
function parseUserAgent(ua: string) {
  const os = ua.includes('Windows') ? 'Windows' : 
             ua.includes('Mac') ? 'MacOS' : 
             ua.includes('Android') ? 'Android' : 
             ua.includes('iPhone') ? 'iOS' : 'Linux/Other';
             
  const device = ua.includes('Mobi') ? 'Mobile' : 'Desktop';
  return { os, device };
}


/**
 * Captura dados detalhados de infraestrutura e geolocalização.
 * 
 * Lógica de Geo:
 * 1. Tenta recuperar via headers da Cloudflare (produção Supabase).
 * 2. Se falhar (localhost/dev), utiliza o IP-API como fallback.
 * 
 * @param {Request} req - O objeto da requisição HTTP.
 * @returns {Promise<object>} Objeto contendo IP, Geo, OS e Device Type.
 */
async function captureInfrastructure(req: Request) {
  const ua = req.headers.get('user-agent') || '';
  // Melhora a captura do IP
  const ip = req.headers.get('x-real-ip') || 
             req.headers.get('cf-connecting-ip') || 
             req.headers.get('x-forwarded-for')?.split(',')[0] || 
             '0.0.0.0';
  
  const { os, device } = parseUserAgent(ua);

  // Tenta capturar dos headers da Vercel/Supabase (mais comuns no Edge)
  let geo = {
    country: req.headers.get('x-vercel-ip-country') || req.headers.get('cf-ipcountry'),
    state: req.headers.get('x-vercel-ip-country-region') || req.headers.get('cf-region'),
    city: req.headers.get('x-vercel-ip-city') || req.headers.get('cf-ipcity')
  };

  // 3. SE ALGUM CAMPO ESTIVER FALTANDO, DISPARA O FALLBACK
  // Mudamos a condição para ser mais agressiva: se não tem cidade ou estado, busca no IP-API
  if (!geo.country || geo.country === 'XX' || !geo.city) {
    try {
      // Importante: se o IP for 0.0.0.0 ou 127.0.0.1, o ip-api não retorna nada útil localmente
      const queryIp = (ip === '0.0.0.0' || ip === '127.0.0.1') ? '' : ip;
      const res = await fetch(`http://ip-api.com/json/${queryIp}?fields=countryCode,regionName,city`);
      const fallback = await res.json();
      
      geo = {
        country: fallback?.countryCode || geo.country || 'N/A',
        state: fallback?.regionName || geo.state || 'N/A',
        city: fallback?.city || geo.city || 'N/A'
      };
    } catch (e) {
      console.warn("[sbX Infrastructure] Falha no fallback de Geo:", e.message);
    }
  }

  return {
    ip_address: ip,
    user_agent: ua,
    country: geo.country,
    state: geo.state,
    city: geo.city,
    operating_system: os,
    device_type: device
  };
}

/**
 * @interface PartnerResponse
 * @description Contrato padrão de saída para motores de simulação sbX
 */
interface PartnerResponse {
  sucess: boolean;
  status_id: number;
  external_operation_id: string | null;
  message: string;
  installment_value: number | null;
  down_payment_amount: number | null;
  financed_amount: number | null;
  installments: number | null;
  cet_rate: number | null;
  financial_institution_id: number | null;
  financial_institution_name: string | null;
  raw: any;
}

/**
 * CONFIGURAÇÕES TÉCNICAS E FLAGS DE AMBIENTE
 */

// Chave de controle para logs de depuração
const DEBUG_MODE = true;

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * Centraliza o rastreio do pipeline respeitando a flag DEBUG_MODE.
 */
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[FANDI-WEBHOOK-DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

/**
 * @function tratarWebhookFandi
 * @description Receptor principal do Webhook. Realiza o mapeamento dos dados 
 * e executa o UPDATE determinístico na tabela de simulações.
 */
// {
//   "codigoProposta": 12123123,
//   "vendedor": {
//     "cnpjLoja": "34784543000169",
//     "nomeLoja": "nome da loja",
//     "cpfVendedor": 30030030030,
//     "nomeVendedor": "nome do vendedor"
//   },
//   "cliente": {
//     "nome": "nome do cliente",
//     "pcd": false,
//     "celular": "79996469297",
//     "sexo": "F",
//     "dataNascimento": "2000-10-10",
//     "possuiCnh": true,
//     "usoTaxi": false,
//     "cpf": "07638735510",
//     "email": "email@gmail.com"
//   },
//   "simulacao": {
//     "valorEntrada": 30000.00,
//     "quantidadeParcelas": 36,
//     "valorParcela": 2000.0,
//     "nomeIF": "ALFA",
//     "nomeIFDefault": "ALFA",
//     "codigoBacen": "025"
//   },
//   "veiculo": {
//     "placa": "ccc1234",
//     "marca": "CHEVROLET",
//     "modelo": "ONIX",
//     "versao": "1.0 12V MT6 4P MAN. BASICO",
//     "anoModelo": 2020,
//     "anoFabricacao": 2020,
//     "valorVeiculo": 60000.00,
//     "zeroKm": true,
//     "renavam": null,
//     "chassi": "LagaTingaLagating",
//     "cor": "branco",
//     "quilometragem": 0
//   }
// }

export async function tratarWebhookFandi(simulationId: string, req: Request) {

  const DEBUG_MODE = true;
  const debugLog = (msg: string, data?: any) => {
    if (DEBUG_MODE) console.log(`[FANDI-WEBHOOK] ${msg}`, data ? JSON.stringify(data, null, 2) : "");
  };

  // 1. CAPTURA DE INFRAESTRUTURA (IP, Geo, Device)
  const infra = await captureInfrastructure(req);

  // 2. PARSE E NORMALIZAÇÃO DO PAYLOAD
  // A Fandi envia chaves em Maiúsculo no Webhook (ex: 'Simulacao' em vez de 'simulacao').
  let body: any;
  try {
    body = await req.json();
  } catch (e) {
    debugLog("ERRO CRÍTICO: Payload do Webhook inválido.");
    return new Response("Invalid JSON", { status: 400 });
  }

  debugLog("RECEBIDO NO WEBHOOK: ", body);

  /**
   * MAPA DE NORMALIZAÇÃO:
   * Criamos referências (s, v, c) que aceitam ambas as variações de caixa (Case Insensitivity).
   */
  const s = body.Simulacao || body.simulacao; // Objeto de Simulação
  const v = body.Veiculo || body.veiculo;     // Objeto do Veículo
  const c = body.Cliente || body.cliente;     // Objeto do Cliente
  
  // Extração do Código Bacen (O "suco" para definir o status)
  const bacenOriginal = s?.CodigoBacen || s?.codigoBacen;
  const codigoProposta = body.CodigoProposta || body.codigoProposta;

  // 3. INICIALIZAÇÃO DO CLIENTE SUPABASE
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // 4. VALIDAÇÃO DO REGISTRO
  const { data: simulation, error: searchError } = await supabase
    .from('simulations')
    .select('id')
    .eq('id', simulationId)
    .single();

  if (searchError || !simulation) {
    debugLog("ERRO: simulation_id não localizado.", { simulationId });
    return new Response("Simulation not found", { status: 404 });
  }

  /**
   * 5. REGRAS DE NEGÓCIO PARA STATUS E ID FINANCEIRO
   * - status_id 1: Sucesso (Se houver código Bacen presente)
   * - status_id 2: Acompanhamento/Pendente (Se Bacen estiver ausente)
   */
  const statusFinalId = bacenOriginal ? 1 : 2;
  
  // Conversão para Inteiro para compatibilidade com colunas 'int' no Postgres
  const financialInstId = bacenOriginal ? parseInt(bacenOriginal, 10) : null;

  debugLog(`[WEBHOOK] Bacen: ${bacenOriginal} -> Status Final: ${statusFinalId}`);

  /**
   * 6. PERSISTÊNCIA EM TRILHA DE AUDITORIA (simulation_updates)
   */
  const { error: logError } = await supabase.from('simulation_updates').insert({
    simulation_id: simulation.id,
    operation: 'UPDATE',
    status_id: statusFinalId,
    stage_id: 2, 
    ip_address: infra.ip_address,
    country: infra.country,
    state: infra.state,
    city: infra.city,
    user_agent: infra.user_agent,
    device_type: infra.device_type,
    operating_system: infra.operating_system,
    origin_details: infra,
    financial_institution_id: financialInstId,
    simulation_details: {
      installments: s?.QuantidadeParcelas || s?.quantidadeParcelas,
      down_payment: s?.ValorEntrada || s?.valorEntrada,
      requested_value: v?.Valor || v?.valor,
      installment_value: s?.ValorParcela || s?.valorParcela,
      financial_institution_name: s?.NomeIF || s?.nomeIF,
      status_fandi: statusFinalId,
      updated_at: new Date().toISOString()
    },
    raw_payload: body // Payload original para debug técnico
  });

  if (logError) debugLog("FALHA AO INSERIR AUDITORIA", logError);

  /**
   * 7. ATUALIZAÇÃO DO ESTADO DA SIMULAÇÃO (simulations)
   */
  const { error: updateError } = await supabase
    .from('simulations')
    .update({ 
      status_id: statusFinalId, 
      financial_institution_id: financialInstId,
      updated_at: new Date().toISOString() 
    })
    .eq('id', simulation.id);

  if (updateError) {
    debugLog("ERRO NO UPDATE FINAL", updateError);
    return new Response("Internal Error", { status: 500 });
  }

  debugLog("WEBHOOK PROCESSADO COM SUCESSO", { fandi_id: codigoProposta });
  return new Response("OK", { status: 200 });
}