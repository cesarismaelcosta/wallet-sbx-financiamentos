/**
 * =========================================================================
 * MOTOR DE CÁLCULO: SIMULAÇÃO DE CONDIÇÕES COMERCIAIS
 * =========================================================================
 * @module processarFluxoParceiro
 * @description Centraliza o pipeline de validação de fatores e simulação de parcelamento
 * para parceiros comerciais, encapsulando o resultado no formato esperado pelo simulation-handler.
 */

/**
 * @interface Consultation
 * @description Representa cada registro individual de simulação financeira gerado.
 * Mapeia diretamente as colunas e regras relacionais da tabela 'simulation_consults'.
 */
interface Consultation {
  status_id: number;                    // Status de processamento (1: Aprovado, 2: Negado, 8: Falha)
  is_selected: boolean;                 // Flag de controle se esta foi a opção escolhida pelo usuário
  external_operation_id: string | null; // Identificador exclusivo gerado para a simulação atual
  message: string;                      // Descritivo textual sobre o resultado da análise/cálculo
  
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
 * @description Envelope padronizado de transporte de dados consumido pelo simulation-handler.
 */
interface PartnerResponse {
  success: boolean;            // Indica se a execução e o handshake do serviço ocorreram sem exceções
  message: string;             // Resumo executivo da operação para fins de logs do barramento
  consults: Consultation[];    // Array contendo a lista de consultas e simulações processadas
  raw: any;                    // Payload bruto, snapshots de regras e trilha de auditoria (Audit Trail)
}

/**
 * CONFIGURAÇÕES TÉCNICAS E FLAGS DE AMBIENTE
 */
// Chave de controle global para exibição de rastros no console do servidor
const DEBUG_MODE = true;

/**
 * FUNÇÃO DE LOG PADRONIZADA
 * @description Captura informações estratégicas do pipeline sem expor dados em ambientes produtivos se a flag estiver inativa.
 */
const debugLog = (message: string, data?: any) => {
  if (DEBUG_MODE) {
    console.log(`[PARTNER-DEBUG] ${message}`, data ? JSON.stringify(data, null, 2) : "");
  }
};

/**
 * PROCESSAR FLUXO PARCEIRO
 * @async
 * @function processarFluxoParceiro
 * @param {any} payload Dados dinâmicos enviados pelo front-end contendo regras, prazos e valores.
 * @returns {Promise<PartnerResponse>} Retorno envelopado estritamente aderente ao contrato técnico do core.
 */
export async function processarFluxoParceiro(payload: any): Promise<PartnerResponse> {
  // Extração e higienização das variáveis de entrada do payload
  const rules = payload.rules;
  const installments = payload.installments || rules?.default_installments || 48;
  const requestedValue = payload.requested_value || payload.offer?.offer_value || 0;
  const downPayment = payload.down_payment_amount || 0;

  debugLog("Payload de entrada capturado para processamento:", {
    requested_value: requestedValue,
    down_payment_amount: downPayment,
    installments: installments
  });

  // Base do cálculo matemático: Valor Líquido que precisa ser financiado
  const amountToFinance = requestedValue - downPayment;
  const downPaymentPercent = requestedValue > 0 ? (downPayment / requestedValue) * 100 : 0;

  // 1. VALIDAÇÃO DE ENTRADA (O "Disjuntor" de Segurança)
  // Recupera o fator multiplicador mapeado na tabela dinamicamente por chave string
  const factor = rules?.payment_factors?.[String(installments)];

  debugLog("Resultado da busca de fatores no dicionário de regras:", {
    prazo: installments,
    fator: factor
  });

  // Se o prazo não estiver listado no JSON de regras do parceiro, corta a execução imediatamente
  if (factor === undefined || factor === null) {
    debugLog(`[BLOQUEIO] Prazo de ${installments}x não é permitido ou está sem fator cadastrado.`);
    
    return {
      success: false,
      message: `O prazo de ${installments} parcelas não está disponível para esta modalidade.`,
      consults: [
        {
          status_id: 8, // Falha de Negócio / Regra Não Atendida
          is_selected: false,
          external_operation_id: null,
          message: `Prazo inválido para a tabela de fatores do parceiro.`,
          
          // Barramento financeiro estruturado com segurança
          financial_institution_id: null,
          financial_institution_name: payload.page_configs?.partner?.name || null,
          requested_value: requestedValue,
          down_payment_amount: downPayment,
          down_payment_percentage: Number(downPaymentPercent.toFixed(2)),
          financed_amount: amountToFinance,
          installments: Number(installments),
          cet_rate: null,
          installment_value: null // Nulo porque o cálculo não pôde ser efetuado
        }
      ],
      // Trilha de depuração para correção rápida na retaguarda
      raw: { 
        error: "Invalid installments dictionary key", 
        requested: installments, 
        available_factors: rules?.payment_factors ? Object.keys(rules.payment_factors) : [] 
      }
    };
  }

  // 2. MOTOR DE CÁLCULO DE CONDIÇÃO COMERCIAL (Fluxo Autorizado)
  // Aplicação direta do fator sobre o montante financiado
  const installmentValue = amountToFinance * factor;

  debugLog(`Cálculo de parcela efetuado com sucesso. Valor resultante: R$ ${installmentValue}`);

  // 3. RETORNO PADRONIZADO E ENVELOPADO (Contrato Satisfeito)
  return {
    success: true,
    message: "Simulação de condições comerciais concluída com sucesso",
    consults: [
      {
        status_id: 1, // Sucesso / Condições Comerciais Geradas
        is_selected: true,
        external_operation_id: `SIM-PRC-${Date.now()}`, // Identificador único temporal da consulta
        message: "Referência de taxa e parcela gerada com sucesso.",
        
        // Barramento preenchido integralmente para consumo da listagem/tabela do front
        financial_institution_id: null,
        financial_institution_name: payload.page_configs?.partner?.name || "Parceiro Comercial",
        requested_value: requestedValue,
        down_payment_amount: downPayment,
        down_payment_percentage: Number(downPaymentPercent.toFixed(2)),
        financed_amount: amountToFinance,
        installments: Number(installments),
        cet_rate: null, // Pode ser expandido futuramente se adicionado ao JSON do banco
        installment_value: Number(installmentValue.toFixed(2)) // Arredondamento básico preventivo
      }
    ],
    // Snapshot para auditoria técnica posterior se necessário
    raw: {
      applied_factor: factor,
      calculation_base: amountToFinance,
      rules_snapshot_id: rules?.id || "not-provided",
      executed_at: new Date().toISOString()
    }
  };
}