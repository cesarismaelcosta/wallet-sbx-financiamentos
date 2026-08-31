/**
 * @fileoverview Componente: WalletLogo
 * @path src/components/common/WalletLogo.tsx
 * 
 * =========================================================================
 * 🤖 ESPECIFICAÇÃO DO COMPONENTE: BRANDING GLOBAL
 * =========================================================================
 * @description Renderiza o logo da marca "Wallet sbX" com suporte a tamanhos 
 * variáveis, tagline opcional responsiva e comportamento de navegação (Link).
 * 
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { Link } from "@tanstack/react-router";
import logoSrc from "@/assets/wallet-sbx-logo.png";
import { cn } from "@/lib/utils";

type WalletLogoProps = {
  /** Largura base do logo. O eixo vertical auto-escala. */
  size?: "sm" | "md" | "lg";
  /** Exibe a tagline "Financiamentos & Seguros" abaixo do logo. */
  withTagline?: boolean;
  /** Envolve o componente em um Link para a rota raiz ("/"). */
  asLink?: boolean;
  /** Centraliza horizontalmente o conjunto (logo + tagline). */
  centered?: boolean;
  /** Classes CSS adicionais para o container raiz. */
  className?: string;
  /** Classes CSS adicionais para customização pontual da tagline. */
  taglineClassName?: string;
};

const SIZE_MAP: Record<NonNullable<WalletLogoProps["size"]>, string> = {
  sm: "h-6",
  md: "h-8",
  lg: "h-10",
};

const TAGLINE_SIZE: Record<NonNullable<WalletLogoProps["size"]>, string> = {
  sm: "text-[8px] sm:text-[9px] tracking-[0.18em]",
  md: "text-[10px] tracking-[0.24em]",
  lg: "text-xs tracking-[0.26em]",
};

export function WalletLogo({
  size = "md",
  withTagline = false,
  asLink = false,
  centered = false,
  className,
  taglineClassName,
}: WalletLogoProps) {
  const content = (
    <span
      className={cn(
        "inline-flex flex-col gap-1",
        centered ? "items-center" : "items-start",
        className,
      )}
    >
      <img
        src={logoSrc}
        alt="Wallet sbX"
        className={cn(SIZE_MAP[size], "w-auto select-none")}
        draggable={false}
      />
      {withTagline && (
        <span
          className={cn(
            "font-semibold uppercase text-muted-foreground",
            TAGLINE_SIZE[size],
            taglineClassName,
          )}
        >
          Financiamentos &amp; Seguros
        </span>
      )}
    </span>
  );

  if (asLink) {
    return (
      <Link to="/" className="inline-flex">
        {content}
      </Link>
    );
  }

  return content;
}