/**
 * @fileoverview VALIDAÇÃO DE INTEGRIDADE FINANCEIRA (VALOR x OFERTA x ENTRADA)
 * @path supabase/functions/_shared/simulation-bounds.ts
 *
 * @description Barreiras Zero-Trust reutilizáveis pelos motores especializados do
 * Financial Gateway (credit-card-service.ts, fandi-service.ts, partner-service.ts).
 * Cada motor chama a barreira certa para o seu produto, sempre ANTES de qualquer
 * side-effect (chamada a API de parceiro externo, persistência no banco).
 *
 * IMPORTANTE: os chamadores devem sempre passar `rules` resolvido server-side em
 * `simulation-handler.ts` (`resolvedConfig.rules`, buscado ali via
 * `resolveOrchestratorConfigs`), nunca `payload.rules` cru — que pode ter sido
 * influenciado pelo cliente em eventuais caminhos que não passem pelo
 * `financial-gateway/index.ts` (o único caminho hoje já reescreve
 * `payload.rules = config.rules` antes de chegar aqui, mas os motores não devem
 * depender disso para serem seguros).
 *
 * Creditas (Auto Equity / Home Equity) não usa nenhuma destas barreiras: é
 * empréstimo com garantia (sem conceito de entrada, diferente de compra
 * financiada), ainda em mock/pré-contrato — sem regra de negócio definida ainda.
 *
 * @author Cesar Ismael Pereira da Costa
 */

const EPS = 0.01; // Tolerância de centavos/arredondamento de ponto flutuante

/**
 * Compra financiada com margem sobre o valor do lote (Fandi / Partner genérico).
 *
 * `requested_value` deve ficar entre `offer_value` (piso) e o teto configurado
 * — `vehicle_details.fipe_value` quando disponível (hoje nunca populado pela
 * Superbid, mas previsto para compatibilidade futura), senão
 * `offer_value * (1 + max_offer_cap_percent / 100)`. O percentual só é
 * considerado se `rules.allow_custom_value === true` E `rules.max_offer_cap_percent`
 * estiver definido; qualquer ausência degrada com segurança para cap=0%
 * (== offer_value exato), em vez de travar com erro de configuração.
 *
 * `down_payment_percentage` validado contra [min, max]_down_payment_percentage.
 */
export function validateOfferMarginBounds(rules: Record<string, any>, offer: any, simulation: any) {
  const offerValue = Number(offer?.offer_value) || 0;
  const requestedValue = Number(simulation?.requested_value) || 0;
  const downPaymentAmount = Number(simulation?.down_payment_amount) || 0;
  const downPaymentPercentage = requestedValue > 0 ? (downPaymentAmount / requestedValue) * 100 : 0;

  const allowCustom = rules?.allow_custom_value === true;
  const capPercent = rules?.max_offer_cap_percent;
  const effectiveCap = allowCustom && capPercent !== null && capPercent !== undefined ? Number(capPercent) : 0;

  const fipeValue = offer?.vehicle_details?.fipe_value;
  const maxAllowedValue =
    fipeValue !== null && fipeValue !== undefined ? Number(fipeValue) : offerValue * (1 + effectiveCap / 100);

  if (requestedValue < offerValue - EPS || requestedValue > maxAllowedValue + EPS) {
    throw new Error("BUSINESS_ERROR: Valor solicitado fora da faixa permitida para esta oferta.");
  }

  const minPct = Number(rules?.min_down_payment_percentage ?? 0);
  const maxPct = Number(rules?.max_down_payment_percentage ?? 100);
  if (downPaymentPercentage < minPct - EPS || downPaymentPercentage > maxPct + EPS) {
    throw new Error("BUSINESS_ERROR: Percentual de entrada fora da faixa permitida para esta oferta.");
  }
}

/**
 * Cartão de crédito: financia exatamente o valor do lote, sem entrada.
 *
 * `requested_value` deve ser IGUAL a `offer_value`, `down_payment_amount` deve
 * ser 0, e (se configurado) `requested_value <= rules.max_financed_amount`.
 */
export function validateCardBounds(rules: Record<string, any>, offer: any, simulation: any) {
  const offerValue = Number(offer?.offer_value) || 0;
  const requestedValue = Number(simulation?.requested_value) || 0;
  const downPaymentAmount = Number(simulation?.down_payment_amount) || 0;

  if (Math.abs(requestedValue - offerValue) > EPS) {
    throw new Error(
      "BUSINESS_ERROR: O valor solicitado para financiamento no cartão deve ser igual ao valor do lote.",
    );
  }
  if (Math.abs(downPaymentAmount) > EPS) {
    throw new Error("BUSINESS_ERROR: Financiamento via cartão não admite valor de entrada.");
  }

  const maxFinanced = rules?.max_financed_amount;
  if (maxFinanced !== null && maxFinanced !== undefined && requestedValue > Number(maxFinanced) + EPS) {
    throw new Error("BUSINESS_ERROR: Valor solicitado excede o limite máximo financiável para este produto.");
  }
}
