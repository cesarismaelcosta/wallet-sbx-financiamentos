/**
 * Calcula o valor da parcela pelo sistema Price.
 * @param principal - Valor solicitado (requested_value)
 * @param monthlyRate - Taxa de juros mensal (ex: 0.02 para 2% ao mês)
 * @param installments - Número de parcelas (n)
 */
export function calculateInstallment(
  principal: number, 
  monthlyRate: number, 
  installments: number
): number {
  if (monthlyRate === 0) return principal / installments;
  
  const pmt = (principal * monthlyRate * Math.pow(1 + monthlyRate, installments)) / 
              (Math.pow(1 + monthlyRate, installments) - 1);
              
  return Number(pmt.toFixed(2));
}

/**
 * Calcula a taxa de juros mensal (i) baseada no valor principal,
 * valor da parcela e número de parcelas (Sistema Price).
 * * @param pv - Valor Principal (requested_value)
 * @param pmt - Valor da Parcela (installment_value)
 * @param n - Número de parcelas
 * @returns Taxa de juros mensal (ex: 0.02 para 2%)
 */
export function calculateMonthlyRate(pv: number, pmt: number, n: number): number {
  let low = 0;
  let high = 1; // 100% ao mês (limite superior razoável)
  let rate = 0;
  
  // Executa 100 iterações para garantir precisão alta
  for (let i = 0; i < 100; i++) {
    rate = (low + high) / 2;
    
    // Fórmula do Valor Presente da Anuidade (Price)
    // Se a taxa for 0, o cálculo é simples, senão usa a fórmula complexa
    const currentPv = rate === 0 
      ? pmt * n 
      : pmt * (1 - Math.pow(1 + rate, -n)) / rate;
    
    // Verifica se chegamos perto o suficiente do principal
    if (Math.abs(currentPv - pv) < 0.0001) {
      break;
    }
    
    // Ajusta o intervalo da busca
    if (currentPv > pv) {
      low = rate; // Precisa de uma taxa maior para reduzir o valor presente
    } else {
      high = rate; // Precisa de uma taxa menor
    }
  }
  
  return rate;
}