/**
 * @fileoverview Utilitários de Formatação Financeira Unificados
 * @path src/features/financial-hub/components/shared/formatters.ts
 * 
 * ============================================================================
 * [FONTE ÚNICA DA VERDADE]
 * ============================================================================
 * Centraliza regras de formatação (Moeda, Documentos, Datas, Percentuais) para
 * garantir consistência em toda a aplicação e evitar bugs visuais de fallbacks
 * divergentes.
 */

/**
 * Formata um número ou string para moeda BRL (R$ X.XXX,XX).
 * Regra de Negócio: Se o valor for nulo, indefinido ou inválido, retorna "—".
 */
export const BRL = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined || n === "") return "—";
  
  const value = typeof n === "string" ? parseFloat(n) : n;
  
  if (isNaN(value)) return "—";

  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

/**
 * Formata CPF ou CNPJ aplicando a máscara correta.
 * Regra de Negócio: Identifica pelo tamanho da string limpa. Se vazio, retorna "—".
 */
export const formatDocument = (doc: string | null | undefined): string => {
  if (!doc) return "—";
  
  const clean = String(doc).replace(/\D/g, '');
  
  if (clean.length === 11) {
    return `CPF: ${clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}`;
  }
  
  if (clean.length === 14) {
    return `CNPJ: ${clean.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')}`;
  }
  
  return `Doc: ${doc}`;
};

/**
 * Formata um número para percentual (X,XX%).
 * Regra de Negócio: Se o valor for nulo, indefinido ou inválido, retorna "—".
 */
export const formatPercent = (n: number | string | null | undefined): string => {
  if (n === null || n === undefined || n === "") return "—";
  
  const value = typeof n === "string" ? parseFloat(n) : n;
  
  if (isNaN(value)) return "—";

  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value / 100);
};

/**
 * Formata datas ISO separando em Dia e Hora (Ideal para tabelas e painéis).
 * Regra de Negócio: Fallback padronizado { d: "—", h: "" } para datas inválidas/nulas.
 */
export function formatDate(iso: string | null | undefined) {
  if (!iso) return { d: "—", h: "" };
  
  try {
    const dt = new Date(iso);
    // Valida se a conversão gerou uma data válida
    if (isNaN(dt.getTime())) return { d: "—", h: "" };

    return {
      d: dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }),
      h: dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    };
  } catch {
    return { d: "—", h: "" };
  }
}