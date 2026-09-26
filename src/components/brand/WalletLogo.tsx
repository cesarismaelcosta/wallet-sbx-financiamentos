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
 * [NEUTRAL PURITY / IMUNIDADE AO TEMA]: Por padrão (`followTheme=false`) o
 * logo NÃO acompanha o dark mode -- sempre renderiza a versão clara e a
 * tagline em `neutral-500` fixo. Isso porque este componente é usado em
 * rotas de cliente (accounts.signin, PanelHeader/navegação do financial-hub,
 * sbxpay.index, sandbox) que não podem herdar o dark mode ativado via
 * localStorage["sbx-theme"] pelo ThemeToggle do backoffice. O único consumidor
 * que deve de fato trocar de tema é o próprio backoffice (`backoffice.lazy.tsx`
 * e `backoffice.login.lazy.tsx`), que passa `followTheme` explicitamente.
 *
 * [MODO NOTURNO ESCOPADO POR PÁGINA]: `forceDark` é um segundo mecanismo,
 * independente de `followTheme`/`resolvedTheme`. Ele existe para rotas como
 * `sbxpay.offer` que têm seu próprio toggle noturno local (não ligado ao
 * ThemeProvider/localStorage["sbx-theme"] global) -- o `PanelHeader` repassa
 * seu `nightMode` recebido via prop para cá como `forceDark`.
 *
 * @author César Ismael Pereira da Costa
 * @author Gemini Pro
 */

import { Link } from "@tanstack/react-router";
import logoSrc from "@/assets/wallet-sbx-logo.png";
import logoSrcDark from "@/assets/wallet-sbx-logo-dark.png";
import { cn } from "@/lib/utils";
import { useTheme } from "@/design-system/sbx-design-system-9f1c03/components/ThemeProvider";

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
  /**
   * Quando `true`, o logo (imagem + cor da tagline) acompanha o dark mode
   * resolvido pelo ThemeProvider. Default `false`: o logo fica imune ao tema
   * (sempre versão clara), pois a maioria dos consumidores é rota de cliente.
   * Só o backoffice deve passar `true`.
   */
  followTheme?: boolean;
  /**
   * Força a versão escura do logo independentemente do ThemeProvider global
   * -- usado por rotas com dark mode escopado só à página (ex.: sbxpay.offer),
   * cujo estado não passa por `resolvedTheme`. Default `false`.
   */
  forceDark?: boolean;
};

const SIZE_MAP: Record<NonNullable<WalletLogoProps["size"]>, string> = {
  sm: "h-6",
  md: "h-8",
  lg: "h-10",
};

const TAGLINE_SIZE: Record<NonNullable<WalletLogoProps["size"]>, string> = {
  // mr negativo cancela o rastro invisível do letter-spacing após o último
  // caractere, que senão empurra o texto centralizado visualmente p/ a esquerda.
  sm: "text-[8px] tracking-[0.18em] mr-[-0.18em]",
  md: "text-[9px] sm:text-[10px] tracking-[0.22em] mr-[-0.22em]",
  lg: "text-[10px] sm:text-[11px] tracking-[0.25em] mr-[-0.25em]",
};

export function WalletLogo({
  size = "md",
  withTagline = false,
  asLink = false,
  centered = false,
  className,
  taglineClassName,
  followTheme = false,
  forceDark = false,
}: WalletLogoProps) {
  const { resolvedTheme } = useTheme();
  const isDarkActive = forceDark || (followTheme && resolvedTheme === "dark");
  const content = (
    <span
      className={cn(
        "inline-flex flex-col gap-1.5 shrink-0",
        centered ? "items-center text-center" : "items-start text-left",
        className,
      )}
    >
      <img
        src={isDarkActive ? logoSrcDark : logoSrc}
        alt="Wallet sbX"
        className={cn(SIZE_MAP[size], "w-auto select-none block")}
        draggable={false}
      />
      {withTagline && (
        <span
          className={cn(
            "font-mono font-medium uppercase whitespace-nowrap leading-none select-none",
            followTheme || forceDark ? "text-muted-foreground" : "text-neutral-500",
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
      <Link to="/" className="inline-flex shrink-0">
        {content}
      </Link>
    );
  }

  return content;
}