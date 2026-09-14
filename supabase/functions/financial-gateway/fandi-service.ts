/**
 * @fileoverview FANDI SERVICE - MOTOR DE INTEGRAÇÃO BANCÁRIA
 * @path supabase/functions/financial-gateway/fandi-service.ts
 * 
 * ============================================================================
 * 🤖 GEMINI ARCHITECTURE SPECIFICATION: HIGH-PERFORMANCE GATEWAY INTEGRATION
 * ============================================================================
 * [MUDANÇAS ARQUITETURAIS - OTIMIZAÇÃO E RESILIÊNCIA]:
 * 1. {Micro-otimização de CPU}: Expressões Regulares (Regex) de limpeza de 
 *    CPF/CNPJ e Telefone foram centralizadas no topo (Sanitização Preemptiva).
 * 2. {Serverless Stability}: Uso obrigatório de `await` em chamadas de side-effect 
 *    (como alertas) para evitar que o Deno/Edge Runtime mate a função 
 *    prematuramente.
 * 3. {DRY Pattern}: Implementação do `buildErrorResponse` para padronizar a 
 *    saída de falhas de rede/API, enxugando dezenas de linhas repetitivas.
 * 4. {Síncrono por Negócio}: A Inclusão (Passo 5) é mantida síncrona intencionalmente
 *    para garantir que a proposta conste no CRM do lojista antes do feedback ao cliente.
 * 
 * @author Cesar Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { 
  SimulationResponse,
  Consultation, 
  SimulationPayload,
  SimulationFinancials, 
  Seller
} from "../_shared/types.ts";

import { Entity, Offer } from "../_shared/types.ts";
import { generateSignature } from '../_shared/crypto.ts';
import { generateUserEmailNotificationHtml } from "./fandi-notifications.ts";
import { sendSystemAlert } from "../_shared/alert.ts";
import { debugLog } from "../_shared/logger.ts";
import { validateOfferMarginBounds } from "../_shared/simulation-bounds.ts";

/**
 * ============================================================================
 * 🧮 HELPERS DE NEGÓCIO
 * ============================================================================
 */

/**
 * Gera um CPF válido a partir de um ID de vendedor (seller_id) preenchendo
 * com zeros à esquerda e calculando os dois dígitos verificadores (DV).
 * Obrigatório para aprovação de GUID caso a política do lojista exija.
 */
function generateCpfFromSellerId(sellerId: string | number): string {
  const base = String(sellerId || "").replace(/\D/g, "").padStart(9, '0').slice(-9);
  let sum1 = 0;
  for (let i = 0; i < 9; i++) sum1 += parseInt(base[i], 10) * (10 - i);
  let dv1 = (sum1 % 11) < 2 ? 0 : 11 - (sum1 % 11);

  let sum2 = 0;
  for (let i = 0; i < 9; i++) sum2 += parseInt(base[i], 10) * (11 - i);
  sum2 += dv1 * 2;
  let dv2 = (sum2 % 11) < 2 ? 0 : 11 - (sum2 % 11);
  return base + dv1 + dv2;
}


/**
 * ============================================================================
 * 🚀 ORQUESTRADOR PRINCIPAL (FANDI PIPELINE)
 * ============================================================================
 */
