/**
 * FANDI SERVICE - MOTOR DE INTEGRAÇÃO BANCÁRIA
 * @author Engenharia Wallet sbX / Cesar Ismael
 * @description Módulo responsável pela orquestração do pipeline de crédito com o parceiro Fandi.
 * Implementa o ciclo de vida completo: Identificação (GUID) -> Autorização (Token) -> Proposta (Simulação) -> Registro (Inclusão).
 * * * --- WORKFLOW DE INTEGRAÇÃO ---
 * 1. OBTENÇÃO DE GUID: Handshake inicial para abertura de sessão de checkout.
 * 2. RECUPERAÇÃO DE CONTEXTO: Captura dinâmica de parâmetros do PDV (Ponto de Venda) e Token JWT.
 * 3. SIMULAÇÃO ATIVA: Disparo da proposta para o motor de crédito da Fandi.
 * 4. INCLUSÃO E WEBHOOK: Persistência da proposta no parceiro e registro da URL de callback para feedback assíncrono.
 * 
 * DOCUMENTAÇÕES DISPONÍVEIS:
 * https://doc.clickup.com/3006379/p/h/2vqxb-44723/6811ecf4e4aafcf
 * https://api-hml.fandi.com.br/comercial/swagger/index.html
 * 
 * CHECKOUT DE TESTE:
 * https://checkout.fandi.com.br/test-drive
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
 * @interface Consultation
 * @description Representa cada linha de consulta individual (Marketplace).
 * Cada item aqui será uma linha na tabela 'simulation_consults'.
 */
interface Consultation {
  status_id: number;                    // ID sbX (1: Aprovado, 2: Negado, 8: Falha)
  is_selected: boolean;                 // Indica se esta consulta foi a escolhida pelo usuário (relevante para múltiplas opções) 
  external_operation_id: string | null; // ID no parceiro (proposta)
  message: string;                      // Mensagem do banco/parceiro
  
  // Barramento Financeiro Específico desta Consulta
  financial_institution_id: number | null;
  financial_institution_name: string | null;
  requested_value: number | null;
  down_payment_amount: number | null;
  down_payment_percentage: number | null;
  financed_amount: number | null;
  installments: number | null;
  cet_rate: number | null;
  installment_value: number | null;
}

/**
 * @interface PartnerResponse
 * @description O Envelope que o fandi-service ou credit-card-service retorna.
 */
