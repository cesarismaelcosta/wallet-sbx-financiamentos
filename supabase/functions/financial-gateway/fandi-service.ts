/**
 * FANDI SERVICE - MOTOR DE INTEGRAÇÃO BANCÁRIA
 * @author Cesar Ismael
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

import { 
  SimulationResponse,
  Consultation, 
  SimulationPayload,
  SimulationFinancials 
} from "../_shared/types.ts";

import { Entity, Offer } from "../_shared/types.ts";

// Importa a função geradora de hash para assinatura do webhook
import { generateSignature } from '../_shared/crypto.ts';

// Importa a função geradora de e-mail de usuários (Template de Veículos Fandi)
import { generateUserEmailNotificationHtml } from "./fandi-notifications.ts";

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
 * @param payload Dados sanitizados vindos do simulation_handler
 * * @returns {Promise<SimulationResponse>} Retorno envelopado estritamente aderente ao contrato técnico do core..
 */
export async function processSimulationFandi(payload: any): Promise<SimulationResponse> {

  // EXTRAÇÃO PADRONIZADA
  const simulation = (payload.simulation_details as SimulationFinancials) || {};
  const entity = (payload.entity as Entity) || {};
  const offer = (payload.offer as Offer) || {};

  // Configurações do parceiro (com fallback para segurança)
  const integrationDetails = payload?.integration_details || {};
  
  // Chave de intefação
  const FANDI_API_KEY = Deno.env.get("FANDI_API_KEY");

  // Registra log no Supabase se ligado
  debugLog("DEBUG integration_details:", integrationDetails);
  debugLog("DEBUG payload:", payload);
  debugLog("DEBUG offer:", offer);
  debugLog("DEBUG entity:", entity);

  // CNPJ DE ACORDO COM O PRODUTO (LEVES E PESADOS)
  const CNPJ_LOJA = integrationDetails.cnpjLoja; 

  // ----------------------------------------------------------------------
  // URL DE WEBHOOK (CALLBACK)
  // ----------------------------------------------------------------------

  // Pega a chave mestra das variáveis de ambiente do Supabase
  const MASTER_SECRET = Deno.env.get('WEBHOOK_MASTER_SECRET');
  if (!MASTER_SECRET) throw new Error("Missing WEBHOOK_MASTER_SECRET");

  // Cria a string que será "lacrada" (visit_id + simulation_id)
  const payloadToSign = `${payload.visit_id}:${payload.simulation_id}`;

  // Gera a assinatura digital
  const signature = await generateSignature(payloadToSign, MASTER_SECRET);

  // Monta a URL injetando a assinatura na query string
  const webhookBase = integrationDetails.urlCallback; 
  const WEBHOOK_URL = `${webhookBase}/${payload.simulation_id}/${signature}`;

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
      nome: entity.name,
      cpf: entity.document,
      dataNascimento: entity.birth_date, 
      celular: (entity.phone || "").replace(/\D/g, ""),
      sexo: entity.gender || "M",
      possuiCnh: true,
      usoComercial: false,
      pcd: false,
      usoTaxi: false
    },
    simulacao: { 
      // Agora acessamos via payload.simulation_params
      valorEntrada: simulation.down_payment_amount, 
      quantidadeParcelas: simulation.installments 
    },
    veiculo: {
      modeloId: null, 
      // Agora acessamos via payload.offer
      valorVeiculo: simulation.requested_value || offer?.offer_value || 0,
      zeroKm: false,
      // Pegando os anos reais que vieram no vehicle_details
      anoFabricacao: offer.vehicle_details?.manufacture_year,
      anoModelo: offer.vehicle_details?.model_year,
      fipe: offer.vehicle_details?.fipe_code
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
    } as SimulationResponse;
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
    } as SimulationResponse;
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
          requested_value: simulation.requested_value,
          down_payment_amount: simulation.down_payment_amount,
          down_payment_percentage: simulation.down_payment_percentage,
          financed_amount: simulation.requested_value ? (simulation.requested_value - (simulation.down_payment_amount ?? 0)) : null,
          installments: simulation.installments,
          cet_rate: null,
          installment_value: null
        }],
        raw: { error: error.message }
    } as SimulationResponse;
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
          requested_value: simulation.requested_value,
          down_payment_amount: simulation.down_payment_amount,
          down_payment_percentage: simulation.down_payment_percentage,
          financed_amount: simulation.requested_value ? (simulation.requested_value - (simulation.down_payment_amount ?? 0)) : null,
          installments: simulation.installments,
          cet_rate: null,
          installment_value: null
        }],
        raw: bodyGuid
    } as SimulationResponse;
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
      nome: entity.name || "",
      celular: (entity.phone || "").replace(/\D/g, ""), 
      cpf: (entity.document || "").replace(/\D/g, ""),
      email: entity.email || "",
      sexo: entity.gender || "M",
      dataNascimento: entity.birth_date, 
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
      valorEntrada: simulation.down_payment_amount, 
      quantidadeParcelas: simulation.installments 
    },
    veiculo: {
      anoFabricacao: offer.vehicle_details?.manufacture_year,
      anoModelo: offer.vehicle_details?.model_year,
      chassi: "",
      cor: "",
      modeloId: dr.veiculo?.modelo?.modeloId,
      placa: "",
      quilometragem: 0,
      renavam: "",       
      valor: simulation.requested_value,
      zeroKm: false,
      fipe: offer.vehicle_details?.fipe_code, 
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
            requested_value: simulation.requested_value,
            down_payment_amount: simulation.down_payment_amount,
            down_payment_percentage: simulation.down_payment_percentage,
            financed_amount: simulation.requested_value ? (simulation.requested_value - (simulation.down_payment_amount ?? 0)) : null,
            installments: simulation.installments,
            cet_rate: null,
            installment_value: null
          }],
          raw: { error: error.message }
      } as SimulationResponse;
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
          requested_value: simulation.requested_value,
          down_payment_amount: simulation.down_payment_amount,
          down_payment_percentage: simulation.down_payment_percentage,
          financed_amount: simulation.requested_value ? (simulation.requested_value - (simulation.down_payment_amount ?? 0)) : null,
          installments: simulation.installments,
          cet_rate: null,
          installment_value: null
        }],
        raw: bodySimulacao
    } as SimulationResponse;
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
    requested_value: simulation.requested_value || null,
    down_payment_amount: retSimulacao?.valorEntrada ?? simulation.down_payment_amount,
    financed_amount: retSimulacao?.valorFinanciado ?? ((simulation.requested_value ?? 0) - (simulation.down_payment_amount ?? 0)),
    installments: retSimulacao?.quantidadeParcelas ?? simulation.installments,
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
      } as SimulationResponse;
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
              valor: simulation.requested_value,
              zeroKm: false,
              anoFabricacao: offer.vehicle_details?.manufacture_year,
              anoModelo: offer.vehicle_details?.model_year,
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

  // Gera o HTML do e-mail APENAS SE a simulação for Aprovada (status_id === 1)
  // Não enviaremos e-mails para erros ou clientes negados, conforme sua regra.
  let notificationsConfig = [];
  if (dadosSimulacao.status_id === 1) {
    const emailTemplateData = generateUserEmailNotificationHtml([consultaIndividual], payload);
    
    notificationsConfig.push({
      channel: 'email',
      template_slug: 'fandi-simulation-result',
      recipient_type: "ENTITY",
      recipient: payload.entity?.email,
      subject: "Sua simulação de financiamento na Superbid 🚗",
      email_body: emailTemplateData.html,
      attachments: emailTemplateData.attachments 
    });
  }

  // Retornamos o Envelope PartnerResponse embora Fandi só tenha uma consulta, para manter a consistência com o contrato do serviço de cartão que pode ter múltiplas linhas.
  return {
    success: dadosSimulacao.status_id === 1 || dadosSimulacao.status_id === 2,  // success é true apenas se for Aprovada (1) ou Negada (2). Se for Falha (8), o success será false.
    message: dadosSimulacao.mensagem,                                           // Propaga a mensagem do banco para o envelope
    consults: [consultaIndividual], // Array com a consulta realizada
    raw: {
      simulacao: simResult,
      inclusao: incResult,
      notifications: notificationsConfig
    }
  } as SimulationResponse;

}