export async function processSimulationFandi(
  payload: any,
  trustedRules: Record<string, any>,
  supabase: any,
): Promise<SimulationResponse> {

  // --------------------------------------------------------------------------
  // 0. 🛡️ ZERO-TRUST GUARD: VALIDAÇÃO DE INTEGRIDADE FINANCEIRA
  // --------------------------------------------------------------------------
  // Valida requested_value/down_payment ANTES de qualquer chamada à API real da
  // Fandi — contra `trustedRules` (resolvido server-side em simulation-handler.ts,
  // nunca `payload.rules` cru, que pode ter sido influenciado pelo cliente).
  validateOfferMarginBounds(trustedRules, payload.offer, payload.simulation_details);

  // --------------------------------------------------------------------------
  // 1. EXTRAÇÃO PADRONIZADA DE ESTADO
  // --------------------------------------------------------------------------
  const simulation = (payload.simulation_details as SimulationFinancials) || {};
  const entity = (payload.entity as Entity) || {};
  const offer = (payload.offer as Offer) || {};
  const seller = (payload.seller as Seller) || {};
  const integrationDetails = payload?.integration_details || {};
  
  const FANDI_API_KEY = Deno.env.get("FANDI_API_KEY");
  const CNPJ_LOJA = integrationDetails.cnpjLoja; 
  const MASTER_SECRET = Deno.env.get('WEBHOOK_MASTER_SECRET');

  if (!FANDI_API_KEY) throw new Error("FANDI_API_KEY não encontrada no ambiente.");

  // 🔥 [MICRO-OTIMIZAÇÃO DE CPU]: Sanitização Preemptiva
  // Evita rodar Regex pesadas dentro da construção repetitiva de objetos JSON
  const safeCpfCnpj = (entity.document || "").replace(/\D/g, "");
  const safePhone = (entity.phone || "").replace(/\D/g, "");

  // --------------------------------------------------------------------------
  // 2. ASSINATURA DE WEBHOOK (HMAC SECURITY)
  // --------------------------------------------------------------------------
  const simulationId = payload.simulation_id;
  const simulationUpdateId = crypto.randomUUID();
  const timestamp = Date.now().toString(); 
  
  // Lacramos a identidade da simulação e o momento do envio para evitar ataques de replay
  const payloadToSign = `${payload.simulation_id}.${simulationUpdateId}.${timestamp}`;
  const signature = await generateSignature(payloadToSign, MASTER_SECRET);

  const webhookBase = "https://ldzutiojmcawhwdhojlo.supabase.co/functions/v1/financial-gateway-webhook/fandi";
  const WEBHOOK_URL = `${webhookBase}/${simulationId}/${simulationUpdateId}/${timestamp}/${signature}`;

  const GUID_URL = 'https://core.fandi.com.br/v2/checkout/obter-guid';

  const codigoParceiro = `${payload.event.event_id}/${payload.offer.offer_id}`;
  const sellerId = payload.seller?.seller_id;
  const SEND_CPF_VENDEDOR = false;
  const cpfVendedor = (SEND_CPF_VENDEDOR && sellerId) ? generateCpfFromSellerId(sellerId) : null;

  // ==========================================================================
  // 🌐 PASSO 1: SOLICITAÇÃO DE GUID (HANDSHAKE INICIAL)
  // Cria a sessão de checkout vinculando o cliente ao lojista.
  // ==========================================================================
  const bodyGuid = { 
    config: { 
      chaveAcesso: FANDI_API_KEY, 
      cnpjLoja: CNPJ_LOJA, 
      urlCallback: WEBHOOK_URL,
      confirmarDados: [], 
      exibeTelaFinalizacao: false,
      ...(codigoParceiro ? { codigoParceiro } : {}),
      ...(cpfVendedor ? { cpfVendedor: cpfVendedor.replace(/\D/g, "") } : {})
    },
    cliente: {
      nome: entity.name,
      cpfCnpj: safeCpfCnpj, // Aplicação de variável sanitizada
      dataNascimento: entity.birth_date, 
      celular: safePhone,   // Aplicação de variável sanitizada
      sexo: entity.gender || "M",
      possuiCnh: true,
      usoComercial: false,
      pcd: false,
      usoTaxi: false
    },
    simulacao: { 
      valorEntrada: simulation.down_payment_amount, 
      quantidadeParcelas: simulation.installments 
    },
    veiculo: {
      modeloId: null, 
      valorVeiculo: simulation.requested_value || offer?.offer_value || 0,
      zeroKm: false,
      anoFabricacao: offer.vehicle_details?.manufacture_year,
      anoModelo: offer.vehicle_details?.model_year,
      fipe: offer.vehicle_details?.fipe_code
    }
  };
  
  let guidResult;
  try {
    const guidResponse = await fetch(GUID_URL, { 
      method: 'POST', 
      headers: { 'Content-Type': 'application/json', 'fandi-tipo-servico': 'checkout' }, 
      body: JSON.stringify(bodyGuid) 
    });
    guidResult = await guidResponse.json();
  } catch (error: any) {
    debugLog("Erro de comunicação com Fandi (GUID).", bodyGuid);
    return buildErrorResponse(8, "Erro de comunicação com Fandi (GUID).", simulation, error);
  }

  // Tratamento específico de Regras de Negócio na geração do GUID
  if (!guidResult.retorno) {
    const apiMessage = guidResult.message || "Falha ao gerar GUID.";
    const isVendedorErro = apiMessage.includes("Problema ao consultar o CPF do Vendedor pela API: Usuário não existe.");
    const isModeloMolicarErro = apiMessage.includes("Código do modelo (Fandi) ou Molicar inválido(s).");

    if (isVendedorErro || isModeloMolicarErro) {
      const errorTitle = isVendedorErro ? "Vendedor não cadastrado na Fandi" : "Código do modelo Fipe ou Molicar inválido";
      
      // ⚠️ [SERVERLESS STABILITY]: Await obrigatório.
      // Se não aguardarmos, a Edge Function morre no 'return' seguinte, descartando o alerta.
      await sendSystemAlert(supabase, {
        context: isVendedorErro ? "fandi-service: SELLER_NOT_FOUND" : "fandi-service: INVALID_FIPE_OR_MOLICAR",
        subject: `Alerta Fandi: ${errorTitle} ⚠️`,
        message: apiMessage,
        visit_id: payload.visit_id || null,
        visit_update_id: payload.visit_update_id || null,
        simulation_id: payload.simulation_id || null,
        simulation_update_id: payload.simulation_update_id || null,
        rawPayload: { erro: apiMessage, codigo_parceiro: codigoParceiro, seller_id: sellerId, fipe_code: offer.vehicle_details?.fipe_code }
      });
    }
    return buildErrorResponse(8, apiMessage, simulation, bodyGuid);
  }

  const guid = guidResult.retorno;

  // ==========================================================================
  // 🔑 PASSO 2: OBTENÇÃO DE CONTEXTO E TOKEN (AUTORIZAÇÃO)
  // Recupera o endpoint específico de processamento e o JWT da sessão.
  // ==========================================================================
  let contextData;
  try {
    const contextResponse = await fetch(`https://core.fandi.com.br/v2/checkout`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', 'fandi-tipo-servico': 'checkout', 'apikey': guid }
    });
    const responseText = await contextResponse.text();
    if (!contextResponse.ok) throw new Error(`FANDI_HTTP_${contextResponse.status}: ${responseText}`);
    contextData = JSON.parse(responseText);
  } catch (error: any) {
    return buildErrorResponse(8, "Erro de conexão ao recuperar contexto Fandi.", simulation, error);
  }
  
  if (!contextData || !contextData.retorno) {
    return buildErrorResponse(8, "Falha na estrutura de contexto da Fandi.", simulation, bodyGuid);
  }

  const dr = contextData.retorno;
  const urlFandi = dr.urlFandi; 
  const tokenAcesso = dr.tokenAcesso; 

  // ==========================================================================
  // ⚡ PASSO 4: SIMULAÇÃO (CÁLCULO REAL NO MOTOR FANDI)
  // Substitui estimativas do front-end por juros reais do banco.
  // ==========================================================================
  const bodySimulacao = {
    cliente: {
      nome: entity.name || "",
      celular: safePhone,   // Aplicação de variável sanitizada
      cpfCnpj: safeCpfCnpj, // Aplicação de variável sanitizada
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
      chassi: "", cor: "",
      modeloId: dr.veiculo?.modelo?.modeloId,
      placa: "", quilometragem: 0, renavam: "",      
      valor: simulation.requested_value,
      zeroKm: false,
      fipe: offer.vehicle_details?.fipe_code, 
      fabricante: dr.veiculo?.fabricante?.fabricanteId || 0,
      codigoParceiro: dr.veiculo?.codigoParceiro || ""
    }
  };

  let simResult;
  try {
      const simResponse = await fetch(`${urlFandi}/v2/checkout/simulacao`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'fandi-tipo-servico': 'checkout', 'ApiKey': guid },
          body: JSON.stringify(bodySimulacao)
      });
      simResult = await simResponse.json();
  } catch (error: any) {
      return buildErrorResponse(8, "Erro de rede na simulação", simulation, error);
  }

  if (!simResult) {
    return buildErrorResponse(8, "Resposta da Fandi vazia.", simulation, bodySimulacao);
  }

  // 4.1 Máquina de Estados da Simulação
  const retSimulacao = simResult.retorno; 
  const hasRetorno = retSimulacao !== null && retSimulacao !== undefined;
  const isAprovada = retSimulacao?.preAprovado === true;
  const isNegadaNegocio = !hasRetorno && !!simResult.message;

  // 4.2 Consolidação de Dados
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

  // 🛡️ GUARD CLAUSE: Interrompe fluxo se o banco negou a simulação ou ocorreu falha grave.
  if (dadosSimulacao.status_id !== 1) {
    const consultaNegadaOuFalha: Consultation = {
      status_id: dadosSimulacao.status_id,
      is_selected: true,
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
          success: dadosSimulacao.status_id === 2, 
          message: dadosSimulacao.mensagem,
          consults: [consultaNegadaOuFalha],
          raw: { simulacao: simResult }
      } as SimulationResponse;
  }


  // ==========================================================================
  // 💾 PASSO 5: INCLUSÃO (CONFIRMAÇÃO NO CRM DA FANDI)
  // Só alcança esta etapa se a simulação foi previamente aprovada (status_id = 1).
  // ==========================================================================
  let externalOperationId = null;
  let incResult = null;

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
              cor: null, chassi: null, renavam: null, placa: null, molicar: null,
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
      
      const incResponse = await fetch(`${urlFandi}/v2/checkout/inclusao`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'fandi-tipo-servico': 'checkout',
              'ApiKey': guid,
              'Authorization': `Bearer ${tokenAcesso}`
          },
          body: JSON.stringify(bodyInclusao)
      });

      incResult = await incResponse.json();

      if (incResponse.ok) {
          externalOperationId = incResult.retorno;
      } else {
          // Fallback Técnico: Se Inclusão falhou, a simulação não é considerada concretizada.
          if (dadosSimulacao.status_id === 1) {
              dadosSimulacao.status_id = 8;
              dadosSimulacao.mensagem = incResult.message || "Erro no registro da proposta (Inclusão).";
          }
      }
  } catch (error: any) {
      if (dadosSimulacao.status_id === 1) {
          dadosSimulacao.status_id = 8;
          dadosSimulacao.mensagem = "Falha na inclusão na Fandi.";
      }
  }

  // ==========================================================================
  // 🏁 ENVELOPAMENTO FINAL DA RESPOSTA (SUCCESS STATE)
  // ==========================================================================
  const consultaIndividual: Consultation = {
    status_id: dadosSimulacao.status_id,
    is_selected: true,
    external_operation_id: externalOperationId,
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

  // Preparação de Notificações (Só notifica se a inclusão também passou limpa)
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

  return {
    success: dadosSimulacao.status_id === 1 || dadosSimulacao.status_id === 2,
    message: dadosSimulacao.mensagem,
    consults: [consultaIndividual],
    raw: {
      simulacao: simResult,
      inclusao: incResult,
      notifications: notificationsConfig
    }
  } as SimulationResponse;
}

/**
 * ============================================================================
 * ♻️ HELPERS DE ARQUITETURA
 * ============================================================================
 */

/**
 * [DRY PATTERN]: Construtor padronizado de respostas de erro da Fandi.
 * Centraliza o envelopamento de falhas de rede, parse JSON ou recusas não mapeadas,
 * garantindo compatibilidade estrita com a interface `SimulationResponse`.
 */
function buildErrorResponse(statusId: number, message: string, simulation: any, rawData: any): SimulationResponse {
  return { 
    success: false, 
    message: message,
    consults: [{
      status_id: statusId,
      is_selected: true,
      external_operation_id: null,
      message: message,
      financial_institution_id: null,
      financial_institution_name: null,
      requested_value: simulation.requested_value || null,
      down_payment_amount: simulation.down_payment_amount || null,
      down_payment_percentage: simulation.down_payment_amount && simulation.requested_value ? (simulation.down_payment_amount / simulation.requested_value) * 100 : null,
      financed_amount: simulation.requested_value ? (simulation.requested_value - (simulation.down_payment_amount ?? 0)) : null,
      installments: simulation.installments || null,
      cet_rate: null,
      installment_value: null
    }],
    raw: rawData
  } as SimulationResponse;
}