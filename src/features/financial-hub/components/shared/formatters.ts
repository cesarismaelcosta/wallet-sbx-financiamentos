/**
 * @fileoverview Utilitários de Formatação Financeira
 * @path src/lib/utils/formatters.ts
 * * PROPÓSITO:
 * Centralizar regras de formatação (Moeda, Datas, Números) para garantir
 * consistência em toda a aplicação (Jornadas Veículos e Auto-Equity).
 * * INTEGRAÇÃO:
 * - Importado globalmente via alias `@/lib/utils/formatters`.
 */

/**
 * Formata um número para moeda BRL (R$ X.XXX,XX)
 */
export const BRL = (n: number | string | undefined): string => {
  const value = typeof n === "string" ? parseFloat(n) : n;
  
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value || 0);
};

/**
 * Formata um número para percentual (X,XX%)
 */
export const formatPercent = (n: number | undefined): string => {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format((n || 0) / 100);
};

/**
 * Formata CPF ou CNPJ retirando caracteres especiais se houver e recolocando-os
 * Identifica CPF ou CNPJ pela quantidade de caracteres. Não verifica se são validos.
 */
export const formatDocument = (doc: string) => {
  const clean = doc.replace(/\D/g, '');
  if (clean.length === 11) return `CPF: ${clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}`;
  if (clean.length === 14) return `CNPJ: ${clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}`;
  return `Doc: ${doc}`;
};