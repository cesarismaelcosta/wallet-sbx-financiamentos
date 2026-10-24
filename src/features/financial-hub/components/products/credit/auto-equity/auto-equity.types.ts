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

export const DOORS = ["2", "3", "4", "5"];
export const TERMS = [12, 24, 30, 36, 42, 48, 54, 60];
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
