/**
 * @fileoverview Constantes da jornada de Home Equity (FlowCredi)
 * @path src/features/financial-hub/components/products/credit/home-equity/home-equity.types.ts
 */

/** Tipos aceitos pela FlowCredi (enum tipo_imovel do /cgi/lead). */
export const PROPERTY_TYPES = ["Apartamento", "Casa", "Casa em condomínio", "Sala Comercial", "Loja", "Terreno", "Galpão", "Rural", "Outros"];

export const UF_LIST = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
];

export const inputClass =
  "h-10 rounded-none bg-white dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-brand-accent font-semibold disabled:bg-neutral-100 dark:disabled:bg-neutral-900 disabled:text-neutral-500";
export const labelClass = "text-[11px] font-medium text-neutral-900 dark:text-neutral-100 uppercase tracking-wider font-sans";
export const digitsToMoney = (v: string) => Number(v.replace(/\D/g, "") || "0") / 100;

/** Crédito máximo: % do imóvel (rules.max_loan_percentage, 60) menos o saldo devedor. */
export const maxCreditOf = (propertyValue: number, balance: number, maxPct: number) =>
  Math.max(0, Math.floor(((propertyValue * maxPct) / 100 - balance) / 1000) * 1000);