interface PartnerResponse {
  success: boolean;            // A integração (handshake) funcionou?
  message: string;             // Resumo da operação do serviço
  consults: Consultation[];    // Lista de todas as consultas realizadas
  // Audit Trail individual para esta linha
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
    console.log(`[FANDI-DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

/**
 * FLUXO PRINCIPAL DE SIMULAÇÃO E INCLUSÃO
 * @param payload Dados sanitizados vindos do simulation_handler.
 */
export async function processarFluxoFandi(payload: any) {

  // Chave de intefação
  const FANDI_API_KEY = Deno.env.get("FANDI_API_KEY");

  // Configurações do parceiro (com fallback para segurança)
  const integrationDetails = payload?.integration_details || {};

  // Registra log no Supabase se ligado
  debugLog("DEBUG integration_details:", integrationDetails);

  // CNPJ DE ACORDO COM O PRODUTO (LEVES E PESADOS)
  const CNPJ_LOJA = integrationDetails.cnpjLoja; 
  // URL DE WEBHOOK (CALLBACK)
  const webhookBase = integrationDetails.urlCallback; 
  const WEBHOOK_URL =
    `${webhookBase}` +
    `/${payload.simulation_id}`;

  // Registra log no Supabase se ligado
  debugLog("DEBUG WEBHOOK_URL:", WEBHOOK_URL);

  if (!FANDI_API_KEY) throw new Error("FANDI_API_KEY não encontrada no ambiente.");

  // Registra log no Supabase se ligado
  debugLog("DEBUG PAYLOAD RECEBIDO:", JSON.stringify(payload, null, 2));

  const GUID_URL = 'https://core.fandi.com.br/v1/checkout/obter-guid';

  /**
   * PASSO 1: SOLICITAÇÃO DE GUID
   * Cria a sessão de checkout vinculando o cliente ao lojista.
   */
  const bodyGuid = { 
    config: { 
      chaveAcesso: FANDI_API_KEY, 
      cnpjLoja: CNPJ_LOJA, 
      confirmarDados: [], 
      exibeTelaFinalizacao: false
    },
    cliente: {
      // Agora acessamos via payload.entity
      nome: payload.name,
      cpf: payload.document,
      dataNascimento: payload.birth_date, 
      celular: (payload.phone || "").replace(/\D/g, ""),
      sexo: payload.gender || "M",
      possuiCnh: true,
      usoComercial: false,
      pcd: false,
      usoTaxi: false
    },
    simulacao: { 
      // Agora acessamos via payload.simulation_params
      valorEntrada: payload.down_payment_amount, 
      quantidadeParcelas: payload.installments 
    },
    veiculo: {
      modeloId: null, 
      // Agora acessamos via payload.offer
      valorVeiculo: payload.requested_value || payload.offer?.offer_value || 0,
      zeroKm: false,
      // Pegando os anos reais que vieram no vehicle_details
      anoFabricacao: payload.offer_details?.vehicle_details?.manufacture_year,
      anoModelo: payload.offer_details?.vehicle_details?.model_year,
      fipe: payload.offer_details?.vehicle_details?.fipe_code
    }
  };

  // Registra log no Supabase se ligado
  debugLog("ENVIO CONSULTA GUID:", bodyGuid);
  
  let guidResult;
  try {
    const guidResponse = await fetch(GUID_URL, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json', 'fandi-tipo-servico': 'checkout' }, 
      body: JSON.stringify(bodyGuid) 
    });
    
    guidResult = await guidResponse.json();
  } catch (error: any) {
    // Erro no fetch ou no parse do JSON (Falha técnica real)
    debugLog("Erro de comunicação com Fandi (GUID).", bodyGuid);
    return { 
        success: false, 
        message: "Erro de comunicação com Fandi (GUID).",
        consults: [{
          status_id: 8,
          is_selected: true,
          external_operation_id: null,
          message: "Erro de comunicação com Fandi (GUID).",
          financial_institution_id: null,
          financial_institution_name: null,
          requested_value: null,
          down_payment_amount: null,
          down_payment_percentage: null,
          financed_amount: null,
          installments: null,
          cet_rate: null,
          installment_value: null
        }],
        raw: { error: error.message }
    } as PartnerResponse;
  }

  if (!guidResult.retorno) {
    // Fandi respondeu, mas não entregou o GUID (Ainda é falha técnica neste passo)
    debugLog("Falha ao gerar GUID.", bodyGuid);
    return { 
        success: false, 
        message: guidResult.message || "Falha ao gerar GUID.",
        consults: [{
          status_id: 8,
          is_selected: true,
          external_operation_id: null,
          message: guidResult.message || "Falha ao gerar GUID.",
          financial_institution_id: null,
          financial_institution_name: null,
          requested_value: null,
          down_payment_amount: null,
          down_payment_percentage: null,
          financed_amount: null,
          installments: null,
          cet_rate: null,
          installment_value: null
        }],
        raw: bodyGuid
    } as PartnerResponse;
  }

  const guid = guidResult.retorno;

  // Registra log no Supabase se ligado
  debugLog("RETORNO CONSULTA GUID: ", bodyGuid);

  /**
   * PASSO 3: OBTENÇÃO DE CONTEXTO E TOKEN
   * Recupera o endpoint específico da Fandi e o Token de Autorização JWT para esta sessão.
   */
  let contextData;
  try {
    const contextResponse = await fetch(`https://core.fandi.com.br/v1/checkout/${guid}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'fandi-tipo-servico': 'checkout', 'chave-acesso': FANDI_API_KEY! }
    });

    contextData = await contextResponse.json();
  } catch (error: any) {
    // Erro de conexão ou parse do JSON
    debugLog("Erro de conexão ao recuperar contexto Fandi." , bodyGuid);
    return { 
        success: false, 
        message: "Erro de conexão ao recuperar contexto Fandi.",
        consults: [{
          status_id: 8,
          is_selected: true,
          external_operation_id: null,
          message: "Erro de conexão ao recuperar contexto Fandi.",
          financial_institution_id: null,
          financial_institution_name: null,
          requested_value: null,
          down_payment_amount: null,
          down_payment_percentage: null,
          financed_amount: null,
          installments: null,
          cet_rate: null,
          installment_value: null
        }],
        raw: { error: error.message }
    } as PartnerResponse;
  }
  
  if (!contextData || !contextData.retorno) {
    // Fandi respondeu, mas o contrato veio vazio ou inválido
    debugLog("Falha na estrutura de contexto da Fandi.", bodyGuid);
    return { 
        success: false, 
        message: "Falha na estrutura de contexto da Fandi.",
        consults: [{
          status_id: 8,
          is_selected: true,
          external_operation_id: null,
          message: "Falha na estrutura de contexto da Fandi.",
          financial_institution_id: null,
          financial_institution_name: null,
          requested_value: null,
          down_payment_amount: null,
          down_payment_percentage: null,
          financed_amount: null,
          installments: null,
          cet_rate: null,
          installment_value: null
        }],
        raw: bodyGuid
    } as PartnerResponse;
  }

  const dr = contextData.retorno;
  const urlFandi = dr.urlFandi; 
  const tokenAcesso = dr.tokenAcesso; 
  
  // Registra log no Supabase se ligado
  debugLog("RETORNO CONSULTA CONTEXT:", contextData);

  /**
   * PASSO 4: SIMULAÇÃO (CÁLCULO REAL)
   * Envia os dados para precificação real, substituindo as estimativas do front-end.
   */
  const bodySimulacao = {
    cliente: {
      nome: payload.name || "",
      celular: (payload.phone || "").replace(/\D/g, ""), 
      cpf: (payload.document || "").replace(/\D/g, ""),
      email: payload.email || "",
      sexo: payload.gender || "M",
      dataNascimento: payload.birth_date, 
      possuiCnh: true,
      usoComercial: false,
      pcd: false,
      usoTaxi: false
    },
    institucional: {
      empresaId: Number(dr.empresaId || 0),
      pontoVendaId: String(dr.pontoVendaId || ""),
      ...(dr.vendedorId && Number(dr.vendedorId) > 0 && { vendedorId: Number(dr.vendedorId) })
    },
    simulacao: { 
      valorEntrada: payload.down_payment_amount, 
      quantidadeParcelas: payload.installments 
    },
    veiculo: {
      anoFabricacao: payload.offer_details?.vehicle_details?.manufacture_year,
      anoModelo: payload.offer_details?.vehicle_details?.model_year,
      chassi: "",
      cor: "",
      modeloId: dr.veiculo?.modelo?.modeloId,
      placa: "",
      quilometragem: 0,
      renavam: "",       
      valor: payload.requested_value,
      zeroKm: false,
      fipe: payload.offer_details?.vehicle_details?.fipe_code, 
      fabricante: dr.veiculo?.fabricante?.fabricanteId || 0,
      codigoParceiro: dr.veiculo?.codigoParceiro || ""
    }
  };

  // Registra log no Supabase se ligado
  debugLog("ENVIO SIMULAÇÃO:", bodySimulacao);

  // 4.1. RECEBIMENTO E VALIDAÇÃO INICIAL
  let simResult;
  try {
      const simResponse = await fetch(`${urlFandi}/v1/checkout/simulacao`, {
          method: 'POST',
          headers: { 
              'Content-Type': 'application/json',
              'fandi-tipo-servico': 'checkout',
              'Authorization': tokenAcesso 
          },
          body: JSON.stringify(bodySimulacao)
      });
      simResult = await simResponse.json();
  } catch (error: any) {
      return { 
          success: false, 
          message: "Erro de rede na simulação",
          consults: [{
            status_id: 8,
            is_selected: true,
            external_operation_id: null,
            message: "Erro de rede na simulação",
            financial_institution_id: null,
            financial_institution_name: null,
            requested_value: null,
            down_payment_amount: null,
            down_payment_percentage: null,
            financed_amount: null,
            installments: null,
            cet_rate: null,
            installment_value: null
          }],
          raw: { error: error.message }
      } as PartnerResponse;
  }

  // Se não retornou objeto, considera erro
  if (!simResult) {
    return { 
        success: false, 
        message: "Resposta da Fandi vazia.",
        consults: [{
          status_id: 8,
          is_selected: true,
          external_operation_id: null,
          message: "Resposta da Fandi vazia.",
          financial_institution_id: null,
          financial_institution_name: null,
          requested_value: null,
          down_payment_amount: null,
          down_payment_percentage: null,
          financed_amount: null,
          installments: null,
          cet_rate: null,
          installment_value: null
        }],
        raw: bodySimulacao
    } as PartnerResponse;
  }

  // Registra log no Supabase se ligado
  debugLog("RETORNO SIMULAÇÃO:", simResult);

  // 4.2. DEFINIÇÃO DE VARIÁVEIS DE ESTADO (Declaradas uma única vez)
  const retSimulacao = simResult.retorno; 
  const hasRetorno = retSimulacao !== null && retSimulacao !== undefined;
  const isAprovada = retSimulacao?.preAprovado === true;
  const isNegadaNegocio = !hasRetorno && !!simResult.message;

  // 4.3. CONSOLIDAÇÃO DO OBJETO DE DADOS FINANCEIROS
  const dadosSimulacao = {
    status_id: isAprovada ? 1 : (isNegadaNegocio ? 2 : 8),
    pre_aprovado: isAprovada,
    mensagem: simResult.message || (isAprovada ? "Aprovada" : "Negada"),
    financial_institution_id: retSimulacao?.institucional?.instituicaoFinanceiraId ?? null,
    financial_institution_name: retSimulacao?.institucional?.nomeInstituicao ?? null,
    requested_value: (Number(retSimulacao?.valorEntrada) || 0) + (Number(retSimulacao?.valorFinanciado) || 0) || null,
    down_payment_amount: retSimulacao?.valorEntrada ?? null,
    financed_amount: retSimulacao?.valorFinanciado ?? null,
    installments: retSimulacao?.quantidadeParcelas ?? null,
    cet_rate: retSimulacao?.simulacao?.taxa?.taxaCetMes ?? null,
    installment_value: retSimulacao?.valorParcela ?? null,
    veiculo_modelo: retSimulacao?.veiculo?.modelo ?? null,
    veiculo_fabricante: retSimulacao?.veiculo?.fabricante ?? null,
    veiculo_familia: retSimulacao?.veiculo?.familia ?? null,
    estado_licenciamento: retSimulacao?.estadoLicenciamento ?? null
  };

  // 4.4. TRAVA DE FLUXO (Interrompe se não for Status 1 - Aprovada)
  // Se for Negada (2) ou Falha (8), envelopa corretamente seguindo o PartnerResponse
  if (dadosSimulacao.status_id !== 1) {
    const consultaNegadaOuFalha: Consultation = {
      status_id: dadosSimulacao.status_id,
      is_selected: true, // Como só temos uma opção com a Fandi, esta é a selecionada por definição
      external_operation_id: null,
      message: dadosSimulacao.mensagem,
      financial_institution_id: dadosSimulacao.financial_institution_id,
      financial_institution_name: dadosSimulacao.financial_institution_name,
      requested_value: dadosSimulacao.requested_value,
      down_payment_amount: dadosSimulacao.down_payment_amount,
      down_payment_percentage: ((Number(dadosSimulacao.down_payment_amount) || 0) / (dadosSimulacao.requested_value || 1)) * 100,
      financed_amount: dadosSimulacao.financed_amount,
      installments: dadosSimulacao.installments,
      cet_rate: dadosSimulacao.cet_rate,
      installment_value: dadosSimulacao.installment_value,
    };

      return { 
            success: dadosSimulacao.status_id === 2, // true se for negada de negócio, false se for falha técnica (8)
            message: dadosSimulacao.mensagem,
            consults: [consultaNegadaOuFalha],
            raw: { simulacao: simResult }
      } as PartnerResponse;
  }

  // =========================================================================
  // PASSO 5: INCLUSÃO (EXECUTADA SEMPRE)
  // =========================================================================

  let externalOperationId = null;
  let incResult = null;

  /**
   * Só tentamos a inclusão se o status for 1 ou 2.
   * (Aprovada ou Negada, mas com dados presentes).
   */
  try {
      const bodyInclusao = {
          guid: guid,
          clienteId: retSimulacao?.clienteId,
          urlCallback: WEBHOOK_URL,
          veiculo: {
              modeloId: dr.veiculo?.modelo?.modeloId || null,
              estadoLicenciamento: retSimulacao?.estadoLicenciamento,
              valor: payload.requested_value,
              zeroKm: false,
              anoFabricacao: payload.offer_details?.vehicle_details?.manufacture_year,
              anoModelo: payload.offer_details?.vehicle_details?.model_year,
              quilometragem: 0,
              cor: null,
              chassi: null,
              renavam: null,
              placa: null,
              molicar: null,
              fabricante: retSimulacao?.veiculo?.fabricante || "",
              familia: retSimulacao?.veiculo?.familia || "",
              modelo: retSimulacao?.veiculo?.modelo || ""
          },
          simulacao: {
              valorEntrada: retSimulacao?.valorEntrada,
              quantidadeParcelas: retSimulacao?.quantidadeParcelas,
              retornoId: retSimulacao?.simulacao?.retornoId,
              possuiIntegracao: false,
              sistemaIntegrado: 0,
              sistemaEhPrecificacao: false,
              taxa: retSimulacao?.simulacao?.taxa,
              menuSelling: retSimulacao?.simulacao?.menuSelling
          },
          institucional: {
              empresaId: Number(dr.empresaId || 0),
              pontoVendaId: String(dr.pontoVendaId || ""),
              instituicaoFinanceiraId: retSimulacao?.institucional?.instituicaoFinanceiraId,
              ...(retSimulacao?.institucional?.vendedorId ? { vendedorId: Number(retSimulacao.institucional.vendedorId) } : {})
          }
      };

      
      // Registra log no Supabase se ligado
      debugLog("ENVIO INCLUSÃO:", bodyInclusao);

      const incResponse = await fetch(`${urlFandi}/v1/checkout/inclusao`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'fandi-tipo-servico': 'checkout',
              'Authorization': tokenAcesso
          },
          body: JSON.stringify(bodyInclusao)
      });

      incResult = await incResponse.json();

      // Registra log no Supabase se ligado
      debugLog("RETORNO INCLUSÃO:", incResult);

      if (incResponse.ok) {
          externalOperationId = incResult.retorno;
      } else {
          // Se a inclusão falhar tecnicamente (500/400) mas a simulação era aprovada,
          // marcamos como falha técnica (8). Se já era Negada (2), mantemos Negada.
          if (dadosSimulacao.status_id === 1) {
              dadosSimulacao.status_id = 8;
              dadosSimulacao.mensagem = incResult.message || "Erro no registro da proposta (Inclusão).";
          }
      }
  } catch (error: any) {
      debugLog("Falha na tentativa de inclusão.", error);
      if (dadosSimulacao.status_id === 1) {
          dadosSimulacao.status_id = 8;
          dadosSimulacao.mensagem = "Falha na inclusão na Fandi.";
      }
  }

  // =========================================================================
  // RETORNO CONSOLIDADO (NOVO CONTRATO)
  // =========================================================================

  // Definimos a consulta individual
  const consultaIndividual: Consultation = {
    status_id: dadosSimulacao.status_id,
    is_selected: true,                            // Como só temos uma opção com a Fandi, esta é a selecionada por definição
    external_operation_id: externalOperationId,
    message: dadosSimulacao.mensagem,

    // Barramento Financeiro Padronizado
    financial_institution_id: dadosSimulacao.financial_institution_id,
    financial_institution_name: dadosSimulacao.financial_institution_name,
    requested_value: dadosSimulacao.requested_value,
    down_payment_amount: dadosSimulacao.down_payment_amount,
    down_payment_percentage: ((Number(dadosSimulacao.down_payment_amount) || 0) / (dadosSimulacao.requested_value || 1)) * 100,
    financed_amount: dadosSimulacao.financed_amount,
    installments: dadosSimulacao.installments,
    cet_rate: dadosSimulacao.cet_rate,
    installment_value: dadosSimulacao.installment_value,
  };

  // Retornamos o Envelope PartnerResponse embora Fandi só tenha uma consulta, para manter a consistência com o contrato do serviço de cartão que pode ter múltiplas linhas.
  return {
    success: dadosSimulacao.status_id === 1 || dadosSimulacao.status_id === 2,  // success é true apenas se for Aprovada (1) ou Negada (2). Se for Falha (8), o success será false.
    message: dadosSimulacao.mensagem,                                           // Propaga a mensagem do banco para o envelope
    consults: [consultaIndividual], // Array com a consulta realizada
    raw: {
      simulacao: simResult,
      inclusao: incResult
    }
  } as PartnerResponse;

}