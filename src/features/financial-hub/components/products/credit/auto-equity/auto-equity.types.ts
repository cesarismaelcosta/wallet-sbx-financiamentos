/**
 * @fileoverview Constantes da jornada de Car Equity (FlowCredi)
 * @path src/features/financial-hub/components/products/credit/auto-equity/auto-equity.types.ts
 *
 * Listas fechadas do POST /auto/lead (Flow Preamble API, AutoLeadRequest).
 */

export const UF_LIST = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export const TERMS = [12, 24, 30, 36, 42, 48, 54, 60, 66, 70]; // CGA: até 70 meses (FlowCredi)

/** Banco do financiamento quando o veículo não está quitado (texto livre na API; lista para facilitar). */
export const OUTSTANDING_BANKS = ["Banco do Brasil", "Bradesco", "BV", "C6", "Caixa", "Creditas", "Itaú", "Pan", "Safra", "Santander", "Outros"];

/**
 * Elegibilidade do veículo, só pelo `rules` (sem a chave, a regra não se aplica):
 * ano de fabricação a partir de (ano atual − max_vehicle_age_years), UFs aceitas e valor mínimo.
 */
export function vehicleEligibility(rules: { max_vehicle_age_years?: number; allowed_licensing_states?: string[]; min_vehicle_value?: number } | null | undefined) {
  const year = new Date().getFullYear();
  const states = Array.isArray(rules?.allowed_licensing_states) && rules!.allowed_licensing_states!.length
    ? rules!.allowed_licensing_states!.map((s) => String(s).toUpperCase()).sort()
    : null;
  return {
    minYear: rules?.max_vehicle_age_years ? year - Number(rules.max_vehicle_age_years) : null,
    maxYear: year + 1,
    states,
    minValue: rules?.min_vehicle_value ? Number(rules.min_vehicle_value) : null,
  };
}

/** "Outros" na lista: o cliente digita o nome do banco. */
export const OTHER_BANK = "Outros";
export const PURPOSES = [
  "Pagamento de dívidas",
  "Refinanciamento de dívidas",
  "Reforma de casa",
  "Aquisição de Bens",
  "Outros",
];
export const PROFESSIONAL_STATUS = [
  "Assalariado/Registrado",
  "Autônomo",
  "Profissional Liberal",
  "Empresário",
  "Funcionário Público",
  "Aposentado/Pensionista",
];

export const inputClass =
  "h-10 rounded-none bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-brand-accent font-semibold disabled:bg-neutral-100 dark:disabled:bg-neutral-900 disabled:text-neutral-500";
export const labelClass = "text-[11px] font-medium text-neutral-900 dark:text-neutral-100 uppercase tracking-wider font-sans";
export const selectItemClass =
  "rounded-none data-[highlighted]:bg-neutral-100 dark:data-[highlighted]:bg-neutral-800 data-[highlighted]:text-neutral-900 dark:data-[highlighted]:text-neutral-100 cursor-pointer";
export const digitsToMoney = (v: string) => Number(v.replace(/\D/g, "") || "0") / 100;
export const PLATE_RE = /^[A-Z]{3}-?\d[A-Z0-9]\d{2}$/;

/** Crédito máximo: valor do veículo menos o saldo devedor (o swagger só limita ao valor do veículo). */
export const maxCreditOf = (vehicleValue: number, balance: number) =>
  Math.max(0, Math.floor((vehicleValue - balance) / 100) * 100);
